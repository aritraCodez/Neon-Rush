export type WeaponId = 'blaster' | 'pulse' | 'shotgun' | 'laser';
export interface WeaponSpec {
  id: WeaponId; name: string; short: string; damage: number; magazine: number; interval: number;
  reload: number; speed: number; pellets: number; spread: number; color: string; unlock: number;
  description: string; charge: number;
}
export const WEAPONS: WeaponSpec[] = [
  { id: 'blaster', name: 'Starter Blaster', short: 'BLASTER', damage: 24, magazine: 14, interval: 0.28, reload: 1.15, speed: 65, pellets: 1, spread: 0, color: '#64f5ff', unlock: 1, description: 'Reliable, precise energy sidearm.', charge: 0 },
  { id: 'pulse', name: 'Rapid Pulse Rifle', short: 'PULSE RIFLE', damage: 12, magazine: 32, interval: 0.105, reload: 1.6, speed: 80, pellets: 1, spread: 0.006, color: '#ffc558', unlock: 1, description: 'Rapid fire. Ideal for moving drones.', charge: 0 },
  { id: 'shotgun', name: 'Plasma Shotgun', short: 'PLASMA', damage: 17, magazine: 6, interval: 0.72, reload: 1.8, speed: 60, pellets: 6, spread: 0.025, color: '#ff78ce', unlock: 2, description: 'Six plasma bolts with a wide spread.', charge: 0 },
  { id: 'laser', name: 'Charged Laser', short: 'CHARGE LASER', damage: 105, magazine: 5, interval: 0.3, reload: 2, speed: 160, pellets: 1, spread: 0, color: '#bcff58', unlock: 3, description: 'Hold fire for a high-damage energy shot.', charge: 0.8 },
];
export const weaponById = (id: WeaponId) => WEAPONS.find(weapon => weapon.id === id)!;
export const upgradeCost = (tier: number) => 60 + tier * 50;
