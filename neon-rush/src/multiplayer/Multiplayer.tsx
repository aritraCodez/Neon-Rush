import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { ArrowLeft, Check, Copy, Crosshair, Crown, DoorOpen, Headphones, Mic, MicOff, Radio, RotateCcw, Send, Shield, Swords, Trophy, Users, Volume2, VolumeX, Wifi, Zap } from 'lucide-react';
import { ArenaClient } from './client';
import { ArenaScene } from './ArenaScene';
import { useArenaControls } from './useArenaControls';
import { useVoiceChat, type VoiceChat, type VoiceSnapshot } from './voice';
import type { ArenaControls } from './useArenaControls';
import type { ArenaChat, ArenaPlayer } from '../../shared/multiplayer';
import { ARENA, ARENA_COVER } from '../../shared/arena.js';
import type { RunnerStyle } from '../game/runnerStyle';
import { audio } from '../game/audio';
import './multiplayer.css';

function savedName() { try { return localStorage.getItem('neon-rush-player-name') || ''; } catch { return ''; } }
const byScore = (a: ArenaPlayer, b: ArenaPlayer) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name);
const timeLabel = (seconds: number) => { const rounded = Math.max(0, Math.ceil(seconds)); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`; };

function TouchPad({ kind, controls, disabled }: { kind: 'move' | 'aim'; controls: RefObject<ArenaControls>; disabled: boolean }) {
  const [point, setPoint] = useState({ x: 0, z: 0 });
  const pointer = useRef<number | null>(null);
  function set(x: number, z: number) {
    const magnitude = Math.hypot(x, z), scale = Math.max(1, magnitude); x /= scale; z /= scale;
    setPoint({ x, z });
    if (kind === 'move') controls.current.move = { x, z };
    else { controls.current.touchAim = true; if (magnitude > 0.1) controls.current.aimDirection = { x: x / Math.max(0.01, Math.hypot(x, z)), z: z / Math.max(0.01, Math.hypot(x, z)) }; controls.current.firing = magnitude > 0.1; }
  }
  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    set((event.clientX - rect.left - rect.width / 2) / (rect.width * 0.38), (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.38));
  };
  const reset = () => { pointer.current = null; set(0, 0); };
  useEffect(() => { if (disabled) reset(); }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={`arena-stick ${kind}`} role="group" tabIndex={disabled ? -1 : 0} aria-label={kind === 'move' ? 'Move runner with pad or arrow keys' : 'Aim and fire with pad or arrow keys'} aria-disabled={disabled}
    onPointerDown={event => { if (disabled) return; event.preventDefault(); event.stopPropagation(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); update(event); }}
    onPointerMove={event => { if (pointer.current === event.pointerId && !disabled) { event.stopPropagation(); update(event); } }}
    onPointerUp={event => { if (pointer.current === event.pointerId) { event.stopPropagation(); reset(); } }} onPointerCancel={reset} onLostPointerCapture={reset} onBlur={reset}
    onKeyDown={event => { if (disabled || !event.key.startsWith('Arrow')) return; event.preventDefault(); set(event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0, event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0); }}
    onKeyUp={event => { if (event.key.startsWith('Arrow')) { event.preventDefault(); reset(); } }}>
    <i /><span style={{ transform: `translate(${point.x * 23}px,${point.z * 23}px)` }}>{kind === 'aim' ? <Crosshair size={23} /> : <span className="stick-cross">✥</span>}</span><small>{kind === 'move' ? 'MOVE' : 'AIM + FIRE'}</small>
  </div>;
}

function ChatPanel({ client, messages, playerId, compact, disabled }: { client: ArenaClient; messages: ArenaChat[]; playerId: string; compact?: boolean; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  const log = useRef<HTMLUListElement>(null);
  useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [messages.length]);
  return <div className={`arena-chat ${compact ? 'compact' : ''}`}>
    <span>ROOM CHAT</span>
    <ul ref={log} aria-live="polite">{messages.length ? messages.map(message => <li key={message.id} className={message.from === playerId ? 'self' : ''}><b style={{ color: message.color }}>{message.name}</b><span>{message.text}</span></li>) : <li className="empty">No messages yet. Say hello.</li>}</ul>
    <form onSubmit={event => { event.preventDefault(); const text = draft.trim(); if (!text || disabled) return; client.chat(text); setDraft(''); }}>
      <input aria-label="Chat message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={80} placeholder={disabled ? 'Reconnect to chat' : 'Message the room'} disabled={disabled} autoComplete="off" />
      <button type="submit" aria-label="Send chat" disabled={disabled || !draft.trim()}><Send size={14} /></button>
    </form>
  </div>;
}

function VoiceDock({ voice, state, compact }: { voice: VoiceChat; state: VoiceSnapshot; compact?: boolean }) {
  const micOn = state.live && !state.muted;
  return <div className={`arena-voice ${compact ? 'compact' : ''} ${state.talking.local ? 'is-talking' : ''}`}>
    {!state.live ? <button className="arena-voice-main" onClick={() => void voice.enable()} aria-label="Enable microphone"><Mic size={15} />ENABLE MIC</button> : <>
      <button className={micOn ? 'is-live' : ''} aria-pressed={micOn} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} onClick={() => voice.setMuted(!state.muted)}>{micOn ? <Mic size={15} /> : <MicOff size={15} />}{micOn ? 'MIC ON' : 'MIC MUTED'}</button>
      <button aria-pressed={!state.deafened} aria-label={state.deafened ? 'Hear teammates' : 'Deafen voice chat'} onClick={() => voice.setDeafened(!state.deafened)}>{state.deafened ? <VolumeX size={15} /> : <Headphones size={15} />}{state.deafened ? 'DEAFEN' : 'HEARING'}</button>
      <button className={state.ptt ? 'is-live' : ''} aria-label="Hold to talk" onPointerDown={event => { event.preventDefault(); voice.setPtt(true); }} onPointerUp={() => voice.setPtt(false)} onPointerCancel={() => voice.setPtt(false)} onPointerLeave={() => voice.setPtt(false)}>TALK</button>
    </>}
    <small>{state.error || (state.live ? (state.muted ? 'Muted — hold V or TALK' : 'Voice live with this room') : 'Talk with everyone in this room')}</small>
  </div>;
}

export default function Multiplayer({ onExit, style, sound, onSound }: { onExit: () => void; style: RunnerStyle; sound: boolean; onSound: () => void }) {
  const [client] = useState(() => new ArenaClient());
  const connection = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const { room, playerId, status } = connection;
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, 6) || '');
  const [joinMode, setJoinMode] = useState<'create' | 'join'>(() => code ? 'join' : 'create');
  const [copied, setCopied] = useState('');
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const [help, setHelp] = useState(false);
  const own = room?.players.find(player => player.id === playerId);
  const active = room?.phase === 'playing' && status === 'connected' && !graphicsFailed && (own?.hp ?? 0) > 0;
  const controls = useArenaControls(client, active);
  const { voice, ...voiceState } = useVoiceChat(client);
  const effects = useRef({ shots: 0, hp: 100, kills: 0, round: 0 });
  useEffect(() => { client.connect(); return () => client.dispose(); }, [client]);
  useEffect(() => {
    if (!room?.code) return;
    const url = new URL(location.href); url.searchParams.set('room', room.code); history.replaceState(null, '', url);
  }, [room?.code]);
  useEffect(() => {
    if (!own || !room) return;
    const previous = effects.current;
    if (room.round === previous.round && status === 'connected') {
      if (own.shots > previous.shots) audio.play('shot');
      if (own.hp < previous.hp) audio.play('hit');
      if (own.kills > previous.kills) audio.play('critical');
    }
    effects.current = { shots: own.shots, hp: own.hp, kills: own.kills, round: room.round };
  }, [own?.shots, own?.hp, own?.kills, room?.round, status]);
  const graphicsError = useCallback(() => setGraphicsFailed(true), []);
  const leave = () => { client.leave(); const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url); onExit(); };
  async function copyInvite() {
    if (!room) return;
    const url = new URL(location.href); url.searchParams.set('room', room.code);
    try { await navigator.clipboard.writeText(url.toString()); setCopied('Invite link copied'); }
    catch { setCopied(`Share room code: ${room.code}`); }
  }
  const host = room?.hostId === playerId;
  const canStart = room && room.players.length >= ARENA.minPlayers && room.players.every(player => player.connected && player.ready);
  const connected = status === 'connected';
  const inLobby = !room || room.phase === 'lobby';

  return <div className="app multiplayer-app">
    <header className="site-header"><button className="brand arena-brand" onClick={leave}><span className="brand-mark"><Zap size={23} fill="currentColor" /></span><span>NEON<span className="brand-light">RUSH</span><small>MULTIPLAYER ARENA</small></span></button>
      <div className="arena-header-status"><span className={`connection-dot ${connected ? 'connected' : ''}`} /><span>{connected ? 'CONNECTED' : status === 'unconfigured' ? 'ARENA OFFLINE' : status === 'offline' ? 'DISCONNECTED' : 'CONNECTING'}</span>{connected && <b><Users size={14} />{connection.online ?? 0} online</b>}</div>
      <div className="header-actions"><button className="icon-button" onClick={onSound} aria-label={sound ? 'Mute sound' : 'Enable sound'}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button className="arena-exit" onClick={leave}><ArrowLeft size={15} />SOLO MODE</button></div>
    </header>
    <main>
      <div className="arena-topline"><span><Radio size={13} /> PLAYER VS PLAYER</span><span>{room ? `ROOM ${room.code} / ROUND ${room.round || 1}` : '2–6 PLAYERS / FREE FOR ALL'}</span></div>
      {connection.error && <div className="arena-error" role="alert">{connection.error}{status === 'offline' && <button onClick={client.connect}>Reconnect</button>}</div>}
      {inLobby ? <div className="arena-lobby">
        <section className="arena-lobby-intro"><div className="eyebrow"><span className="tiny-line" /> NO BOTS. REAL RIVALS.</div><h1>MEET IN<br /><span>THE ARENA.</span></h1><p>Bring your name.<br />Leave with the high score.</p><div className="arena-rule-chips"><span><Users size={15} />2–6 players</span><span><Trophy size={15} />First to 10</span><span><Zap size={15} />3-minute rounds</span></div>
          <div className="arena-map-preview" aria-hidden="true"><div className="map-grid" />{ARENA_COVER.map((box, index) => <i key={index} style={{ left: `${(box.x / ARENA.width + 0.5) * 100}%`, top: `${(box.z / ARENA.depth + 0.5) * 100}%`, width: `${box.width / ARENA.width * 100}%`, height: `${box.depth / ARENA.depth * 100}%` }} />)}<span className="map-player a" /><span className="map-player b" /><span className="map-player c" /><b>THE EXCHANGE / ARENA 01</b></div>
          <p className="arena-rules">Move freely, use cover, and outshoot your friends. Respawn after 3 seconds. Highest eliminations wins; equal scores share the win.</p>
        </section>
        <section className="arena-lobby-card">
          {status === 'unconfigured' ? <div className="arena-unavailable"><Radio size={35} /><h2>The arena is coming online.</h2><p>Online play is not available on this deployment yet. You can keep playing solo.</p><button className="primary-button" onClick={leave}>BACK TO SOLO</button></div> : !room ? <>
            <div className="arena-card-heading"><span>YOUR NEXT RIVAL IS WAITING</span><h2>Join the fight.</h2></div>
            <div className="arena-join-tabs" role="group" aria-label="Room action"><button aria-pressed={joinMode === 'create'} onClick={() => setJoinMode('create')}>CREATE ROOM</button><button aria-pressed={joinMode === 'join'} onClick={() => setJoinMode('join')}>JOIN FRIENDS</button></div>
            <form onSubmit={event => { event.preventDefault(); audio.unlock(); try { localStorage.setItem('neon-rush-player-name', name.trim()); } catch { /* Optional preference. */ } client.join(name.trim(), style.id, joinMode === 'join' ? code : undefined); }}>
              <label className="arena-field">PLAYER NAME<input value={name} onChange={event => setName(event.target.value)} placeholder="Your callsign" minLength={2} maxLength={18} autoComplete="nickname" required disabled={connection.pending} /></label>
              {joinMode === 'join' && <label className="arena-field">ROOM CODE<input className="room-code-input" value={code} onChange={event => setCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6))} placeholder="ABC234" minLength={6} maxLength={6} required autoComplete="off" disabled={connection.pending} /></label>}
              <button className="primary-button arena-join-button" disabled={!connected || connection.pending}><Swords size={18} />{!connected ? 'CONNECTING TO ARENA…' : connection.pending ? 'JOINING…' : joinMode === 'join' ? 'JOIN ROOM' : 'CREATE A ROOM'}</button>
            </form>
            <p className="arena-connection-note">{connected ? 'Share your room code with friends. Everyone readies up before the host starts.' : 'The server may take about a minute to wake up on its first connection.'}</p>
            <div className="arena-live-info"><Wifi size={16} /><span>{connected ? 'Live server connection' : 'Waiting for server'}</span><b>{connected && connection.latency !== null ? `${connection.latency} ms` : '—'}</b></div>
          </> : <>
            <div className="arena-room-title"><div><span>YOUR PRIVATE ROOM</span><h2>{room.code}</h2></div><button className="arena-copy" onClick={() => void copyInvite()}><Copy size={16} />INVITE</button></div><p className="arena-copy-status" role="status">{copied || 'Send this code to your friends to join.'}</p>
            <div className="arena-roster-title"><span>LIVE PLAYERS</span><b>{room.players.filter(player => player.connected).length} / {ARENA.maxPlayers}</b></div>
            <ul className="arena-roster">{room.players.map(player => <li key={player.id} className={voiceState.talking[player.id] ? 'is-talking' : ''}><span className="player-avatar" style={{ '--player-color': player.color } as CSSProperties}>{player.name.slice(0, 2).toUpperCase()}</span><div><strong>{player.name}{player.id === playerId && <small> YOU</small>}</strong><span>{!player.connected ? 'Reconnecting…' : voiceState.talking[player.id] ? 'Speaking' : player.muted ? 'Mic muted' : player.id === room.hostId ? 'Room host' : 'Voice ready'}</span></div>{player.muted ? <MicOff size={14} className="voice-mute-icon" /> : <Mic size={14} className={`voice-mic-icon ${voiceState.talking[player.id] ? 'is-talking' : ''}`} />}{player.id === room.hostId && <Crown size={15} className="host-crown" />}<b className={player.ready ? 'player-ready' : 'player-waiting'}>{!player.connected ? 'OFFLINE' : player.ready ? 'READY' : 'WAITING'}</b></li>)}</ul>
            <VoiceDock voice={voice} state={voiceState} />
            <ChatPanel client={client} messages={connection.chat} playerId={playerId} disabled={!connected} />
            <button className={`arena-ready-button ${own?.ready ? 'is-ready' : ''}`} aria-pressed={own?.ready ?? false} disabled={!connected} onClick={() => { audio.unlock(); client.send({ type: 'ready', ready: !own?.ready }); }}><Check size={17} />{own?.ready ? 'READY — CLICK TO UNREADY' : 'I’M READY'}</button>
            {host && <button className="primary-button" disabled={!connected || !canStart} onClick={() => { audio.unlock(); client.send({ type: 'start' }); }}><Swords size={18} />START MATCH</button>}
            <p className="arena-connection-note">{room.players.length < 2 ? 'Invite at least one friend to start a match.' : host ? 'Start when every player is connected and ready.' : 'The host will start when everyone is ready.'}</p>
            <button className="text-button" onClick={() => { client.leave(); setCopied(''); const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url); }}><DoorOpen size={14} /> Leave room</button>
          </>}
        </section>
      </div> : <div className="arena-match-layout">
        <section className="arena-stage" aria-label="Live multiplayer arena">
          <div className="arena-canvas"><ArenaScene room={room} playerId={playerId} controls={controls} onError={graphicsError} talking={voiceState.talking} /></div>
          <div className="arena-match-top"><span><i /> THE EXCHANGE</span><div><small>FIRST TO {ARENA.winningKills}</small><strong>{timeLabel(room.remaining)}</strong></div><button className="arena-small-button" aria-expanded={help} onClick={() => setHelp(!help)}>CONTROLS</button></div>
          {help && <div className="arena-controls-help"><p><b>WASD / arrows:</b> move · <b>Mouse:</b> aim · <b>Hold click / F:</b> fire · <b>Space / Shift:</b> dash · <b>R:</b> reload · <b>V:</b> hold to talk.</p><p>Touch: left pad moves, right pad aims and fires. Use room chat or enable mic to talk with the room.</p></div>}
          <div className="arena-kill-feed" aria-live="polite">{room.events.filter(event => event.kind === 'kill').slice(0, 3).map(event => <span key={event.id}><Crosshair size={11} />{event.text}</span>)}</div>
          <div className="arena-chat-feed" aria-live="polite">{connection.chat.slice(-3).map(message => <span key={message.id}><b style={{ color: message.color }}>{message.name}</b> {message.text}</span>)}</div>
          <div className="arena-radar" role="img" aria-label="Live map of every connected player"><span>LIVE RADAR</span><div>{ARENA_COVER.map((box, index) => <i key={index} style={{ left: `${(box.x / ARENA.width + 0.5) * 100}%`, top: `${(box.z / ARENA.depth + 0.5) * 100}%`, width: `${box.width / ARENA.width * 100}%`, height: `${box.depth / ARENA.depth * 100}%` }} />)}{room.players.filter(player => player.connected && player.hp > 0).map(player => <b key={player.id} title={player.name} className={player.id === playerId ? 'self' : ''} style={{ left: `${(player.x / ARENA.width + 0.5) * 100}%`, top: `${(player.z / ARENA.depth + 0.5) * 100}%`, background: player.color }} />)}</div></div>
          {room.phase === 'countdown' && <div className="arena-center-overlay"><span>ALL RUNNERS CONNECTED</span><strong>{Math.max(1, Math.ceil(room.countdown))}</strong><p>Get ready. Watch your corners.</p></div>}
          {room.phase === 'playing' && own && own.hp <= 0 && <div className="arena-respawn" role="status"><strong>REBOOTING IN {Math.max(1, Math.ceil(own.respawnIn))}</strong><span>You’ll rejoin the fight with full health.</span></div>}
          {room.phase === 'playing' && own && <>
            <div className="arena-vitals"><div><Shield size={16} /><strong>{own.hp}</strong><span>HEALTH</span></div><i><b style={{ width: `${own.hp}%`, background: own.color }} /></i><small>{own.shield > 0 ? 'SPAWN SHIELD · FIRING ENDS PROTECTION' : own.dashCooldown > 0 ? `DASH IN ${own.dashCooldown.toFixed(1)}s` : 'DASH READY · SPACE'}</small></div>
            <div className="arena-ammo"><span>ARENA BLASTER</span><strong>{own.reload > 0 ? '↻' : own.ammo}<small> / {ARENA.magazine}</small></strong><button disabled={!active || own.reload > 0} onClick={() => { controls.current.reload = true; }}><RotateCcw size={13} />{own.reload > 0 ? `RELOADING ${own.reload.toFixed(1)}s` : 'RELOAD · R'}</button></div>
            <div className="arena-mobile-controls"><TouchPad kind="move" controls={controls} disabled={!active} /><button className="arena-dash" disabled={!active || own.dashCooldown > 0} onClick={() => { controls.current.dash = true; }}><Zap size={20} />DASH</button><TouchPad kind="aim" controls={controls} disabled={!active} /></div>
            <div className="arena-hit-flash" style={{ opacity: own.hit > 0 ? 0.45 : 0 }} />
          </>}
          {room.phase === 'finished' && <div className="arena-result-overlay"><div className="arena-result-card"><Trophy size={34} /><span>ROUND {room.round} COMPLETE</span><h2>{room.winners.length > 1 ? 'SHARED VICTORY' : room.winners.includes(playerId) ? 'YOU WIN.' : 'GOOD FIGHT.'}</h2><p>{room.endReason}</p><ol>{[...room.players].sort(byScore).map(player => <li key={player.id}><span style={{ color: player.color }}>{player.name}{player.id === playerId ? ' (you)' : ''}</span><b>{player.kills} K <small>/ {player.deaths} D</small></b></li>)}</ol>{host ? <button className="primary-button" disabled={!connected} onClick={() => client.send({ type: 'lobby' })}><RotateCcw size={16} />REMATCH LOBBY</button> : <p>Waiting for the host to open a rematch.</p>}<button className="text-button" onClick={leave}>Leave arena</button></div></div>}
          {(!connected || graphicsFailed) && <div className="arena-network-overlay" role="status"><Wifi size={30} /><strong>{graphicsFailed ? 'Graphics unavailable' : 'Reconnecting…'}</strong><p>{graphicsFailed ? 'Reload with WebGL enabled to return to the arena.' : 'Your match continues. Rejoin within 20 seconds to keep your place.'}</p><button className="arena-small-button" onClick={leave}>BACK TO SOLO</button></div>}
        </section>
        <aside className="arena-scoreboard"><div className="arena-scoreboard-heading"><div><span>LIVE STANDINGS</span><h2>The contenders.</h2></div><Users size={20} /></div><VoiceDock voice={voice} state={voiceState} compact /><ChatPanel client={client} messages={connection.chat} playerId={playerId} compact disabled={!connected} /><div className="arena-score-columns"><span>PLAYER</span><span>K / D</span></div><ol>{[...room.players].sort(byScore).map((player, index) => <li key={player.id} className={`${player.id === playerId ? 'self' : ''} ${voiceState.talking[player.id] ? 'is-talking' : ''}`}><span className="arena-rank">{index + 1}</span><div><strong><i style={{ background: player.connected ? player.color : '#687789' }} />{player.name}{player.id === playerId && <small> YOU</small>}{voiceState.talking[player.id] ? <Mic size={11} /> : player.muted ? <MicOff size={11} /> : null}</strong><span>{!player.connected ? 'Reconnecting' : voiceState.talking[player.id] ? 'Speaking' : player.hp <= 0 ? 'Respawning' : `${player.hp} HP`}</span></div><b>{player.kills}<small> / {player.deaths}</small></b></li>)}</ol><div className="arena-room-footer"><span>ROOM CODE</span><strong>{room.code}</strong><small><Wifi size={12} />{connected && connection.latency !== null ? `${connection.latency} ms` : 'Reconnecting'}</small></div><button className="arena-small-button" onClick={leave}><DoorOpen size={14} />LEAVE MATCH</button><p>The match continues if you leave.</p></aside>
      </div>}
    </main>
    <footer><span>ONE ARENA. REAL PLAYERS. <b>MAKE YOUR NAME.</b></span><span><i /> LIVE MULTIPLAYER</span></footer>
  </div>;
}
