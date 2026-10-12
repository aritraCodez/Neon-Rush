import { useEffect, useRef } from 'react';
import { Coins, Play, RotateCcw, Trophy, Route, Zap } from 'lucide-react';
import { game } from '../game/engine';
import type { Snapshot } from '../game/engine';

export const format = (n: number) => Math.floor(n).toLocaleString('en-US');

export function GameOverlay({ state, ready, failed, onHelp, onMissions }: { state: Snapshot; ready: boolean; failed: boolean; onHelp: () => void; onMissions: () => void }) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (state.phase === 'paused' || state.phase === 'over') primary.current?.focus({ preventScroll: true }); }, [state.phase]);
  if (state.phase === 'menu') return <div className="intro">
    <div className="eyebrow"><span className="tiny-line" /> COMBAT EVOLUTION</div>
    <h1>NEON<br /><span>RUSH</span><i>™</i></h1>
    <p className="intro-tagline">Run the streets. Take back the city.</p>
    <p className="intro-description">Five districts. Four weapons. One last stand.<br />Your next evolution starts here.</p>
    <button className="primary-button start-button" onClick={() => state.campaign.progress.checkpoint ? game.continueCheckpoint() : game.startLevel(state.campaign.progress.unlocked)} disabled={!ready || failed}><Play size={19} fill="currentColor" />{failed ? 'GRAPHICS UNAVAILABLE' : ready ? state.campaign.progress.checkpoint ? 'CONTINUE MISSION' : 'START CAMPAIGN' : 'LOADING CIRCUIT…'}<kbd>↵</kbd></button>
    {failed ? <p className="graphics-message">Enable hardware acceleration and WebGL, then reload to play.</p> : <div className="intro-secondary"><button onClick={onMissions}>MISSIONS & ARMORY</button><button onClick={game.start} disabled={!ready}>START RUN · ENDLESS</button></div>}
    <button className="text-button how-button" onClick={onHelp}>First time? <span>Field manual</span></button>
  </div>;
  if (state.phase === 'countdown') return <div className="countdown" aria-live="assertive"><span>GET READY</span><strong key={state.countdown}>{Math.max(1, state.countdown)}</strong><p>Chase your next best.</p></div>;
  if (state.phase !== 'over' && state.phase !== 'paused') return null;
  const over = state.phase === 'over';
  return <div className="overlay-backdrop">
    <section className="run-panel" role="dialog" aria-modal="true" aria-label={over ? 'Run complete' : 'Game paused'} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <div className="panel-emblem">{over ? <Zap size={26} /> : <span className="pause-glyph">Ⅱ</span>}</div>
      <div className="eyebrow">{over ? 'UNTIL THE NEXT RUSH' : 'TAKE A BREATHER'}</div>
      <h2>{over ? state.campaign.active ? 'MISSION FAILED' : 'RUN COMPLETE' : 'ON PAUSE.'}</h2>
      <p>{over ? 'The city is ready when you are.' : 'Your next move can wait.'}</p>
      <div className="result-score"><span>{over ? 'FINAL SCORE' : 'CURRENT SCORE'}</span><strong>{format(state.score)}</strong></div>
      {over && state.newBest && <div className="new-best"><Trophy size={14} /> NEW PERSONAL BEST</div>}
      <div className="result-stats"><div><Coins size={17} /><strong>{state.coins}</strong><span>coins</span></div><div><Route size={17} /><strong>{format(state.distance)}</strong><span>meters</span></div><div><Trophy size={17} /><strong>{format(state.best)}</strong><span>best score</span></div></div>
      <button ref={primary} className="primary-button" onClick={over ? state.campaign.active && state.campaign.progress.checkpoint ? game.continueCheckpoint : game.restart : game.resume}>{over ? <RotateCcw size={18} /> : <Play size={18} fill="currentColor" />}{over ? state.campaign.active && state.campaign.progress.checkpoint ? 'RETRY CHECKPOINT' : 'RUN IT BACK' : 'RESUME RUN'}</button>
      {!over && <button className="secondary-button" onClick={game.restart}><RotateCcw size={16} />Restart run</button>}
      <button className="text-button" onClick={game.menu}>Back to the city</button>
    </section>
  </div>;
}
