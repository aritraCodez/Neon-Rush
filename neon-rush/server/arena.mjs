import { movePlayer, sanitizeInput, INPUT_DT } from '../shared/movement.js';
import { ARENA, ARENA_COVER, ARENA_SPAWNS, PLAYER_COLORS } from '../shared/arena.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value * 1000) / 1000;
const neutral = () => ({ dx: 0, dz: 0, aimX: 0, aimZ: 0, fire: false });
export function cleanName(value) {
  if (typeof value !== 'string') throw new Error('Enter a player name.');
  const name = value.normalize('NFKC').replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 18) throw new Error('Use a name with 2–18 letters, numbers, or spaces.');
  return name;
}
export function cleanChat(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').replace(/[\p{Cc}\p{Cs}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function segmentBox(x, z, dx, dz, box, radius = 0) {
  let lo = 0, hi = 1;
  for (const [origin, delta, min, max] of [[x, dx, box.x - box.width / 2 - radius, box.x + box.width / 2 + radius], [z, dz, box.z - box.depth / 2 - radius, box.z + box.depth / 2 + radius]]) {
    if (Math.abs(delta) < 1e-9) { if (origin < min || origin > max) return Infinity; }
    else { const a = (min - origin) / delta, b = (max - origin) / delta; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); if (lo > hi) return Infinity; }
  }
  return lo;
}
export function segmentCircle(x, z, dx, dz, cx, cz, radius) {
  const ox = x - cx, oz = z - cz;
  const a = dx * dx + dz * dz, c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) return 0;
  if (a < 1e-10) return Infinity;
  const b = 2 * (ox * dx + oz * dz), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return Infinity;
  const time = (-b - Math.sqrt(discriminant)) / (2 * a);
  return time >= 0 && time <= 1 ? time : Infinity;
}

export class ArenaRoom {
  constructor(code, clock = Date.now) {
    this.snapshotId = 0; this.tickRate = ARENA.tickRate; this.snapshotRate = 15; this.serverStepMs = 0;
    this.code = code; this.clock = clock; this.hostId = ''; this.phase = 'lobby'; this.round = 0;
<<<<<<< Updated upstream
    this.players = new Map(); this.bullets = []; this.events = []; this.chat = []; this.nextId = 0;
=======
    this.players = new Map(); this.bullets = []; this.events = []; this.pendingEvents = []; this.nextId = 0;
>>>>>>> Stashed changes
    this.phaseUntil = 0; this.matchEnds = 0; this.winners = []; this.endReason = '';
  }
  notice(text, kind = 'notice') { const event = { id: ++this.nextId, text, kind }; this.events.unshift(event); this.pendingEvents.push(event); this.events.length = Math.min(this.events.length, 5); }
  addPlayer(id, rawName, style) {
    if (this.phase !== 'lobby' && this.phase !== 'finished') throw new Error('This match has started. Join after it finishes.');
    if (this.players.size >= ARENA.maxPlayers) throw new Error('This room is full (6 players).');
    const name = cleanName(rawName);
    if ([...this.players.values()].some(player => player.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is already in this room. Choose another.');
    const color = PLAYER_COLORS.find(value => ![...this.players.values()].some(player => player.color === value)) ?? PLAYER_COLORS[0];
    const spawn = ARENA_SPAWNS[this.players.size];
    const player = {
      id, name, style: ['ion', 'nova', 'solar', 'toxic'].includes(style) ? style : 'ion', color,
      ...spawn, angle: Math.atan2(spawn.x, spawn.z), hp: 100, kills: 0, deaths: 0,
      connected: true, ready: false, muted: true, respawnIn: 0, shield: 0, dashCooldown: 0, dashTime: 0,
      ammo: ARENA.magazine, reload: 0, cooldown: 0, moving: false, shots: 0, hit: 0,
<<<<<<< Updated upstream
      input: neutral(), inputAt: 0, dashQueued: false, reloadQueued: false, disconnectedAt: 0, lastChatAt: 0,
=======
      ack: 0, lastSeq: 0, commands: [], sequenced: false, input: neutral(), inputAt: 0, dashQueued: false, reloadQueued: false, disconnectedAt: 0,
>>>>>>> Stashed changes
    };
    this.players.set(id, player); if (!this.hostId) this.hostId = id;
    this.notice(`${name} joined the room.`); return player;
  }
  setConnected(id, connected) {
    const player = this.players.get(id); if (!player) return;
    player.commands.length = 0; player.lastSeq = player.ack; player.dashQueued = false; player.reloadQueued = false;
    player.connected = connected; player.input = neutral(); player.moving = false;
    player.disconnectedAt = connected ? 0 : this.clock();
    if (!connected) { player.ready = false; if (this.phase === 'countdown') { this.phase = 'lobby'; this.notice('Countdown cancelled: a player disconnected.'); } }
    if (!this.players.get(this.hostId)?.connected) this.hostId = [...this.players.values()].find(p => p.connected)?.id ?? this.hostId;
  }
  removePlayer(id) {
    const player = this.players.get(id); if (!player) return;
    this.players.delete(id); this.bullets = this.bullets.filter(bullet => bullet.owner !== id);
    this.notice(`${player.name} left the room.`);
    if (this.hostId === id) this.hostId = [...this.players.values()].find(p => p.connected)?.id ?? this.players.keys().next().value ?? '';
    if (this.phase === 'countdown') this.phase = 'lobby';
    if (this.phase === 'playing' && this.players.size < ARENA.minPlayers) this.finish('The other players left.');
  }
  ready(id, value) {
    if (this.phase !== 'lobby' || typeof value !== 'boolean') throw new Error('Ready checks are available in the lobby.');
    const player = this.players.get(id); if (player?.connected) player.ready = value;
  }
  setMuted(id, muted) {
    const player = this.players.get(id); if (player?.connected) player.muted = muted === true;
  }
  addChat(id, raw) {
    const player = this.players.get(id); if (!player?.connected) return null;
    const now = this.clock();
    if (now - player.lastChatAt < 400) return null;
    const text = cleanChat(raw); if (!text) return null;
    player.lastChatAt = now;
    const message = { id: ++this.nextId, from: id, name: player.name, color: player.color, text, at: now };
    this.chat.push(message); if (this.chat.length > 80) this.chat.splice(0, this.chat.length - 80);
    return message;
  }
  start(id) {
    if (id !== this.hostId) throw new Error('Only the room host can start the match.');
    if (this.phase !== 'lobby') throw new Error('Return to the lobby before starting another match.');
    const players = [...this.players.values()];
    if (players.length < ARENA.minPlayers || players.some(player => !player.connected || !player.ready)) throw new Error('At least two players must join, and everyone must be ready.');
    this.round++; this.phase = 'countdown'; this.phaseUntil = this.clock() + 3000;
    this.matchEnds = this.phaseUntil + ARENA.duration * 1000; this.bullets = []; this.events = []; this.winners = []; this.endReason = '';
    players.forEach((player, index) => {
      player.ack = player.lastSeq; player.commands.length = 0;
      Object.assign(player, ARENA_SPAWNS[index], { hp: 100, kills: 0, deaths: 0, respawnIn: 0, shield: ARENA.spawnShield, ammo: ARENA.magazine, reload: 0, cooldown: 0, dashCooldown: 0, dashTime: 0, shots: 0, hit: 0, input: neutral(), dashQueued: false, reloadQueued: false });
      player.angle = Math.atan2(player.x, player.z);
    });
  }
  lobby(id) {
    if (id !== this.hostId || this.phase !== 'finished') throw new Error('The host can return to the lobby after the match.');
    this.phase = 'lobby'; this.bullets = [];
    for (const player of this.players.values()) { player.ready = false; player.hp = 100; player.respawnIn = 0; player.input = neutral(); }
  }
  enqueueInputs(id, commands) {
    const player = this.players.get(id);
    if (!player?.connected || this.phase !== 'playing' || !Array.isArray(commands) || commands.length > 8) return false;
    // Validate the entire batch before accepting it; never overwrite queued edges.
    const clean = []; let seq = player.lastSeq;
    for (const command of commands) {
      const input = sanitizeInput(command);
      if (!input || !Number.isSafeInteger(command.seq) || command.seq <= 0) return false;
      if (command.seq <= seq) continue; // retransmitted/stale command
      if (command.seq !== seq + 1) return false;
      seq = command.seq; clean.push({ ...input, seq });
    }
    if (player.commands.length + clean.length > 120) return false;
    player.sequenced = true; player.lastSeq = seq;
    player.commands.push(...clean); player.inputAt = this.clock(); return true;
  }
  setInput(id, input) {
    const player = this.players.get(id), clean = sanitizeInput(input);
    if (!player?.connected || player.sequenced || this.phase !== 'playing' || !clean) return;
    player.input = clean;
    player.inputAt = this.clock(); player.dashQueued ||= clean.dash; player.reloadQueued ||= clean.reload;
  }
  respawn(player) {
    player.ack = player.lastSeq; player.commands.length = 0; player.dashQueued = false; player.reloadQueued = false;
    const enemies = [...this.players.values()].filter(p => p.id !== player.id && p.hp > 0 && p.connected);
    const spawn = [...ARENA_SPAWNS].sort((a, b) => {
      const nearest = point => Math.min(...enemies.map(p => Math.hypot(point.x - p.x, point.z - p.z)), 100);
      return nearest(b) - nearest(a);
    })[0];
    Object.assign(player, spawn, { hp: 100, respawnIn: 0, shield: ARENA.spawnShield, ammo: ARENA.magazine, reload: 0, cooldown: 0, dashTime: 0, dashCooldown: 0, input: neutral() });
  }
  finish(reason) {
    this.phase = 'finished'; this.endReason = reason; this.bullets = [];
    const highest = Math.max(0, ...[...this.players.values()].map(player => player.kills));
    this.winners = [...this.players.values()].filter(player => player.kills === highest).map(player => player.id);
    for (const player of this.players.values()) { player.input = neutral(); player.moving = false; player.ready = false; }
  }
  tick(dt, now = this.clock()) {
    if (this.phase === 'countdown' && now >= this.phaseUntil) this.phase = 'playing';
    if (this.phase !== 'playing') return;
    if (now >= this.matchEnds) { this.finish('Time is up.'); return; }
    let remaining = clamp(dt, 0, 0.1);
    while (remaining > 1e-6 && this.phase === 'playing') { const step = Math.min(remaining, INPUT_DT); this.step(step, now); remaining -= step; }
  }
  step(dt, now) {
    for (const player of this.players.values()) {
      player.hit = Math.max(0, player.hit - dt); player.moving = false;
      if (!player.connected) continue;
      if (player.hp <= 0) { player.ack = player.lastSeq; player.commands.length = 0; player.respawnIn = Math.max(0, player.respawnIn - dt); if (player.respawnIn <= 0) this.respawn(player); continue; }
      if (player.sequenced) {
        const command = player.commands.shift();
        player.input = command ?? { ...player.input, dx: 0, dz: 0,
          fire: now - player.inputAt <= 500 && player.input.fire, dash: false, reload: false };
        player.dashQueued = command?.dash === true; player.reloadQueued = command?.reload === true;
        if (command) player.ack = command.seq;
      }
      if (now - player.inputAt > 500 && !player.sequenced) { player.input = neutral(); player.dashQueued = false; player.reloadQueued = false; }
      player.shield = Math.max(0, player.shield - dt); player.cooldown = Math.max(0, player.cooldown - dt);
      if (player.reload > 0) { player.reload = Math.max(0, player.reload - dt); if (player.reload <= 0) player.ammo = ARENA.magazine; }
      const input = player.input;
      movePlayer(player, { ...input, dash: player.dashQueued }, dt);
      player.dashQueued = false;
      if ((player.reloadQueued || player.ammo === 0) && player.reload <= 0 && player.ammo < ARENA.magazine) player.reload = ARENA.reloadTime;
      player.reloadQueued = false;
      if (input.fire && player.cooldown <= 0 && player.reload <= 0 && player.ammo > 0) {
        player.shield = 0; player.ammo--; player.shots++; player.cooldown = ARENA.fireInterval;
        this.bullets.push({ id: ++this.nextId, owner: player.id, x: player.x, z: player.z, vx: -Math.sin(player.angle) * ARENA.bulletSpeed, vz: -Math.cos(player.angle) * ARENA.bulletSpeed, life: 1.5, color: player.color });
      }
    }
    const active = [];
    for (const bullet of this.bullets) {
      const dx = bullet.vx * dt, dz = bullet.vz * dt;
      let nearest = Infinity, target = null;
      for (const box of ARENA_COVER) nearest = Math.min(nearest, segmentBox(bullet.x, bullet.z, dx, dz, box, 0.1));
      for (const player of this.players.values()) {
        if (player.id === bullet.owner || player.hp <= 0 || !player.connected) continue;
        const hit = segmentCircle(bullet.x, bullet.z, dx, dz, player.x, player.z, ARENA.playerRadius + 0.12);
        if (hit < nearest) { nearest = hit; target = player; }
      }
      if (Number.isFinite(nearest)) {
        if (target && target.shield <= 0 && target.dashTime <= 0) {
          target.hp = Math.max(0, target.hp - ARENA.bulletDamage); target.hit = 0.25;
          if (target.hp === 0) {
            target.ack = target.lastSeq; target.commands.length = 0; target.dashQueued = false; target.reloadQueued = false;
            target.deaths++; target.respawnIn = ARENA.respawnTime; target.input = neutral();
            const shooter = this.players.get(bullet.owner);
            if (shooter) { shooter.kills++; this.notice(`${shooter.name} eliminated ${target.name}`, 'kill'); }
            if (shooter?.kills >= ARENA.winningKills) { this.finish(`${shooter.name} reached ${ARENA.winningKills} eliminations.`); return; }
          }
        }
        continue;
      }
      bullet.x += dx; bullet.z += dz; bullet.life -= dt;
      if (bullet.life > 0 && Math.abs(bullet.x) < ARENA.width / 2 && Math.abs(bullet.z) < ARENA.depth / 2) active.push(bullet);
    }
    this.bullets = active;
  }
  snapshot(now = this.clock()) {
    return {
      snapshotId: this.snapshotId, tickRate: this.tickRate, snapshotRate: this.snapshotRate, serverStepMs: this.serverStepMs,
      code: this.code, hostId: this.hostId, phase: this.phase, round: this.round,
      remaining: this.phase === 'playing' ? Math.max(0, (this.matchEnds - now) / 1000) : ARENA.duration,
      countdown: this.phase === 'countdown' ? Math.max(0, (this.phaseUntil - now) / 1000) : 0,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, style: p.style, color: p.color, x: round(p.x), z: round(p.z), angle: round(p.angle),
<<<<<<< Updated upstream
        hp: p.hp, kills: p.kills, deaths: p.deaths, connected: p.connected, ready: p.ready, muted: p.muted,
        respawnIn: round(p.respawnIn), shield: round(p.shield), dashCooldown: round(p.dashCooldown), dashing: p.dashTime > 0,
        ammo: p.ammo, reload: round(p.reload), moving: p.moving, shots: p.shots, hit: round(p.hit),
      })),
      bullets: this.bullets.map(({ life: _life, ...bullet }) => ({ ...bullet, x: round(bullet.x), z: round(bullet.z) })),
      events: this.events, chat: this.chat, winners: this.winners, endReason: this.endReason, serverTime: now,
=======
        hp: p.hp, kills: p.kills, deaths: p.deaths, connected: p.connected, ready: p.ready,
        ack: p.ack, dashTime: p.dashTime, respawnIn: round(p.respawnIn), shield: round(p.shield), dashCooldown: round(p.dashCooldown), dashing: p.dashTime > 0,
        ammo: p.ammo, reload: round(p.reload), moving: p.moving, shots: p.shots, hit: round(p.hit),
      })),
      bullets: this.bullets.map(({ life: _life, ...bullet }) => ({ ...bullet, x: round(bullet.x), z: round(bullet.z) })),
      events: [...this.events], winners: [...this.winners], endReason: this.endReason, serverTime: now,
>>>>>>> Stashed changes
    };
  }
}
