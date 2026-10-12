import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CombatSystem, crossesCover, inCombat, segmentDistance } from '../src/game/combat.ts';
import type { CombatHooks, PlayerTarget } from '../src/game/combat.ts';
import { GameEngine } from '../src/game/engine.ts';
import { getLevel, LEVELS } from '../src/game/levels.ts';
import { completeLevel, freshProgress, loadProgress, purchaseUpgrade, saveProgress } from '../src/game/progression.ts';
import type { StorageLike } from '../src/game/progression.ts';

const player: PlayerTarget = { x: 0, y: 0, crouching: false, invincible: false };
const hooks: CombatHooks = { damage: () => {}, reward: () => {}, pickup: () => {} };
function tick(system: CombatSystem, seconds: number, target = player, callbacks = hooks) { for (let t = 0; t < seconds; t += 1 / 120) system.update(1 / 120, target, callbacks); }
function arena(level = 1, boss = false) { const system = new CombatSystem(); system.reset(5, freshProgress().upgrades); system.begin(getLevel(level), boss); return system; }
function memory(): StorageLike { const data = new Map<string, string>(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }; }

test('swept collision catches high-speed projectiles and cover only blocks low shots', () => {
  assert.equal(segmentDistance(0, 1, 5, 0, 1, -5, 0, 1, 0), 0);
  assert.ok(crossesCover(-2.5, 0.8, -5, -2.5, 0.8, 0));
  assert.equal(crossesCover(-2.5, 1.5, -5, -2.5, 1.5, 0), false);
  assert.equal(crossesCover(0, 0.8, -5, 0, 0.8, 0), false);
});

test('player projectiles hit enemies and precise aim produces critical feedback', () => {
  const system = arena(); const enemy = system.spawn('turret', 0, -12)!;
  system.aim = { x: 0, y: 1.65, z: -12 }; system.setFiring(true);
  tick(system, 0.22);
  assert.ok(enemy.hp < enemy.maxHp - 24, 'Core hit should exceed base damage');
  assert.ok(system.hits > 0); assert.ok(system.critical > 0); assert.equal(system.ammo.blaster, 13);
});

test('ammunition, reload, unlocked cycling and charged laser use real timers', () => {
  const system = arena(); system.ammo.blaster = 2; system.reload(); tick(system, 0.5);
  assert.equal(system.ammo.blaster, 2); assert.ok(system.reloading > 0);
  tick(system, 0.7); assert.equal(system.ammo.blaster, 14);
  system.unlocked = 1; system.switchWeapon(); assert.equal(system.weapon, 'pulse'); system.switchWeapon(); assert.equal(system.weapon, 'blaster');
  system.unlocked = 3; system.weapon = 'laser'; system.cooldown = 0; system.setFiring(true); tick(system, 0.5);
  assert.equal(system.ammo.laser, 5); assert.ok(system.charge > 0);
  tick(system, 0.35); assert.equal(system.ammo.laser, 4); assert.ok(system.projectiles.some(p => p.active && p.laser));
});

test('enemy AI telegraphs before firing and respects attack cooldowns', () => {
  const system = arena(); const enemy = system.spawn('sniper', 0, -15)!; enemy.cooldown = 0.1;
  tick(system, 0.12); assert.ok(enemy.telegraph > 1.3); assert.equal(system.projectiles.filter(p => !p.friendly && p.active).length, 0);
  tick(system, 1.65); assert.ok(system.projectiles.some(p => p.active && !p.friendly)); assert.ok(enemy.cooldown > 3);
});

test('enemy shots damage the player, while cover and dash prevent hits', () => {
  const shotAtPlayer = (system: CombatSystem, x: number, y: number) => Object.assign(system.projectiles[0], { active: true, friendly: false, x, y, z: -4, vx: 0, vy: 0, vz: 20, ttl: 2, damage: 15, color: '#f00', radius: 0.15 });
  let damage = 0;
  const callbacks = { ...hooks, damage: (value: number) => { damage += value; } };
  const system = arena(); shotAtPlayer(system, 0, 0.9); tick(system, 0.3, player, callbacks); assert.equal(damage, 15);
  damage = 0; shotAtPlayer(system, -2.5, 0.5); tick(system, 0.3, { ...player, x: -2.5, crouching: true }, callbacks); assert.equal(damage, 0);
  shotAtPlayer(system, 0, 0.9); assert.ok(system.dash()); tick(system, 0.25, player, callbacks); assert.equal(damage, 0); assert.equal(system.dash(), false);
});

test('shield bots expose their defenses while attacking; kills award combo rewards', () => {
  const system = arena(3), enemy = system.spawn('shield', 0, -16)!; enemy.weak = false;
  let rewards = 0; const callbacks = { ...hooks, reward: (value: number) => { rewards += value; } };
  const before = enemy.hp; system.damageEnemy(enemy, 30, false, callbacks); assert.ok(before - enemy.hp < 6);
  enemy.weak = true; const open = enemy.hp; system.damageEnemy(enemy, 30, false, callbacks); assert.equal(open - enemy.hp, 30);
  system.damageEnemy(enemy, 1000, true, callbacks); assert.equal(enemy.active, false); assert.equal(system.kills, 1); assert.ok(rewards > 0); assert.equal(system.combo, 1);
});

test('wave spawns are deterministic and all levels have distinct bosses and patterns', () => {
  const a = arena(2), b = arena(2); tick(a, 1.5); tick(b, 1.5);
  const positions = (system: CombatSystem) => system.enemies.filter(e => e.active).map(e => [e.kind, e.homeX, e.z, e.cooldown]);
  assert.deepEqual(positions(a), positions(b)); assert.equal(a.wave, 1);
  assert.equal(new Set(LEVELS.map(level => level.boss)).size, 5);
  assert.equal(new Set(LEVELS.map(level => level.sky)).size, 5);
});

test('boss phases change at health thresholds and telegraphed hazards resolve fairly', () => {
  const system = arena(1, true), boss = system.enemies.find(e => e.active)!;
  boss.hp = boss.maxHp * 0.6; tick(system, 0.02); assert.equal(boss.phase, 2);
  boss.hp = boss.maxHp * 0.2; tick(system, 0.02); assert.equal(boss.phase, 3);
  let damage = 0; const callbacks = { ...hooks, damage: (value: number) => { damage += value; } };
  system.enemies.forEach(e => { e.cooldown = 100; });
  Object.assign(system.hazards[0], { active: true, kind: 'laser', x: 0, time: 0, fired: false });
  tick(system, 1, player, callbacks); assert.equal(damage, 0);
  tick(system, 0.3, { ...player, x: 2.5 }, callbacks); assert.equal(damage, 0);
  Object.assign(system.hazards[1], { active: true, kind: 'shockwave', x: 0, z: -2, time: 0, fired: false });
  tick(system, 0.3, { ...player, y: 1.5 }, callbacks); assert.equal(damage, 0);
});

test('the final district deploys all previous enemy types and elite units', () => {
  const system = arena(5), seen = new Set<string>();
  for (let wave = 0; wave < 3; wave++) {
    tick(system, 2);
    for (const enemy of system.enemies) if (enemy.active) { seen.add(enemy.kind); system.damageEnemy(enemy, 10000, true, hooks); }
  }
  for (const kind of getLevel(5).enemies) assert.ok(seen.has(kind), `Missing enemy type ${kind}`);
});

test('campaign obstacle damage uses armor before health and pause freezes combat', () => {
  const engine = new GameEngine(); engine.startLevel(1); engine.deploy(); for (let i = 0; i < 31; i++) engine.update(0.1);
  engine.entities = []; engine.spawn('wall', 0, -0.3); engine.update(0.02);
  assert.equal(engine.phase, 'running'); assert.equal(engine.health, 100); assert.equal(engine.armor, 5);
  engine.segmentDistance = getLevel(1).runLength; engine.update(0.02); assert.equal(engine.phase, 'transition');
  for (let i = 0; i < 25; i++) engine.update(0.1);
  assert.equal(engine.phase, 'combat'); engine.combat.ammo.blaster = 2; engine.reload(); engine.pause();
  const reload = engine.combat.reloading, time = engine.missionTime;
  engine.update(0.1); assert.equal(engine.combat.reloading, reload); assert.equal(engine.missionTime, time); assert.equal(engine.combat.firing, false);
});

test('checkpoint restoration resets transient combat, restores score and applies retry rating penalty', () => {
  const engine = new GameEngine(); engine.startLevel(1); engine.deploy();
  for (let i = 0; i < 31; i++) engine.update(0.1);
  engine.entities = []; engine.score = 400; engine.coins = 12; engine.segmentDistance = 160; engine.update(0.01);
  const saved = structuredClone(engine.progress.checkpoint)!; assert.equal(saved.stage, 'combat');
  engine.score = 9999; engine.health = 1; engine.combat.firing = true;
  assert.ok(engine.continueCheckpoint()); assert.equal(engine.score, saved.score); assert.equal(engine.coins, saved.coins); assert.equal(engine.health, 100);
  assert.equal(engine.damageTaken, saved.damage + 25); assert.equal(engine.combat.firing, false);
  for (let i = 0; i < 25; i++) engine.update(0.1); assert.equal(engine.phase, 'combat');
});

test('progress persists safely, unlocks levels, banks credits and purchases capped upgrades', () => {
  const storage = memory(), progress = freshProgress();
  completeLevel(progress, 1, 2500, 30, 2, ['first-clear']); saveProgress(progress, storage);
  const restored = loadProgress(storage); assert.equal(restored.unlocked, 2); assert.equal(restored.bank, 90); assert.equal(restored.stars[1], 2);
  assert.ok(purchaseUpgrade(restored, 'blaster')); assert.equal(restored.bank, 30); assert.equal(restored.upgrades.blaster, 1);
  assert.equal(purchaseUpgrade(restored, 'blaster'), false);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadProgress(blocked).unlocked, 1); assert.doesNotThrow(() => saveProgress(restored, blocked));
  storage.setItem('neon-rush-campaign-v1', '{broken'); assert.equal(loadProgress(storage).unlocked, 1);
  const locked = new GameEngine(); locked.progress = freshProgress(); assert.equal(locked.startLevel(5), false); assert.equal(locked.phase, 'menu');
});

export function pilot(engine: GameEngine) {
  if (engine.phase === 'running') {
    const hazards = engine.entities.filter(e => e.active && ['wall', 'hurdle', 'beam'].includes(e.kind) && e.z > -13 && e.z < 1);
    if (hazards.some(e => e.lane === engine.lane)) {
      const safe = [-1, 0, 1].find(lane => !hazards.some(e => e.lane === lane));
      if (safe !== undefined && safe !== engine.lane) engine.act(safe < engine.lane ? 'left' : 'right');
    }
  } else if (inCombat(engine.phase)) {
    const target = engine.combat.enemies.find(e => e.active);
    if (target) { engine.combat.aim = { x: target.x, y: target.y + 0.45, z: target.z }; engine.fire(true); }
    const imminent = engine.combat.projectiles.some(p => p.active && !p.friendly && p.z > -6 && Math.abs(p.x - engine.x) < 1.2);
    if (imminent) engine.dash();
    for (const hazard of engine.combat.hazards) if (hazard.active) {
      if (hazard.kind === 'shockwave' && hazard.z > -5 && hazard.z < -2) engine.act('jump');
      if (hazard.kind === 'laser' && Math.abs(hazard.x - engine.x) < 1 && hazard.time > 0.3) { engine.act(engine.lane > 0 ? 'left' : 'right'); }
    }
  } else if (engine.phase === 'upgrade') engine.chooseUpgrade('armor');
}

for (const level of LEVELS) test(`Level ${level.id}: real projectiles complete runner → waves → upgrade → runner → ${level.boss} → unlock`, () => {
  const engine = new GameEngine(() => 0.42); engine.progress = freshProgress(); engine.progress.unlocked = level.id;
  engine.startLevel(level.id); engine.deploy();
  const phases = new Set<string>();
  for (let i = 0; i < 120 * 220 && !['victory', 'over'].includes(engine.phase); i++) { phases.add(engine.phase); pilot(engine); engine.update(1 / 120); }
  assert.equal(engine.phase, 'victory', `Stopped in ${engine.phase}, HP ${engine.health}, kills ${engine.combat.kills}, time ${engine.missionTime.toFixed(1)}`);
  for (const phase of ['running', 'combat', 'upgrade', 'boss', 'transition']) assert.ok(phases.has(phase), `Missing ${phase}`);
  assert.ok(engine.combat.hits > 0); assert.ok(engine.stars >= 1); assert.equal(engine.progress.unlocked, Math.min(5, level.id + 1));
  assert.equal(engine.progress.checkpoint, null); assert.ok(engine.progress.bank > 0);
});
