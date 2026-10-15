export const ARENA = Object.freeze({
  width: 26, depth: 32, maxPlayers: 12, minPlayers: 2, duration: 180,
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
  { x: -10, z: -4 }, { x: 10, z: 4 }, { x: -10, z: 4 },
  { x: 10, z: -4 }, { x: -5, z: 13 }, { x: 5, z: -13 },
]);
export const PLAYER_COLORS = Object.freeze(['#57e8f5', '#ff78ce', '#bdff54', '#ffc558', '#a59aff', '#ff865e', '#68ffb4', '#ff566d', '#85afff', '#e5f483', '#ecabff', '#f7dbbc']);

export const ARENA_WEAPONS = Object.freeze({
  blaster: { name: 'Blaster', color: '#57e8f5', damage: 25, magazine: 16, interval: 0.22, reload: 1.3, speed: 38, pellets: 1, spread: 0 },
  pulse: { name: 'Pulse rifle', color: '#ffc558', damage: 12, magazine: 32, interval: 0.1, reload: 1.6, speed: 46, pellets: 1, spread: 0 },
  shotgun: { name: 'Plasma shotgun', color: '#ff78ce', damage: 12, magazine: 6, interval: 0.7, reload: 1.7, speed: 34, pellets: 5, spread: 0.32 },
  laser: { name: 'Rail blaster', color: '#bdff54', damage: 55, magazine: 5, interval: 0.8, reload: 1.9, speed: 70, pellets: 1, spread: 0 },
});
export const arenaWeapon = id => Object.hasOwn(ARENA_WEAPONS, id) ? ARENA_WEAPONS[id] : ARENA_WEAPONS.blaster;

const stations = (width, depth) => [
  { id: 'pulse', kind: 'pulse', x: 0, z: -depth * 0.28 },
  { id: 'shotgun', kind: 'shotgun', x: 0, z: depth * 0.28 },
  { id: 'laser', kind: 'laser', x: width * 0.32, z: 0 },
  { id: 'health', kind: 'health', x: -width * 0.32, z: 0 },
  { id: 'armor', kind: 'armor', x: 0, z: 4 },
];
export const ARENA_MAPS = Object.freeze([
  { id: 'exchange', name: 'The Exchange', description: 'Compact cover and fast duels.', width: 26, depth: 32, color: '#57e8f5', cover: ARENA_COVER, spawns: ARENA_SPAWNS, pickups: stations(26, 32) },
  { id: 'foundry', name: 'Orbital Foundry', description: 'Cargo lanes, reactor cover, and flanking routes.', width: 34, depth: 40, color: '#ffc558',
    cover: [
      { x: -7, z: -8, width: 5, depth: 2.5, height: 1.8, asset: 'cargo' },
      { x: 7, z: 8, width: 5, depth: 2.5, height: 1.8, asset: 'cargo' },
      { x: 7, z: -8, width: 2.5, depth: 5, height: 1.8, asset: 'cargo' },
      { x: -7, z: 8, width: 2.5, depth: 5, height: 1.8, asset: 'cargo' },
      { x: 0, z: 0, width: 3, depth: 3, height: 2.6, asset: 'reactor' },
      { x: -12, z: -13, width: 2, depth: 2, height: 1.4, asset: 'barrels' },
      { x: 12, z: 13, width: 2, depth: 2, height: 1.4, asset: 'barrels' },
    ],
    spawns: [
      { x: -13, z: 16 }, { x: 13, z: -16 }, { x: -13, z: -17 }, { x: 13, z: 17 },
      { x: 0, z: -17 }, { x: 0, z: 17 }, { x: -14, z: -5 }, { x: 14, z: 5 },
      { x: -14, z: 5 }, { x: 14, z: -5 }, { x: -6, z: 16 }, { x: 6, z: -16 },
    ], pickups: stations(34, 40),
  },
]);
export const arenaMap = id => ARENA_MAPS.find(map => map.id === id) ?? ARENA_MAPS[0];
