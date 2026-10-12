import { Crosshair } from 'lucide-react';
import type { CampaignSnapshot } from '../game/engine';
import { getLevel } from '../game/levels';

export function BossHealthBar({ state }: { state: CampaignSnapshot }) {
  if (!state.bossMaxHp) return null;
  const level = getLevel(state.levelId);
  return <div className="boss-health" style={{ '--boss-color': level.color } as React.CSSProperties}>
    <div><Crosshair size={16} /><strong>{level.boss.toUpperCase()}</strong><span>PHASE {state.bossPhase} / 3</span></div>
    <div className="boss-health-track" role="progressbar" aria-label={`${level.boss} health`} aria-valuenow={Math.ceil(state.bossHp)} aria-valuemin={0} aria-valuemax={state.bossMaxHp}><i style={{ width: `${state.bossHp / state.bossMaxHp * 100}%` }} /><b /><b /></div>
    <small>WEAK POINT: GLOWING CORE</small>
  </div>;
}
