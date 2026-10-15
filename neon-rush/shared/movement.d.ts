import type { ArenaMapSpec } from './arena.js';
import type { ArenaInput } from './multiplayer';
export const INPUT_DT: number;
export interface MovementState { x: number; z: number; angle: number; dashTime: number; dashCooldown: number; moving: boolean }
export function sanitizeInput(input: unknown): ArenaInput | null;
export function movePlayer(player: MovementState, input: ArenaInput, dt?: number, map?: ArenaMapSpec): void;
export function muzzlePoint(x: number, z: number, angle: number, right?: number, forward?: number): { x: number; z: number };
