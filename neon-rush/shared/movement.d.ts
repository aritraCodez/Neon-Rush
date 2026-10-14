import type { ArenaInput } from './multiplayer';
export const INPUT_DT: number;
export interface MovementState { x: number; z: number; angle: number; dashTime: number; dashCooldown: number; moving: boolean }
export function sanitizeInput(input: unknown): ArenaInput | null;
export function movePlayer(player: MovementState, input: ArenaInput, dt?: number): void;
