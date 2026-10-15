import { Component, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { game, LANE_WIDTH } from '../game/engine';
import type { EntityKind } from '../game/engine';
import { CombatScene, District } from './CombatScene';
import { getLevel } from '../game/levels';
import { inCombat } from '../game/combat';
import { weaponById } from '../game/weapons';
import { RunnerModel } from './RunnerModel';
import type { RunnerStyle } from '../game/runnerStyle';
import { GraphicsLifecycle } from './GraphicsLifecycle';

const CYAN = '#46eeff';
const PINK = '#ff2a9b';
const menuPan = { x: 0, y: 0, tx: 0, ty: 0 };

function MenuLook() {
  const { gl } = useThree();
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const canvas = gl.domElement;
    const down = (event: PointerEvent) => {
      if (game.phase !== 'menu' || event.button > 0) return;
      event.preventDefault();
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
    };
    const move = (event: PointerEvent) => {
      const start = drag.current; if (!start || start.id !== event.pointerId || game.phase !== 'menu') return;
      menuPan.tx = THREE.MathUtils.clamp(menuPan.tx - (event.clientX - start.x) * 0.018, -7.5, 7.5);
      menuPan.ty = THREE.MathUtils.clamp(menuPan.ty + (event.clientY - start.y) * 0.01, -2.2, 2.4);
      start.x = event.clientX; start.y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (drag.current?.id !== event.pointerId) return;
      drag.current = null; canvas.style.cursor = 'grab';
    };
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', down, { passive: false });
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.style.cursor = '';
    };
  }, [gl]);
  useFrame((_, dt) => {
    if (game.phase !== 'menu') { menuPan.tx = 0; menuPan.ty = 0; }
    menuPan.x = THREE.MathUtils.damp(menuPan.x, menuPan.tx, 8, dt);
    menuPan.y = THREE.MathUtils.damp(menuPan.y, menuPan.ty, 8, dt);
  });
  return null;
}

function Simulation() {
  const { camera, size } = useThree();
  const look = useMemo(() => new THREE.Vector3(-3, 1.7, -25), []);
  useFrame((_, dt) => {
    game.update(dt);
    const menu = game.phase === 'menu';
    const arena = game.arena && !menu;
    const targetX = menu ? (size.width < 600 ? -1.2 : -5.6) + menuPan.x : arena ? game.x * 0.4 + (size.width < 600 ? 0.5 : 1.35) : game.x * 0.11;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, 3, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, (menu ? 5.2 : arena ? 3.9 : 4.6) + (menu ? menuPan.y : 0), 3, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, arena ? 8.2 : 11, 3, dt);
    look.x = THREE.MathUtils.damp(look.x, arena ? 0 : camera.position.x * 0.78, 3, dt);
    look.y = THREE.MathUtils.damp(look.y, arena ? 1.8 : 1.7, 3, dt);
    look.z = THREE.MathUtils.damp(look.z, arena ? -18 : -28, 3, dt);
    camera.lookAt(look);
    const perspective = camera as THREE.PerspectiveCamera;
    const fov = game.phase === 'running' ? 56 + (game.speed - 17) * 0.35 : 56;
    perspective.fov = THREE.MathUtils.damp(perspective.fov, fov, 2, dt);
    perspective.updateProjectionMatrix();
  }, -2);
  return null;
}

function Track() {
  const lines = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  useFrame(() => { if (lines.current) lines.current.position.z = game.visualDistance % 6; if (root.current) root.current.visible = !game.arena && game.phase !== 'menu'; });
  return <group ref={root}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.14, -70]}>
      <planeGeometry args={[280, 300]} /><meshStandardMaterial color="#06091b" metalness={0.7} roughness={0.5} />
    </mesh>
    <gridHelper args={[240, 80, '#272251', '#191732']} position={[0, -0.12, -65]} />
    <mesh position={[0, -0.13, -65]}>
      <boxGeometry args={[8.5, 0.24, 155]} /><meshStandardMaterial color="#10162b" metalness={0.85} roughness={0.26} />
    </mesh>
    {[-4.3, 4.3].map(x => <group key={x}>
      <mesh position={[x, 0.02, -65]}><boxGeometry args={[0.075, 0.08, 155]} /><meshBasicMaterial color={CYAN} toneMapped={false} /></mesh>
      <mesh position={[x * 1.1, -0.03, -65]}><boxGeometry args={[0.04, 0.05, 155]} /><meshBasicMaterial color="#157695" /></mesh>
    </group>)}
    {[-1.25, 1.25].map(x => <mesh key={x} position={[x, 0.004, -65]}><boxGeometry args={[0.025, 0.012, 155]} /><meshBasicMaterial color="#225370" /></mesh>)}
    <group ref={lines}>
      {Array.from({ length: 28 }, (_, i) => <group key={i} position={[0, 0.016, 10 - i * 6]}>
        <mesh><boxGeometry args={[8.45, 0.012, 0.028]} /><meshBasicMaterial color="#243150" /></mesh>
        {[-4.26, 4.26].map(x => <mesh key={x} position={[x, 0.025, 0]}><boxGeometry args={[0.15, 0.025, 1.2]} /><meshBasicMaterial color={CYAN} toneMapped={false} /></mesh>)}
      </group>)}
    </group>
    {[-25, -65, -110].map((z, i) => <group key={z} position={[0, 0, z]}>
      {[-5.1, 5.1].map(x => <group key={x} position={[x, 4.5, 0]}>
        <mesh><boxGeometry args={[0.3, 9, 0.45]} /><meshStandardMaterial color="#151a32" metalness={0.8} roughness={0.3} /></mesh>
        <mesh position={[0, 0, 0.25]}><boxGeometry args={[0.05, 9, 0.025]} /><meshBasicMaterial color={i % 2 ? CYAN : PINK} toneMapped={false} /></mesh>
      </group>)}
      <mesh position={[0, 9, 0]}><boxGeometry args={[10.5, 0.25, 0.45]} /><meshStandardMaterial color="#151a32" /></mesh>
      <mesh position={[0, 8.85, 0.25]}><boxGeometry args={[10.3, 0.05, 0.04]} /><meshBasicMaterial color={i % 2 ? CYAN : PINK} toneMapped={false} /></mesh>
    </group>)}
  </group>;
}

function City() {
  const buildings = useMemo(() => {
    let seed = 67;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    return Array.from({ length: 66 }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      return { x: side * (12 + rand() * 26), z: -14 - row * 5.1, width: 2.2 + rand() * 4, height: 5 + rand() * 29, depth: 3 + rand() * 4, color: rand() > 0.6 ? '#c2229e' : '#168ab2' };
    });
  }, []);
  return <group>
    {buildings.map((b, i) => <group key={i} position={[b.x, b.height / 2, b.z]}>
      <mesh><boxGeometry args={[b.width, b.height, b.depth]} /><meshStandardMaterial color={i % 3 ? '#080d20' : '#101129'} roughness={0.48} metalness={0.45} /></mesh>
      <mesh position={[b.width / 2 + 0.015, 0, b.depth / 2]}><boxGeometry args={[0.035, b.height, 0.035]} /><meshBasicMaterial color={b.color} toneMapped={false} /></mesh>
      <mesh position={[0, b.height / 2, b.depth / 2 + 0.015]}><boxGeometry args={[b.width, 0.04, 0.04]} /><meshBasicMaterial color={b.color} toneMapped={false} /></mesh>
      {Array.from({ length: 3 }, (_, n) => <mesh key={n} position={[0, b.height * (0.28 - n * 0.18), b.depth / 2 + 0.02]}>
        <boxGeometry args={[b.width * (i % 2 ? 0.7 : 0.35), 0.065, 0.025]} /><meshBasicMaterial color={b.color} transparent opacity={0.65} toneMapped={false} />
      </mesh>)}
    </group>)}
  </group>;
}

function Sky() {
  const positions = useMemo(() => {
    const a = new Float32Array(450 * 3);
    for (let i = 0; i < 450; i++) { a[i * 3] = Math.sin(i * 134.4) * 140; a[i * 3 + 1] = 10 + ((i * 17.43) % 70); a[i * 3 + 2] = -100 - ((i * 5.8) % 90); }
    return a;
  }, []);
  return <>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial size={0.12} color="#818bbb" transparent opacity={0.7} sizeAttenuation /></points>
    <mesh position={[0, 27, -165]}>
      <planeGeometry args={[50, 50]} />
      <shaderMaterial transparent depthWrite={false} toneMapped={false}
        vertexShader={'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'}
        fragmentShader={'varying vec2 vUv; void main(){ float r=length(vUv-.5); float halo=exp(-r*8.)*.33*(1.-smoothstep(.35,.5,r)); float disc=(1.-smoothstep(.32,.325,r)); float stripe=step(.21,fract(vUv.y*24.)); if(vUv.y>.53) stripe=1.; vec3 color=mix(vec3(.42,.03,.72),vec3(1.,.08,.46),vUv.y); gl_FragColor=vec4(color*1.5, max(halo,disc*stripe*.88)); }'} />
    </mesh>
  </>;
}

const kinds: EntityKind[] = ['wall', 'hurdle', 'beam', 'coin', 'shield', 'magnet', 'double'];
const entityColors: Record<EntityKind, string> = { wall: '#ff2585', hurdle: '#ff9d33', beam: '#ff268f', coin: '#ffe074', shield: '#35e8ff', magnet: '#ae79ff', double: '#b8ff48' };

function EntityBatch({ kind }: { kind: EntityKind }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const edge = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const isHazard = ['wall', 'hurdle', 'beam'].includes(kind);
  const geometry = useMemo(() => {
    if (kind === 'coin') return new THREE.TorusGeometry(0.29, 0.09, 6, 12);
    if (!isHazard) return new THREE.OctahedronGeometry(0.48);
    if (kind === 'wall') return new THREE.BoxGeometry(1.85, 3.2, 1.05);
    if (kind === 'hurdle') return new THREE.BoxGeometry(1.9, 0.78, 0.75);
    return new THREE.BoxGeometry(2.1, 0.65, 0.7);
  }, [kind, isHazard]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    let count = 0;
    for (const e of game.entities) {
      if (e.kind !== kind || !e.active || count >= 100) continue;
      const y = kind === 'wall' ? 1.6 : kind === 'hurdle' ? 0.39 : kind === 'beam' ? 1.7 : 1.15;
      scratch.position.set(e.lane * LANE_WIDTH, y + (isHazard ? 0 : Math.sin(clock.elapsedTime * 3 + e.id) * 0.1), e.z);
      scratch.rotation.set(0, isHazard ? 0 : clock.elapsedTime * 2 + e.id * 0.3, isHazard || kind === 'coin' ? 0 : Math.PI / 4);
      scratch.scale.setScalar(1);
      scratch.updateMatrix();
      mesh.current.setMatrixAt(count, scratch.matrix);
      edge.current?.setMatrixAt(count, scratch.matrix);
      count++;
    }
    mesh.current.count = count; mesh.current.instanceMatrix.needsUpdate = true;
    if (edge.current) { edge.current.count = count; edge.current.instanceMatrix.needsUpdate = true; }
  });
  return <>
    <instancedMesh ref={mesh} args={[geometry, undefined, 100]} frustumCulled={false}>
      {isHazard ? <meshStandardMaterial color="#21132c" emissive={entityColors[kind]} emissiveIntensity={0.18} metalness={0.5} roughness={0.3} /> :
        <meshStandardMaterial color={entityColors[kind]} emissive={entityColors[kind]} emissiveIntensity={1.5} metalness={0.45} roughness={0.2} />}
    </instancedMesh>
    {isHazard && <instancedMesh ref={edge} args={[geometry, undefined, 100]} frustumCulled={false}><meshBasicMaterial color={entityColors[kind]} wireframe toneMapped={false} /></instancedMesh>}
  </>;
}

function Runner({ style }: { style: RunnerStyle }) {
  const ref = useRef<THREE.Group>(null);
  const shield = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const muzzle = useRef<THREE.Mesh>(null);
  const [weapon, setWeapon] = useState(game.combat.weapon);
  const idleTime = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (game.combat.weapon !== weapon) setWeapon(game.combat.weapon);
    if (!game.reducedMotion && game.phase === 'menu') idleTime.current += Math.min(dt, 0.05);
    ref.current.position.set(game.x, game.y + 0.05, 0);
    ref.current.scale.y = THREE.MathUtils.damp(ref.current.scale.y, game.slide > 0 ? 0.38 : 1, 22, dt);
    ref.current.rotation.z = THREE.MathUtils.damp(ref.current.rotation.z, (game.x - game.lane * LANE_WIDTH) * 0.12, 12, dt);
    const angle = inCombat(game.phase) ? Math.atan2(-(game.combat.aim.x - game.x), -game.combat.aim.z) : 0;
    ref.current.rotation.y = THREE.MathUtils.damp(ref.current.rotation.y, angle, 12, dt);
    ref.current.visible = !(game.invincible > 0 && Math.floor(game.elapsed * 12) % 2 === 0);
    if (shield.current) { shield.current.visible = game.powers.shield > 0; shield.current.rotation.y = game.elapsed * 0.8; }
    if (ring.current) { ring.current.position.x = game.x; ring.current.rotation.z = game.elapsed; }
    if (muzzle.current) {
      muzzle.current.visible = game.combat.muzzle > 0;
      (muzzle.current.material as THREE.MeshBasicMaterial).color.set(weaponById(game.combat.weapon).color).multiplyScalar(3);
      muzzle.current.scale.setScalar(0.8 + game.combat.muzzle * 10);
    }
  });
  return <>
    <group ref={ref}>
      <RunnerModel style={style} weapon={weapon} pose={() => ({
        motion: game.arena ? 'aim' : game.slide > 0 ? 'idle' : game.y > 0.12 ? 'jump' : (game.phase === 'running' || game.phase === 'paused') ? 'run' : 'idle',
        time: game.phase === 'menu' ? idleTime.current : game.elapsed,
      })} />
      <mesh ref={muzzle} position={[0.43, 1.15, -1.12]} visible={false}><octahedronGeometry args={[0.16]} /><meshBasicMaterial color={style.color} toneMapped={false} /></mesh>
      <mesh ref={shield} position={[0, 1, 0]} visible={false}><icosahedronGeometry args={[1.4, 1]} /><meshBasicMaterial color={style.color} transparent opacity={0.23} wireframe toneMapped={false} /></mesh>
      <pointLight color={style.color} intensity={6} distance={5} position={[0, 0.5, 0.5]} />
    </group>
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}><ringGeometry args={[0.65, 0.72, 32]} /><meshBasicMaterial color={style.color} transparent opacity={0.6} toneMapped={false} side={THREE.DoubleSide} /></mesh>
  </>;
}

function World({ highQuality, levelId, runnerStyle }: { highQuality: boolean; levelId: number; runnerStyle: RunnerStyle }) {
  const level = getLevel(levelId);
  return <>
    <color attach="background" args={[level.sky]} />
    <fog attach="fog" args={[level.sky, 32, 150]} />
    <hemisphereLight intensity={0.55} color="#9ecbff" groundColor="#1a1028" />
    <ambientLight intensity={0.42} color="#b7a0c8" />
    <directionalLight position={[6, 12, 4]} intensity={2.1} color="#e7f3ff" />
    <directionalLight position={[-7, 3, -6]} intensity={1.55} color="#ff4fb8" />
    <pointLight position={[0, 6, -22]} color={PINK} intensity={70} distance={55} />
    <Simulation /><MenuLook /><Sky /><City /><District levelId={levelId} /><Track />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, -60]}><planeGeometry args={[240, 240]} /><meshStandardMaterial color="#282333" metalness={0.7} roughness={0.32} /></mesh>
    <CombatScene levelId={levelId} />
    {kinds.map(kind => <EntityBatch key={kind} kind={kind} />)}
    <Runner style={runnerStyle} />
    {highQuality && <EffectComposer multisampling={0}>
      <Bloom intensity={1.15} luminanceThreshold={0.8} luminanceSmoothing={0.4} mipmapBlur />
      <Vignette eskil={false} offset={0.15} darkness={0.65} />
    </EffectComposer>}
  </>;
}

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export const Scene = memo(function Scene({ highQuality, onReady, onError, levelId, runnerStyle, suspended }: { highQuality: boolean; onReady: () => void; onError: () => void; levelId: number; runnerStyle: RunnerStyle; suspended: boolean }) {
  const [lost, setLost] = useState(false);
  const handleLost = useCallback(() => { game.pause(); setLost(true); onError(); }, [onError]);
  return <SceneBoundary onError={onError}>
    {lost ? <div className="webgl-error">Graphics connection lost. Reload the page to reconnect.</div> :
      <Canvas frameloop={suspended ? 'never' : 'always'} camera={{ position: [-5.6, 5.6, 11], fov: 56, near: 0.1, far: 280 }} dpr={highQuality ? [1, 1.5] : 1}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}>
        <GraphicsLifecycle onReady={onReady} onLost={handleLost} />
        <World highQuality={highQuality} levelId={levelId} runnerStyle={runnerStyle} />
      </Canvas>}
  </SceneBoundary>;
});
