import { useEffect } from 'react';
import type { RefObject } from 'react';
import { game } from './engine';
import type { Action } from './engine';
import { inCombat } from './combat';
import type { TouchScheme } from './touchScheme';

type Trace = { x: number; y: number; mode: 'pending' | 'swipe' | 'fire'; hold: number };
const actionFrom = (dx: number, dy: number): Action => Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy < 0 ? 'jump' : 'slide';
const playing = () => ['running', 'countdown', 'combat', 'boss'].includes(game.phase);
const hud = (event: Event) => (event.target as HTMLElement | null)?.closest('button, a, [role="slider"], input, textarea, select, dialog');

export function usePlayGestures(stage: RefObject<HTMLElement | null>, enabled: boolean, scheme: TouchScheme) {
  useEffect(() => {
    const node = stage.current; if (!node || !enabled) return;
    const pointers = new Map<number, Trace>();
    const firing = new Set<number>();
    const gestures = scheme !== 'buttons';
    const syncFire = () => game.fire(firing.size > 0);
    const clearHold = (trace: Trace) => { clearTimeout(trace.hold); trace.hold = 0; };
    const aim = (event: PointerEvent) => {
      if (!inCombat(game.phase) || hud(event)) return;
      const rect = node.getBoundingClientRect();
      game.combat.aimActive = true;
      game.combat.aimNdc = { x: (event.clientX - rect.left) / rect.width * 2 - 1, y: 1 - (event.clientY - rect.top) / rect.height * 2 };
    };
    const down = (event: PointerEvent) => {
      if (hud(event) || !playing()) return;
      if (event.pointerType === 'mouse') {
        aim(event);
        if (inCombat(game.phase) && event.button === 0) { node.setPointerCapture(event.pointerId); firing.add(event.pointerId); syncFire(); }
        return;
      }
      if (!gestures) return;
      event.preventDefault();
      node.setPointerCapture(event.pointerId);
      const hold = window.setTimeout(() => {
        const trace = pointers.get(event.pointerId); if (!trace || trace.mode !== 'pending' || !inCombat(game.phase)) return;
        trace.mode = 'fire'; firing.add(event.pointerId); syncFire();
      }, 140);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, mode: 'pending', hold });
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') { aim(event); return; }
      const trace = pointers.get(event.pointerId); if (!trace) return;
      const dx = event.clientX - trace.x, dy = event.clientY - trace.y, distance = Math.hypot(dx, dy);
      const threshold = trace.mode === 'swipe' ? 46 : 32;
      if (distance < threshold) return;
      clearHold(trace);
      if (trace.mode === 'fire') { firing.delete(event.pointerId); syncFire(); }
      const action = actionFrom(dx, dy);
      trace.mode = 'swipe'; trace.x = event.clientX; trace.y = event.clientY;
      game.act(action);
      if (inCombat(game.phase)) game.cover(action === 'slide');
    };
    const up = (event: PointerEvent) => {
      const trace = pointers.get(event.pointerId);
      pointers.delete(event.pointerId);
      firing.delete(event.pointerId); syncFire();
      if (event.pointerType === 'mouse' || !trace) return;
      clearHold(trace);
      if (trace.mode === 'swipe') { game.cover(false); return; }
      if (trace.mode === 'fire') return;
      if (inCombat(game.phase)) {
        firing.add(event.pointerId); syncFire();
        window.setTimeout(() => { firing.delete(event.pointerId); syncFire(); }, 90);
      } else if (game.phase === 'running') game.act('jump');
    };
    node.addEventListener('pointerdown', down, { passive: false });
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      for (const trace of pointers.values()) clearHold(trace);
      pointers.clear(); firing.clear(); game.fire(false); game.cover(false);
    };
  }, [enabled, scheme, stage]);
}
