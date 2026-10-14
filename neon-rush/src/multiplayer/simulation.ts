import { INPUT_DT, movePlayer, sanitizeInput } from '../../shared/movement.js';
import type { ArenaCommand, ArenaInput, ArenaPlayer, ArenaSnapshot } from '../../shared/multiplayer';

export class ArenaSimulation {
  room: ArenaSnapshot | null = null;
  predicted: ArenaPlayer | null = null;
  pending: ArenaCommand[] = [];
  history: { room: ArenaSnapshot; arrived: number }[] = [];
  sequence = 0;
  sent = 0;
  accumulator = 0;
  jitter = 0;
  correctionCount = 0;
  correctionMagnitude = 0;
  maxCorrection = 0;
  offsetX = 0;
  offsetZ = 0;
  private dash = false;
  private reload = false;
  private renderTime = 0;

  reset(ack = 0) {
    this.room = null; this.predicted = null; this.pending = []; this.history = [];
    this.sequence = ack; this.sent = ack; this.accumulator = 0;
    this.offsetX = 0; this.offsetZ = 0; this.dash = false; this.reload = false; this.renderTime = 0;
  }
  receive(room: ArenaSnapshot, playerId: string, now: number) {
    if (this.room && room.code === this.room.code && room.snapshotId <= this.room.snapshotId) return false;
    const previous = this.history.at(-1);
    if (previous) {
      const deviation = Math.abs((now - previous.arrived) - (room.serverTime - previous.room.serverTime));
      this.jitter += (deviation - this.jitter) * 0.1;
    }
    const own = room.players.find(p => p.id === playerId);
    const discontinuity = !this.room || this.room.code !== room.code || this.room.round !== room.round ||
      this.room.phase !== room.phase || this.predicted?.deaths !== own?.deaths ||
      (this.predicted?.hp === 0) !== (own?.hp === 0);
    if (discontinuity) { this.history = []; this.renderTime = 0; this.offsetX = 0; this.offsetZ = 0; this.accumulator = 0; }
    this.history.push({ room, arrived: now });
    if (this.history.length > 32) this.history.shift();
    this.room = room;
    if (!own) { this.predicted = null; this.pending = []; return true; }
    if (discontinuity) {
      this.pending = []; this.sequence = own.ack; this.sent = own.ack;
      this.dash = false; this.reload = false;
    }
    this.sequence = Math.max(this.sequence, own.ack);
    this.pending = this.pending.filter(command => command.seq > own.ack);
    const before = this.predicted;
    const corrected = { ...own };
    if (room.phase === 'playing' && own.hp > 0) for (const command of this.pending) movePlayer(corrected, command);
    if (before && !discontinuity) {
      const dx = before.x - corrected.x, dz = before.z - corrected.z;
      const error = Math.hypot(dx, dz);
      if (error > 0.01) {
        this.correctionCount++; this.correctionMagnitude = error; this.maxCorrection = Math.max(this.maxCorrection, error);
        // Small errors smooth visually; large corrections and lifecycle changes
        // are immediately authoritative, never hidden behind an extended lerp.
        if (error < 0.75 && Math.hypot(this.offsetX + dx, this.offsetZ + dz) < 0.75) { this.offsetX += dx; this.offsetZ += dz; }
        else { this.offsetX = 0; this.offsetZ = 0; }
      }
    }
    this.predicted = corrected;
    return true;
  }
  advance(dt: number, raw: ArenaInput) {
    const input = sanitizeInput(raw);
    if (!input || !this.predicted || this.room?.phase !== 'playing' || this.predicted.hp <= 0) return;
    this.dash ||= input.dash === true; this.reload ||= input.reload === true;
    this.offsetX *= Math.exp(-25 * dt); this.offsetZ *= Math.exp(-25 * dt);
    // A stalled/hidden frame cannot generate a burst of seconds-old movement.
    this.accumulator += Math.min(Math.max(dt, 0), 0.1);
    while (this.accumulator + 1e-9 >= INPUT_DT && this.pending.length < 120) {
      const command = { ...input, seq: ++this.sequence, dash: this.dash, reload: this.reload };
      this.dash = false; this.reload = false;
      this.pending.push(command); movePlayer(this.predicted, command);
      this.accumulator -= INPUT_DT;
    }
    this.accumulator = Math.min(this.accumulator, INPUT_DT);
  }
  batch() { return this.pending.filter(command => command.seq > this.sent).slice(0, 8); }

  // One target time per display frame, based on monotonic arrival time. No
  // assumption that the client clock agrees with the server's wall clock.
  sampleTime(now: number) {
    const latest = this.history.at(-1);
    if (!latest) return 0;
    const delay = Math.min(220, Math.max(75, 1000 / latest.room.snapshotRate * 1.5 + this.jitter * 2));
    const desired = latest.room.serverTime + Math.max(0, now - latest.arrived) - delay;
    this.renderTime = Math.max(this.renderTime, Math.min(desired, latest.room.serverTime + 80));
    return this.renderTime;
  }
  samplePlayer(id: string, selfId: string, time: number, out: ArenaPlayer) {
    if (id === selfId && this.predicted) {
      Object.assign(out, this.predicted); out.x += this.offsetX; out.z += this.offsetZ; return;
    }
    let left = this.history[0], right = left;
    if (!left) return;
    for (const entry of this.history) { if (entry.room.serverTime <= time) left = entry; right = entry; if (entry.room.serverTime >= time) break; }
    const a = left.room.players.find(p => p.id === id), b = right.room.players.find(p => p.id === id);
    if (!a || !b) return;
    Object.assign(out, a);
    if (a.deaths !== b.deaths || (a.hp === 0) !== (b.hp === 0) || a.connected !== b.connected || Math.hypot(a.x - b.x, a.z - b.z) > 4) {
      Object.assign(out, time >= right.room.serverTime ? b : a); return;
    }
    const duration = right.room.serverTime - left.room.serverTime;
    if (duration > 0) {
      const t = Math.max(0, Math.min(1, (time - left.room.serverTime) / duration));
      out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
      out.angle = a.angle + Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle)) * t;
      out.moving = a.moving || b.moving;
    } else if (time > left.room.serverTime && a.hp > 0 && a.connected && a.moving) {
      const previous = this.history.at(-2)?.room;
      const p = previous?.players.find(player => player.id === id);
      if (p && previous && a.deaths === p.deaths && p.hp > 0) {
        const elapsed = (left.room.serverTime - previous.serverTime) / 1000;
        if (elapsed > 0) {
          const speed = 7 * (a.dashing ? 2.8 : 1);
          const input = { dx: (a.x - p.x) / elapsed / speed, dz: (a.z - p.z) / elapsed / speed, aimX: a.x - Math.sin(a.angle) * 30, aimZ: a.z - Math.cos(a.angle) * 30, fire: false };
          let remaining = Math.min(0.08, (time - left.room.serverTime) / 1000);
          while (remaining > 1e-6) { const dt = Math.min(INPUT_DT, remaining); movePlayer(out, input, dt); remaining -= dt; }
        }
      }
    }
  }
  bulletFrame(time: number) {
    let result = this.history[0];
    for (const entry of this.history) { if (entry.room.serverTime > time) break; result = entry; }
    return result?.room;
  }
}
