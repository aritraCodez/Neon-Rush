import { Coins, Crosshair, LockKeyhole, Shield, Star, Trophy, Zap } from 'lucide-react';
import { LEVELS } from '../game/levels';
import { game } from '../game/engine';
import type { Progress } from '../game/progression';
import { ACHIEVEMENTS } from '../game/progression';
import { WEAPONS, upgradeCost } from '../game/weapons';

export function LevelSelect({ progress, ready, onStart }: { progress: Progress; ready: boolean; onStart: () => void }) {
  return <div className="level-select">
    <div className="mission-select-intro"><p>Five districts. One city to take back.</p><span><Coins size={16} />{progress.bank} CREDITS</span></div>
    {progress.checkpoint && <button className="checkpoint-button" disabled={!ready} onClick={() => { game.continueCheckpoint(); onStart(); }}><Shield size={18} /><span>Continue checkpoint<strong>{LEVELS[progress.checkpoint.level - 1].name} / {progress.checkpoint.stage === 'runner2' ? 'Second run' : progress.checkpoint.stage === 'boss' ? 'Boss encounter' : progress.checkpoint.stage === 'upgrade' ? 'Field upgrade' : 'Combat arena'}</strong></span></button>}
    <div className="level-list">{LEVELS.map(level => {
      const locked = level.id > progress.unlocked;
      return <button className={`level-card ${locked ? 'locked' : ''}`} key={level.id} style={{ '--level-color': level.color } as React.CSSProperties} disabled={locked || !ready} onClick={() => { game.startLevel(level.id); onStart(); }} aria-label={`${level.name}${locked ? ', locked' : ', start mission'}`}>
        <span className="level-number">0{level.id}</span><div><small>{level.district}</small><h3>{level.name}</h3><p>{locked ? `Complete ${LEVELS[level.id - 2].name} to unlock` : `Target: ${level.boss}`}</p></div><span className="level-stars">{locked ? <LockKeyhole size={18} /> : [1, 2, 3].map(star => <Star key={star} size={13} fill={(progress.stars[level.id] ?? 0) >= star ? 'currentColor' : 'none'} />)}</span>
      </button>;
    })}</div>
    <div className="armory-heading"><Crosshair size={18} /><h3>WEAPON LAB</h3><span>Permanent damage upgrades · +15% per tier</span></div>
    <div className="armory-grid">{WEAPONS.map(weapon => {
      const tier = progress.upgrades[weapon.id], locked = weapon.unlock > progress.unlocked;
      return <div className="weapon-card" key={weapon.id}><div className="weapon-card-title"><Zap size={17} style={{ color: weapon.color }} /><strong>{weapon.name}</strong></div><p>{weapon.description}</p><div className="weapon-tier">{[1, 2, 3].map(n => <i key={n} className={tier >= n ? 'filled' : ''} />)}<span>{locked ? `Unlock in level ${weapon.unlock}` : `TIER ${tier} / 3`}</span></div><button disabled={locked || tier === 3 || progress.bank < upgradeCost(tier)} onClick={() => game.buyWeaponUpgrade(weapon.id)}>{locked ? 'LOCKED' : tier === 3 ? 'MAXED OUT' : `UPGRADE · ${upgradeCost(tier)} CREDITS`}</button></div>;
    })}</div>
    <div className="achievement-list"><h3><Trophy size={16} /> ACHIEVEMENTS</h3>{Object.entries(ACHIEVEMENTS).map(([id, title]) => <span key={id} className={progress.achievements.includes(id) ? 'earned' : ''}><Star size={12} />{title}</span>)}</div>
  </div>;
}
