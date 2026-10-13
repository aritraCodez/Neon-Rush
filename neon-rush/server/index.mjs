import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { ArenaRoom } from './arena.mjs';
import { ARENA } from '../shared/arena.js';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode() { return Array.from(randomBytes(6), byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join(''); }
const validToken = (provided, expected) => typeof provided === 'string' && /^[a-f0-9]{64}$/.test(provided) && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

export async function startArenaServer({
  port = Number(process.env.PORT || 3001), host = '0.0.0.0',
  allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5187').split(',').map(value => value.trim().replace(/\/$/, '')),
  maxRooms = 50, maxConnections = 320, reconnectGrace = 20_000,
} = {}) {
  const rooms = new Map(), sessions = new Map();
  let closing = false, tickCount = 0, previousTick = Date.now();
  const http = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(closing ? 503 : 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: closing ? 'stopping' : 'ok', online: onlineCount(), rooms: rooms.size }));
    } else { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Neon Rush Arena server. Health: /health'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const onlineCount = () => [...sessions.values()].filter(session => session.ws?.readyState === WebSocket.OPEN).length;
  const send = (ws, value) => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 1024 * 1024) { ws.close(1013, 'Connection too slow'); return; }
    if (ws.bufferedAmount < 64 * 1024) ws.send(JSON.stringify(value));
  };
  function drop(session) {
    const room = rooms.get(session.code);
    room?.removePlayer(session.id); sessions.delete(session.id);
    if (room && room.players.size === 0) rooms.delete(room.code);
  }
  function snapshot(session) { const room = rooms.get(session.code); if (room) send(session.ws, { type: 'snapshot', room: room.snapshot() }); }
  function bind(ws, session) {
    if (session.ws && session.ws !== ws) session.ws.close(4000, 'Session opened in another connection');
    session.ws = ws; session.disconnectedAt = 0; ws.playerId = session.id;
    rooms.get(session.code)?.setConnected(session.id, true);
    send(ws, { type: 'session', id: session.id, token: session.token, code: session.code }); snapshot(session);
  }
  http.on('upgrade', (request, socket, head) => {
    if (closing || request.url !== '/ws' || !allowedOrigins.includes(request.headers.origin) || wss.clients.size >= maxConnections) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    ws.alive = true; ws.tokens = 80; ws.refillAt = Date.now(); ws.playerId = '';
    send(ws, { type: 'hello', protocol: 1, online: onlineCount() });
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => { /* Close/disconnect handles recovery. */ });
    ws.on('message', (raw, binary) => {
      const now = Date.now(); ws.tokens = Math.min(80, ws.tokens + (now - ws.refillAt) * 0.05); ws.refillAt = now;
      if (binary || ws.tokens < 1) { ws.close(1008, 'Message rate or format not supported'); return; } ws.tokens--;
      let message;
      try { message = JSON.parse(raw.toString()); } catch { ws.close(1008, 'Invalid JSON'); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;
      try {
        if (message.type === 'ping') { send(ws, { type: 'pong', sent: typeof message.sent === 'number' ? message.sent : 0 }); return; }
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
            let code; do { code = roomCode(); } while (rooms.has(code)); room = new ArenaRoom(code);
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
          case 'input': room.setInput(session.id, message.input); break;
          case 'ready': room.ready(session.id, message.ready); break;
          case 'start': room.start(session.id); break;
          case 'lobby': room.lobby(session.id); break;
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
    const now = Date.now(), dt = (now - previousTick) / 1000; previousTick = now;
    for (const session of sessions.values()) if (!session.ws && now - session.disconnectedAt >= reconnectGrace) drop(session);
    for (const room of rooms.values()) room.tick(dt, now);
    tickCount++;
    if (tickCount % 2 === 0) {
      for (const room of rooms.values()) {
        const message = { type: 'snapshot', room: room.snapshot(now) };
        for (const id of room.players.keys()) send(sessions.get(id)?.ws, message);
      }
    }
    if (tickCount % ARENA.tickRate === 0) for (const ws of wss.clients) send(ws, { type: 'presence', online: onlineCount() });
  }, 1000 / ARENA.tickRate);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  }, 10_000);
  await new Promise((resolveListen, reject) => { http.once('error', reject); http.listen(port, host, resolveListen); });
  async function close() {
    if (closing) return; closing = true; clearInterval(tick); clearInterval(heartbeat);
    for (const ws of wss.clients) { send(ws, { type: 'shutdown', message: 'The server is restarting. Please reconnect and create a new room.' }); ws.close(1012, 'Server restarting'); }
    const force = setTimeout(() => { for (const ws of wss.clients) ws.terminate(); }, 500); force.unref();
    await Promise.all([new Promise(done => wss.close(done)), new Promise(done => http.close(done))]); clearTimeout(force);
    rooms.clear(); sessions.clear();
  }
  return { http, wss, rooms, sessions, close, port: http.address().port };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arena = await startArenaServer();
  console.log(`Neon Rush Arena listening on port ${arena.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void arena.close().then(() => process.exit(0)); });
}
