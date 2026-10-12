import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Coins, Gauge, Magnet, Pause, Shield, Trophy, Zap } from 'lucide-react';
import { game } from '../game/engine';
import type { Snapshot } from '../game/engine';
import { format } from './GameOverlay';
import { inCombat } from '../game/combat';

export function Hud({ state }: { state: Snapshot }) {
  const active = state.phase !== 'menu';
  return <>
    <div className="stage-top">
      {active ? <div className="coin-counter"><Coins size={21} /><strong>{format(state.coins)}</strong><span>COINS</span></div> : <div className="circuit-label"><span className="live-dot" /> ACTION RUNNER <span className="label-divider">/</span> VOL. 02</div>}
      {active && <div className="score-counter"><span>SCORE</span><strong>{String(state.score).padStart(6, '0')}</strong></div>}
      <div className="stage-top-right"><div className="best-counter"><Trophy size={16} /><span>PERSONAL BEST</span><strong>{format(state.best)}</strong></div>{(['running', 'countdown', 'transition'].includes(state.phase) || inCombat(state.phase)) && <button className="icon-button pause-button" aria-label="Pause game" title="Pause (Esc)" onClick={game.pause}><Pause size={20} /></button>}</div>
    </div>
    {state.phase === 'running' && <>
      <div className="power-stack" aria-live="polite">
        {([['shield', Shield, 'SHIELD', 10], ['magnet', Magnet, 'MAGNET', 12], ['double', Zap, '2× SCORE', 10]] as const).map(([key, Icon, label, max]) => state[key] > 0 && <div key={key} className={`active-power ${key}`}><Icon size={20} /><div><span>{label}</span><div className="power-bar"><i style={{ width: `${state[key] / max * 100}%` }} /></div></div><b>{Math.ceil(state[key])}s</b></div>)}
      </div>
      {state.notice && <div className="game-notice" role="status"><Zap size={16} />{state.notice}</div>}
      <div className="run-telemetry"><div><Gauge size={16} /><strong>{Math.round(state.speed * 3.6)}</strong><span>KM/H</span></div><span>{format(state.distance)} m</span><span>LEVEL {state.level}</span><div className="level-progress"><i style={{ width: `${state.distance % 250 / 2.5}%` }} /></div></div>
      <div className="touch-controls" aria-label="Touch game controls">{([['left', ArrowLeft, 'Left'], ['right', ArrowRight, 'Right'], ['jump', ArrowUp, 'Jump'], ['slide', ArrowDown, 'Slide']] as const).map(([action, Icon, label]) => <button key={action} aria-label={label} onPointerDown={event => { event.preventDefault(); game.act(action); }}><Icon size={22} /><span>{label}</span></button>)}</div>
    </>}
    {state.phase === 'menu' && <div className="scene-caption"><span className="coordinate">SECTOR 07 / 23:59</span><span className="scene-location">NIGHTFALL<br /><b>CIRCUIT</b></span><span className="scene-line" /><span className="scene-caption-small">THE STREETS ARE CALLING.</span></div>}
    <div className="stage-bottom"><span><i />{state.phase === 'menu' ? 'ALL SYSTEMS GO' : state.phase === 'paused' ? 'RUN ON STANDBY' : state.phase === 'over' ? 'CONNECTION ENDED' : 'RUNNER CONNECTED'}</span><span>NEON CITY <b>35.6895° N 139.6917° E</b></span></div>
  </>;
}
