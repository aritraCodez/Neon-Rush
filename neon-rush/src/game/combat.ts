import { audio } from './audio';
import { ENEMIES, emptyEnemy } from './enemies';
import type { Enemy, EnemyKind } from './enemies';
import { getLevel, seededRandom } from './levels';
import type { LevelConfig } from './levels';
import { WEAPONS, weaponById } from './weapons';
import type { WeaponId } from './weapons';

export interface Projectile { active: boolean; friendly: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; damage: number; ttl: number; color: string; radius: number; laser: boolean }
export interface Particle { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; ttl: number; life: number; color: string; size: number }
export interface Pickup { active: boolean; x: number; z: number; kind: 'health' | 'armor' | 'ammo' | 'coin' }
export interface Hazard { active: boolean; kind: 'laser' | 'shockwave'; x: number; z: number; time: number; fired: boolean }
export interface PlayerTarget { x: number; y: number; crouching: boolean; invincible: boolean }
export interface CombatHooks { damage: (amount: number) => void; reward: (score: number, coins: number) => void; pickup: (kind: Pickup['kind']) => void }
export const COVER = [{ x: -2.5, z: -2.8, width: 1.8, height: 1.05 }, { x: 2.5, z: -2.8, width: 1.8, height: 1.05 }];
export const inCombat = (phase: string) => phase === 'combat' || phase === 'boss';

// Segment/sphere distance prevents high-speed projectiles passing through a target.
export function segmentDistance(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / (dx * dx + dy * dy + dz * dz || 1)));
  return Math.hypot(ax + dx * t - cx, ay + dy * t - cy, az + dz * t - cz);
}
export function crossesCover(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  return COVER.some(cover => {
    const t = (cover.z - az) / (bz - az || 0.00001);
    if (t < 0 || t > 1) return false;
    return Math.abs(ax + (bx - ax) * t - cover.x) < cover.width / 2 && ay + (by - ay) * t < cover.height;
  });
}

export class CombatSystem {
  readonly enemies: Enemy[] = Array.from({ length: 12 }, emptyEnemy);
  readonly projectiles: Projectile[] = Array.from({ length: 180 }, () => ({ active: false, friendly: true, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, damage: 0, ttl: 0, color: '', radius: 0.1, laser: false }));
  readonly particles: Particle[] = Array.from({ length: 160 }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ttl: 0, life: 0, color: '', size: 0.1 }));
  readonly pickups: Pickup[] = Array.from({ length: 12 }, () => ({ active: false, x: 0, z: 0, kind: 'coin' }));
  readonly hazards: Hazard[] = Array.from({ length: 12 }, () => ({ active: false, kind: 'laser', x: 0, z: 0, time: 0, fired: false }));
  level: LevelConfig = getLevel(1);
  weapon: WeaponId = 'blaster';
  ammo: Record<WeaponId, number> = { blaster: 14, pulse: 32, shotgun: 6, laser: 5 };
  tiers: Record<WeaponId, number> = { blaster: 0, pulse: 0, shotgun: 0, laser: 0 };
  unlocked = 1;
  reloading = 0;
  reloadTotal = 0;
  cooldown = 0;
  charge = 0;
  firing = false;
  covering = false;
  aim = { x: 0, y: 1.4, z: -20 };
  aimNdc = { x: 0, y: 0 };
  aimStick = { x: 0, y: 0 };
  aimActive = false;
  aimTarget = -1;
  wave = 0;
  waveDelay = 0;
  complete = false;
  boss = false;
  kills = 0;
  shots = 0;
  hits = 0;
  combo = 0;
  comboTime = 0;
  critical = 0;
  hitMarker = 0;
  muzzle = 0;
  dashTime = 0;
  dashCooldown = 0;
  damageBoost = 0;
  reloadBoost = 0;
  armorBoost = 0;
  alert = '';
  alertTime = 0;
  time = 0;
  private nextId = 1;
  private random = seededRandom(1);
  private effectRandom = seededRandom(971);

  reset(unlocked: number, tiers: Record<WeaponId, number>) {
    this.clear(); this.weapon = 'blaster'; this.unlocked = unlocked; this.tiers = { ...tiers };
    this.kills = 0; this.shots = 0; this.hits = 0; this.combo = 0; this.comboTime = 0;
    this.damageBoost = 0; this.reloadBoost = 0; this.armorBoost = 0; this.dashCooldown = 0; this.dashTime = 0;
    this.time = 0; this.aimActive = false; this.aimNdc = { x: 0, y: 0 };
    this.refill();
  }
  clear() {
    for (const pool of [this.enemies, this.projectiles, this.particles, this.pickups, this.hazards]) for (const item of pool) item.active = false;
    this.firing = false; this.covering = false; this.aimStick = { x: 0, y: 0 }; this.complete = false; this.reloading = 0; this.charge = 0; this.cooldown = 0; this.muzzle = 0;
  }
  refill() { for (const spec of WEAPONS) this.ammo[spec.id] = spec.magazine; this.reloading = 0; }
  begin(level: LevelConfig, boss: boolean) {
    this.clear(); this.refill(); this.level = level; this.boss = boss; this.wave = 0; this.nextId = 1;
    this.random = seededRandom(level.id * 719 + (boss ? 37 : 0)); this.effectRandom = seededRandom(level.id * 883); this.waveDelay = 1.3;
    this.aim = { x: 0, y: boss ? 2.9 : 1.4, z: -20 }; this.aimActive = false;
    this.alert = boss ? 'TARGET THE GLOWING CORE' : 'CHECKPOINT ENGAGED'; this.alertTime = 3;
    if (boss) { this.spawn('boss', 0, -20); this.wave = 1; }
  }
  setFiring(value: boolean) { this.firing = value; if (!value) this.charge = 0; if (value) audio.unlock(); }
  switchWeapon() {
    const available = WEAPONS.filter(w => w.unlock <= this.unlocked);
    this.weapon = available[(available.findIndex(w => w.id === this.weapon) + 1) % available.length].id;
    this.reloading = 0; this.charge = 0; this.cooldown = 0.15; audio.play('switch');
  }
  reload() {
    const spec = weaponById(this.weapon);
    if (this.reloading > 0 || this.ammo[this.weapon] >= spec.magazine) return;
    this.reloadTotal = spec.reload * (1 - this.reloadBoost);
    this.reloading = this.reloadTotal; this.charge = 0; audio.play('reload');
  }
  dash() {
    if (this.dashCooldown > 0) return false;
    this.dashTime = 0.38; this.dashCooldown = 2.6 * (1 - this.reloadBoost); this.covering = false;
    audio.play('dash'); return true;
  }
  spawn(kind: EnemyKind, x: number, z: number, miniboss = false) {
    const enemy = this.enemies.find(e => !e.active); if (!enemy) return;
    const spec = ENEMIES[kind];
    Object.assign(enemy, emptyEnemy(), {
      id: this.nextId++, active: true, kind, x, homeX: x, y: kind === 'boss' ? 2.5 : spec.flying ? 2.2 : 1.2, z,
      hp: kind === 'boss' ? this.level.bossHp : spec.hp * (1 + (this.level.id - 1) * 0.06) * (miniboss ? 1.4 : 1),
      radius: kind === 'boss' ? 2 : spec.radius * (miniboss ? 1.2 : 1),
      cooldown: 1.8 + this.random() * 2.2, miniboss,
    });
    enemy.maxHp = enemy.hp;
    this.burst(x, 1, z, this.level.color, 8);
    return enemy;
  }
  private nextWave() {
    this.wave++;
    const count = this.level.waveSize + (this.wave === this.level.waves ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const miniboss = this.wave === this.level.waves && i === count - 1;
      const kind = miniboss ? 'heavy' : this.level.enemies[(i + (this.wave - 1) * this.level.waveSize) % this.level.enemies.length];
      this.spawn(kind, (i - (count - 1) / 2) * 2.9, -15 - (i % 2) * 5 - this.random() * 2, miniboss);
    }
    this.alert = this.wave === this.level.waves ? 'FINAL WAVE · CHECKPOINT WARDEN' : `WAVE ${this.wave} INCOMING`;
    this.alertTime = 2.5; audio.play('alarm');
  }
  private launch(friendly: boolean, x: number, y: number, z: number, tx: number, ty: number, tz: number, damage: number, speed: number, color: string, laser = false) {
    const p = this.projectiles.find(item => !item.active); if (!p) return;
    const length = Math.hypot(tx - x, ty - y, tz - z) || 1;
    Object.assign(p, { active: true, friendly, x, y, z, vx: (tx - x) / length * speed, vy: (ty - y) / length * speed, vz: (tz - z) / length * speed, damage, ttl: 5, color, laser, radius: friendly ? 0.13 : 0.19 });
  }
  burst(x: number, y: number, z: number, color: string, count = 8) {
    for (let i = 0; i < count; i++) {
      const p = this.particles.find(item => !item.active); if (!p) break;
      const angle = this.effectRandom() * Math.PI * 2, speed = 1.5 + this.effectRandom() * 4;
      Object.assign(p, { active: true, x, y, z, vx: Math.cos(angle) * speed, vy: 1 + this.effectRandom() * 4, vz: Math.sin(angle) * speed, life: 0.45 + this.effectRandom() * 0.3, ttl: 0.7, color, size: 0.04 + this.effectRandom() * 0.1 });
    }
  }
  private fire(player: PlayerTarget) {
    const spec = weaponById(this.weapon);
    if (this.reloading > 0 || this.cooldown > 0) return;
    if (this.ammo[this.weapon] <= 0) { this.reload(); return; }
    const sx = player.x + 0.32, sy = player.y + (player.crouching ? 0.66 : 1.4), sz = -0.65;
    for (let i = 0; i < spec.pellets; i++) {
      const spread = (i - (spec.pellets - 1) / 2) * spec.spread * 22;
      const jitter = spec.pellets === 1 ? (this.random() - 0.5) * spec.spread * 22 : 0;
      this.launch(true, sx, sy, sz, this.aim.x + spread + jitter, this.aim.y + (spec.pellets > 1 ? Math.sin(i * 2.4) * 0.12 : 0), this.aim.z,
        spec.damage * (1 + this.tiers[this.weapon] * 0.15 + this.damageBoost), spec.speed, spec.color, this.weapon === 'laser');
    }
    this.shots += spec.pellets; this.ammo[this.weapon]--; this.cooldown = spec.interval; this.charge = 0; this.muzzle = 0.09;
    audio.play(this.weapon === 'laser' ? 'laser' : this.weapon === 'shotgun' ? 'shotgun' : 'shot');
  }
  damageEnemy(enemy: Enemy, damage: number, critical: boolean, hooks: CombatHooks) {
    if (!enemy.active) return;
    const shielded = enemy.kind === 'shield' && !enemy.weak && !critical;
    enemy.hp -= damage * (critical ? 1.85 : shielded ? 0.18 : 1);
    enemy.hit = 0.13; this.hits++; this.hitMarker = 0.14; this.critical = critical ? 0.4 : this.critical;
    this.burst(enemy.x, enemy.y, enemy.z, critical ? '#fff2a2' : ENEMIES[enemy.kind].color, critical ? 7 : 3);
    audio.play(critical ? 'critical' : 'impact');
    if (enemy.hp > 0) return;
    enemy.active = false; this.kills++; this.combo++; this.comboTime = 5;
    const multiplier = 1 + Math.min(4, Math.floor(this.combo / 3));
    hooks.reward((enemy.kind === 'boss' ? 1500 : enemy.miniboss ? 350 : 100) * multiplier, enemy.kind === 'boss' ? 35 : enemy.miniboss ? 12 : 4);
    this.burst(enemy.x, enemy.y, enemy.z, ENEMIES[enemy.kind].color, 18); audio.play('explosion');
    if (enemy.kind !== 'boss') {
      const pickup = this.pickups.find(p => !p.active);
      if (pickup) Object.assign(pickup, { active: true, x: Math.max(-2.5, Math.min(2.5, enemy.x)), z: enemy.z, kind: (['health', 'ammo', 'armor', 'coin'] as const)[(this.kills - 1) % 4] });
    }
  }
  private attack(enemy: Enemy, player: PlayerTarget) {
    const spec = ENEMIES[enemy.kind];
    if (enemy.kind !== 'boss') {
      const count = enemy.kind === 'elite' || enemy.kind === 'heavy' ? 3 : 1;
      for (let i = 0; i < count; i++) this.launch(false, enemy.x, enemy.y, enemy.z + 0.7, enemy.targetX + (i - (count - 1) / 2) * 1.4, enemy.targetY, 0, spec.damage, spec.projectileSpeed, spec.color);
      audio.play('enemy-shot'); return;
    }
    const pattern = this.level.patterns[enemy.patternIndex % this.level.patterns.length];
    enemy.patternIndex++;
    if (pattern === 'shockwave') {
      const hazard = this.hazards.find(h => !h.active);
      if (hazard) Object.assign(hazard, { active: true, kind: 'shockwave', x: 0, z: enemy.z, time: 0, fired: false });
    } else if (pattern === 'laser') {
      const lanes = enemy.phase >= 3 ? [player.x, player.x > 0 ? -2.5 : 2.5] : [player.x];
      for (const x of lanes) { const hazard = this.hazards.find(h => !h.active); if (hazard) Object.assign(hazard, { active: true, kind: 'laser', x, z: -10, time: 0, fired: false }); }
    } else {
      const count = pattern === 'sweep' ? 7 : 3 + (enemy.phase - 1) * 2;
      for (let i = 0; i < count; i++) {
        const tx = pattern === 'sweep' ? (i - 3) * 1.8 : enemy.targetX + (i - (count - 1) / 2) * 1.2;
        this.launch(false, enemy.x, 1.35, enemy.z + 1.5, tx, enemy.targetY, 1, 18 + this.level.id * 2, 13 + enemy.phase * 2, this.level.color);
      }
    }
    audio.play('boss');
  }

  update(dt: number, player: PlayerTarget, hooks: CombatHooks) {
    this.time += dt;
    for (const key of ['cooldown', 'muzzle', 'hitMarker', 'critical', 'dashTime', 'dashCooldown', 'alertTime', 'comboTime'] as const) this[key] = Math.max(0, this[key] - dt);
    if (this.comboTime === 0) this.combo = 0;
    if (this.reloading > 0) {
      this.reloading = Math.max(0, this.reloading - dt);
      if (this.reloading === 0) { this.ammo[this.weapon] = weaponById(this.weapon).magazine; audio.play('reload-done'); }
    }
    if (this.firing && !this.complete) {
      const spec = weaponById(this.weapon);
      if (spec.charge && this.cooldown === 0 && this.reloading === 0 && this.ammo[this.weapon] > 0) {
        this.charge += dt;
        if (this.charge >= spec.charge) this.fire(player);
      } else this.fire(player);
    }

    const alive = this.enemies.some(e => e.active);
    if (!alive && !this.complete) {
      if ((this.boss && this.wave > 0) || this.wave >= this.level.waves) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) {
          // Unclaimed drops are awarded when the checkpoint is secured.
          for (const pickup of this.pickups) if (pickup.active) { hooks.pickup(pickup.kind); pickup.active = false; }
          this.complete = true; this.firing = false;
        }
      } else { this.waveDelay -= dt; if (this.waveDelay <= 0) this.nextWave(); }
    } else if (alive) this.waveDelay = 1.8;

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const spec = ENEMIES[enemy.kind]; enemy.age += dt; enemy.hit = Math.max(0, enemy.hit - dt);
      if (enemy.kind === 'boss') {
        const phase = enemy.hp < enemy.maxHp / 3 ? 3 : enemy.hp < enemy.maxHp * 2 / 3 ? 2 : 1;
        if (phase > enemy.phase) { this.alert = `PHASE ${phase} · CORE EXPOSED`; this.alertTime = 2.2; audio.play('alarm'); }
        enemy.phase = phase;
        enemy.x = Math.sin(enemy.age * 0.5) * (enemy.phase + 0.4);
        enemy.y = this.level.id === 4 ? 3.3 + Math.sin(enemy.age) * 0.4 : 2.5;
      } else {
        enemy.x = enemy.homeX + Math.sin(enemy.age * spec.speed + enemy.id) * Math.min(1.5, spec.speed * 0.6);
        if (spec.flying) enemy.y = 2.2 + Math.sin(enemy.age * 1.8 + enemy.id) * 0.4;
        if (enemy.kind === 'chaser') enemy.z = Math.min(-8, enemy.z + dt * 0.55);
      }
      enemy.weak = enemy.kind !== 'shield' || enemy.telegraph > 0 || enemy.cooldown > spec.cooldown / this.level.aggression - 0.8;
      if (enemy.telegraph > 0) {
        enemy.telegraph -= dt;
        if (enemy.telegraph <= 0) { this.attack(enemy, player); enemy.cooldown = spec.cooldown / this.level.aggression / (enemy.kind === 'boss' ? 0.85 + enemy.phase * 0.15 : 1); }
      } else {
        enemy.cooldown -= dt;
        if (enemy.cooldown <= 0) {
          enemy.telegraph = spec.telegraph;
          enemy.targetX = player.x; enemy.targetY = player.y + (player.crouching ? 0.5 : 1.3);
          if (enemy.kind === 'boss') {
            const pattern = this.level.patterns[enemy.patternIndex % this.level.patterns.length];
            this.alert = pattern === 'shockwave' ? 'JUMP · SHOCKWAVE INCOMING' : pattern === 'laser' ? 'DASH · LASER LOCK' : 'MOVE · INCOMING VOLLEY'; this.alertTime = 2.5;
          }
        }
      }
    }

    for (const p of this.projectiles) {
      if (!p.active) continue;
      const ox = p.x, oy = p.y, oz = p.z;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.ttl -= dt;
      if (p.ttl <= 0 || p.z > 8 || p.z < -45 || Math.abs(p.x) > 35 || p.y < 0) { p.active = false; continue; }
      if (crossesCover(ox, oy, oz, p.x, p.y, p.z)) { p.active = false; this.burst(p.x, p.y, p.z, '#ffe29b', 3); continue; }
      if (p.friendly) {
        for (const enemy of this.enemies) {
          if (!enemy.active) continue;
          if (segmentDistance(ox, oy, oz, p.x, p.y, p.z, enemy.x, enemy.y, enemy.z) <= enemy.radius + p.radius) {
            const weakY = enemy.y + (enemy.kind === 'boss' ? 0.5 : 0.45);
            // Test the shot trajectory against the core, which sits inside the body collider.
            const critical = segmentDistance(ox, oy, oz, p.x + p.vx * 0.1, p.y + p.vy * 0.1, p.z + p.vz * 0.1, enemy.x, weakY, enemy.z + 0.15) < (enemy.kind === 'boss' ? 0.65 : 0.38);
            this.damageEnemy(enemy, p.damage, critical, hooks); p.active = false; break;
          }
        }
      } else if (!player.invincible && this.dashTime <= 0 && segmentDistance(ox, oy, oz, p.x, p.y, p.z, player.x, player.y + (player.crouching ? 0.38 : 0.9), 0) < (player.crouching ? 0.4 : 0.66) + p.radius) {
        p.active = false; hooks.damage(p.damage); this.combo = 0; this.burst(player.x, player.y + 1, 0, '#ff4a6c', 7);
      }
    }
    for (const hazard of this.hazards) {
      if (!hazard.active) continue;
      hazard.time += dt;
      if (hazard.kind === 'shockwave') {
        const before = hazard.z; hazard.z += dt * 10;
        if (!hazard.fired && before < 0.5 && hazard.z >= -0.6) {
          hazard.fired = true;
          if (player.y < 0.65 && !player.invincible && this.dashTime <= 0) hooks.damage(24);
        }
        if (hazard.z > 7) hazard.active = false;
      } else {
        if (!hazard.fired && hazard.time >= 1.2) {
          hazard.fired = true;
          if (Math.abs(player.x - hazard.x) < 0.8 && !player.invincible && this.dashTime <= 0) hooks.damage(28);
        }
        if (hazard.time >= 1.8) hazard.active = false;
      }
    }
    for (const p of this.particles) {
      if (!p.active) continue;
      p.ttl -= dt; if (p.ttl <= 0) { p.active = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= dt * 7;
    }
    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      pickup.z = Math.min(-0.1, pickup.z + dt * 8);
      if (pickup.z >= -0.6 && Math.abs(player.x - pickup.x) < 1.4) { hooks.pickup(pickup.kind); pickup.active = false; audio.play('power'); }
    }
  }
}
