import type { ArenaSnapshot, ArenaPlayer } from './multiplayer';
export interface SnapshotDelta { type: 'delta'; base: number; changes: Partial<Omit<ArenaSnapshot, 'players'>> & { players: (Partial<ArenaPlayer> & { id: string })[] } }
export function snapshotDelta(previous: ArenaSnapshot, next: ArenaSnapshot): SnapshotDelta;
export function applySnapshotDelta(previous: ArenaSnapshot | null, message: SnapshotDelta): ArenaSnapshot | null;
