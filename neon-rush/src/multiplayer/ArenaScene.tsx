import { Component, memo, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RunnerModel } from '../components/RunnerModel';
import { GraphicsLifecycle } from '../components/GraphicsLifecycle';
import { RUNNER_STYLES } from '../game/runnerStyle';
import { ARENA, ARENA_COVER } from '../../shared/arena.js';
import type { ArenaSnapshot, ArenaPlayer } from '../../shared/multiplayer';
import type { ArenaClient } from './client';
import type { ArenaControls } from './useArenaControls';

type LabelMap = Map<string, HTMLDivElement>;
const ArenaRunner = memo(function ArenaRunner({ id, room, playerId, labels, client }: { client: ArenaClient; id: string; room: RefObject<ArenaSnapshot>; playerId: string; labels: RefObject<LabelMap> }) {
  const root = useRef<THREE.Group>(null);
  const shield = useRef<THREE.Mesh>(null);
  const muzzle = useRef<THREE.Mesh>(null);
  const player = room.current.players.find(p => p.id === id)!;
  const pose = useRef({ motion: 'aim' as 'aim' | 'run', time: 0 });
  const initial = useRef(player);
  const rendered = useRef({ ...player });
  const projected = useMemo(() => new THREE.Vector3(), []);
  const shot = useRef({ count: player.shots, remaining: 0 });
  const { camera, size } = useThree();
  useFrame((_, dt) => {
    if (!root.current || !room.current.players.some(p => p.id === id)) return;
    const state = rendered.current;
    client.simulation.samplePlayer(id, playerId, client.renderTime, state);
    root.current.visible = state.hp > 0 && state.connected;
    root.current.position.set(state.x, 0, state.z);
    root.current.rotation.y = state.angle;
    pose.current.motion = state.moving ? 'run' : 'aim'; pose.current.time = performance.now() / 1000;
    if (shield.current) shield.current.visible = state.shield > 0 || state.dashing;
    if (state.shots !== shot.current.count) { shot.current.count = state.shots; shot.current.remaining = 0.09; }
    shot.current.remaining = Math.max(0, shot.current.remaining - dt);
    if (muzzle.current) muzzle.current.visible = shot.current.remaining > 0;
    const label = labels.current.get(id);
    if (label) {
      projected.set(root.current.position.x, 2.65, root.current.position.z).project(camera);
      label.style.display = root.current.visible && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1 && projected.z < 1 ? '' : 'none';
      label.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) * size.width / 2}px, ${(1 - projected.y) * size.height / 2}px)`;
    }
  });
  const finish = RUNNER_STYLES.find(style => style.id === player.style) ?? RUNNER_STYLES[0];
  return <group ref={root} position={[initial.current.x, 0, initial.current.z]}>
    <RunnerModel style={{ ...finish, color: player.color }} weapon="blaster" pose={() => pose.current} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><ringGeometry args={[0.62, id === playerId ? 0.78 : 0.68, 32]} /><meshBasicMaterial color={player.color} toneMapped={false} /></mesh>
    <mesh ref={shield} position={[0, 1.05, 0]}><sphereGeometry args={[1.1, 16, 12]} /><meshBasicMaterial color={player.color} wireframe transparent opacity={0.2} /></mesh>
    <mesh ref={muzzle} visible={false} position={[0.43, 1.05, -1.07]}><octahedronGeometry args={[0.24]} /><meshBasicMaterial color={player.color} toneMapped={false} /></mesh>
  </group>;
});

function Bolts({ client }: { client: ArenaClient }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const object = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    if (!mesh.current) return;
    const frame = client.simulation.bulletFrame(client.renderTime);
    const bullets = frame?.bullets ?? [];
    const elapsed = frame ? Math.max(0, Math.min(0.08, (client.renderTime - frame.serverTime) / 1000)) : 0;
    mesh.current.count = Math.min(128, bullets.length);
    for (let index = 0; index < mesh.current.count; index++) {
      const bullet = bullets[index];
      object.position.set(bullet.x + bullet.vx * elapsed, 1.05, bullet.z + bullet.vz * elapsed); object.rotation.set(0, Math.atan2(bullet.vx, bullet.vz), 0); object.updateMatrix();
      mesh.current!.setMatrixAt(index, object.matrix); mesh.current!.setColorAt(index, color.set(bullet.color));
    }
    mesh.current.instanceMatrix.needsUpdate = true; if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, 128]} frustumCulled={false}><boxGeometry args={[0.12, 0.12, 0.7]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>;
}

function ArenaWorld({ room, playerId, controls, labels, client }: { client: ArenaClient; room: RefObject<ArenaSnapshot>; playerId: string; controls: RefObject<ArenaControls>; labels: RefObject<LabelMap> }) {
  const { camera, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    client.rendered(); client.renderTime = client.simulation.sampleTime(performance.now());
    if (client.simulation.room) room.current = client.simulation.room;
    const own = client.simulation.predicted;
    const narrow = size.width < 600;
    const x = (own?.x ?? 0) * (narrow ? 0.8 : 0.2), z = (own?.z ?? 0) * (narrow ? 0.85 : 0.25);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, x, 4, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, narrow ? 21 : 29, 4, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, z + (narrow ? 16 : 23), 4, dt);
    target.set(camera.position.x, 0, camera.position.z - (narrow ? 16 : 23)); camera.lookAt(target);
  }, -1);
  const aim = (x: number, z: number) => { controls.current.aim.x = x; controls.current.aim.z = z; controls.current.touchAim = false; };
  return <>
    <color attach="background" args={['#070d19']} /><fog attach="fog" args={['#070d19', 48, 95]} />
    <ambientLight intensity={1.6} color="#bed4ee" /><directionalLight position={[8, 18, 12]} intensity={3.5} color="#d2e9ff" />
    <pointLight position={[-9, 4, -10]} intensity={60} distance={25} color="#b063f5" /><pointLight position={[9, 4, 10]} intensity={70} distance={25} color="#53e9ff" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerMove={event => { if (event.pointerType === 'mouse') aim(event.point.x, event.point.z); }} onPointerDown={event => {
      if (event.pointerType === 'mouse' && event.button === 0) { aim(event.point.x, event.point.z); controls.current.firing = true; }
    }}><planeGeometry args={[160, 160]} /><meshStandardMaterial color="#101b2c" roughness={0.64} metalness={0.4} /></mesh>
    <gridHelper args={[80, 40, '#31435d', '#1c2b41']} position={[0, 0.01, 0]} />
    <mesh position={[0, -0.15, 0]}><boxGeometry args={[ARENA.width, 0.25, ARENA.depth]} /><meshStandardMaterial color="#142439" metalness={0.6} roughness={0.45} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * ARENA.width / 2, 0.15, 0]}><boxGeometry args={[0.16, 0.3, ARENA.depth]} /><meshStandardMaterial color="#57e8f5" emissive="#57e8f5" emissiveIntensity={2} /></mesh>
      <mesh position={[0, 0.15, side * ARENA.depth / 2]}><boxGeometry args={[ARENA.width, 0.3, 0.16]} /><meshStandardMaterial color="#bb7cfa" emissive="#bb7cfa" emissiveIntensity={2} /></mesh>
    </group>)}
    {ARENA_COVER.map((box, index) => <group key={index} position={[box.x, 0, box.z]}>
      <mesh position={[0, index === 4 ? 1.2 : 0.7, 0]}><boxGeometry args={[box.width, index === 4 ? 2.4 : 1.4, box.depth]} /><meshStandardMaterial color="#2b3b52" metalness={0.6} roughness={0.36} /></mesh>
      <mesh position={[0, index === 4 ? 2.42 : 1.42, 0]}><boxGeometry args={[box.width + 0.03, 0.055, box.depth + 0.03]} /><meshStandardMaterial color={index === 4 ? '#b48af9' : '#57e8f5'} emissive={index === 4 ? '#b48af9' : '#57e8f5'} emissiveIntensity={1.5} /></mesh>
      {index === 4 && <mesh position={[0, 3.1, 0]}><octahedronGeometry args={[0.5]} /><meshStandardMaterial color="#c998ff" emissive="#bf8fff" emissiveIntensity={2} /></mesh>}
    </group>)}
    {room.current.players.map(player => <ArenaRunner key={player.id} id={player.id} room={room} playerId={playerId} labels={labels} client={client} />)}
    <Bolts client={client} />
  </>;
}

// Change resolution only after sustained load, never geometry, physics or UI.
function AdaptiveResolution() {
  const { setDpr } = useThree();
  const budget = useRef({ seconds: 0, frames: 0, fastWindows: 0, dpr: Math.min(devicePixelRatio, (navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches) ? 1.25 : 1.5) });
  useFrame((_, dt) => {
    if (document.hidden || dt > 0.5) { budget.current.seconds = 0; budget.current.frames = 0; return; }
    const sample = budget.current; sample.seconds += dt; sample.frames++;
    if (sample.seconds < 3) return;
    const fps = sample.frames / sample.seconds;
    const maximum = Math.min(devicePixelRatio, (navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches) ? 1.25 : 1.5);
    sample.fastWindows = fps > 57 ? sample.fastWindows + 1 : 0;
    const next = fps < 45 ? Math.max(0.75, sample.dpr - 0.25) : sample.fastWindows >= 3 ? Math.min(maximum, sample.dpr + 0.25) : sample.dpr;
    if (next !== sample.dpr) { sample.dpr = next; sample.fastWindows = 0; setDpr(next); }
    sample.seconds = 0; sample.frames = 0;
  });
  return null;
}

class ArenaBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
export function ArenaScene({ room, playerId, controls, onError, client, talking }: { client: ArenaClient; room: ArenaSnapshot; playerId: string; controls: RefObject<ArenaControls>; onError: () => void; talking?: Record<string, boolean> }) {
  const latest = useRef(room); latest.current = room;
  const labels = useRef<LabelMap>(new Map());
  const initialDpr = useRef(Math.min(devicePixelRatio, (navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches) ? 1.25 : 1.5));
  return <>
    <ArenaBoundary onError={onError}><Canvas camera={{ position: [0, 29, 23], fov: 50, near: 0.1, far: 120 }} dpr={initialDpr.current} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} onCreated={({ gl }) => {
      gl.domElement.tabIndex = 0; gl.domElement.setAttribute('aria-label', 'Multiplayer arena. WASD or arrow keys move. Mouse aims. Hold click or F to fire. Space dashes. R reloads. Hold V to talk.');
    }}><GraphicsLifecycle onLost={onError} /><AdaptiveResolution /><ArenaWorld room={latest} playerId={playerId} controls={controls} labels={labels} client={client} /></Canvas></ArenaBoundary>
    <div className="arena-nameplates" aria-hidden="true">{room.players.map((player: ArenaPlayer) => <div key={player.id} className={`arena-nameplate ${player.id === playerId ? 'own-player' : ''} ${talking?.[player.id] ? 'is-talking' : ''}`} ref={node => { if (node) labels.current.set(player.id, node); else labels.current.delete(player.id); }}>
      <span style={{ color: player.color }}>{player.name}{player.id === playerId ? ' · YOU' : ''}{talking?.[player.id] ? ' · MIC' : player.muted ? ' · MUTED' : ''}</span><i><b style={{ width: `${player.hp}%`, background: player.color }} /></i>
    </div>)}</div>
  </>;
}
