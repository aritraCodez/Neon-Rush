export const ARENA = Object.freeze({
  width: 26, depth: 32, maxPlayers: 6, minPlayers: 2, duration: 180,
  winningKills: 10, speed: 7, playerRadius: 0.52,
  bulletSpeed: 38, bulletDamage: 25, fireInterval: 0.22,
  magazine: 16, reloadTime: 1.3, respawnTime: 3, spawnShield: 1.5,
  dashTime: 0.16, dashCooldown: 3, tickRate: 30,
});
export const ARENA_COVER = Object.freeze([
  { x: -5.5, z: -6, width: 4, depth: 1.5 },
  { x: 5.5, z: 6, width: 4, depth: 1.5 },
  { x: 5.5, z: -6, width: 1.5, depth: 4 },
  { x: -5.5, z: 6, width: 1.5, depth: 4 },
  { x: 0, z: 0, width: 3, depth: 3 },
]);
export const ARENA_SPAWNS = Object.freeze([
  { x: -9, z: 11 }, { x: 9, z: -11 }, { x: -9, z: -11 },
  { x: 9, z: 11 }, { x: 0, z: -12 }, { x: 0, z: 12 },
]);
export const PLAYER_COLORS = Object.freeze(['#57e8f5', '#ff78ce', '#bdff54', '#ffc558', '#a59aff', '#ff865e']);
