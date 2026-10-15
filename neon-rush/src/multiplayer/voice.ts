import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ArenaClient, ConnectionState, VoiceInbound } from './client';

export interface VoiceSnapshot {
  live: boolean; muted: boolean; deafened: boolean; ptt: boolean; playbackBlocked: boolean; error: string; talking: Record<string, boolean>;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
const silent: VoiceSnapshot = { live: false, muted: true, deafened: false, ptt: false, playbackBlocked: false, error: '', talking: {} };
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
  private ignoredOffers = new Set<string>();
  private signals = new Map<string, Promise<void>>();
  private blockedAudio = new Set<string>();
  private enabling: Promise<boolean> | null = null;
  private generation = 0;
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
    this.unsub = this.client.onVoice(message => {
      // SDP and trickled ICE must be applied in order, including during reconnects.
      const generation = this.generation;
      const next = (this.signals.get(message.from) ?? Promise.resolve()).then(async () => {
        if (generation === this.generation) await this.signal(message);
      });
      this.signals.set(message.from, next);
      void next.finally(() => { if (this.signals.get(message.from) === next) this.signals.delete(message.from); });
    });
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
  enable(openMic = true): Promise<boolean> {
    // Resume playback in the user gesture, before waiting for microphone permission.
    this.audio(); this.resumePlayback();
    if (this.enabling) return this.enabling;
    this.enabling = this.enableMic(openMic).finally(() => { this.enabling = null; });
    return this.enabling;
  }
  private async enableMic(openMic: boolean) {
    this.patch({ error: '' });
    const generation = this.generation;
    try {
      if (!this.stream) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
        this.stream = stream;
        this.watch('local', this.stream);
      }
      this.applyMic(openMic || this.state.ptt);
      this.patch({ live: true, muted: !openMic });
      this.client.setMuted(!openMic && !this.state.ptt);
      for (const pc of this.peers.values()) {
        await this.attachMic(pc);
      }
      this.resumePlayback();
      return true;
    } catch {
      this.patch({ live: false, error: 'Microphone permission is needed for voice chat. Allow the mic, then try again.' });
      return false;
    }
  }
  setMuted(muted: boolean) {
    this.resumePlayback();
    if (!this.stream) { void this.enable(); return; }
    this.applyMic(!muted || this.state.ptt);
    this.patch({ muted });
    this.client.setMuted(muted && !this.state.ptt);
  }
  setPtt(held: boolean) {
    if (!this.stream) {
      // A denied permission must not recursively prompt, or open the mic after release.
      this.patch({ ptt: held });
      if (held) void this.enable(false);
      return;
    }
    this.applyMic(!this.state.muted || held);
    this.patch({ ptt: held });
    if (this.state.muted) this.client.setMuted(!held);
  }
  setDeafened(deafened: boolean) {
    this.patch({ deafened });
    for (const element of this.remote.values()) element.volume = deafened ? 0 : 1;
    if (!deafened) this.resumePlayback();
  }
  resumePlayback = () => {
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
    for (const [id, element] of this.remote) if (element.paused || this.blockedAudio.has(id)) this.play(id, element);
  };
  private play(id: string, element: HTMLAudioElement) {
    void element.play().then(() => {
      if (this.remote.get(id) !== element) return;
      this.blockedAudio.delete(id);
      if (this.state.playbackBlocked !== Boolean(this.blockedAudio.size)) this.patch({ playbackBlocked: Boolean(this.blockedAudio.size) });
    }).catch(error => {
      if (this.remote.get(id) !== element || error?.name !== 'NotAllowedError') return;
      this.blockedAudio.add(id); this.patch({ playbackBlocked: true });
    });
  }
  dispose() {
    this.unsub?.(); this.unsub = undefined;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resetPeers();
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    for (const watch of this.analysers.values()) watch.source.disconnect();
    this.analysers.clear();
    void this.context?.close(); this.context = null;
    this.patch(silent);
  }
  private applyMic(open: boolean) { for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = open; }
  private async attachMic(pc: RTCPeerConnection) {
    // Use the audio channel associated with the remote offer, not an unnegotiated sender.
    const channel = pc.getTransceivers().find(item => item.receiver.track.readyState !== 'ended' && item.receiver.track.kind === 'audio');
    if (!channel) return;
    channel.direction = 'sendrecv';
    await channel.sender.replaceTrack(this.stream?.getAudioTracks()[0] ?? null);
  }
  private ensure(remoteId: string) {
    if (this.peers.has(remoteId) || !this.localId) return;
    if (typeof RTCPeerConnection !== 'function') { this.patch({ error: 'Voice chat needs a browser with WebRTC.' }); return; }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(remoteId, pc);
    // Only the initial caller creates a channel. The answerer uses the one created
    // by setRemoteDescription; creating its own leaves its microphone unnegotiated.
    if (!polite(this.localId, remoteId)) {
      const track = this.stream?.getAudioTracks()[0];
      pc.addTransceiver(track ?? 'audio', { direction: 'sendrecv' });
    }
    pc.onnegotiationneeded = () => { void this.offer(remoteId); };
    pc.onicecandidate = event => { if (event.candidate) this.client.voice(remoteId, { kind: 'ice', candidate: event.candidate.toJSON() }); };
    pc.ontrack = event => {
      const media = event.streams[0] ?? new MediaStream([event.track]);
      let element = this.remote.get(remoteId);
      if (!element) {
        element = new Audio(); element.autoplay = true; element.setAttribute('playsinline', '');
        this.remote.set(remoteId, element);
      }
      element.srcObject = media; element.volume = this.state.deafened ? 0 : 1;
      this.play(remoteId, element);
      event.track.onunmute = () => { if (this.remote.get(remoteId) === element) this.play(remoteId, element); };
      this.watch(remoteId, media);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.restartIce(); };
  }
  private async offer(remoteId: string) {
    const pc = this.peers.get(remoteId); if (!pc || pc.signalingState !== 'stable' || this.offering.has(remoteId)) return;
    this.offering.add(remoteId);
    try {
      await pc.setLocalDescription();
      if (this.peers.get(remoteId) === pc && pc.localDescription?.sdp) this.client.voice(remoteId, { kind: 'offer', sdp: pc.localDescription.sdp });
    } catch { /* A newer offer/answer from the same peer replaces this attempt. */ }
    this.offering.delete(remoteId);
  }
  private async signal(message: VoiceInbound) {
    if (!this.localId || message.from === this.localId) return;
    this.ensure(message.from);
    const pc = this.peers.get(message.from); if (!pc) return;
    try {
      if (message.kind === 'ice' && message.candidate) {
        if (this.ignoredOffers.has(message.from)) return;
        if (!pc.remoteDescription) {
          const queued = this.pendingIce.get(message.from) ?? [];
          queued.push(message.candidate); this.pendingIce.set(message.from, queued); return;
        }
        await pc.addIceCandidate(message.candidate); return;
      }
      if (message.kind === 'offer' && message.sdp) {
        const collision = this.offering.has(message.from) || pc.signalingState !== 'stable';
        if (collision && !polite(this.localId, message.from)) { this.ignoredOffers.add(message.from); return; }
        this.ignoredOffers.delete(message.from);
        await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp });
        await this.attachMic(pc);
        await this.flushIce(message.from, pc);
        await pc.setLocalDescription(await pc.createAnswer());
        if (pc.localDescription?.sdp) this.client.voice(message.from, { kind: 'answer', sdp: pc.localDescription.sdp });
      }
      if (message.kind === 'answer' && message.sdp) {
        await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
        this.ignoredOffers.delete(message.from);
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
    this.ignoredOffers.delete(id); this.blockedAudio.delete(id);
    if (this.state.playbackBlocked !== Boolean(this.blockedAudio.size)) this.patch({ playbackBlocked: Boolean(this.blockedAudio.size) });
    this.peers.get(id)?.close(); this.peers.delete(id); this.pendingIce.delete(id); this.offering.delete(id);
    const element = this.remote.get(id); if (element) { element.pause(); element.srcObject = null; this.remote.delete(id); }
    this.analysers.get(id)?.source.disconnect(); this.analysers.delete(id);
    if (this.state.talking[id]) {
      const talking = { ...this.state.talking }; delete talking[id]; this.patch({ talking });
    }
  }
  private resetPeers() { this.generation++; this.signals.clear(); for (const id of [...this.peers.keys()]) this.closePeer(id); }
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
    window.addEventListener('pointerdown', voice.resumePlayback); window.addEventListener('keydown', voice.resumePlayback);
    return () => { window.removeEventListener('pointerdown', voice.resumePlayback); window.removeEventListener('keydown', voice.resumePlayback); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop); voice.dispose(); };
  }, [voice]);
  useEffect(() => { voice.sync(connection); }, [voice, connection]);
  const talking = { ...snapshot.talking };
  if (connection.playerId && talking.local) talking[connection.playerId] = talking.local;
  return { voice, ...snapshot, talking };
}
