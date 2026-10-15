import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { ArenaRoom } from './arena.mjs';
import { snapshotDelta } from '../shared/snapshots.js';
import { FixedClock } from './timing.mjs';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode() { return Array.from(randomBytes(6), byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join(''); }
const validToken = (provided, expected) => typeof provided === 'string' && /^[a-f0-9]{64}$/.test(provided) && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

export async function startArenaServer({
  port = Number(process.env.PORT || 3001), host = '0.0.0.0',
  allowedOrigins = (process.env.ALLOWED_ORIGINS || [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5187',
    'https://neon-rush-rsii.onrender.com',
    'https://neon-rush-rsii.onrender.com/'
  ].join(',')).split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean),
  tickRate = Number(process.env.ARENA_TICK_RATE || 30),
  snapshotRate = Number(process.env.ARENA_SNAPSHOT_RATE || 15),
  maxRooms = 50, maxConnections = 320, reconnectGrace = 20_000,
} = {}) {
  if (![20, 30, 60].includes(tickRate) || !Number.isInteger(snapshotRate) || snapshotRate < 5 || snapshotRate > tickRate) throw new Error('Use tick rate 20/30/60 and snapshot rate 5..tickRate');
  const rooms = new Map(), sessions = new Map();
  const fixed = new FixedClock(tickRate);
  const loopDelay = monitorEventLoopDelay({ resolution: 20 }); loopDelay.enable();
  const metrics = { tickRate, snapshotRate, ticks: 0, stepMs: 0, maxStepMs: 0, skippedSnapshots: 0, bytesOut: 0 };
  const baselines = new Map();
  let closing = false, previousTick = performance.now();
  const http = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(closing ? 503 : 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: closing ? 'stopping' : 'ok', online: onlineCount(), rooms: rooms.size, metrics: { ...metrics, droppedMs: fixed.droppedMs, eventLoopP99Ms: loopDelay.percentile(99) / 1e6, memoryMB: process.memoryUsage().rss / 1048576, cpu: process.cpuUsage() } }));
    } else { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Neon Rush Arena server. Health: /health'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
  const cleanIce = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (typeof value.candidate !== 'string' || value.candidate.length > 512) return null;
    const candidate = { candidate: value.candidate };
    if (typeof value.sdpMid === 'string' && value.sdpMid.length <= 32) candidate.sdpMid = value.sdpMid;
    if (Number.isInteger(value.sdpMLineIndex) && value.sdpMLineIndex >= 0 && value.sdpMLineIndex < 8) candidate.sdpMLineIndex = value.sdpMLineIndex;
    if (typeof value.usernameFragment === 'string' && value.usernameFragment.length <= 64) candidate.usernameFragment = value.usernameFragment;
    return candidate;
  };
  const onlineCount = () => [...sessions.values()].filter(session => session.ws?.readyState === WebSocket.OPEN).length;
  // Critical messages stay ordered in ws's reliable queue. Only replaceable
  // snapshots may be skipped. Bound a hopeless connection by closing explicitly.
  const send = (ws, value, replaceable = false) => {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    if (ws.bufferedAmount > 1024 * 1024) { ws.close(1013, 'Connection too slow'); return false; }
    if (replaceable && ws.bufferedAmount > 64 * 1024) { metrics.skippedSnapshots++; return false; }
    const encoded = typeof value === 'string' ? value : JSON.stringify(value);
    ws.send(encoded); metrics.bytesOut += Buffer.byteLength(encoded); return true;
  };
  function drop(session) {
    const room = rooms.get(session.code);
    room?.removePlayer(session.id); sessions.delete(session.id);
    if (room && room.players.size === 0) { rooms.delete(room.code); baselines.delete(room.code); }
  }
  function snapshot(session) { const room = rooms.get(session.code); if (room) { send(session.ws, { type: 'snapshot', room: room.snapshot() }); session.needsFull = true; } }
  function bind(ws, session) {
    if (session.ws && session.ws !== ws) session.ws.close(4000, 'Session opened in another connection');
    session.ws = ws; session.disconnectedAt = 0; ws.playerId = session.id;
    rooms.get(session.code)?.setConnected(session.id, true);
    send(ws, { type: 'session', id: session.id, token: session.token, code: session.code, ack: rooms.get(session.code)?.players.get(session.id)?.ack ?? 0 });
    const room = rooms.get(session.code); if (room) send(ws, { type: 'chat-history', messages: room.chat });
    snapshot(session);
  }
  http.on('upgrade', (request, socket, head) => {
    if (closing || request.url !== '/ws' || !allowedOrigins.includes(request.headers.origin) || wss.clients.size >= maxConnections) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    ws.alive = true; ws.tokens = 120; ws.refillAt = Date.now(); ws.playerId = '';
    send(ws, { type: 'hello', protocol: 2, tickRate, snapshotRate, online: onlineCount() });
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => { /* Close/disconnect handles recovery. */ });
    ws.on('message', (raw, binary) => {
      const now = Date.now(); ws.tokens = Math.min(120, ws.tokens + (now - ws.refillAt) * 0.08); ws.refillAt = now;
      if (binary || ws.tokens < 1) { ws.close(1008, 'Message rate or format not supported'); return; } ws.tokens--;
      let message;
      try { message = JSON.parse(raw.toString()); } catch { ws.close(1008, 'Invalid JSON'); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;
      try {
        if (message.type === 'ping') { send(ws, { type: 'pong', sent: typeof message.sent === 'number' ? message.sent : 0 }); return; }
        if (['resume', 'create', 'join'].includes(message.type)) ws.protocolVersion = message.protocol === 2 ? 2 : 1;
        if (message.type === 'resume') {
          if (ws.playerId) throw new Error('Already joined a room.');
          const session = typeof message.id === 'string' ? sessions.get(message.id) : null;
          if (!session || !validToken(message.token, session.token) || !rooms.has(session.code)) { send(ws, { type: 'error', code: 'session_expired', message: 'Your previous room is no longer available. Create or join a room again.' }); return; }
          bind(ws, session); return;
        }
        if (message.type === 'create' || message.type === 'join') {
          if (ws.playerId) throw new Error('Leave your current room before joining another.');
          let room;
          if (message.type === 'create') {
            if (rooms.size >= maxRooms) throw new Error('The arena is full right now. Please try again shortly.');
            let code; do { code = roomCode(); } while (rooms.has(code)); room = new ArenaRoom(code, Date.now, { capacity: message.capacity ?? 6, mapId: message.mapId ?? 'exchange' }); room.tickRate = tickRate; room.snapshotRate = snapshotRate;
          } else {
            const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
            room = rooms.get(code); if (!room) throw new Error('Room not found. Check the six-character code.');
          }
          const id = randomUUID(); room.addPlayer(id, message.name, message.style);
          rooms.set(room.code, room);
          const session = { id, token: randomBytes(32).toString('hex'), code: room.code, ws: null, disconnectedAt: 0 };
          sessions.set(id, session); bind(ws, session); return;
        }
        const session = sessions.get(ws.playerId);
        if (!session || session.ws !== ws) return;
        const room = rooms.get(session.code); if (!room) return;
        switch (message.type) {
          case 'input':
            if (ws.protocolVersion === 2) { if (room.phase !== 'playing' || message.round !== room.round) break; if (!room.enqueueInputs(session.id, message.inputs)) send(ws, { type: 'input_rejected', ack: room.players.get(session.id)?.ack ?? 0 }); }
            else room.setInput(session.id, message.input);
            break;
          case 'resync': snapshot(session); break;
          case 'settings': room.configure(session.id, { capacity: message.capacity, mapId: message.mapId }); break;
          case 'ready': room.ready(session.id, message.ready); break;
          case 'start': room.start(session.id); break;
          case 'lobby': room.lobby(session.id); break;
          case 'chat': {
            const chat = room.addChat(session.id, message.text); if (!chat) return;
            const payload = { type: 'chat', message: chat };
            for (const id of room.players.keys()) send(sessions.get(id)?.ws, payload);
            break;
          }
          case 'voice-state': room.setMuted(session.id, message.muted); break;
          case 'voice': {
            const targetId = typeof message.to === 'string' ? message.to : '';
            if (!targetId || targetId === session.id || !room.players.has(targetId)) return;
            const kind = message.kind;
            if (kind === 'ice') {
              const candidate = cleanIce(message.candidate); if (!candidate) return;
              send(sessions.get(targetId)?.ws, { type: 'voice', from: session.id, kind, candidate }); return;
            }
            if ((kind !== 'offer' && kind !== 'answer') || typeof message.sdp !== 'string' || message.sdp.length < 20 || message.sdp.length > 8192) return;
            send(sessions.get(targetId)?.ws, { type: 'voice', from: session.id, kind, sdp: message.sdp }); break;
          }
          case 'leave': drop(session); ws.playerId = ''; send(ws, { type: 'left' }); break;
        }
      } catch (error) { send(ws, { type: 'error', message: error instanceof Error ? error.message : 'Unable to process that action.' }); }
    });
    ws.on('close', () => {
      const session = sessions.get(ws.playerId);
      if (session?.ws === ws) {
        session.ws = null; session.disconnectedAt = Date.now();
        rooms.get(session.code)?.setConnected(session.id, false);
      }
    });
  });
  const tick = setInterval(() => {
    const monotonic = performance.now(), elapsed = (monotonic - previousTick) / 1000;
    previousTick = monotonic;
    fixed.advance(elapsed, dt => {
      const start = performance.now(), now = Date.now();
      for (const room of rooms.values()) room.tick(dt, now);
      metrics.stepMs = performance.now() - start;
      metrics.maxStepMs = Math.max(metrics.maxStepMs, metrics.stepMs); metrics.ticks++;
    });
  }, 1000 / tickRate / 2);
  const snapshots = setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) if (!session.ws && now - session.disconnectedAt >= reconnectGrace) drop(session);
    for (const room of rooms.values()) {
      room.snapshotId++; room.serverStepMs = Math.round(metrics.stepMs * 1000) / 1000;
      const next = room.snapshot(now), previous = baselines.get(room.code);
      const topology = !previous || previous.phase !== next.phase || previous.round !== next.round ||
        previous.players.map(p => p.id).join() !== next.players.map(p => p.id).join();
      const critical = topology || next.players.some(p => {
        const old = previous?.players.find(other => other.id === p.id);
        return old?.deaths !== p.deaths || old?.kills !== p.kills || old?.connected !== p.connected;
      });
      const full = JSON.stringify({ type: 'snapshot', room: next });
      const delta = topology ? full : JSON.stringify(snapshotDelta(previous, next));
      for (const id of room.players.keys()) {
        const session = sessions.get(id); if (!session) continue;
        // Event delivery is reliable and independent of replaceable positions.
        for (const event of room.pendingEvents) if (event.id > (session.eventId ?? 0)) {
          if (send(session.ws, { type: 'event', event })) session.eventId = event.id;
        }
        const useFull = session.needsFull || critical || session.ws?.protocolVersion !== 2 || next.snapshotId % (snapshotRate * 2) === 0;
        session.needsFull = !send(session.ws, useFull ? full : delta, !critical);
      }
      room.pendingEvents.length = 0;
      baselines.set(room.code, next);
    }
  }, 1000 / snapshotRate);
  const presence = setInterval(() => {
    const message = JSON.stringify({ type: 'presence', online: onlineCount() });
    for (const ws of wss.clients) send(ws, message, true);
  }, 1000);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  }, 10_000);
  await new Promise((resolveListen, reject) => { http.once('error', reject); http.listen(port, host, resolveListen); });
  async function close() {
    if (closing) return; closing = true; clearInterval(tick); clearInterval(snapshots); clearInterval(presence); clearInterval(heartbeat); loopDelay.disable();
    for (const ws of wss.clients) { send(ws, { type: 'shutdown', message: 'The server is restarting. Please reconnect and create a new room.' }); ws.close(1012, 'Server restarting'); }
    const force = setTimeout(() => { for (const ws of wss.clients) ws.terminate(); }, 500); force.unref();
    await Promise.all([new Promise(done => wss.close(done)), new Promise(done => http.close(done))]); clearTimeout(force);
    rooms.clear(); sessions.clear(); baselines.clear();
  }
  return { http, wss, rooms, sessions, metrics, close, port: http.address().port };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arena = await startArenaServer();
  console.log(`Neon Rush Arena listening on port ${arena.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void arena.close().then(() => process.exit(0)); });
}
