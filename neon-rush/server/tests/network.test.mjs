import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { applySnapshotDelta } from '../../shared/snapshots.js';
import { startArenaServer } from '../index.mjs';

async function connect(port, origin = 'https://neon-rush-rsii.onrender.com') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
  const queue = [], waiters = [];
  let latest = null;
  function deliver(message) {
    const index = waiters.findIndex(waiter => waiter.predicate(message));
    if (index >= 0) { const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    else { queue.push(message); if (queue.length > 300) queue.shift(); }
  }
  ws.on('message', data => {
    const message = JSON.parse(data.toString());
    if (message.type === 'snapshot') latest = message.room;
    if (message.type === 'delta') latest = applySnapshotDelta(latest, message);
    deliver(message);
    if (latest && ['snapshot', 'delta'].includes(message.type)) deliver({ type: 'state', room: latest });
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return { ws, send: value => ws.send(JSON.stringify(value)), next: (type, condition = () => true) => {
    const predicate = message => message.type === type && condition(message);
    const index = queue.findIndex(predicate); if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => { const i = waiters.indexOf(waiter); if (i >= 0) waiters.splice(i, 1); reject(new Error(`Timed out waiting for ${type}`)); }, 5000);
      waiters.push(waiter);
    });
  } };
}
test('host settings synchronize, reject guests and enforce capacity for twelve real sockets', { timeout: 15000 }, async t => {
  const server = await startArenaServer({ port: 0, allowedOrigins: ['https://neon-rush-rsii.onrender.com'] });
  t.after(() => server.close());
  const peers = await Promise.all(Array.from({ length: 13 }, () => connect(server.port)));
  const host = peers[0];
  host.send({ type: 'create', name: 'Host', capacity: 2, mapId: 'foundry' });
  const session = await host.next('session');
  peers[1].send({ type: 'join', code: session.code, name: 'Guest1' });
  await peers[1].next('session');
  peers[2].send({ type: 'join', code: session.code, name: 'Guest2' });
  assert.match((await peers[2].next('error')).message, /full/);
  peers[1].send({ type: 'settings', capacity: 12, mapId: 'exchange' });
  assert.match((await peers[1].next('error')).message, /host/);
  host.send({ type: 'ready', ready: true });
  await host.next('state', m => m.room.players.some(p => p.ready));
  host.send({ type: 'settings', capacity: 12, mapId: 'foundry' });
  const changed = await peers[1].next('state', m => m.room.capacity === 12);
  assert.equal(changed.room.mapId, 'foundry');
  assert.ok(changed.room.players.every(p => !p.ready));
  for (let i = 2; i < 12; i++) {
    peers[i].send({ type: 'join', code: session.code, name: `Guest${i}` });
    await peers[i].next('session');
  }
  peers[12].send({ type: 'join', code: session.code, name: 'Overflow' });
  assert.match((await peers[12].next('error')).message, /full/);
  host.send({ type: 'settings', capacity: 11 });
  assert.match((await host.next('error')).message, /roster/);
  peers.slice(0, 12).forEach(peer => peer.send({ type: 'ready', ready: true }));
  await host.next('state', m => m.room.players.length === 12 && m.room.players.every(p => p.ready));
  host.send({ type: 'start' });
  await host.next('state', m => m.room.phase === 'countdown');
  host.send({ type: 'settings', capacity: 12, mapId: 'exchange' });
  assert.match((await host.next('error')).message, /lobby/);
  const room = server.rooms.get(session.code);
  room.phaseUntil = Date.now() - 1;
  await peers[11].next('state', m => m.room.phase === 'playing');
  const shooter = room.players.get(session.id), pickup = room.pickups.find(p => p.kind === 'pulse');
  Object.assign(shooter, { x: pickup.x, z: pickup.z });
  const received = await peers[11].next('state', m => m.room.players.find(p => p.id === session.id).weapon === 'pulse');
  assert.equal(received.room.players.find(p => p.id === session.id).ammo, 32);
  assert.ok(received.room.pickups.find(p => p.id === pickup.id).availableIn > 0);
});

test('two real WebSockets create, join, synchronize, resume, migrate host, and clean rooms', { timeout: 15000 }, async t => {
  const server = await startArenaServer({ port: 0, allowedOrigins: ['https://neon-rush-rsii.onrender.com'], reconnectGrace: 1000 });
  t.after(() => server.close());
  const a = await connect(server.port), b = await connect(server.port);
  a.send({ type: 'create', name: 'Alice', style: 'ion' }); const alice = await a.next('session');
  b.send({ type: 'join', code: alice.code, name: 'Bob', style: 'nova' }); const bob = await b.next('session');
  const roster = await a.next('snapshot', message => message.room.players.length === 2); assert.deepEqual(roster.room.players.map(p => p.name), ['Alice', 'Bob']);
  b.send({ type: 'start' }); assert.match((await b.next('error')).message, /host/);
  a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true });
  await a.next('snapshot', message => message.room.players.every(p => p.ready)); a.send({ type: 'start' });
  await b.next('snapshot', message => message.room.phase === 'countdown');
  server.rooms.get(alice.code).phaseUntil = Date.now() - 1;
  await b.next('snapshot', message => message.room.phase === 'playing');
  a.send({ type: 'input', input: { dx: 1, dz: 0, aimX: 5, aimZ: 0, fire: false, kills: 999, hp: 999, x: 9000 } });
  const moved = await b.next('snapshot', message => message.room.players.find(p => p.id === alice.id).x > -8.8);
  assert.equal(moved.room.players.find(p => p.id === alice.id).kills, 0);
  const closed = new Promise(resolve => a.ws.once('close', resolve)); a.ws.close(); await closed;
  await b.next('snapshot', message => message.room.players.find(p => p.id === alice.id)?.connected === false);
  const resumed = await connect(server.port); resumed.send({ type: 'resume', id: alice.id, token: alice.token });
  assert.equal((await resumed.next('session')).id, alice.id);
  await b.next('snapshot', message => message.room.players.find(p => p.id === alice.id)?.connected === true && message.room.hostId === bob.id);
  const intruder = await connect(server.port); intruder.send({ type: 'resume', id: bob.id, token: 'f'.repeat(64) });
  assert.equal((await intruder.next('error')).code, 'session_expired');
  const health = await (await fetch(`http://127.0.0.1:${server.port}/health`)).json(); assert.equal(health.online, 2);
  b.send({ type: 'leave' }); await b.next('left');
  const final = await resumed.next('snapshot', message => message.room.phase === 'finished'); assert.equal(final.room.hostId, alice.id);
  resumed.send({ type: 'leave' }); await resumed.next('left'); assert.equal(server.rooms.size, 0); assert.equal(server.sessions.size, 0);
});
test('origin validation, missing rooms, binary frames, and expired sessions fail cleanly', { timeout: 10000 }, async t => {
  const server = await startArenaServer({ port: 0, allowedOrigins: ['https://neon-rush-rsii.onrender.com'], reconnectGrace: 100 }); t.after(() => server.close());
  await assert.rejects(connect(server.port, 'https://untrusted.example'), /403/);
  const a = await connect(server.port); a.send({ type: 'join', code: 'ABC234', name: 'Alice' }); assert.match((await a.next('error')).message, /not found/);
  a.send({ type: 'create', name: 'Alice' }); const session = await a.next('session');
  const closed = new Promise(resolve => a.ws.once('close', resolve)); a.ws.close(); await closed;
  await new Promise(resolve => setTimeout(resolve, 170));
  const b = await connect(server.port); b.send({ type: 'resume', id: session.id, token: session.token }); assert.equal((await b.next('error')).code, 'session_expired');
  assert.equal(server.rooms.size, 0);
  const binaryClose = new Promise(resolve => b.ws.once('close', resolve)); b.ws.send(Buffer.from([0, 1, 2])); assert.equal(await binaryClose, 1008);
});
test('voice signaling is relayed in-room, muted state syncs, and strangers are ignored', { timeout: 10000 }, async t => {
  const server = await startArenaServer({ port: 0, allowedOrigins: ['https://neon-rush-rsii.onrender.com'] }); t.after(() => server.close());
  const a = await connect(server.port), b = await connect(server.port), stray = await connect(server.port);
  a.send({ type: 'create', name: 'Alice', style: 'ion' }); const alice = await a.next('session');
  b.send({ type: 'join', code: alice.code, name: 'Bob', style: 'nova' }); const bob = await b.next('session');
  stray.send({ type: 'create', name: 'Carol', style: 'solar' }); const carol = await stray.next('session');
  const sdp = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
  a.send({ type: 'voice', to: bob.id, kind: 'offer', sdp });
  const offer = await b.next('voice'); assert.equal(offer.from, alice.id); assert.equal(offer.kind, 'offer'); assert.equal(offer.sdp, sdp);
  b.send({ type: 'voice', to: alice.id, kind: 'answer', sdp });
  const answer = await a.next('voice'); assert.equal(answer.from, bob.id); assert.equal(answer.kind, 'answer');
  a.send({ type: 'voice', to: bob.id, kind: 'ice', candidate: { candidate: 'candidate:1 1 UDP 1 127.0.0.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
  const ice = await b.next('voice'); assert.equal(ice.kind, 'ice'); assert.equal(ice.candidate.sdpMid, '0');
  a.send({ type: 'voice-state', muted: false });
  const unmuted = await b.next('snapshot', message => message.room.players.find(player => player.id === alice.id)?.muted === false);
  assert.equal(unmuted.room.players.find(player => player.id === bob.id).muted, true);
  a.send({ type: 'voice', to: carol.id, kind: 'offer', sdp });
  a.send({ type: 'voice', to: bob.id, kind: 'offer', sdp: 'short' });
  a.send({ type: 'voice', to: bob.id, kind: 'ice', candidate: { candidate: 'x'.repeat(600) } });
  stray.send({ type: 'voice', to: bob.id, kind: 'offer', sdp });
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(server.rooms.size, 2);
});
test('room chat is sanitized, broadcast in-room, and replayed to joiners', { timeout: 10000 }, async t => {
  const server = await startArenaServer({ port: 0, allowedOrigins: ['https://neon-rush-rsii.onrender.com'] }); t.after(() => server.close());
  const a = await connect(server.port), b = await connect(server.port), stray = await connect(server.port);
  a.send({ type: 'create', name: 'Alice', style: 'ion' }); const alice = await a.next('session');
  a.send({ type: 'chat', text: '  hello   arena\u0007  ' });
  const first = await a.next('chat'); assert.equal(first.message.text, 'hello arena'); assert.equal(first.message.from, alice.id);
  a.send({ type: 'chat', text: '' }); a.send({ type: 'chat', text: 'x'.repeat(90) });
  await new Promise(resolve => setTimeout(resolve, 450));
  a.send({ type: 'chat', text: 'x'.repeat(90) });
  const clipped = await a.next('chat'); assert.equal(clipped.message.text.length, 80);
  b.send({ type: 'join', code: alice.code, name: 'Bob', style: 'nova' });
  const history = await b.next('chat-history'); assert.equal(history.messages.length, 2); assert.equal(history.messages[0].text, 'hello arena');
  stray.send({ type: 'create', name: 'Carol', style: 'solar' }); await stray.next('session');
  b.send({ type: 'chat', text: 'glhf' });
  const relay = await a.next('chat'); assert.equal(relay.message.text, 'glhf'); assert.equal(relay.message.name, 'Bob');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(await Promise.race([stray.next('chat').then(() => 'leaked'), new Promise(resolve => setTimeout(() => resolve('ok'), 60))]), 'ok');
});

test('protocol 2: six players, deltas, bounded input, reliable events under pressure, resync and resume', { timeout: 15000 }, async t => {
  const server = await startArenaServer({ port: 0 }); t.after(() => server.close());
  const clients = await Promise.all(Array.from({ length: 6 }, () => connect(server.port)));
  clients[0].send({ type: 'create', protocol: 2, name: 'Player 0' });
  const sessions = [await clients[0].next('session')];
  for (let i = 1; i < clients.length; i++) {
    clients[i].send({ type: 'join', protocol: 2, code: sessions[0].code, name: `Player ${i}` }); sessions.push(await clients[i].next('session'));
  }
  const outsider = await connect(server.port); outsider.send({ type: 'create', protocol: 2, name: 'Other room' });
  const outsideSession = await outsider.next('session');
  const outsideState = await outsider.next('state'); assert.equal(outsideState.room.code, outsideSession.code); assert.equal(outsideState.room.players.length, 1);
  clients.forEach(client => client.send({ type: 'ready', ready: true }));
  await clients[0].next('state', message => message.room.players.length === 6 && message.room.players.every(p => p.ready));
  clients[0].send({ type: 'start' }); await clients[0].next('state', message => message.room.phase === 'countdown');
  const room = server.rooms.get(sessions[0].code); room.phaseUntil = 0;
  await clients[0].next('state', message => message.room.phase === 'playing');
  const sequence = Array(6).fill(0), started = performance.now(), ticksBefore = server.metrics.ticks;
  const inputTimer = setInterval(() => clients.forEach((client, id) => {
    const dx = Math.floor(sequence[id] / 20) % 2 ? -1 : 1;
    client.send({ type: 'input', round: room.round, inputs: Array.from({ length: 2 }, () => ({ seq: ++sequence[id], dx, dz: 0, aimX: 0, aimZ: 0, fire: false, dt: 999, x: 999 })) });
  }), 1000 / 30);
  t.after(() => clearInterval(inputTimer));
  await clients[0].next('state', message => message.room.players.every(p => p.ack >= 120)); clearInterval(inputTimer);
  const elapsed = (performance.now() - started) / 1000;
  assert.ok(server.metrics.ticks - ticksBefore >= 60);
  assert.ok([...room.players.values()].every(p => p.kills === 0 && Math.abs(p.x) < 13));
  assert.ok((await clients[0].next('delta')).base >= 0);
  // Emulate an already congested sender without flooding the actual test host.
  const socket = server.sessions.get(sessions[0].id).ws; let queued = 100_000;
  Object.defineProperty(socket, 'bufferedAmount', { configurable: true, get: () => queued });
  const skippedBefore = server.metrics.skippedSnapshots;
  room.notice('Reliable event during congestion');
  assert.equal((await clients[0].next('event', message => message.event.text === 'Reliable event during congestion')).event.text, 'Reliable event during congestion');
  await new Promise(resolve => setTimeout(resolve, 100)); assert.ok(server.metrics.skippedSnapshots > skippedBefore);
  const beforeRecovery = room.snapshotId; queued = 0;
  await clients[0].next('snapshot', message => message.room.snapshotId > beforeRecovery);
  delete socket.bufferedAmount;
  clients[0].send({ type: 'resync' }); await clients[0].next('snapshot', message => message.room.snapshotId >= beforeRecovery);
  const closed = new Promise(resolve => clients[0].ws.once('close', resolve)); clients[0].ws.close(); await closed;
  const resumed = await connect(server.port); resumed.send({ type: 'resume', protocol: 2, id: sessions[0].id, token: sessions[0].token });
  const session = await resumed.next('session'); assert.ok(session.ack >= 120);
  resumed.send({ type: 'input', round: room.round, inputs: [{ seq: session.ack + 1, dx: 0, dz: 1, aimX: 0, aimZ: 0, fire: false }] });
  await resumed.next('state', message => message.room.players.find(p => p.id === session.id).ack === session.ack + 1);
  const health = await (await fetch(`http://127.0.0.1:${server.port}/health`)).json();
  console.log(JSON.stringify({ realSocketPlayers: 6, isolatedRooms: 2, elapsedSeconds: +elapsed.toFixed(3), measuredTickHz: +((server.metrics.ticks - ticksBefore) / ((performance.now() - started) / 1000)).toFixed(2), maxStepMs: +health.metrics.maxStepMs.toFixed(3), eventLoopP99Ms: +health.metrics.eventLoopP99Ms.toFixed(3), memoryMB: +health.metrics.memoryMB.toFixed(1) }));
});

test('server accepts 20/30/60 Hz and rejects unsupported configuration', async t => {
  for (const tickRate of [20, 30, 60]) {
    const server = await startArenaServer({ port: 0, tickRate });
    assert.equal(server.metrics.tickRate, tickRate); await server.close();
  }
  await assert.rejects(startArenaServer({ port: 0, tickRate: 25 }), /tick rate/);
  await assert.rejects(startArenaServer({ port: 0, snapshotRate: 120 }), /snapshot rate/);
});
