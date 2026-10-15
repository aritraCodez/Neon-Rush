import { audio } from './audio';
import { CombatSystem, inCombat } from './combat';
import type { Pickup } from './combat';
import { getLevel } from './levels';
import { completeLevel, loadProgress, purchaseUpgrade, saveProgress } from './progression';
import type { Checkpoint, Progress } from './progression';
import type { WeaponId } from './weapons';
import { weaponById } from './weapons';

export type Phase = 'menu' | 'briefing' | 'countdown' | 'running' | 'combat' | 'boss' | 'transition' | 'upgrade' | 'victory' | 'paused' | 'over';
export type EntityKind = 'wall' | 'hurdle' | 'beam' | 'coin' | 'shield' | 'magnet' | 'double';
export type Action = 'left' | 'right' | 'jump' | 'slide';
export type Power = 'shield' | 'magnet' | 'double';
export interface Entity { id: number; kind: EntityKind; lane: number; z: number; active: boolean }
export interface Snapshot {
  phase: Phase; score: number; best: number; coins: number; distance: number;
  speed: number; level: number; countdown: number; shield: number; magnet: number;
  double: number; notice: string; newBest: boolean;
  campaign: CampaignSnapshot;
}
export interface CampaignSnapshot {
  active: boolean; levelId: number; health: number; armor: number; segment: number; segmentDistance: number;
  segmentLength: number; missionTime: number; damageTaken: number; arena: boolean; transitionLabel: string;
  transitionTime: number; stars: number; progress: Progress; wave: number; waves: number; remaining: number;
  weapon: WeaponId; ammo: number; magazine: number; reload: number; reloadTotal: number; charge: number;
  dashCooldown: number; kills: number; combo: number; multiplier: number; accuracy: number; alert: string;
  bossHp: number; bossMaxHp: number; bossPhase: number; achievements: string[];
}
export const LANE_WIDTH = 2.5;
const HAZARDS: EntityKind[] = ['wall', 'hurdle', 'beam'];

export class GameEngine {
  phase: Phase = 'menu';
  entities: Entity[] = [];
  lane = 0;
  x = 0;
  y = 0;
  velocityY = 0;
  slide = 0;
  distance = 0;
  visualDistance = 0;
  elapsed = 0;
  score = 0;
  coins = 0;
  best = 0;
  previousBest = 0;
  speed = 17;
  countdown = 3;
  powers: Record<Power, number> = { shield: 0, magnet: 0, double: 0 };
  invincible = 0;
  flash = 0;
  notice = '';
  reducedMotion = false;
  readonly combat = new CombatSystem();
  progress = loadProgress();
  mode: 'endless' | 'campaign' = 'endless';
  levelId = 1;
  health = 100;
  armor = 35;
  arena = false;
  segment = 0;
  segmentDistance = 0;
  missionTime = 0;
  damageTaken = 0;
  stars = 0;
  earnedAchievements: string[] = [];
  transitionLabel = '';
  transitionTime = 0;
  private transitionTarget: 'combat' | 'running' | 'boss' = 'combat';
  private lastDirection = 1;
  private noticeTime = 0;
  private nextId = 0;
  private rowDistance = 0;
  private nextPower = 150;
  private hudTimer = 0;
  private listeners = new Set<() => void>();
  private snapshot!: Snapshot;
  private pausedFrom: Phase = 'running';

  constructor(private random: () => number = Math.random) {
    try { this.best = Math.max(0, Number(localStorage.getItem('neon-rush-best')) || 0); } catch { /* Local storage can be unavailable. */ }
    this.demo();
    this.publish();
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;

  private publish() {
    const boss = this.combat.enemies.find(enemy => enemy.active && enemy.kind === 'boss');
    const spec = weaponById(this.combat.weapon);
    this.snapshot = {
      phase: this.phase, score: Math.floor(this.score), best: this.best, coins: this.coins,
      distance: Math.floor(this.distance), speed: this.speed, level: 1 + Math.floor(this.distance / 250),
      countdown: Math.ceil(this.countdown), ...this.powers, notice: this.notice,
      newBest: this.score > this.previousBest && this.score > 0,
      campaign: {
        active: this.mode === 'campaign', levelId: this.levelId, health: this.health, armor: this.armor,
        segment: this.segment, segmentDistance: this.segmentDistance, segmentLength: getLevel(this.levelId).runLength,
        missionTime: this.missionTime, damageTaken: this.damageTaken, arena: this.arena, transitionLabel: this.transitionLabel,
        transitionTime: this.transitionTime, stars: this.stars,
        progress: { ...this.progress, upgrades: { ...this.progress.upgrades }, stars: { ...this.progress.stars }, scores: { ...this.progress.scores }, achievements: [...this.progress.achievements] },
        wave: this.combat.wave, waves: getLevel(this.levelId).waves, remaining: this.combat.enemies.filter(e => e.active).length,
        weapon: this.combat.weapon, ammo: this.combat.ammo[this.combat.weapon], magazine: spec.magazine,
        reload: this.combat.reloading, reloadTotal: this.combat.reloadTotal, charge: this.combat.charge,
        dashCooldown: this.combat.dashCooldown, kills: this.combat.kills, combo: this.combat.combo,
        multiplier: 1 + Math.min(4, Math.floor(this.combat.combo / 3)), accuracy: this.combat.shots ? Math.min(1, this.combat.hits / this.combat.shots) : 0,
        alert: this.combat.alertTime > 0 ? this.combat.alert : '', bossHp: boss?.hp ?? 0, bossMaxHp: boss?.maxHp ?? 0,
        bossPhase: boss?.phase ?? 1, achievements: this.earnedAchievements,
      },
    };
    this.listeners.forEach(listener => listener());
  }

  spawn(kind: EntityKind, lane: number, z: number) {
    this.entities.push({ id: this.nextId++, kind, lane, z, active: true });
  }

  private demo() {
    this.entities = [];
    this.spawn('wall', -1, -25);
    this.spawn('hurdle', 1, -50);
    this.spawn('beam', 0, -72);
    for (let i = 0; i < 8; i++) this.spawn('coin', 0, -9 - i * 3.6);
    this.spawn('shield', 1, -20);
  }

  start = () => {
    this.mode = 'endless'; this.arena = false;
    this.health = 100; this.armor = 35; this.segment = 0; this.segmentDistance = 0; this.missionTime = 0; this.damageTaken = 0; this.stars = 0;
    this.combat.reset(this.progress.unlocked, this.progress.upgrades);
    audio.unlock();
    audio.play('start');
    this.phase = 'countdown';
    this.countdown = 3;
    this.lane = 0; this.x = 0; this.y = 0; this.velocityY = 0; this.slide = 0;
    this.distance = 0; this.score = 0; this.coins = 0; this.elapsed = 0; this.speed = 17;
    this.previousBest = this.best;
    this.powers = { shield: 0, magnet: 0, double: 0 };
    this.invincible = 0; this.flash = 0; this.rowDistance = 0; this.nextPower = 130;
    this.notice = ''; this.entities = []; this.nextId = 0;
    for (let i = 0; i < 6; i++) this.spawn('coin', 0, -15 - i * 3);
    this.spawn('hurdle', 0, -44);
    this.spawn('wall', -1, -67);
    this.spawn('shield', 1, -68);
    this.spawn('beam', 1, -92);
    for (let i = 0; i < 5; i++) this.spawn('coin', 0, -78 - i * 3);
    this.publish();
  };

  menu = () => { this.phase = 'menu'; this.arena = false; this.y = 0; this.x = 0; this.slide = 0; this.combat.clear(); this.powers = { shield: 0, magnet: 0, double: 0 }; this.demo(); this.publish(); };
  pause = () => {
    if (!['running', 'countdown', 'combat', 'boss', 'transition'].includes(this.phase)) return;
    this.pausedFrom = this.phase;
    this.combat.setFiring(false); this.combat.covering = false;
    this.combat.aimStick = { x: 0, y: 0 };
    this.phase = 'paused';
    this.publish();
  };
  resume = () => { if (this.phase === 'paused') { audio.unlock(); this.phase = this.pausedFrom; this.publish(); } };
  togglePause = () => { if (this.phase === 'paused') this.resume(); else this.pause(); };

  act = (action: Action) => {
    if (this.phase !== 'running' && !inCombat(this.phase)) return;
    if (action === 'left' || action === 'right') {
      const next = Math.max(-1, Math.min(1, this.lane + (action === 'left' ? -1 : 1)));
      if (next !== this.lane) audio.play('move');
      this.lane = next;
      this.lastDirection = action === 'left' ? -1 : 1;
    }
    if (action === 'jump' && this.y <= 0.01) { this.velocityY = 11.6; this.slide = 0; audio.play('jump'); }
    if (action === 'slide') {
      if (this.y > 0.01) this.velocityY = -15;
      else if (this.slide <= 0) { this.slide = 0.82; audio.play('slide'); }
    }
  };

  startLevel = (id: number, keepCheckpoint = false) => {
    if (!Number.isInteger(id) || id < 1 || id > this.progress.unlocked) return false;
    this.start(); this.mode = 'campaign'; this.levelId = id; this.phase = 'briefing'; this.arena = true;
    this.earnedAchievements = []; this.combat.level = getLevel(id);
    if (!keepCheckpoint) { this.progress.checkpoint = null; saveProgress(this.progress); }
    this.publish(); return true;
  };
  deploy = () => { if (this.phase !== 'briefing') return; this.arena = false; this.phase = 'countdown'; this.countdown = 3; audio.play('start'); this.publish(); };
  restart = () => { if (this.mode === 'campaign') this.startLevel(this.levelId); else this.start(); };
  fire = (value: boolean) => { if (inCombat(this.phase)) this.combat.setFiring(value); else this.combat.setFiring(false); };
  reload = () => { if (inCombat(this.phase)) { this.combat.reload(); this.publish(); } };
  switchWeapon = () => { if (inCombat(this.phase) || this.phase === 'running') { this.combat.switchWeapon(); this.publish(); } };
  cover = (value: boolean) => { this.combat.covering = value && inCombat(this.phase); };
  dash = () => {
    if (!inCombat(this.phase) || !this.combat.dash()) return;
    const direction = this.lane === 1 ? -1 : this.lane === -1 ? 1 : this.lastDirection;
    this.lane = Math.max(-1, Math.min(1, this.lane + direction)); this.slide = 0;
    this.publish();
  };
  buyWeaponUpgrade = (weapon: WeaponId) => { if (this.phase !== 'menu' || weaponById(weapon).unlock > this.progress.unlocked) return false; const bought = purchaseUpgrade(this.progress, weapon); if (bought) { audio.play('power'); this.publish(); } return bought; };

  private checkpoint(stage: Checkpoint['stage']) {
    this.progress.checkpoint = { level: this.levelId, stage, score: this.score, coins: this.coins, distance: this.distance, time: this.missionTime,
      kills: this.combat.kills, damage: this.damageTaken, shots: this.combat.shots, hits: this.combat.hits,
      damageBoost: this.combat.damageBoost, reloadBoost: this.combat.reloadBoost, armorBoost: this.combat.armorBoost };
    saveProgress(this.progress);
  }
  continueCheckpoint = () => {
    const saved = this.progress.checkpoint; if (!saved) return false;
    this.startLevel(saved.level, true);
    this.score = saved.score; this.coins = saved.coins; this.distance = saved.distance; this.missionTime = saved.time;
    this.damageTaken = saved.damage + 25; this.combat.kills = saved.kills; this.combat.shots = saved.shots; this.combat.hits = saved.hits;
    this.progress.checkpoint = { ...saved, damage: this.damageTaken }; saveProgress(this.progress);
    this.combat.damageBoost = saved.damageBoost; this.combat.reloadBoost = saved.reloadBoost; this.combat.armorBoost = saved.armorBoost;
    this.armor = 35 + saved.armorBoost;
    this.segment = saved.stage === 'combat' ? 0 : 1;
    if (saved.stage === 'upgrade') { this.phase = 'upgrade'; this.arena = true; this.publish(); }
    else this.beginTransition(saved.stage === 'runner2' ? 'running' : saved.stage);
    return true;
  };
  chooseUpgrade = (choice: 'damage' | 'armor' | 'capacitor') => {
    if (this.phase !== 'upgrade') return;
    if (choice === 'damage') this.combat.damageBoost += 0.25;
    else if (choice === 'armor') { this.combat.armorBoost += 30; this.armor = Math.min(100, this.armor + 45); this.health = Math.min(100, this.health + 35); }
    else if (choice === 'capacitor') this.combat.reloadBoost = 0.25;
    else return;
    audio.play('power'); this.segment = 1; this.segmentDistance = 0;
    this.checkpoint('runner2'); this.beginTransition('running');
  };
  private beginTransition(target: 'combat' | 'running' | 'boss') {
    this.phase = 'transition'; this.transitionTarget = target; this.transitionTime = target === 'boss' ? 3.5 : 2.4;
    this.transitionLabel = target === 'boss' ? getLevel(this.levelId).boss : target === 'combat' ? 'CHECKPOINT BREACH' : 'BACK ON THE RUN';
    this.combat.setFiring(false); this.combat.covering = false; this.entities = [];
    this.y = 0; this.velocityY = 0; this.slide = 0; this.lane = 0; this.arena = target !== 'running';
    if (target !== 'running') this.combat.begin(getLevel(this.levelId), target === 'boss');
    else { this.combat.clear(); this.rowDistance = 20; this.nextPower = this.distance + 40; }
    audio.play(target === 'boss' ? 'boss' : 'alarm'); this.publish();
  }
  private takeDamage = (amount: number) => {
    if (this.invincible > 0 || this.combat.dashTime > 0) return;
    if (this.powers.shield > 0) { this.powers.shield = 0; this.invincible = 1; this.notice = 'SHIELD SAVED YOU'; this.noticeTime = 2; audio.play('hit'); return; }
    const absorbed = Math.min(this.armor, amount); this.armor -= absorbed;
    this.health = Math.max(0, this.health - (amount - absorbed)); this.damageTaken += amount;
    this.flash = 0.85; this.invincible = 0.65; audio.play('hit');
    if (this.health <= 0) this.finish();
  };
  private collectCombatPickup = (kind: Pickup['kind']) => {
    if (kind === 'health') this.health = Math.min(100, this.health + 20);
    if (kind === 'armor') this.armor = Math.min(100, this.armor + 25);
    if (kind === 'ammo') this.combat.refill();
    if (kind === 'coin') { this.coins += 10; this.score += 250; }
  };
  private combatHooks = { damage: this.takeDamage, reward: (score: number, coins: number) => { this.score += score * (this.powers.double > 0 ? 2 : 1); this.coins += coins; }, pickup: this.collectCombatPickup };

  private victory() {
    if (this.phase === 'victory') return;
    const accuracy = this.combat.shots ? this.combat.hits / this.combat.shots : 0;
    const level = getLevel(this.levelId);
    this.stars = 1 + Number(this.damageTaken <= 60) + Number(this.missionTime <= level.parTime && accuracy >= 0.25);
    const earned = ['first-clear'];
    if (this.damageTaken === 0) earned.push('untouched');
    if (accuracy >= 0.65) earned.push('sharpshooter');
    if (this.missionTime < level.parTime * 0.65) earned.push('speed-runner');
    if (this.levelId === 5) earned.push('city-liberator');
    this.earnedAchievements = earned.filter(id => !this.progress.achievements.includes(id));
    this.score += this.stars * 500; this.best = Math.max(this.best, Math.floor(this.score));
    try { localStorage.setItem('neon-rush-best', String(this.best)); } catch { /* Optional storage. */ }
    completeLevel(this.progress, this.levelId, this.score, this.coins, this.stars, earned);
    this.phase = 'victory'; this.combat.setFiring(false); audio.play('victory'); this.publish();
  }

  private finish() {
    this.phase = 'over';
    this.flash = 1;
    this.combat.setFiring(false); this.combat.covering = false;
    audio.play('over');
    if (this.score > this.best) {
      this.best = Math.floor(this.score);
      try { localStorage.setItem('neon-rush-best', String(this.best)); } catch { /* The run still works without storage. */ }
    }
    this.publish();
  }

  private generateRow() {
    const level = (this.mode === 'campaign' ? this.levelId : 1) + Math.floor(this.distance / 250);
    const safeLane = Math.floor(this.random() * 3) - 1;
    const blocked = [-1, 0, 1].filter(lane => lane !== safeLane);
    const count = level > 1 && this.random() < Math.min(0.72, 0.2 + level * 0.07) ? 2 : 1;
    if (this.random() > 0.5) blocked.reverse();
    for (const lane of blocked.slice(0, count)) {
      this.spawn(HAZARDS[Math.floor(this.random() * HAZARDS.length)], lane, -125);
    }
    for (let i = 0; i < 5; i++) this.spawn('coin', safeLane, -123 - i * 2.9);
    if (this.distance >= this.nextPower) {
      const kinds: Power[] = ['shield', 'magnet', 'double'];
      this.spawn(kinds[Math.floor(this.random() * kinds.length)], safeLane, -138);
      this.nextPower = this.distance + 130 + this.random() * 80;
    }
  }

  update(delta: number) {
    const dt = Math.min(Math.max(delta, 0), 0.1);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.phase === 'menu') { if (!this.reducedMotion) this.visualDistance += dt * 3; return; }
    if (['paused', 'over', 'briefing', 'upgrade', 'victory'].includes(this.phase)) return;
    if (this.mode === 'campaign') this.missionTime += dt;
    if (this.phase === 'transition') {
      this.transitionTime -= dt;
      this.x += (0 - this.x) * (1 - Math.exp(-5 * dt));
      if (this.transitionTime <= 0) { this.phase = this.transitionTarget; if (this.phase === 'running') this.segmentDistance = 0; this.publish(); }
      this.hudTimer += dt; if (this.hudTimer > 0.08) { this.hudTimer = 0; this.publish(); }
      return;
    }
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before) { audio.play('tick'); this.publish(); }
      if (this.countdown <= 0) { this.phase = 'running'; this.publish(); }
      return;
    }
    // Small physics steps keep collision checks reliable even when a frame is delayed.
    let remaining = dt;
    while (remaining > 0 && (this.phase === 'running' || inCombat(this.phase))) {
      const step = Math.min(remaining, 1 / 120);
      if (inCombat(this.phase)) this.combatStep(step); else this.step(step);
      remaining -= step;
    }
    this.hudTimer += dt;
    if (this.hudTimer >= 0.08) { this.hudTimer = 0; this.publish(); }
  }

  private combatStep(dt: number) {
    this.elapsed += dt;
    this.x += (this.lane * LANE_WIDTH - this.x) * (1 - Math.exp(-(this.combat.dashTime > 0 ? 22 : 9) * dt));
    this.y += this.velocityY * dt; this.velocityY -= 27 * dt;
    if (this.y <= 0) { this.y = 0; this.velocityY = 0; }
    this.slide = this.combat.covering && this.y === 0 ? 0.1 : Math.max(0, this.slide - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    for (const power of ['shield', 'magnet', 'double'] as Power[]) this.powers[power] = Math.max(0, this.powers[power] - dt);
    this.combat.update(dt, { x: this.x, y: this.y, crouching: this.slide > 0, invincible: this.invincible > 0 }, this.combatHooks);
    if (this.phase === 'over') return;
    if (this.combat.complete) {
      if (this.phase === 'boss') this.victory();
      else { this.phase = 'upgrade'; this.combat.setFiring(false); this.checkpoint('upgrade'); audio.play('victory'); this.publish(); }
    }
  }

  private step(dt: number) {
    this.elapsed += dt;
    this.speed = Math.min(36, (this.mode === 'campaign' ? getLevel(this.levelId).speed + this.segment * 2 : 17) + this.distance / 180);
    const travel = this.speed * dt;
    this.distance += travel;
    this.segmentDistance += travel;
    this.visualDistance += travel;
    this.score += travel * (this.powers.double > 0 ? 4 : 2);
    this.x += (this.lane * LANE_WIDTH - this.x) * (1 - Math.exp(-18 * dt));
    this.y += this.velocityY * dt;
    this.velocityY -= 27 * dt;
    if (this.y <= 0) { this.y = 0; this.velocityY = 0; }
    this.slide = Math.max(0, this.slide - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    for (const power of ['shield', 'magnet', 'double'] as Power[]) this.powers[power] = Math.max(0, this.powers[power] - dt);
    this.noticeTime -= dt;
    if (this.noticeTime <= 0) this.notice = '';
    this.rowDistance += travel;
    if (this.rowDistance > Math.max(22, this.speed * 1.15)) { this.rowDistance = 0; this.generateRow(); }

    for (const entity of this.entities) {
      if (!entity.active) continue;
      entity.z += travel;
      if (entity.z > 6) { entity.active = false; continue; }
      const dx = Math.abs(entity.lane * LANE_WIDTH - this.x);
      const inLane = dx < 0.88;
      const near = Math.abs(entity.z) < 0.9;
      if (entity.kind === 'coin') {
        const magnet = this.powers.magnet > 0 && dx < 6 && Math.abs(entity.z) < 8;
        if (magnet || (inLane && near && this.y < 1.7)) {
          entity.active = false; this.coins++; this.score += this.powers.double > 0 ? 50 : 25;
          audio.play('coin');
        }
        continue;
      }
      if (!inLane || !near) continue;
      if (entity.kind === 'shield' || entity.kind === 'magnet' || entity.kind === 'double') {
        if (this.y > 1.8) continue;
        entity.active = false;
        this.powers[entity.kind] = entity.kind === 'magnet' ? 12 : 10;
        this.notice = entity.kind === 'double' ? 'DOUBLE SCORE' : `${entity.kind.toUpperCase()} ACTIVE`;
        this.noticeTime = 2.2; audio.play('power');
        continue;
      }
      const hit = entity.kind === 'wall' || (entity.kind === 'hurdle' && this.y < 0.9) ||
        (entity.kind === 'beam' && this.y + (this.slide > 0 ? 0.65 : 1.65) > 1.25);
      if (hit && this.invincible <= 0) {
        if (this.powers.shield > 0) {
          this.powers.shield = 0; this.invincible = 1.5; this.flash = 0.6;
          this.notice = 'SHIELD SAVED YOU'; this.noticeTime = 2; entity.active = false;
          audio.play('hit');
        } else if (this.mode === 'campaign') { entity.active = false; this.takeDamage(30); if (this.phase === 'over') break; }
        else { this.finish(); break; }
      }
    }
    this.entities = this.entities.filter(entity => entity.active);
    if (this.mode === 'campaign' && this.phase === 'running' && this.segmentDistance >= getLevel(this.levelId).runLength) {
      this.checkpoint(this.segment === 0 ? 'combat' : 'boss');
      this.beginTransition(this.segment === 0 ? 'combat' : 'boss');
    }
  }
}

export const game = new GameEngine();
