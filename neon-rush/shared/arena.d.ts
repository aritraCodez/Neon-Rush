export const ARENA: Readonly<{
  width: number; depth: number; maxPlayers: number; minPlayers: number; duration: number;
  winningKills: number; speed: number; playerRadius: number; bulletSpeed: number; bulletDamage: number;
  fireInterval: number; magazine: number; reloadTime: number; respawnTime: number; spawnShield: number;
  dashTime: number; dashCooldown: number; tickRate: number;
}>;
export const ARENA_COVER: readonly { x: number; z: number; width: number; depth: number }[];
export const ARENA_SPAWNS: readonly { x: number; z: number }[];
export const PLAYER_COLORS: readonly string[];
