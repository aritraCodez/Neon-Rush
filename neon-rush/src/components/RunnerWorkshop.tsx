import { Component, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Download, Grid3X3, Move, Pause, Play, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RunnerModel } from './RunnerModel';
import { RUNNER_STYLES } from '../game/runnerStyle';
import type { RunnerStyle } from '../game/runnerStyle';
import { createRigClips, getRigJoints, poseRig } from '../game/rigAnimation';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { RigMotion } from '../game/rigAnimation';
import { WEAPONS, weaponById } from '../game/weapons';
import type { WeaponId } from '../game/weapons';

type ViewAction = 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'reset';
type ViewControl = { current: ((action: ViewAction) => void) | null };
function CameraControls({ rotating, actions }: { rotating: boolean; actions: ViewControl }) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.target.set(0, 1.05, 0); orbit.enablePan = false;
    orbit.minDistance = 3; orbit.maxDistance = 16;
    orbit.minPolarAngle = 0.3; orbit.maxPolarAngle = Math.PI / 2 + 0.12;
    orbit.autoRotateSpeed = 1.4;
    orbit.update(); orbit.saveState(); controls.current = orbit;
    const offset = new THREE.Vector3();
    const spherical = new THREE.Spherical();
    actions.current = action => {
      if (action === 'reset') { orbit.reset(); return; }
      offset.copy(camera.position).sub(orbit.target); spherical.setFromVector3(offset);
      if (action === 'left' || action === 'right') spherical.theta += action === 'left' ? -0.25 : 0.25;
      if (action === 'up' || action === 'down') spherical.phi += action === 'up' ? -0.15 : 0.15;
      if (action === 'in' || action === 'out') spherical.radius *= action === 'in' ? 0.86 : 1.16;
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, orbit.minDistance, orbit.maxDistance);
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, orbit.minPolarAngle, orbit.maxPolarAngle);
      camera.position.copy(orbit.target).add(offset.setFromSpherical(spherical)); orbit.update();
    };
    return () => { orbit.dispose(); controls.current = null; actions.current = null; };
  }, [camera, gl, actions]);
  useFrame((_, dt) => { if (controls.current) { controls.current.autoRotate = rotating; controls.current.update(dt); } });
  return null;
}

function Showroom({ style, weapon, wireframe, motion, playing, modelRef, actions, rotating }: {
  style: RunnerStyle; weapon: WeaponId; wireframe: boolean; motion: RigMotion; playing: boolean;
  modelRef: { current: THREE.Group | null }; actions: ViewControl; rotating: boolean;
}) {
  const time = useRef(0);
  useEffect(() => { time.current = 0; }, [motion]);
  useFrame((_, dt) => { if (playing) time.current += Math.min(dt, 0.05); }, -1);
  return <>
    <color attach="background" args={['#0b1420']} />
    <fog attach="fog" args={['#0b1420', 7, 17]} />
    <hemisphereLight intensity={0.7} color="#d7e8ff" groundColor="#1a2430" />
    <ambientLight intensity={0.55} color="#bacde3" />
    <directionalLight position={[-3, 5, -4]} intensity={3.2} color="#e2eeff" />
    <directionalLight position={[4, 2, 2]} intensity={3.4} color={style.color} />
    <directionalLight position={[0, 3, 5]} intensity={1.6} color="#ffffff" />
    <pointLight position={[-3, 1, 2]} intensity={10} color="#b697ff" />
    <RunnerModel style={style} weapon={weapon} wireframe={wireframe} modelRef={modelRef} pose={() => ({ motion, time: time.current })} />
    <mesh position={[0, -0.095, 0]}><cylinderGeometry args={[1.25, 1.35, 0.15, 64]} /><meshStandardMaterial color="#1d2d3a" roughness={0.4} metalness={0.7} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]}><ringGeometry args={[1.19, 1.22, 64]} /><meshBasicMaterial color={style.color} toneMapped={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}><planeGeometry args={[50, 50]} /><meshStandardMaterial color="#101b29" roughness={0.8} /></mesh>
    <gridHelper args={[30, 30, '#294452', '#1b2e3d']} position={[0, -0.17, 0]} />
    <CameraControls rotating={rotating} actions={actions} />
  </>;
}

class PreviewBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function RunnerWorkshop({ style, onStyle, reduced, unlocked }: { style: RunnerStyle; onStyle: (style: RunnerStyle) => void; reduced: boolean; unlocked: number }) {
  const [weapon, setWeapon] = useState<WeaponId>('blaster');
  const [motion, setMotion] = useState<RigMotion>('idle');
  const [playing, setPlaying] = useState(!reduced);
  const [rotating, setRotating] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const modelRef = useRef<THREE.Group | null>(null);
  const actions = useRef<((action: ViewAction) => void) | null>(null);
  const spec = weaponById(weapon);

  async function exportModel() {
    if (!modelRef.current || exporting) return;
    setExporting(true); setStatus('Preparing your model…');
    try {
      // Work on a clone so sampling export clips never changes the visible pose.
      const clips = modelRef.current.userData.clips as THREE.AnimationClip[] | undefined;
      const model = clips?.length ? cloneSkinned(modelRef.current) as THREE.Group : modelRef.current.clone(true);
      const animations = clips?.length ? clips : createRigClips(model);
      if (!clips?.length) poseRig(getRigJoints(model), 'idle', 0);
      model.updateMatrixWorld(true);
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const result = await new GLTFExporter().parseAsync(model, { binary: true, animations, onlyVisible: true });
      if (!(result instanceof ArrayBuffer)) throw new Error('Unexpected model format');
      const url = URL.createObjectURL(new Blob([result], { type: 'model/gltf-binary' }));
      const link = document.createElement('a'); link.href = url; link.download = `neon-runner-${style.id}-${weapon}.glb`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus('Model exported with Idle, Run, Jump, and Aim animations.');
    } catch { setStatus('The model could not be exported. Please try again.'); }
    finally { setExporting(false); }
  }

  return <div className="workshop" style={{ '--runner-accent': style.color } as CSSProperties}>
    <div className="workshop-heading"><span><i /> RUNNER LAB / MK. III</span><span>REAL-TIME 3D</span></div>
    <div className="workshop-layout">
      <div className="workshop-view" role="group" aria-label="Interactive runner model. Drag to orbit, scroll or pinch to zoom. Arrow keys rotate, plus and minus zoom, Home resets." tabIndex={0} onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const keys: Record<string, ViewAction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out', Home: 'reset' };
        const action = keys[event.key]; if (action) { event.preventDefault(); actions.current?.(action); }
      }}>
        {failed ? <div className="workshop-unavailable"><strong>3D preview unavailable</strong><p>Enable WebGL and hardware acceleration, then reload. You can still choose an armor finish.</p></div> : <PreviewBoundary onError={() => setFailed(true)}>
          <Canvas camera={{ position: [5.4, 2.6, -7.4], fov: 32, near: 0.1, far: 50 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => {
            setReady(true);
            gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); setFailed(true); }, { once: true });
          }}>
            <Showroom style={style} weapon={weapon} wireframe={wireframe} motion={motion} playing={playing} modelRef={modelRef} actions={actions} rotating={rotating} />
          </Canvas>
        </PreviewBoundary>}
        {!ready && !failed && <div className="workshop-loading">ASSEMBLING RUNNER…</div>}
        <div className="model-label"><span>NR—07</span><strong>{style.name.toUpperCase()} SERIES</strong><small>ARTICULATED COMBAT FRAME</small></div>
        <div className="view-tools">
          <button aria-label="Auto rotate model" aria-pressed={rotating} disabled={failed} onClick={() => setRotating(!rotating)}><RotateCw size={17} /></button>
          <button aria-label="Show wireframe" aria-pressed={wireframe} disabled={failed} onClick={() => setWireframe(!wireframe)}><Grid3X3 size={17} /></button>
          <button aria-label="Zoom in" disabled={failed} onClick={() => actions.current?.('in')}><ZoomIn size={17} /></button>
          <button aria-label="Zoom out" disabled={failed} onClick={() => actions.current?.('out')}><ZoomOut size={17} /></button>
          <button aria-label="Reset model view" disabled={failed} onClick={() => { actions.current?.('reset'); setRotating(false); }}><RotateCcw size={17} /></button>
        </div>
        <span className="orbit-hint"><Move size={13} /> DRAG TO ORBIT <b>·</b> SCROLL / PINCH TO ZOOM</span>
      </div>

      <div className="workshop-options">
        <section><div className="lab-section-title"><span>01</span><h3>Armor finish</h3><small>APPLIED LIVE</small></div>
          <div className="finish-options">{RUNNER_STYLES.map(option => <button key={option.id} className={style.id === option.id ? 'selected' : ''} aria-label={`${option.name} armor`} aria-pressed={style.id === option.id} onClick={() => onStyle(option)}><i style={{ background: option.color }} /><span>{option.name}</span></button>)}</div>
          <p className="finish-description">{style.description} Your finish carries into every run.</p>
        </section>
        <section><div className="lab-section-title"><span>02</span><h3>Weapon preview</h3></div>
          <div className="weapon-preview-options">{WEAPONS.map(option => <button key={option.id} aria-pressed={weapon === option.id} onClick={() => setWeapon(option.id)}><i style={{ background: option.color }} />{option.short}</button>)}</div>
          <p className="weapon-preview-copy">{spec.description}</p>
          <div className="weapon-preview-stats"><span><b>{spec.damage * spec.pellets}</b>DMG / SHOT</span><span><b>{spec.magazine}</b>MAGAZINE</span><span><b>{spec.reload}s</b>RELOAD</span></div>
          <small className="preview-note">{spec.unlock > unlocked ? `Preview only · unlocks in mission ${spec.unlock}.` : 'Preview only · equip weapons during combat with Q.'}</small>
        </section>
        <section><div className="lab-section-title"><span>03</span><h3>Motion test</h3><button className="motion-toggle" aria-label={playing ? 'Pause model animation' : 'Play model animation'} disabled={failed} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button></div>
          <div className="motion-options">{(['idle', 'run', 'jump', 'aim'] as RigMotion[]).map(option => <button key={option} aria-pressed={motion === option} disabled={failed} onClick={() => { setMotion(option); setPlaying(true); }}>{option}</button>)}</div>
        </section>
        <div className="model-export"><button className="secondary-button" onClick={() => void exportModel()} disabled={!ready || failed || exporting}><Download size={16} />{exporting ? 'PREPARING MODEL…' : 'EXPORT 3D MODEL'}</button><p>GLB · includes 4 animations · opens in Blender</p><p className="export-status" role="status">{status}</p></div>
      </div>
    </div>
    <div className="workshop-footnote"><span><i /> FINISH SAVED ON THIS BROWSER</span><span>Drag to explore. Make it yours.</span></div>
  </div>;
}
