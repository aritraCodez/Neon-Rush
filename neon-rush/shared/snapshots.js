// Deltas are based on a specific snapshot, never on arrival order. The transport
// sends a full snapshot after congestion/reconnect or a topology/phase change.
export function snapshotDelta(previous, next) {
  const changes = {};
  for (const key of Object.keys(next)) {
    if (key === 'players') continue;
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) changes[key] = next[key];
  }
  changes.players = next.players.map(player => {
    const before = previous.players.find(p => p.id === player.id);
    const patch = { id: player.id };
    for (const key of Object.keys(player)) if (player[key] !== before?.[key]) patch[key] = player[key];
    return patch;
  }).filter(p => Object.keys(p).length > 1);
  return { type: 'delta', base: previous.snapshotId, changes };
}
export function applySnapshotDelta(previous, message) {
  if (!previous || previous.snapshotId !== message.base) return null;
  const patches = new Map(message.changes.players.map(player => [player.id, player]));
  return { ...previous, ...message.changes, players: previous.players.map(player => ({ ...player, ...patches.get(player.id) })) };
}
