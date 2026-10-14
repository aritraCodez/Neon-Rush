import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaSimulation } from '../src/multiplayer/simulation';
import { ArenaRoom } from '../server/arena.mjs';
import { FixedClock } from '../server/timing.mjs';
import { movePlayer, INPUT_DT } from '../shared/movement.js';
import { applySnapshotDelta, snapshotDelta } from '../shared/snapshots.js';
import type { ArenaCommand, ArenaPlayer, ArenaSnapshot } from '../shared/multiplayer';

const neutral = { dx: 0, dz: 0, aimX: 0, aimZ: 0, fire: false };
function setup(count = 2) {
  let now = 0;
  const room = new ArenaRoom('ABC234', () => now);
  for (let i = 0; i < count; i++) { room.addPlayer(String(i), `Player ${i}`, 'ion'); room.ready(String(i), true); }
  room.start('0'); room.phase = 'playing';
  return { room, clock: (value: number) => { now = value; }, snapshot: () => { room.snapshotId++; return structuredClone(room.snapshot(now)) as ArenaSnapshot; } };
}

test('fixed clock bounds stalls and consumes only fixed server time at 20/30/60 Hz', () => {
  for (const rate of [20, 30, 60]) {
    const fixed = new FixedClock(rate); let seconds = 0;
    for (const elapsed of [0.011, 0.021, 0.008, 0.035, 0.025]) fixed.advance(elapsed, (dt: number) => { assert.equal(dt, 1 / rate); seconds += dt; });
    assert.ok(Math.abs(seconds - 0.1) < 1e-8);
    assert.equal(fixed.advance(10, () => {}), 5); assert.ok(fixed.droppedMs > 9000);
  }
});

test('command flood, forged elapsed time, positions, gaps, duplicates, and invalid numbers cannot grant movement', () => {
  const { room, clock } = setup(); const player = room.players.get('0'); const initial = player.x;
  const command = (seq: number) => ({ ...neutral, dx: 1, seq, dt: 1000, x: 9000, kills: 999 });
  assert.equal(room.enqueueInputs('0', [command(2)]), false);
  assert.equal(room.enqueueInputs('0', [{ ...command(1), dx: NaN }]), false);
  for (let seq = 1; seq <= 120; seq += 8) assert.equal(room.enqueueInputs('0', Array.from({ length: 8 }, (_, i) => command(seq + i))), true);
  assert.equal(room.enqueueInputs('0', [command(121)]), false);
  assert.equal(room.enqueueInputs('0', [command(1)]), true);
  clock(33); room.tick(1 / 30, 33);
  assert.equal(player.ack, 2); assert.equal(player.commands.length, 118);
  assert.ok(player.x - initial <= 7 / 30 + 1e-9); assert.equal(player.kills, 0);
  room.setConnected('0', false); assert.equal(player.commands.length, 0);
  room.setConnected('0', true); assert.equal(room.enqueueInputs('0', [command(3)]), true);
});

test('prediction replays unacknowledged movement and dash through shared collisions', () => {
  const { room, snapshot, clock } = setup(); const sim = new ArenaSimulation();
  sim.receive(snapshot(), '0', 0);
  const input = { ...neutral, dx: 1, dz: -1, dash: true };
  sim.advance(INPUT_DT, input); assert.notEqual(sim.predicted!.x, -9, 'Moves before server runs');
  for (let i = 1; i < 90; i++) sim.advance(INPUT_DT, { ...input, dash: false });
  const expected = { ...sim.predicted! }; const commands = [...sim.pending];
  for (let i = 0; i < 90; i += 2) {
    assert.equal(room.enqueueInputs('0', commands.slice(i, i + 2)), true);
    clock(i * 1000 / 60); room.tick(1 / 30, i * 1000 / 60);
    if (i === 40) sim.receive(snapshot(), '0', i * 1000 / 60);
  }
  sim.receive(snapshot(), '0', 1500);
  assert.equal(sim.pending.length, 0);
  assert.ok(Math.hypot(sim.predicted!.x - expected.x, sim.predicted!.z - expected.z) < 0.002);
  // Also check the shared collision path independently of snapshot rounding.
  const replay = { ...room.snapshot().players[1], x: -9, z: 11, dashTime: 0, dashCooldown: 0 };
  for (let i = 0; i < 90; i++) movePlayer(replay, { ...input, dash: i === 0 });
  assert.ok(Math.hypot(replay.x - expected.x, replay.z - expected.z) < 1e-8);
});

test('deltas round-trip, baseline loss is detected, and stale snapshots cannot rewind prediction', () => {
  const { room, snapshot } = setup(); const a = snapshot(); room.players.get('0').x += 0.5; const b = snapshot();
  const delta = snapshotDelta(a, b);
  assert.deepEqual(applySnapshotDelta(a, delta), b);
  assert.equal(applySnapshotDelta(b, delta), null);
  assert.ok(JSON.stringify(delta).length < JSON.stringify(b).length);
  const sim = new ArenaSimulation(); sim.receive(b, '0', 100);
  assert.equal(sim.receive(a, '0', 150), false); assert.equal(sim.room!.snapshotId, b.snapshotId);
});

test('reconciliation smooths small errors, exposes large corrections, and clears dead/rematch inputs', () => {
  const { room, snapshot } = setup(); const sim = new ArenaSimulation();
  sim.receive(snapshot(), '0', 0); sim.advance(INPUT_DT, { ...neutral, dx: 1 });
  sim.predicted!.x += 0.2; sim.receive(snapshot(), '0', 50);
  assert.ok(Math.abs(sim.offsetX - 0.2) < 0.001); assert.equal(sim.pending.length, 1);
  for (let i = 0; i < 3; i++) { sim.predicted!.x += 0.4; sim.receive(snapshot(), '0', 60 + i * 10); }
  assert.ok(Math.hypot(sim.offsetX, sim.offsetZ) < 0.75, 'Accumulated smoothing cannot hide a large correction');
  sim.predicted!.x += 5; sim.receive(snapshot(), '0', 100);
  assert.equal(sim.offsetX, 0); assert.ok(sim.maxCorrection >= 5);
  Object.assign(room.players.get('0'), { hp: 0, deaths: 1 }); sim.receive(snapshot(), '0', 150);
  assert.equal(sim.pending.length, 0); assert.equal(sim.predicted!.hp, 0);
  room.round++; Object.assign(room.players.get('0'), { hp: 100, x: -9 }); sim.receive(snapshot(), '0', 200);
  assert.equal(sim.predicted!.x, -9); assert.equal(sim.history.length, 1);
});

test('dash/reload edges survive frames shorter than one simulation step and unsent batches', () => {
  const { snapshot } = setup(); const sim = new ArenaSimulation(); sim.receive(snapshot(), '0', 0);
  sim.advance(1 / 120, { ...neutral, dx: 1, dash: true, reload: true });
  assert.equal(sim.pending.length, 0);
  sim.advance(1 / 120, { ...neutral, dx: 1 });
  assert.equal(sim.batch()[0].dash, true); assert.equal(sim.batch()[0].reload, true);
  assert.equal(sim.batch()[0].seq, 1, 'Failed sends can retry the same pending batch');
  sim.sent = 1; sim.advance(INPUT_DT, { ...neutral, dx: 1 });
  assert.equal(sim.batch()[0].dash, false); assert.equal(sim.batch()[0].reload, false);
});

test('temporary command gaps stop translation without resetting aim or held fire; stale fire expires', () => {
  const { room, clock } = setup(); const player = room.players.get('0');
  room.enqueueInputs('0', [{ ...neutral, seq: 1, dx: 1, aimX: -9, aimZ: -20, fire: true }]);
  clock(17); room.tick(INPUT_DT, 17); const x = player.x, angle = player.angle;
  clock(34); room.tick(INPUT_DT, 34);
  assert.equal(player.x, x); assert.ok(Math.abs(player.angle - angle) < 0.01); assert.equal(player.input.fire, true);
  clock(600); room.tick(INPUT_DT, 600); assert.equal(player.input.fire, false);
});

test('interpolation wraps angles, bounds extrapolation, and snaps life transitions', () => {
  const { snapshot } = setup(); const sim = new ArenaSimulation();
  const a = snapshot(); a.serverTime = 1000; Object.assign(a.players[1], { x: 8, z: -11, angle: Math.PI - 0.1, moving: true });
  const b = structuredClone(a); b.snapshotId++; b.serverTime = 1100; b.players[1].x = 8.7; b.players[1].angle = -Math.PI + 0.1;
  sim.receive(a, '0', 0); sim.receive(b, '0', 100);
  const out = { ...b.players[1] }; sim.samplePlayer('1', '0', 1050, out);
  assert.ok(Math.abs(out.x - 8.35) < 1e-8); assert.ok(Math.abs(out.angle - Math.PI) < 1e-8);
  sim.samplePlayer('1', '0', 5000, out); assert.ok(out.x <= 8.7 + 7 * 0.08 + 1e-8);
  const c = structuredClone(b); c.snapshotId++; c.serverTime = 1200; Object.assign(c.players[1], { deaths: 1, hp: 0, x: -9 });
  sim.receive(c, '0', 200); sim.samplePlayer('1', '0', 1200, out); assert.equal(out.hp, 0); assert.equal(out.x, -9);
  sim.reset(42); assert.equal(sim.pending.length, 0); assert.equal(sim.history.length, 0); assert.equal(sim.sequence, 42);
});

// Deterministic network scheduler: loss delays the ordered TCP stream by 150 ms,
// rather than incorrectly dropping WebSocket application messages.
for (const condition of [
  { rtt: 20, jitter: 0, loss: 0 }, { rtt: 50, jitter: 0, loss: 0 },
  { rtt: 100, jitter: 0, loss: 0 }, { rtt: 200, jitter: 0, loss: 0 },
  { rtt: 100, jitter: 35, loss: 0.05 },
]) test(`six-player simulated network ${JSON.stringify(condition)}`, () => {
  const { room, snapshot, clock } = setup(6);
  const sims = Array.from({ length: 6 }, () => new ArenaSimulation());
  const up: { at: number; id: number; commands: ArenaCommand[] }[] = [], down: { at: number; id: number; state: ArenaSnapshot }[] = [];
  const lastUp = Array(6).fill(0), lastDown = Array(6).fill(0);
  let seed = 417, maxPending = 0, maxRemoteStep = 0, bytesFull = 0, bytesDelta = 0;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const delay = () => Math.max(0, condition.rtt / 2 + (random() * 2 - 1) * condition.jitter) + (random() < condition.loss ? 150 : 0);
  const first = snapshot(); sims.forEach((sim, i) => sim.receive(first, String(i), 0));
  let previousSnapshot = first; let lastRemote: ArenaPlayer | null = null;
  for (let frame = 1; frame <= 1200; frame++) {
    const now = frame * 1000 / 60; clock(now);
    for (let i = up.length - 1; i >= 0; i--) if (up[i].at <= now) {
      // Delivery order is explicit even if several batches arrive in one frame.
      const ready = up.filter(packet => packet.at <= now).sort((a, b) => a.at - b.at);
      for (const packet of ready) assert.equal(room.enqueueInputs(String(packet.id), packet.commands), true);
      for (let j = up.length - 1; j >= 0; j--) if (up[j].at <= now) up.splice(j, 1);
      break;
    }
    if (frame % 2 === 0) room.tick(1 / 30, now);
    for (const packet of down.filter(packet => packet.at <= now).sort((a, b) => a.at - b.at)) sims[packet.id].receive(packet.state, String(packet.id), now);
    for (let j = down.length - 1; j >= 0; j--) if (down[j].at <= now) down.splice(j, 1);
    sims.forEach((sim, id) => {
      const direction = Math.floor(frame / 20) % 2 ? -1 : 1;
      sim.advance(INPUT_DT, { ...neutral, dx: frame < 900 ? direction : 0, dz: frame < 900 ? (id % 2 ? 0.3 : -0.3) : 0, dash: frame % 240 === 0 && frame < 900 });
      if (frame === 1) assert.notEqual(sim.predicted!.x, first.players[id].x, 'Immediate prediction without response');
      maxPending = Math.max(maxPending, sim.pending.length);
      if (frame % 2 === 0) {
        const commands = sim.batch(); if (commands.length) {
          lastUp[id] = Math.max(lastUp[id] + 0.001, now + delay()); up.push({ at: lastUp[id], id, commands }); sim.sent = commands.at(-1)!.seq;
        }
      }
    });
    if (frame % 4 === 0) {
      const state = snapshot(); bytesFull += JSON.stringify(state).length; bytesDelta += JSON.stringify(snapshotDelta(previousSnapshot, state)).length; previousSnapshot = state;
      sims.forEach((_, id) => { lastDown[id] = Math.max(lastDown[id] + 0.001, now + delay()); down.push({ at: lastDown[id], id, state }); });
    }
    const remote = { ...sims[0].room!.players[1] }; sims[0].samplePlayer('1', '0', sims[0].sampleTime(now), remote);
    if (lastRemote) maxRemoteStep = Math.max(maxRemoteStep, Math.hypot(remote.x - lastRemote.x, remote.z - lastRemote.z)); lastRemote = remote;
  }
  assert.ok(maxPending < 60, `Bounded pending commands: ${maxPending}`);
  for (let id = 0; id < 6; id++) assert.ok(Math.hypot(sims[id].predicted!.x - room.players.get(String(id)).x, sims[id].predicted!.z - room.players.get(String(id)).z) < 0.01, 'Settles to server authority');
  assert.ok(maxRemoteStep < 1, `No ordinary movement teleports: ${maxRemoteStep}`);
  console.log(JSON.stringify({ scenario: condition, simulatedSeconds: 20, players: 6, localResponseMs: 1000 / 60, maxPending, maxRemoteFrameStep: +maxRemoteStep.toFixed(3), maxCorrection: +Math.max(...sims.map(sim => sim.maxCorrection)).toFixed(3), fullBytes: bytesFull, deltaBytes: bytesDelta }));
});
