import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Heart, RefreshCw, Shield, Shuffle, Zap } from 'lucide-react';
import { game } from '../game/engine';
import type { Snapshot } from '../game/engine';
import { inCombat } from '../game/combat';
import { getLevel } from '../game/levels';
import { weaponById } from '../game/weapons';
import { BossHealthBar } from './BossHealthBar';

function LiveFeedback({ active }: { active: boolean }) {
  const cursor = useRef<HTMLDivElement>(null);
  const damage = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (cursor.current) {
        cursor.current.style.left = `${(game.combat.aimNdc.x + 1) * 50}%`;
        cursor.current.style.top = `${(1 - game.combat.aimNdc.y) * 50}%`;
        cursor.current.dataset.target = String(game.combat.aimTarget >= 0);
        cursor.current.dataset.hit = String(game.combat.hitMarker > 0);
      }
      if (damage.current) damage.current.style.opacity = String(game.flash * 0.7);
      if (hit.current) { hit.current.style.opacity = game.combat.critical > 0 ? '1' : '0'; }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update); return () => cancelAnimationFrame(frame);
  }, []);
  return <><div ref={damage} className="damage-vignette" />{active && <><div ref={cursor} className="combat-reticle" aria-hidden="true"><i /><i /><i /><i /><span /></div><div ref={hit} className="critical-feedback">CRITICAL HIT</div></>}</>;
}

function MobileCombat() {
  const pad = useRef<HTMLDivElement>(null);
  const updateAim = (x: number, y: number) => {
    const bounds = pad.current?.getBoundingClientRect(); if (!bounds) return;
    game.combat.aimStick = { x: Math.max(-1, Math.min(1, (x - bounds.left - bounds.width / 2) / (bounds.width / 2))), y: Math.max(-1, Math.min(1, (y - bounds.top - bounds.height / 2) / (bounds.height / 2))) };
  };
  return <div className="mobile-combat" aria-label="Mobile combat controls">
    <div className="mobile-move">{([['left', ArrowLeft, 'Move left'], ['right', ArrowRight, 'Move right'], ['jump', ArrowUp, 'Jump'], ['slide', ArrowDown, 'Slide']] as const).map(([action, Icon, label]) => <button key={action} aria-label={label} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); game.act(action); }}><Icon size={20} /></button>)}<button className="cover-control" aria-label="Hold for cover" onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); game.cover(true); }} onPointerUp={() => game.cover(false)} onPointerCancel={() => game.cover(false)}><Shield size={15} />COVER</button></div>
    <div className="mobile-aim-pad" ref={pad} role="slider" aria-label="Aim control" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={0} tabIndex={0}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); updateAim(event.clientX, event.clientY); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.stopPropagation(); updateAim(event.clientX, event.clientY); } }}
      onPointerUp={() => { game.combat.aimStick = { x: 0, y: 0 }; }} onPointerCancel={() => { game.combat.aimStick = { x: 0, y: 0 }; }}
      onKeyDown={event => { const axes: Record<string, [number, number]> = { ArrowLeft: [-0.06, 0], ArrowRight: [0.06, 0], ArrowUp: [0, 0.06], ArrowDown: [0, -0.06] }; if (axes[event.key]) { event.preventDefault(); event.stopPropagation(); const [x, y] = axes[event.key]; game.combat.aimActive = true; game.combat.aimNdc.x = Math.max(-0.95, Math.min(0.95, game.combat.aimNdc.x + x)); game.combat.aimNdc.y = Math.max(-0.8, Math.min(0.85, game.combat.aimNdc.y + y)); } }}><Crosshair size={26} /><span>AIM</span></div>
    <div className="mobile-fire-group"><button className="fire-control" aria-label="Hold to fire" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); game.fire(true); }} onPointerUp={event => { event.stopPropagation(); game.fire(false); }} onPointerCancel={() => game.fire(false)}><Crosshair size={22} />FIRE</button><button aria-label="Dash" onClick={game.dash}><Zap size={19} />DASH</button></div>
  </div>;
}

export function CombatHud({ state }: { state: Snapshot }) {
  const c = state.campaign, active = inCombat(state.phase), level = getLevel(c.levelId), weapon = weaponById(c.weapon);
  if (!c.active || ['menu', 'briefing', 'victory'].includes(state.phase)) return null;
  return <>
    <LiveFeedback active={active} />
    {['running', 'combat', 'boss'].includes(state.phase) && <>
      <div className="mission-tracker"><span>MISSION 0{level.id} / {level.name.toUpperCase()}</span><strong>{state.phase === 'running' ? c.segment === 0 ? 'Reach the patrol checkpoint' : `Find ${level.boss}` : state.phase === 'boss' ? 'Eliminate the district commander' : level.objective}</strong><div className="mission-progress"><i style={{ width: `${state.phase === 'running' ? c.segmentDistance / c.segmentLength * 100 : c.wave / c.waves * 100}%` }} /></div><small>{state.phase === 'running' ? `${Math.floor(c.segmentDistance)} / ${c.segmentLength} m` : state.phase === 'boss' ? 'CHECKPOINT SAVED' : `WAVE ${c.wave || 1} / ${c.waves} · ${c.remaining} HOSTILES`}</small></div>
      {state.phase === 'boss' && <BossHealthBar state={c} />}
      <div className="player-vitals"><div><Heart size={14} /><strong>{Math.ceil(c.health)}</strong><span>HEALTH</span><Shield size={13} /><b>{Math.ceil(c.armor)}</b></div><div className="health-track" role="progressbar" aria-label="Player health" aria-valuenow={Math.ceil(c.health)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${c.health}%` }} /></div><div className="armor-track"><i style={{ width: `${c.armor}%` }} /></div></div>
      {active && <>
        <div className="campaign-power-pills">{state.shield > 0 && <span><Shield size={12} />SHIELD {Math.ceil(state.shield)}s</span>}{state.double > 0 && <span><Zap size={12} />2× SCORE {Math.ceil(state.double)}s</span>}</div>
        <div className="weapon-hud"><div className="weapon-label"><Crosshair size={14} /><span>{weapon.short}</span><span className="weapon-tier-label">T{c.progress.upgrades[c.weapon]}</span></div><div className="ammo-count"><strong>{c.ammo}</strong><span>/ {c.magazine}</span><small>{c.reload > 0 ? 'RELOADING' : c.weapon === 'laser' ? 'HOLD TO CHARGE' : 'UNLIMITED RESERVES'}</small></div><div className="reload-track"><i style={{ width: `${c.reload > 0 ? (1 - c.reload / c.reloadTotal) * 100 : c.charge > 0 ? c.charge / weapon.charge * 100 : 0}%` }} /></div><div className="weapon-actions"><button onClick={game.reload} aria-label="Reload weapon"><RefreshCw size={13} /><kbd>R</kbd>Reload</button><button onClick={game.switchWeapon} aria-label="Switch weapon"><Shuffle size={13} /><kbd>Q</kbd>Switch</button></div></div>
        <div className="dash-meter"><Zap size={16} /><span>{c.dashCooldown > 0 ? `DASH ${c.dashCooldown.toFixed(1)}s` : 'DASH READY'}</span><kbd>SHIFT</kbd></div>
        {c.combo > 1 && <div className="combo-display"><strong>{c.multiplier}×</strong><span>{c.combo} COMBO</span></div>}
        {c.alert && <div className="combat-alert" role="status"><Crosshair size={14} />{c.alert}</div>}
        <div className="combat-key-hints">MOUSE AIM <span>·</span> HOLD CLICK FIRE <span>·</span> HOLD S COVER <span>·</span> SPACE JUMP</div>
        <MobileCombat />
      </>}
    </>}
  </>;
}
