export type EnemyKind = 'patrol' | 'ground' | 'turret' | 'chaser' | 'shield' | 'sniper' | 'flying' | 'heavy' | 'elite' | 'boss';
export interface EnemySpec { name: string; hp: number; speed: number; cooldown: number; telegraph: number; damage: number; projectileSpeed: number; color: string; flying: boolean; radius: number }
export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  patrol: { name: 'Patrol Drone', hp: 48, speed: 1.1, cooldown: 3.2, telegraph: 0.9, damage: 11, projectileSpeed: 13, color: '#ff649c', flying: true, radius: 0.8 },
  ground: { name: 'Ground Bot', hp: 70, speed: 0.6, cooldown: 3.5, telegraph: 1, damage: 14, projectileSpeed: 14, color: '#ffb256', flying: false, radius: 0.8 },
  turret: { name: 'Turret', hp: 85, speed: 0, cooldown: 3, telegraph: 1, damage: 15, projectileSpeed: 16, color: '#ffc062', flying: false, radius: 0.85 },
  chaser: { name: 'Chaser Drone', hp: 52, speed: 2.3, cooldown: 2.8, telegraph: 0.85, damage: 12, projectileSpeed: 15, color: '#61e8ff', flying: true, radius: 0.75 },
  shield: { name: 'Shield Bot', hp: 100, speed: 0.55, cooldown: 3.1, telegraph: 1.25, damage: 15, projectileSpeed: 16, color: '#ae87ff', flying: false, radius: 0.9 },
  sniper: { name: 'Sniper Drone', hp: 58, speed: 0.4, cooldown: 4.4, telegraph: 1.6, damage: 25, projectileSpeed: 29, color: '#ff5678', flying: true, radius: 0.75 },
  flying: { name: 'Flying Drone', hp: 65, speed: 2.2, cooldown: 2.5, telegraph: 0.9, damage: 13, projectileSpeed: 17, color: '#70ddff', flying: true, radius: 0.8 },
  heavy: { name: 'Heavy Bot', hp: 165, speed: 0.3, cooldown: 3.4, telegraph: 1.15, damage: 20, projectileSpeed: 14, color: '#ffc057', flying: false, radius: 1.05 },
  elite: { name: 'Elite Unit', hp: 135, speed: 1.6, cooldown: 2.5, telegraph: 1.05, damage: 17, projectileSpeed: 19, color: '#ff426f', flying: false, radius: 0.9 },
  boss: { name: 'Boss', hp: 420, speed: 0.8, cooldown: 2.6, telegraph: 1.25, damage: 22, projectileSpeed: 16, color: '#ff5d97', flying: false, radius: 2 },
};

export interface Enemy {
  id: number; active: boolean; kind: EnemyKind; x: number; y: number; z: number; homeX: number;
  hp: number; maxHp: number; radius: number; cooldown: number; telegraph: number;
  targetX: number; targetY: number; hit: number; age: number; phase: number;
  patternIndex: number; weak: boolean; miniboss: boolean;
}
export const emptyEnemy = (): Enemy => ({ id: 0, active: false, kind: 'patrol', x: 0, y: 1, z: -20, homeX: 0, hp: 0, maxHp: 0, radius: 0.8, cooldown: 0, telegraph: 0, targetX: 0, targetY: 1, hit: 0, age: 0, phase: 1, patternIndex: 0, weak: true, miniboss: false });
