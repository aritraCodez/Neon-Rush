import type { ArenaWeaponId, PickupKind } from './arena.js';
export interface ArenaInput { dx: number; dz: number; aimX: number; aimZ: number; fire: boolean; dash?: boolean; reload?: boolean; aimDX?: number; aimDZ?: number }
export interface ArenaCommand extends ArenaInput { seq: number }
export interface ArenaPlayer {
  id: string; name: string; style: string; color: string; x: number; z: number; angle: number;
  hp: number; kills: number; deaths: number; connected: boolean; ready: boolean; muted: boolean;
  respawnIn: number; shield: number; dashCooldown: number; dashTime: number; dashing: boolean; ack: number;
  ammo: number; reload: number; moving: boolean; shots: number; hit: number;
  weapon: ArenaWeaponId; armor: number;
}
export interface ArenaBullet { id: number; owner: string; x: number; z: number; vx: number; vz: number; color: string }
export interface ArenaEvent { id: number; text: string; kind: 'kill' | 'notice' }
export interface ArenaChat { id: number; from: string; name: string; color: string; text: string; at: number }
export interface ArenaPickup { id: string; kind: PickupKind; x: number; z: number; availableIn: number }
export interface ArenaSnapshot {
  code: string; hostId: string; phase: 'lobby' | 'countdown' | 'playing' | 'finished';
  round: number; remaining: number; countdown: number; players: ArenaPlayer[];
  bullets: ArenaBullet[]; events: ArenaEvent[]; chat: ArenaChat[]; winners: string[]; endReason: string; serverTime: number;
  snapshotId: number; tickRate: number; snapshotRate: number; serverStepMs: number;
  capacity: number; mapId: string; pickups: ArenaPickup[];
}
