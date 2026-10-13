import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRoom, cleanName, segmentBox, segmentCircle } from '../arena.mjs';
import { ARENA } from '../../shared/arena.js';

function setup() {
  let now = 1000;
  const room = new ArenaRoom('ABC234', () => now);
  const one = room.addPlayer('one', 'Alpha', 'ion'), two = room.addPlayer('two', 'Bravo', 'nova');
  const tick = (seconds, input) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) { now += 1000 / 60; if (input) input(); room.tick(1 / 60, now); } };
  const start = () => { room.ready('one', true); room.ready('two', true); room.start('one'); tick(3.05); };
  return { room, one, two, tick, start };
}
test('names, capacity, host permissions, ready checks, countdown, and rematch are enforced', () => {
  const { room, one, start } = setup();
  assert.equal(cleanName('  Neon   Hero  '), 'Neon Hero');
  assert.throws(() => cleanName('!'));
  assert.throws(() => room.addPlayer('duplicate', 'alpha', 'ion'));
  assert.throws(() => room.start('two'), /host/);
  assert.throws(() => room.start('one'), /ready/);
  start(); assert.equal(room.phase, 'playing'); assert.equal(room.round, 1);
  assert.throws(() => room.addPlayer('late', 'Charlie', 'ion'), /started/);
  one.kills = 2; room.finish('Test result'); assert.deepEqual(room.winners, ['one']);
  assert.throws(() => room.lobby('two'), /host/);
  room.lobby('one'); assert.equal(room.phase, 'lobby'); assert.ok([...room.players.values()].every(player => !player.ready));
  for (let i = 0; i < 4; i++) room.addPlayer(`extra${i}`, `Extra ${i}`, 'ion');
  assert.throws(() => room.addPlayer('overflow', 'Too Many', 'ion'), /full/);
});
test('movement is server bounded, normalized, collision checked, and stops with stale input', () => {
  const { room, one, tick, start } = setup(); start();
  Object.assign(one, { x: -10, z: 0 });
  const input = { dx: 999, dz: 999, aimX: 0, aimZ: 0, fire: false, x: 9999, hp: 999 };
  const x = one.x, z = one.z; tick(0.2, () => room.setInput('one', input));
  assert.ok(Math.hypot(one.x - x, one.z - z) <= ARENA.speed * 0.22); assert.equal(one.hp, 100);
  const before = { x: one.x, z: one.z }; room.setInput('one', { dx: NaN, dz: 0, aimX: 0, aimZ: 0 });
  tick(1); const stopped = { x: one.x, z: one.z }; tick(0.2); assert.equal(one.x, stopped.x); assert.equal(one.z, stopped.z);
  assert.ok(Math.hypot(stopped.x - before.x, stopped.z - before.z) <= ARENA.speed * 0.6);
  Object.assign(one, { x: -5.5, z: -10 });
  tick(1, () => room.setInput('one', { dx: 0, dz: 1, aimX: 0, aimZ: 0, fire: false }));
  assert.ok(one.z < -7.2, 'Cover blocks movement');
  Object.assign(one, { x: -12, z: -14 });
  tick(1, () => room.setInput('one', { dx: -1, dz: -1, aimX: 0, aimZ: 0, fire: false }));
  assert.ok(one.x >= -ARENA.width / 2 + ARENA.playerRadius); assert.ok(one.z >= -ARENA.depth / 2 + ARENA.playerRadius);
});
test('server shots cause real eliminations, score changes, respawns, and shields', () => {
  const { room, one, two, tick, start } = setup(); start();
  Object.assign(one, { x: -10, z: -8, shield: 0 }); Object.assign(two, { x: -10, z: -2, shield: 0 });
  tick(1.1, () => room.setInput('one', { dx: 0, dz: 0, aimX: two.x, aimZ: two.z, fire: true }));
  assert.equal(two.hp, 0); assert.equal(two.deaths, 1); assert.equal(one.kills, 1); assert.ok(one.ammo < ARENA.magazine);
  assert.equal(room.events[0].kind, 'kill');
  room.setInput('one', { dx: 0, dz: 0, aimX: two.x, aimZ: two.z, fire: false }); tick(3.1);
  assert.equal(two.hp, 100); assert.ok(two.shield > 0); assert.equal(two.ammo, ARENA.magazine);
  assert.ok(Math.hypot(two.x - one.x, two.z - one.z) > 15, 'Respawn chooses a distant spawn');
});
test('cover absorbs projectiles, spawn immunity blocks damage, and firing cancels immunity', () => {
  const { room, one, two, tick, start } = setup(); start();
  Object.assign(one, { x: -5.5, z: -10, shield: 0 }); Object.assign(two, { x: -5.5, z: -3, shield: 0 });
  tick(1.2, () => room.setInput('one', { dx: 0, dz: 0, aimX: two.x, aimZ: two.z, fire: true }));
  assert.equal(two.hp, 100, 'Bullets cannot pass through cover');
  room.bullets = []; Object.assign(one, { x: -10, z: -4, shield: 1.5, cooldown: 0, ammo: 16 }); Object.assign(two, { x: -10, z: -2, shield: 1.5 });
  tick(0.3, () => room.setInput('one', { dx: 0, dz: 0, aimX: two.x, aimZ: two.z, fire: true }));
  assert.equal(two.hp, 100); assert.equal(one.shield, 0);
});
test('reload, dash cooldown, no-client health or score authority, and win limit', () => {
  const { room, one, two, tick, start } = setup(); start();
  one.ammo = 0; tick(0.02); assert.ok(one.reload > 0); tick(1.4); assert.equal(one.ammo, ARENA.magazine);
  room.setInput('one', { dx: 1, dz: 0, aimX: 0, aimZ: 0, fire: false, dash: true, hp: 500, kills: 200 }); tick(0.05);
  assert.ok(one.dashCooldown > 2.8); assert.equal(one.kills, 0); assert.equal(one.hp, 100);
  one.kills = ARENA.winningKills - 1;
  Object.assign(one, { x: -10, z: -8, shield: 0, cooldown: 0, dashTime: 0 }); Object.assign(two, { x: -10, z: -2, shield: 0, hp: 25 });
  tick(0.5, () => room.setInput('one', { dx: 0, dz: 0, aimX: two.x, aimZ: two.z, fire: true }));
  assert.equal(room.phase, 'finished'); assert.deepEqual(room.winners, ['one']); assert.equal(room.bullets.length, 0);
});
test('disconnect cancels countdown, migrates host, and removes empty opposition; ties are shared', () => {
  const { room, one, two, start, tick } = setup();
  room.ready('one', true); room.ready('two', true); room.start('one'); room.setConnected('one', false);
  assert.equal(room.phase, 'lobby'); assert.equal(room.hostId, 'two'); assert.equal(one.ready, false);
  room.setConnected('one', true); room.hostId = 'one'; start();
  one.kills = 3; two.kills = 3; room.matchEnds = 0; tick(0.02); assert.deepEqual(room.winners, ['one', 'two']);
  room.lobby('one'); start(); room.removePlayer('one'); assert.equal(room.hostId, 'two'); assert.equal(room.phase, 'finished');
  const publicPlayer = room.snapshot().players[0]; assert.equal('input' in publicPlayer, false); assert.equal('token' in publicPlayer, false);
});
test('swept collision tests catch narrow walls and players even between snapshots', () => {
  assert.ok(segmentBox(-10, 0, 20, 0, { x: 0, z: 0, width: 1, depth: 2 }) < 0.5);
  assert.ok(segmentCircle(-10, 0, 20, 0, 0, 0, 0.5) < 0.5);
  assert.equal(segmentCircle(-10, 3, 20, 0, 0, 0, 0.5), Infinity);
});
