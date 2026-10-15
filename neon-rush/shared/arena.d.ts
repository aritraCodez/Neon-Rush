export const ARENA: Readonly<{
  width: number; depth: number; maxPlayers: number; minPlayers: number; duration: number;
  winningKills: number; speed: number; playerRadius: number; bulletSpeed: number; bulletDamage: number;
  fireInterval: number; magazine: number; reloadTime: number; respawnTime: number; spawnShield: number;
  dashTime: number; dashCooldown: number; tickRate: number;
}>;
export const ARENA_COVER: readonly { x: number; z: number; width: number; depth: number }[];
export const ARENA_SPAWNS: readonly { x: number; z: number }[];
export const PLAYER_COLORS: readonly string[];
export type ArenaWeaponId = 'blaster' | 'pulse' | 'shotgun' | 'laser';
export type PickupKind = Exclude<ArenaWeaponId, 'blaster'> | 'health' | 'armor';
export interface ArenaWeaponSpec { name: string; color: string; damage: number; magazine: number; interval: number; reload: number; speed: number; pellets: number; spread: number }
export interface ArenaCover { x: number; z: number; width: number; depth: number; height?: number; asset?: string }
export interface ArenaMapSpec { id: string; name: string; description: string; width: number; depth: number; color: string; cover: readonly ArenaCover[]; spawns: readonly { x: number; z: number }[]; pickups: readonly { id: string; kind: PickupKind; x: number; z: number }[] }
export const ARENA_WEAPONS: Readonly<Record<ArenaWeaponId, ArenaWeaponSpec>>;
export function arenaWeapon(id?: string): ArenaWeaponSpec;
export const ARENA_MAPS: readonly ArenaMapSpec[];
export function arenaMap(id?: string): ArenaMapSpec;
