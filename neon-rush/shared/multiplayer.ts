export interface ArenaInput { dx: number; dz: number; aimX: number; aimZ: number; fire: boolean; dash?: boolean; reload?: boolean }
export interface ArenaPlayer {
  id: string; name: string; style: string; color: string; x: number; z: number; angle: number;
  hp: number; kills: number; deaths: number; connected: boolean; ready: boolean;
  respawnIn: number; shield: number; dashCooldown: number; dashing: boolean;
  ammo: number; reload: number; moving: boolean; shots: number; hit: number;
}
export interface ArenaBullet { id: number; owner: string; x: number; z: number; vx: number; vz: number; color: string }
export interface ArenaEvent { id: number; text: string; kind: 'kill' | 'notice' }
export interface ArenaSnapshot {
  code: string; hostId: string; phase: 'lobby' | 'countdown' | 'playing' | 'finished';
  round: number; remaining: number; countdown: number; players: ArenaPlayer[];
  bullets: ArenaBullet[]; events: ArenaEvent[]; winners: string[]; endReason: string; serverTime: number;
}
