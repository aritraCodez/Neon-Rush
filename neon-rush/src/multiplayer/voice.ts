import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ArenaClient, ConnectionState, VoiceInbound } from './client';

export interface VoiceSnapshot {
  live: boolean; muted: boolean; deafened: boolean; ptt: boolean; error: string; talking: Record<string, boolean>;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
const silent: VoiceSnapshot = { live: false, muted: true, deafened: false, ptt: false, error: '', talking: {} };
const polite = (localId: string, remoteId: string) => localId > remoteId;
const level = (analyser: AnalyserNode, buffer: Uint8Array) => {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) { const n = (buffer[i] - 128) / 128; sum += n * n; }
  return Math.sqrt(sum / buffer.length);
};

export class VoiceChat {
  private state: VoiceSnapshot = silent;
  private listeners = new Set<() => void>();
  private peers = new Map<string, RTCPeerConnection>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private offering = new Set<string>();
  private remote = new Map<string, HTMLAudioElement>();
  private analysers = new Map<string, { analyser: AnalyserNode; buffer: Uint8Array; source: MediaStreamAudioSourceNode }>();
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private localId = '';
  private roomCode = '';
  private frame = 0;
  private unsub: (() => void) | undefined;
  constructor(private client: ArenaClient) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(value: Partial<VoiceSnapshot>) { this.state = { ...this.state, ...value }; this.listeners.forEach(listener => listener()); }
  private audio() {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    return this.context;
  }
  attach() {
    this.unsub = this.client.onVoice(message => { void this.signal(message); });
  }
  sync(connection: ConnectionState) {
    this.localId = connection.playerId;
    if (connection.status !== 'connected' || !connection.room || !connection.playerId) { this.roomCode = ''; this.resetPeers(); return; }
    if (this.stream && this.roomCode !== connection.room.code) this.client.setMuted(this.state.muted && !this.state.ptt);
    this.roomCode = connection.room.code;
    const live = connection.room.players.filter(player => player.connected && player.id !== connection.playerId).map(player => player.id);
    for (const id of [...this.peers.keys()]) if (!live.includes(id)) this.closePeer(id);
    for (const id of live) this.ensure(id);
  }
  async enable() {
    this.patch({ error: '' });
    try {
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        this.watch('local', this.stream);
      }
      this.applyMic(true);
      this.patch({ live: true, muted: false });
      this.client.setMuted(false);
      for (const pc of this.peers.values()) {
        const sender = pc.getSenders().find(item => !item.track || item.track.kind === 'audio');
        if (sender) await sender.replaceTrack(this.stream.getAudioTracks()[0] ?? null);
      }
    } catch {
      this.patch({ live: false, error: 'Microphone permission is needed for voice chat. Allow the mic, then try again.' });
    }
  }
  setMuted(muted: boolean) {
    if (!this.stream) { void this.enable(); return; }
    this.applyMic(!muted || this.state.ptt);
    this.patch({ muted });
    this.client.setMuted(muted && !this.state.ptt);
  }
  setPtt(held: boolean) {
    if (!this.stream && held) { void this.enable().then(() => this.setPtt(true)); return; }
    this.applyMic(!this.state.muted || held);
    this.patch({ ptt: held });
    if (this.state.muted) this.client.setMuted(!held);
  }
  setDeafened(deafened: boolean) {
    this.patch({ deafened });
    for (const element of this.remote.values()) element.volume = deafened ? 0 : 1;
  }
  dispose() {
    this.unsub?.(); this.unsub = undefined;
    cancelAnimationFrame(this.frame);
    this.resetPeers();
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    for (const watch of this.analysers.values()) watch.source.disconnect();
    this.analysers.clear();
    void this.context?.close(); this.context = null;
    this.patch(silent);
  }
  private applyMic(open: boolean) { for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = open; }
  private ensure(remoteId: string) {
    if (this.peers.has(remoteId) || !this.localId) return;
    if (typeof RTCPeerConnection !== 'function') { this.patch({ error: 'Voice chat needs a browser with WebRTC.' }); return; }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(remoteId, pc);
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    const track = this.stream?.getAudioTracks()[0];
    if (track) void pc.getSenders().find(item => !item.track || item.track.kind === 'audio')?.replaceTrack(track);
    pc.onicecandidate = event => { if (event.candidate) this.client.voice(remoteId, { kind: 'ice', candidate: event.candidate.toJSON() }); };
    pc.ontrack = event => {
      const media = event.streams[0] ?? new MediaStream([event.track]);
      let element = this.remote.get(remoteId);
      if (!element) {
        element = new Audio(); element.autoplay = true; element.setAttribute('playsinline', '');
        this.remote.set(remoteId, element);
      }
      element.srcObject = media; element.volume = this.state.deafened ? 0 : 1;
      void element.play().catch(() => {});
      this.watch(remoteId, media);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.restartIce(); };
    if (!polite(this.localId, remoteId)) void this.offer(remoteId);
  }
  private async offer(remoteId: string) {
    const pc = this.peers.get(remoteId); if (!pc) return;
    this.offering.add(remoteId);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (pc.localDescription?.sdp) this.client.voice(remoteId, { kind: 'offer', sdp: pc.localDescription.sdp });
    } catch { /* A newer offer/answer from the same peer replaces this attempt. */ }
    this.offering.delete(remoteId);
  }
  private async signal(message: VoiceInbound) {
    if (!this.localId || message.from === this.localId) return;
    this.ensure(message.from);
    const pc = this.peers.get(message.from); if (!pc) return;
    try {
      if (message.kind === 'ice' && message.candidate) {
        if (!pc.remoteDescription) {
          const queued = this.pendingIce.get(message.from) ?? [];
          queued.push(message.candidate); this.pendingIce.set(message.from, queued); return;
        }
        await pc.addIceCandidate(message.candidate); return;
      }
      if (message.kind === 'offer' && message.sdp) {
        const collision = this.offering.has(message.from) || pc.signalingState !== 'stable';
        if (collision && !polite(this.localId, message.from)) return;
        await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp });
        await this.flushIce(message.from, pc);
        await pc.setLocalDescription(await pc.createAnswer());
        if (pc.localDescription?.sdp) this.client.voice(message.from, { kind: 'answer', sdp: pc.localDescription.sdp });
      }
      if (message.kind === 'answer' && message.sdp) {
        await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
        await this.flushIce(message.from, pc);
      }
    } catch { /* Drop a malformed or stale signaling packet and keep the mesh. */ }
  }
  private async flushIce(id: string, pc: RTCPeerConnection) {
    const queued = this.pendingIce.get(id); this.pendingIce.delete(id);
    if (!queued) return;
    for (const candidate of queued) { try { await pc.addIceCandidate(candidate); } catch { /* Candidate expired after a renegotiation. */ } }
  }
  private watch(id: string, media: MediaStream) {
    const context = this.audio();
    this.analysers.get(id)?.source.disconnect();
    const source = context.createMediaStreamSource(media);
    const analyser = context.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.45;
    source.connect(analyser);
    this.analysers.set(id, { analyser, buffer: new Uint8Array(analyser.fftSize), source });
    if (!this.frame) this.frame = requestAnimationFrame(this.sample);
  }
  private sample = () => {
    this.frame = this.analysers.size ? requestAnimationFrame(this.sample) : 0;
    const talking = { ...this.state.talking };
    let changed = false;
    for (const [id, watch] of this.analysers) {
      const active = (id === 'local' ? !this.state.muted || this.state.ptt : !this.state.deafened) && level(watch.analyser, watch.buffer) > 0.045;
      if (Boolean(talking[id]) !== active) { talking[id] = active; changed = true; }
    }
    if (changed) this.patch({ talking });
  };
  private closePeer(id: string) {
    this.peers.get(id)?.close(); this.peers.delete(id); this.pendingIce.delete(id); this.offering.delete(id);
    const element = this.remote.get(id); if (element) { element.pause(); element.srcObject = null; this.remote.delete(id); }
    this.analysers.get(id)?.source.disconnect(); this.analysers.delete(id);
    if (this.state.talking[id]) {
      const talking = { ...this.state.talking }; delete talking[id]; this.patch({ talking });
    }
  }
  private resetPeers() { for (const id of [...this.peers.keys()]) this.closePeer(id); }
}

export function useVoiceChat(client: ArenaClient) {
  const [voice] = useState(() => new VoiceChat(client));
  const snapshot = useSyncExternalStore(voice.subscribe, voice.getSnapshot);
  const connection = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => {
    voice.attach();
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.code !== 'KeyV' || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select, dialog')) return;
      event.preventDefault(); voice.setPtt(true);
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'KeyV') voice.setPtt(false); };
    const stop = () => voice.setPtt(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop); voice.dispose(); };
  }, [voice]);
  useEffect(() => { voice.sync(connection); }, [voice, connection]);
  const talking = { ...snapshot.talking };
  if (connection.playerId && talking.local) talking[connection.playerId] = talking.local;
  return { voice, ...snapshot, talking };
}
