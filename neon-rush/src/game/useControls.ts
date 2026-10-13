import { useEffect } from 'react';
import { game } from './engine';
import type { Action } from './engine';
import { inCombat } from './combat';

export function useControls(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const keys: Record<string, Action> = {
      ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', ArrowDown: 'slide', s: 'slide', S: 'slide',
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      if ((event.target as HTMLElement)?.closest('dialog, input, select, textarea, [role="slider"]')) return;
      const action = keys[event.key];
      const buttonFocused = (event.target as HTMLElement)?.closest('button');
      if (buttonFocused && (event.key === ' ' || event.key === 'Enter') && game.phase !== 'running' && !inCombat(game.phase)) return;
      if (action) {
        if (game.phase === 'running' || game.phase === 'countdown' || inCombat(game.phase)) event.preventDefault();
        if (!event.repeat) game.act(action);
        if (action === 'slide' && inCombat(game.phase)) game.cover(true);
      }
      if (inCombat(game.phase)) {
        if (event.key.toLowerCase() === 'f') { event.preventDefault(); game.fire(true); }
        if (!event.repeat && event.key.toLowerCase() === 'r') { event.preventDefault(); game.reload(); }
        if (!event.repeat && event.key.toLowerCase() === 'q') { event.preventDefault(); game.switchWeapon(); }
        if (!event.repeat && event.key === 'Shift') { event.preventDefault(); game.dash(); }
      }
      if (!event.repeat && ['Escape', 'p', 'P'].includes(event.key)) { event.preventDefault(); game.togglePause(); }
      if (ready && !event.repeat && event.key === 'Enter') {
        if (game.phase === 'menu') { if (game.progress.checkpoint) game.continueCheckpoint(); else game.startLevel(game.progress.unlocked); }
        else if (game.phase === 'over') game.restart();
        else if (game.phase === 'briefing') game.deploy();
      }
    };
    const keyup = (event: KeyboardEvent) => { if (['s', 'S', 'ArrowDown'].includes(event.key)) game.cover(false); if (event.key.toLowerCase() === 'f') game.fire(false); };
    const hidden = () => { if (document.hidden) game.pause(); };
    const blur = () => game.pause();
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [ready]);
}
