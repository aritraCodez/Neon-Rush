import { useEffect, useRef } from 'react';
import type { ArenaClient } from './client';
import type { ArenaInput } from '../../shared/multiplayer';

export interface ArenaControls {
  move: { x: number; z: number }; aim: { x: number; z: number }; firing: boolean;
  dash: boolean; reload: boolean; touchAim: boolean; held: Set<string>;
  aimDirection: { x: number; z: number };
}
export function useArenaControls(client: ArenaClient, active: boolean) {
  const controls = useRef<ArenaControls>({ move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, firing: false, dash: false, reload: false, touchAim: false, held: new Set(), aimDirection: { x: 0, z: -1 } });
  useEffect(() => {
    const input = controls.current;
    const reset = () => { input.move = { x: 0, z: 0 }; input.firing = false; input.dash = false; input.reload = false; input.held.clear(); client.input({ dx: 0, dz: 0, aimX: input.aim.x, aimZ: input.aim.z, fire: false }); };
    reset();
    if (!active) return;
    const keys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'r', 'f']);
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement)?.closest('input, textarea, select, dialog')) return;
      const key = event.key.toLowerCase(); if (!keys.has(key)) return;
      // Preserve normal button activation while keyboard focus is in the HUD.
      if (key === ' ' && (event.target as HTMLElement)?.closest('button')) return;
      event.preventDefault(); input.held.add(key);
      if (!event.repeat && [' ', 'shift'].includes(key)) input.dash = true;
      if (!event.repeat && key === 'r') input.reload = true;
    };
    const up = (event: KeyboardEvent) => { input.held.delete(event.key.toLowerCase()); };
    const hidden = () => { if (document.hidden) reset(); };
    const release = (event: PointerEvent) => { if (event.pointerType === 'mouse') input.firing = false; };
    const tick = setInterval(() => {
      const left = input.held.has('a') || input.held.has('arrowleft'), right = input.held.has('d') || input.held.has('arrowright');
      const forward = input.held.has('w') || input.held.has('arrowup'), back = input.held.has('s') || input.held.has('arrowdown');
      const own = client.getSnapshot().room?.players.find(player => player.id === client.getSnapshot().playerId);
      if (input.touchAim && own) input.aim = { x: own.x + input.aimDirection.x * 30, z: own.z + input.aimDirection.z * 30 };
      const value: ArenaInput = { dx: input.move.x + Number(right) - Number(left), dz: input.move.z + Number(back) - Number(forward), aimX: input.aim.x, aimZ: input.aim.z, fire: input.firing || input.held.has('f'), dash: input.dash, reload: input.reload };
      client.input(value); input.dash = false; input.reload = false;
    }, 50);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
    return () => { clearInterval(tick); reset(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); };
  }, [client, active]);
  return controls;
}
