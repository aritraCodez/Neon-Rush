import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Check, Crosshair, Gauge, Play, Shield, Star, Trophy, Zap } from 'lucide-react';
import { game } from '../game/engine';
import type { Snapshot } from '../game/engine';
import { getLevel } from '../game/levels';
import { ACHIEVEMENTS } from '../game/progression';
import { format } from './GameOverlay';

function Panel({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => { root.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }, []);
  return <div className="campaign-backdrop"><section ref={root} className={`mission-panel ${className}`} role="dialog" aria-modal="true" aria-label={label} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>{children}</section></div>;
}

export function CampaignOverlay({ state, onMissions }: { state: Snapshot; onMissions: () => void }) {
  const c = state.campaign; const level = getLevel(c.levelId);
  if (state.phase === 'briefing') return <Panel label="Mission briefing" className="briefing-panel">
    <span className="mission-eyebrow"><span /> MISSION 0{level.id} · {level.district}</span>
    <h2>{level.name.toUpperCase()}</h2><p>{level.description}</p>
    <div className="mission-route"><div><Gauge /><span>01 / INFILTRATE</span><b>Run the district</b></div><div><Crosshair /><span>02 / BREACH</span><b>Clear the checkpoint</b></div><div><Shield /><span>03 / ELIMINATE</span><b>{level.boss}</b></div></div>
    <div className="briefing-tip"><Crosshair size={20} /><p><b>Aim with the mouse. Hold click to fire.</b> R reloads · Q switches weapons · Shift dashes.<br />Move behind a barricade and hold S to take cover.</p></div>
    <div className="briefing-tip mobile-briefing"><p>Use the aim pad and hold FIRE. Move behind a barricade and hold COVER. All controls appear when combat begins.</p></div>
    <button className="primary-button" onClick={game.deploy}><Play size={17} fill="currentColor" /> DEPLOY RUNNER</button>
    <button className="text-button" onClick={game.menu}>Back to the city</button>
  </Panel>;
  if (state.phase === 'transition') return <div className="mission-transition" aria-live="polite"><span>{c.transitionLabel === level.boss ? 'HOSTILE SIGNATURE DETECTED' : 'MISSION LINK / ACTIVE'}</span><h2>{c.transitionLabel.toUpperCase()}</h2><p>{c.transitionLabel === level.boss ? 'Break the armor. Target the glowing core.' : c.arena ? 'Hold your ground. Watch for attack warnings.' : 'Checkpoint secured. Push deeper into the district.'}</p><div className="transition-loader"><i /></div></div>;
  if (state.phase === 'upgrade') return <Panel label="Choose a field upgrade" className="upgrade-panel"><span className="mission-eyebrow"><Check size={16} /> CHECKPOINT SECURED</span><h2>BUILD YOUR EDGE.</h2><p>Choose one field upgrade for the rest of this mission.</p><div className="upgrade-choices">
    <button onClick={() => game.chooseUpgrade('damage')}><Crosshair /><strong>OVERCHARGE</strong><b>+25% weapon damage</b><span>Every weapon. Every shot.</span></button>
    <button onClick={() => game.chooseUpgrade('armor')}><Shield /><strong>REINFORCE</strong><b>+45 armor · +35 health</b><span>Extra armor at checkpoints.</span></button>
    <button onClick={() => game.chooseUpgrade('capacitor')}><Zap /><strong>FAST CAPACITOR</strong><b>25% faster cooldowns</b><span>Reload and dash sooner.</span></button>
  </div><small>Progress saved. Next: the final run, then {level.boss}.</small></Panel>;
  if (state.phase === 'victory') return <Panel label="Mission complete" className="victory-panel"><span className="mission-eyebrow"><Trophy size={16} /> DISTRICT LIBERATED</span><h2>MISSION COMPLETE.</h2><p>{level.name} is yours. {level.boss} is offline.</p><div className="victory-stars">{[1, 2, 3].map(star => <Star size={38} key={star} fill={c.stars >= star ? 'currentColor' : 'none'} className={c.stars >= star ? 'earned' : ''} />)}</div><div className="victory-score"><span>MISSION SCORE</span><strong>{format(state.score)}</strong></div>
    <div className="victory-metrics"><div><strong>{c.kills}</strong><span>eliminations</span></div><div><strong>{Math.round(c.accuracy * 100)}%</strong><span>accuracy</span></div><div><strong>{Math.floor(c.missionTime / 60)}:{String(Math.floor(c.missionTime % 60)).padStart(2, '0')}</strong><span>mission time</span></div><div><strong>+{state.coins + 40 + level.id * 20}</strong><span>banked credits</span></div></div>
    <div className="star-criteria"><span className="earned"><Check size={12} />Mission cleared</span><span className={c.damageTaken <= 60 ? 'earned' : ''}>≤60 damage taken</span><span className={c.missionTime <= level.parTime && c.accuracy >= 0.25 ? 'earned' : ''}>≤{level.parTime}s + 25% accuracy</span></div>
    {c.achievements.length > 0 && <div className="new-achievements">{c.achievements.map(id => <span key={id}><Trophy size={13} />{ACHIEVEMENTS[id]}</span>)}</div>}
    {level.id < 5 ? <button className="primary-button" onClick={() => game.startLevel(level.id + 1)}><Play size={16} fill="currentColor" />NEXT MISSION UNLOCKED</button> : <button className="primary-button" onClick={() => { game.menu(); onMissions(); }}><Trophy size={16} />EXPLORE YOUR RECORDS</button>}
    <button className="text-button" onClick={game.menu}>Return to the city</button>
  </Panel>;
  return null;
}
