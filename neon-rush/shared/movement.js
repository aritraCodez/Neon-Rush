import { ARENA, arenaMap } from './arena.js';

// One command always represents this much simulation time. Client timestamps and
// elapsed time never grant movement budget on the server.
export const INPUT_DT = 1 / 60;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function sanitizeInput(input) {
  if (!input || !['dx', 'dz', 'aimX', 'aimZ'].every(key => Number.isFinite(input[key]))) return null;
  const direction = Number.isFinite(input.aimDX) && Number.isFinite(input.aimDZ)
    ? { aimDX: clamp(input.aimDX, -1, 1), aimDZ: clamp(input.aimDZ, -1, 1) } : {};
  return { ...direction, dx: clamp(input.dx, -1, 1), dz: clamp(input.dz, -1, 1),
    aimX: clamp(input.aimX, -40, 40), aimZ: clamp(input.aimZ, -40, 40),
    fire: input.fire === true, dash: input.dash === true, reload: input.reload === true };
}
const blocked = (x, z, map) => map.cover.some(box =>
  Math.abs(x - box.x) < box.width / 2 + ARENA.playerRadius &&
  Math.abs(z - box.z) < box.depth / 2 + ARENA.playerRadius);

// Shared movement/collision rules; combat and all score changes stay on server.
export function movePlayer(player, input, dt = INPUT_DT, map = arenaMap()) {
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.dashTime = Math.max(0, player.dashTime - dt);
  const length = Math.hypot(input.dx, input.dz);
  if (input.dash && player.dashCooldown <= 0 && length > 0.1) {
    player.dashTime = ARENA.dashTime; player.dashCooldown = ARENA.dashCooldown;
  }
  const scale = ARENA.speed * (player.dashTime > 0 ? 2.8 : 1) * dt / Math.max(1, length);
  const nx = clamp(player.x + input.dx * scale, -map.width / 2 + ARENA.playerRadius, map.width / 2 - ARENA.playerRadius);
  const nz = clamp(player.z + input.dz * scale, -map.depth / 2 + ARENA.playerRadius, map.depth / 2 - ARENA.playerRadius);
  const previousX = player.x, previousZ = player.z;
  if (!blocked(nx, player.z, map)) player.x = nx;
  if (!blocked(player.x, nz, map)) player.z = nz;
  const ax = input.aimDX ?? (input.aimX - player.x), az = input.aimDZ ?? (input.aimZ - player.z);
  if (Math.hypot(ax, az) > 0.01) player.angle = Math.atan2(-ax, -az);
  player.moving = Math.hypot(player.x - previousX, player.z - previousZ) > 0.001;
}
