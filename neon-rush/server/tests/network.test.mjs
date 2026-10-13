import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startArenaServer } from '../index.mjs';

async function connect(port, origin = 'https://neon-rush-rsii.onrender.com') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
  const queue = [], waiters = [];
  ws.on('message', data => {
    const message = JSON.parse(data.toString());
    const index = waiters.findIndex(waiter => waiter.predicate(message));
    if (index >= 0) { const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    else { queue.push(message); if (queue.length > 300) queue.shift(); }
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
