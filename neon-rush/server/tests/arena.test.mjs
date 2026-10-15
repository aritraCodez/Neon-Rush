import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRoom, cleanName, segmentBox, segmentCircle } from '../arena.mjs';
import { ARENA, ARENA_MAPS, arenaWeapon } from '../../shared/arena.js';

function setup() {
  let now = 1000;
  const room = new ArenaRoom('ABC234', () => now);
  const one = room.addPlayer('one', 'Alpha', 'ion'), two = room.addPlayer('two', 'Bravo', 'nova');
  const tick = (seconds, input) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) { now += 1000 / 60; if (input) input(); room.tick(1 / 60, now); } };
  const start = () => { room.ready('one', true); room.ready('two', true); room.start('one'); tick(3.05); };
  return { room, one, two, tick, start };
}

test('host settings validate capacity, reset readiness, enforce room limits and support twelve unique spawns', () => {
  const { room, one, two } = setup();
  assert.throws(() => room.configure('two', { capacity: 3 }), /host/);
  for (const capacity of [1, 13, 2.5, '4']) assert.throws(() => room.configure('one', { capacity }), /Choose/);
  assert.throws(() => room.configure('one', { mapId: 'missing' }), /map/);
  room.ready('one', true); room.ready('two', true);
  room.configure('one', { capacity: 2, mapId: 'foundry' });
  assert.equal(one.ready, false); assert.equal(two.ready, false);
  assert.throws(() => room.addPlayer('third', 'Third'), /full/);
  room.configure('one', { capacity: 12 });
  for (let i = 2; i < 12; i++) room.addPlayer(`extra${i}`, `Player ${i}`);
  assert.equal(new Set([...room.players.values()].map(p => `${p.x},${p.z}`)).size, 12);
  assert.throws(() => room.configure('one', { capacity: 11 }), /roster/);
  for (const player of room.players.values()) room.ready(player.id, true);
  room.start('one'); assert.equal(room.snapshot().mapId, 'foundry'); assert.equal(room.snapshot().capacity, 12);
  assert.throws(() => room.configure('one', { capacity: 12 }), /lobby/);
});

test('all map spawns and pickup stations are inside the arena and clear of cover', () => {
  for (const map of ARENA_MAPS) for (const point of [...map.spawns, ...map.pickups]) {
    assert.ok(Math.abs(point.x) < map.width / 2 - ARENA.playerRadius);
    assert.ok(Math.abs(point.z) < map.depth / 2 - ARENA.playerRadius);
    assert.ok(map.cover.every(box => Math.abs(point.x - box.x) >= box.width / 2 + ARENA.playerRadius || Math.abs(point.z - box.z) >= box.depth / 2 + ARENA.playerRadius), `${map.id}: blocked station/spawn`);
  }
});

test('pickups are awarded by server proximity, respawn, and reset weapons on death', () => {
  const { room, one, two, start, tick } = setup(); start();
  const pickup = room.pickups.find(p => p.kind === 'pulse');
  Object.assign(one, { x: pickup.x, z: pickup.z });
  tick(0.02);
  assert.equal(one.weapon, 'pulse'); assert.equal(one.ammo, arenaWeapon('pulse').magazine);
  assert.ok(pickup.availableIn > 11);
  Object.assign(two, { x: pickup.x, z: pickup.z }); tick(0.02); assert.equal(two.weapon, 'blaster');
  one.x = -11; two.x = 11; tick(12.1); assert.equal(pickup.availableIn, 0);
  const health = room.pickups.find(p => p.kind === 'health');
  Object.assign(one, { x: health.x, z: health.z, hp: 45 }); tick(0.02); assert.equal(one.hp, 85);
  const armor = room.pickups.find(p => p.kind === 'armor');
  Object.assign(one, { x: armor.x, z: armor.z }); tick(0.02); assert.equal(one.armor, 50);
  room.respawn(one); assert.equal(one.weapon, 'blaster'); assert.equal(one.armor, 0);
});

test('weapon pickups change projectile spread, cadence and reload; armor absorbs damage', () => {
  const { room, one, two, start, tick } = setup(); start();
  Object.assign(one, { x: -10, z: -8, shield: 0, weapon: 'shotgun', ammo: 6 });
  Object.assign(two, { x: 10, z: 10 });
  room.setInput('one', { dx: 0, dz: 0, aimX: -10, aimZ: 5, fire: true }); tick(0.02);
  assert.equal(room.bullets.length, 5); assert.equal(one.ammo, 5);
  assert.equal(new Set(room.bullets.map(b => b.vx.toFixed(3))).size, 5);
  room.setInput('one', { dx: 0, dz: 0, aimX: -10, aimZ: 5, fire: false, reload: true }); tick(1.8);
  assert.equal(one.ammo, 6);
  room.bullets = []; Object.assign(one, { weapon: 'laser', ammo: 5, cooldown: 0, reload: 0 });
  Object.assign(two, { x: -10, z: -4, shield: 0, hp: 100, armor: 50 });
  room.setInput('one', { dx: 0, dz: 0, aimX: two.x, aimZ: two.z, fire: true }); tick(0.1);
  assert.equal(two.armor, 0); assert.equal(two.hp, 95);
});

test('shots align with target after movement and directional touch aim stays fixed while moving', () => {
  const { room, one, two, start } = setup(); start();
  Object.assign(one, { x: -10, z: -8, shield: 0 }); Object.assign(two, { x: 10, z: 10 });
  room.setInput('one', { dx: 1, dz: 0, aimX: -10, aimZ: -4, fire: true }); room.step(1 / 60, 4100);
  const shot = room.bullets[0]; const dx = -10 - one.x, dz = -4 - one.z;
  assert.ok(Math.abs(shot.vx * dz - shot.vz * dx) < 1e-8);
  assert.ok(Math.hypot(shot.x - one.x, shot.z - one.z) > 0.7, 'bolt starts at the gun, not the body');
  room.bullets = []; one.cooldown = 0;
  room.setInput('one', { dx: 1, dz: 1, aimX: 0, aimZ: 0, aimDX: 0, aimDZ: -1, fire: true }); room.step(1 / 60, 4100);
  assert.ok(Math.abs(room.bullets[0].vx) < 1e-8); assert.ok(room.bullets[0].vz < 0);
});
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
