import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Box, ChevronRight, CircleHelp, Gamepad2, Magnet, Maximize, Minimize, Settings2, Shield, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { Scene } from './components/Scene';
import { GameOverlay, format } from './components/GameOverlay';
import { Hud } from './components/Hud';
import { Modal } from './components/Modal';
import { game } from './game/engine';
import { audio } from './game/audio';
import { useControls } from './game/useControls';
import { usePlayGestures } from './game/usePlayGestures';
import { readTouchScheme, saveTouchScheme, type TouchScheme } from './game/touchScheme';
import { CombatHud } from './components/CombatHud';
import { CampaignOverlay } from './components/CampaignOverlay';
import { LevelSelect } from './components/LevelSelect';
import { RunnerWorkshop } from './components/RunnerWorkshop';
import { readRunnerStyle, saveRunnerStyle } from './game/runnerStyle';
import './multiplayer/multiplayer.css';

const Multiplayer = lazy(() => import('./multiplayer/Multiplayer'));

function readSetting(key: string, fallback: boolean) {
  try { const value = localStorage.getItem(`neon-rush-${key}`); return value === null ? fallback : value === 'true'; } catch { return fallback; }
}
function saveSetting(key: string, value: boolean) { try { localStorage.setItem(`neon-rush-${key}`, String(value)); } catch { /* Optional preferences. */ } }

export default function App() {
  const [multiplayer, setMultiplayer] = useState(() => new URLSearchParams(location.search).has('room'));
  const state = useSyncExternalStore(game.subscribe, game.getSnapshot);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<'help' | 'settings' | 'missions' | 'workshop' | null>(null);
  const [runnerStyle, setRunnerStyle] = useState(readRunnerStyle);
  const [sound, setSound] = useState(() => readSetting('sound', true));
  const [quality, setQuality] = useState(() => readSetting('quality', true));
  const [reduced, setReduced] = useState(() => readSetting('motion', window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [touchScheme, setTouchScheme] = useState(readTouchScheme);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullscreenNote, setFullscreenNote] = useState('');
  const stage = useRef<HTMLDivElement>(null);
  const touchDevice = navigator.maxTouchPoints > 0 || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useControls(ready && !failed && !multiplayer);
  usePlayGestures(stage, ready && !failed && !multiplayer, touchScheme);
  useEffect(() => { audio.enabled = sound; saveSetting('sound', sound); if (sound) audio.unlock(); }, [sound]);
  useEffect(() => { game.reducedMotion = reduced; saveSetting('motion', reduced); }, [reduced]);
  useEffect(() => { saveSetting('quality', quality); }, [quality]);
  useEffect(() => { saveTouchScheme(touchScheme); }, [touchScheme]);
  useEffect(() => { saveRunnerStyle(runnerStyle); }, [runnerStyle]);
  useEffect(() => {
    const change = () => setFullscreen(Boolean(document.fullscreenElement));
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('fullscreenchange', change);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('fullscreenchange', change); window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    if (!fullscreenNote) return;
    const hide = window.setTimeout(() => setFullscreenNote(''), 3500);
    return () => clearTimeout(hide);
  }, [fullscreenNote]);
  useEffect(() => {
    // Expose only supported, real game actions to compatible agent browsers.
    type Context = { registerTool: (tool: object, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: Context }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      { name: 'read_run_state', description: 'Read the current Neon Rush score, distance, power-ups, and game phase.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => game.getSnapshot() },
      { name: 'pause_run', description: 'Pause a running Neon Rush game. Does not start or restart a run.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute: () => { if (!['running', 'countdown', 'combat', 'boss', 'transition'].includes(game.phase)) throw new Error('There is no active run to pause.'); game.pause(); return game.getSnapshot(); } },
    ];
    for (const tool of tools) { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Unsupported experimental API. */ } }
    return () => lifecycle.abort();
  }, []);
  const onReady = useCallback(() => { setReady(true); setFailed(false); }, []);
  const onError = useCallback(() => { setFailed(true); game.menu(); }, []);
  const openDialog = (value: 'help' | 'settings' | 'missions' | 'workshop') => { game.pause(); game.fire(false); setDialog(value); };
  const toggleFullscreen = async () => {
    if (expanded) { setExpanded(false); setFullscreenNote(''); return; }
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (touchDevice) {
      setExpanded(true);
      setFullscreenNote('Screen-fit mode. Use Exit fullscreen to return.');
      return;
    }
    try {
      if (stage.current?.requestFullscreen) await stage.current.requestFullscreen();
      else { setExpanded(true); setFullscreenNote('Screen-fit mode. Use Exit fullscreen to return.'); }
    } catch { setExpanded(true); setFullscreenNote('Browser fullscreen unavailable. Screen-fit mode enabled.'); }
  };

  if (multiplayer) return <Suspense fallback={<div className="app"><p style={{ padding: 40 }}>Loading multiplayer arena…</p></div>}><Multiplayer style={runnerStyle} sound={sound} onSound={() => setSound(value => !value)} onExit={() => { game.menu(); setMultiplayer(false); }} /></Suspense>;

  return <div className={`app ${reduced ? 'reduced-motion' : ''}`}>
    <header className="site-header">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); if (state.phase === 'menu') return; game.pause(); }} aria-label="Neon Rush home"><span className="brand-mark"><Zap size={23} fill="currentColor" strokeWidth={1.6} /></span><span>NEON<span className="brand-light">RUSH</span><small>COMBAT EVOLUTION</small></span></a>
      <div className="header-center"><span className="header-dash" /><span>RUN. FIGHT. RISE.</span><span className="header-dash" /></div>
      <div className="header-actions"><button className={`sound-button ${sound ? '' : 'muted'}`} onClick={() => setSound(!sound)} aria-label={sound ? 'Mute sound' : 'Enable sound'} title={sound ? 'Mute sound' : 'Enable sound'}>{sound ? <AudioLines size={18} /> : <VolumeX size={18} />}<span>SOUND {sound ? 'ON' : 'OFF'}</span></button><span className="header-separator" /><button className="icon-button" aria-label="How to play" onClick={() => openDialog('help')}><CircleHelp size={19} /></button><button className="icon-button" aria-label="Settings" onClick={() => openDialog('settings')}><Settings2 size={19} /></button></div>
    </header>

    <main>
      <div className="section-topline"><span><span className="live-dot" /> NIGHT CITY / SYSTEM ONLINE</span><span>CAMPAIGN + ENDLESS</span></div>
      <nav className="arena-mode-nav" aria-label="Game mode"><button aria-current="page"><Gamepad2 size={16} />SOLO CAMPAIGN</button><button onClick={() => { game.pause(); setDialog(null); setMultiplayer(true); }}><Zap size={16} />MULTIPLAYER ARENA</button></nav>
      <div ref={stage} className={`game-stage phase-${state.phase} ${state.campaign.active ? 'campaign-mode' : ''} touch-${touchScheme} ${expanded ? 'stage-expanded' : ''}`} aria-label="Neon Rush 3D game">
        <div className="scene"><Scene highQuality={quality} onReady={onReady} onError={onError} levelId={state.campaign.levelId} runnerStyle={runnerStyle} suspended={dialog === 'workshop'} /></div>
        <div className="scene-shade" />
        <Hud state={state} touchScheme={touchScheme} />
        <CombatHud state={state} touchScheme={touchScheme} />
        <GameOverlay state={state} ready={ready} failed={failed} onHelp={() => openDialog('help')} onMissions={() => openDialog('missions')} />
        <CampaignOverlay state={state} onMissions={() => openDialog('missions')} />
        <button className="fullscreen-button icon-button" aria-label={fullscreen || expanded ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}>{fullscreen || expanded ? <Minimize size={17} /> : <Maximize size={17} />}</button>
        {fullscreenNote && <div className="fullscreen-note" role="status">{fullscreenNote}</div>}
      </div>

      <button className="runner-lab-entry" onClick={() => openDialog('workshop')} aria-label="Open 3D Runner Lab"><span className="lab-entry-icon"><Box size={24} /></span><span className="lab-entry-copy"><strong>BUILD YOUR IDENTITY.</strong><small>Explore your runner in 3D. Change your armor. Preview every weapon.</small></span><span className="lab-entry-tag"><span>ENTER RUNNER LAB</span><ChevronRight size={20} /></span></button>
      <div className="guide-grid">
        <button className="guide-card controls-card" onClick={() => openDialog('help')}><div className="guide-icon"><Gamepad2 size={21} /></div><div><h3>MAKE YOUR MOVE</h3><p><kbd>←</kbd><kbd>→</kbd><span>Move</span><kbd>↑</kbd><span>Jump</span><kbd>↓</kbd><span>Slide</span></p></div><ChevronRight size={16} className="card-chevron" /></button>
        <button className="guide-card power-card" onClick={() => openDialog('help')}><div className="guide-icon violet"><Zap size={20} /></div><div><h3>A LITTLE EXTRA EDGE</h3><p><Shield size={14} className="cyan" />Shield<span className="dot-separator">·</span><Magnet size={14} className="violet-text" />Magnet<span className="dot-separator">·</span><span className="lime">2×</span>Score</p></div><ChevronRight size={16} className="card-chevron" /></button>
        <div className="guide-card record-card"><div className="guide-icon gold"><Trophy size={20} /></div><div><h3>YOUR ONLY RIVAL IS YOU</h3><p>Personal best <strong>{format(state.best)}</strong><span className="record-unit">PTS</span></p></div><span className="record-orbit">↗</span></div>
      </div>
    </main>
    <footer><span>ONE CITY. FIVE DISTRICTS. <b>MAKE THEM YOURS.</b></span><span><i /> NO DOWNLOAD. JUST PLAY.<span className="footer-version">V.2.0</span></span></footer>

    {dialog === 'workshop' && <Modal title="Your runner. Your signature." className="workshop-modal" onClose={() => setDialog(null)}><RunnerWorkshop style={runnerStyle} onStyle={setRunnerStyle} reduced={reduced} unlocked={state.campaign.progress.unlocked} /></Modal>}
    {dialog === 'missions' && <Modal title="Choose your next fight." onClose={() => setDialog(null)}><LevelSelect progress={state.campaign.progress} ready={ready && !failed} onStart={() => setDialog(null)} /></Modal>}

    {dialog === 'settings' && <Modal title="Fine-tune your rush" onClose={() => setDialog(null)}>
      <p className="modal-copy">Your circuit. Your settings.</p>
      {[{ title: 'Sound effects', text: 'Hear coins, jumps, and power-ups.', value: sound, set: setSound, Icon: Volume2 }, { title: 'Neon bloom', text: 'Turn off for smoother play on slower devices.', value: quality, set: setQuality, Icon: Zap }, { title: 'Reduced motion', text: 'Quiet the menus and ambient track movement.', value: reduced, set: setReduced, Icon: Settings2 }].map(({ title, text, value, set, Icon }) => <div className="setting-row" key={title}><Icon size={20} /><div><strong>{title}</strong><p>{text}</p></div><button className={`switch ${value ? 'on' : ''}`} role="switch" aria-checked={value} aria-label={title} onClick={() => set(!value)}><span /></button></div>)}
      <div className="setting-row"><Gamepad2 size={20} /><div><strong>Android / touch controls</strong><p>Use on-screen buttons, screen swipes, or both. Swipe to dodge and tap with another finger to fire.</p></div></div>
      <div className="touch-scheme" role="radiogroup" aria-label="Touch control scheme">{([['buttons', 'BUTTONS'], ['both', 'BOTH'], ['swipes', 'SWIPES']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={touchScheme === value} onClick={() => setTouchScheme(value as TouchScheme)}>{label}</button>)}</div>
      <p className="settings-note">Scores and preferences are saved on this browser.</p>
    </Modal>}
    {dialog === 'help' && <Modal title="Own the night." onClose={() => setDialog(null)}>
      <p className="modal-copy">Run the district. Clear the checkpoint. Defeat its boss.</p>
      <div className="help-controls">{[[ArrowLeft, 'Change lanes', '← → or A / D', 'Swipe left or right'], [ArrowUp, 'Jump barriers', '↑, W or Space', 'Swipe up or tap'], [ArrowDown, 'Slide under gates', '↓ or S', 'Swipe down']].map(([Icon, title, keys, touch]) => { const ControlIcon = Icon as typeof ArrowRight; return <div key={String(title)}><ControlIcon size={20} /><strong>{String(title)}</strong><span>{String(keys)}</span><small>{String(touch)}</small></div>; })}</div>
      <div className="hazard-tip"><span className="hazard-swatch" /><p><b>Pink blocks:</b> change lanes. <b>Orange barriers:</b> jump. <b>Raised pink beams:</b> slide. There’s always an open lane.</p></div>
      <h3 className="help-heading">COMBAT FIELD MANUAL</h3>
      <div className="combat-help"><p><b>Mouse:</b> aim. <b>Hold left click / F:</b> fire. <b>R:</b> reload. <b>Q:</b> cycle weapons. <b>Shift:</b> dash to an adjacent lane.</p><p><b>Cover:</b> move behind a barricade and hold S / Down. Release to fire over it. Jump shockwaves; dash out of marked laser lanes.</p><p><b>Critical hits:</b> aim at glowing cores. Shield Bots expose their armor while winding up an attack. Kills chain into a score multiplier.</p><p><b>On Android / touch:</b> swipe left or right to dodge, swipe up to jump, swipe down to slide or take cover. Tap the arena to fire — you can swipe with one finger and tap-fire with another. Choose Buttons, Swipes, or Both in Settings. FIRE, AIM, and DASH stay on screen.</p><p>All weapons have unlimited reserve energy. A charged laser fires after holding for 0.8 seconds. The shotgun unlocks at level 2; the laser at level 3. Green pickups repair health, violet restore armor, cyan refill ammunition.</p><p>Campaign checkpoints are saved at each encounter. Retry restores health and adds 25 damage to the mission rating. Credits bank on mission completion; spend them in Missions & Armory.</p></div>
      <h3 className="help-heading">GRAB AN ADVANTAGE</h3>
      <div className="help-power"><Shield className="cyan" size={23} /><div><strong>Shield</strong><span>Absorbs one collision. Lasts up to 10 seconds.</span></div></div>
      <div className="help-power"><Magnet className="violet-text" size={23} /><div><strong>Coin magnet</strong><span>Pulls in nearby coins from all lanes for 12 seconds.</span></div></div>
      <div className="help-power"><Zap className="lime" size={23} /><div><strong>Double score</strong><span>Earn twice the points for 10 seconds.</span></div></div>
      <p className="help-footnote">Coins earn 25 points. Every meter earns 2. Speed builds as you go. Press <kbd>Esc</kbd> or <kbd>P</kbd> to pause.</p>
      <button className="primary-button" onClick={() => setDialog(null)}>GOT IT. LET’S GO.</button>
    </Modal>}
  </div>;
}
