import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/engine.ts';

function running() {
  const engine = new GameEngine(() => 0.42);
  engine.start();
  for (let i = 0; i < 31; i++) engine.update(0.1);
  engine.entities = [];
  assert.equal(engine.phase, 'running');
  return engine;
}

test('countdown, pause, resume and restart preserve or reset the right state', () => {
  const engine = running();
  engine.update(0.1);
  engine.pause();
  const distance = engine.distance;
  for (let i = 0; i < 10; i++) engine.update(0.1);
  assert.equal(engine.distance, distance);
  engine.resume(); engine.update(0.1);
  assert.ok(engine.distance > distance);
  engine.start();
  assert.equal(engine.distance, 0); assert.equal(engine.score, 0); assert.equal(engine.phase, 'countdown');
});

test('lane movement is smooth and bounded', () => {
  const engine = running();
  engine.act('right'); engine.act('right');
  assert.equal(engine.lane, 1);
  engine.update(0.016);
  assert.ok(engine.x > 0 && engine.x < 2.5);
  for (let i = 0; i < 15; i++) engine.update(0.1);
  assert.ok(Math.abs(engine.x - 2.5) < 0.001);
});

test('coins are collected only in range and add score', () => {
  const engine = running();
  engine.spawn('coin', 0, -0.3); engine.spawn('coin', 1, -0.3);
  engine.update(0.02);
  assert.equal(engine.coins, 1); assert.ok(engine.score >= 25);
  assert.equal(engine.entities.filter(e => e.kind === 'coin').length, 1);
});

test('obstacles end the run, while jumping clears a low barrier', () => {
  const hit = running(); hit.spawn('hurdle', 0, -0.3); hit.update(0.02); assert.equal(hit.phase, 'over');
  const jump = running(); jump.act('jump');
  for (let i = 0; i < 3; i++) jump.update(0.1);
  assert.ok(jump.y > 0.9);
  jump.spawn('hurdle', 0, -0.3); jump.update(0.02); assert.equal(jump.phase, 'running');
  const wall = running(); wall.spawn('wall', 0, -0.3); wall.update(0.02); assert.equal(wall.phase, 'over');
});

test('sliding clears a raised beam and expires', () => {
  const engine = running(); engine.act('slide'); engine.spawn('beam', 0, -0.3); engine.update(0.1);
  assert.equal(engine.phase, 'running');
  for (let i = 0; i < 10; i++) engine.update(0.1);
  assert.equal(engine.slide, 0);
  engine.spawn('beam', 0, -0.3); engine.update(0.02); assert.equal(engine.phase, 'over');
});

test('shield absorbs one hit; magnet collects adjacent coins; double doubles coin points', () => {
  const engine = running(); engine.spawn('shield', 0, -0.3); engine.update(0.02);
  engine.spawn('wall', 0, -0.3); engine.update(0.02);
  assert.equal(engine.phase, 'running'); assert.equal(engine.powers.shield, 0); assert.ok(engine.invincible > 0);
  engine.spawn('magnet', 0, -0.3); engine.spawn('double', 0, -0.3); engine.update(0.02);
  const score = engine.score;
  engine.spawn('coin', -1, -5); engine.spawn('coin', 1, -5); engine.update(0.02);
  assert.equal(engine.coins, 2); assert.ok(engine.score >= score + 100);
  const timer = engine.powers.magnet; engine.pause(); engine.update(0.1); assert.equal(engine.powers.magnet, timer);
});

test('substeps catch a fast collision despite a delayed frame', () => {
  const engine = running(); engine.distance = 5000; engine.spawn('wall', 0, -1.5); engine.update(0.1);
  assert.equal(engine.phase, 'over');
});

test('procedural rows leave an open lane and difficulty increases with a speed cap', () => {
  const engine = running(); let rows = 0;
  for (let i = 0; i < 3000; i++) {
    engine.entities = []; engine.update(0.1);
    const hazards = engine.entities.filter(e => ['wall', 'hurdle', 'beam'].includes(e.kind));
    if (hazards.length) { rows++; assert.ok(new Set(hazards.map(e => e.lane)).size < 3); }
  }
  assert.ok(rows > 100); assert.equal(engine.speed, 36); assert.equal(engine.phase, 'running');
});
