import type { EnemyKind } from './enemies';

export type BossPattern = 'volley' | 'sweep' | 'shockwave' | 'laser';
export interface LevelConfig {
  id: number; name: string; district: string; description: string; objective: string;
  enemies: EnemyKind[]; boss: string; bossHp: number; patterns: BossPattern[];
  runLength: number; waves: number; waveSize: number; speed: number; aggression: number;
  color: string; accent: string; sky: string; parTime: number;
}

export const LEVELS: LevelConfig[] = [
  { id: 1, name: 'Neon Streets', district: 'KABUKI / LOWER CITY', description: 'The district has gone dark. Break the patrol line and take down the Sentinel.', objective: 'Clear the patrol checkpoint', enemies: ['patrol', 'ground'], boss: 'Cyber Sentinel', bossHp: 420, patterns: ['volley', 'sweep', 'shockwave'], runLength: 160, waves: 2, waveSize: 3, speed: 17, aggression: 1, color: '#ff3a9e', accent: '#ffe080', sky: '#23162d', parTime: 210 },
  { id: 2, name: 'Laser Highway', district: 'EXPRESSWAY / SECTOR 12', description: 'Cut through the laser grid. Titan Mech is holding the elevated expressway.', objective: 'Silence the highway defenses', enemies: ['turret', 'chaser'], boss: 'Titan Mech', bossHp: 590, patterns: ['laser', 'volley', 'shockwave'], runLength: 190, waves: 2, waveSize: 4, speed: 19, aggression: 1.12, color: '#39e8ff', accent: '#ff9f5a', sky: '#122536', parTime: 235 },
  { id: 3, name: 'Dark Factory', district: 'FOUNDRY / RESTRICTED', description: 'The factory is building an army. Strike between shields and shut down its core.', objective: 'Disable the assembly guard', enemies: ['shield', 'sniper'], boss: 'Core Guardian', bossHp: 760, patterns: ['shockwave', 'laser', 'sweep'], runLength: 210, waves: 3, waveSize: 3, speed: 20.5, aggression: 1.18, color: '#bb7bff', accent: '#baff59', sky: '#1a1928', parTime: 270 },
  { id: 4, name: 'Skyline Assault', district: 'SKY DECK / 480 METERS', description: 'Take the fight above the city. Stay mobile beneath the Destroyer’s cannons.', objective: 'Secure the airborne relay', enemies: ['flying', 'heavy'], boss: 'Sky Destroyer', bossHp: 930, patterns: ['sweep', 'volley', 'laser'], runLength: 230, waves: 3, waveSize: 4, speed: 22, aggression: 1.25, color: '#4ecbff', accent: '#ff78b9', sky: '#222945', parTime: 300 },
  { id: 5, name: 'Neon Overlord', district: 'THE SPIRE / ZERO ACCESS', description: 'Every signal leads here. Break the elite guard and end the Overlord’s reign.', objective: 'Breach the final defense', enemies: ['patrol', 'ground', 'turret', 'chaser', 'shield', 'sniper', 'flying', 'heavy', 'elite'], boss: 'Neon Overlord', bossHp: 1200, patterns: ['laser', 'shockwave', 'sweep', 'volley'], runLength: 250, waves: 3, waveSize: 5, speed: 23.5, aggression: 1.32, color: '#ff406a', accent: '#ffe785', sky: '#2b142c', parTime: 330 },
];

export function getLevel(id: number) { return LEVELS.find(level => level.id === id) ?? LEVELS[0]; }
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
