import { upgradeCost } from './weapons';
import type { WeaponId } from './weapons';

export interface Checkpoint {
  level: number; stage: 'combat' | 'upgrade' | 'runner2' | 'boss'; score: number; coins: number;
  distance: number; time: number; kills: number; damage: number; shots: number; hits: number;
  damageBoost: number; reloadBoost: number; armorBoost: number;
}
export interface Progress {
  version: 1; unlocked: number; bank: number; stars: Record<string, number>; scores: Record<string, number>;
  upgrades: Record<WeaponId, number>; achievements: string[]; checkpoint: Checkpoint | null;
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
const KEY = 'neon-rush-campaign-v1';
export const freshProgress = (): Progress => ({ version: 1, unlocked: 1, bank: 0, stars: {}, scores: {}, upgrades: { blaster: 0, pulse: 0, shotgun: 0, laser: 0 }, achievements: [], checkpoint: null });
const number = (value: unknown, min = 0, max = 1e8) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
function browserStorage(): StorageLike | undefined { try { return globalThis.localStorage; } catch { return undefined; } }

export function loadProgress(storage = browserStorage()): Progress {
  const progress = freshProgress();
  try {
    const saved = object(JSON.parse(storage?.getItem(KEY) ?? 'null'));
    if (saved.version !== 1) return progress;
    progress.unlocked = Math.floor(number(saved.unlocked, 1, 5));
    progress.bank = Math.floor(number(saved.bank));
    for (let i = 1; i <= 5; i++) { progress.stars[i] = Math.floor(number(object(saved.stars)[i], 0, 3)); progress.scores[i] = Math.floor(number(object(saved.scores)[i])); }
    for (const weapon of ['blaster', 'pulse', 'shotgun', 'laser'] as const) progress.upgrades[weapon] = Math.floor(number(object(saved.upgrades)[weapon], 0, 3));
    progress.achievements = Array.isArray(saved.achievements) ? saved.achievements.filter((v): v is string => typeof v === 'string' && ['first-clear', 'untouched', 'sharpshooter', 'city-liberator', 'speed-runner'].includes(v)) : [];
    const cp = object(saved.checkpoint);
    if (['combat', 'upgrade', 'runner2', 'boss'].includes(String(cp.stage)) && typeof cp.level === 'number' && Number.isInteger(cp.level) && cp.level >= 1 && cp.level <= progress.unlocked) {
      progress.checkpoint = { level: cp.level, stage: cp.stage as Checkpoint['stage'], score: number(cp.score), coins: Math.floor(number(cp.coins)), distance: number(cp.distance), time: number(cp.time), kills: number(cp.kills), damage: number(cp.damage), shots: number(cp.shots), hits: number(cp.hits), damageBoost: number(cp.damageBoost, 0, 2), reloadBoost: number(cp.reloadBoost, 0, 0.6), armorBoost: number(cp.armorBoost, 0, 60) };
    }
  } catch { /* Corrupt or blocked storage never prevents playing. */ }
  return progress;
}
export function saveProgress(progress: Progress, storage = browserStorage()) { try { storage?.setItem(KEY, JSON.stringify(progress)); } catch { /* Keep progression in memory for this session. */ } }
export function purchaseUpgrade(progress: Progress, id: WeaponId) {
  const tier = progress.upgrades[id]; const cost = upgradeCost(tier);
  if (tier >= 3 || progress.bank < cost) return false;
  progress.bank -= cost; progress.upgrades[id]++; saveProgress(progress); return true;
}
export function completeLevel(progress: Progress, level: number, score: number, coins: number, stars: number, achievements: string[]) {
  progress.unlocked = Math.max(progress.unlocked, Math.min(5, level + 1));
  progress.stars[level] = Math.max(progress.stars[level] ?? 0, stars);
  progress.scores[level] = Math.max(progress.scores[level] ?? 0, Math.floor(score));
  progress.bank += Math.max(0, Math.floor(coins)) + 40 + level * 20;
  progress.achievements = [...new Set([...progress.achievements, ...achievements])];
  progress.checkpoint = null; saveProgress(progress);
}
export const ACHIEVEMENTS: Record<string, string> = { 'first-clear': 'First Light', untouched: 'Untouchable', sharpshooter: 'Deadeye', 'city-liberator': 'City Liberator', 'speed-runner': 'Speedrunner' };
