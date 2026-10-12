import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { game } from '../game/engine';
import { COVER, inCombat } from '../game/combat';
import { ENEMIES } from '../game/enemies';
import type { EnemyKind } from '../game/enemies';
import { getLevel } from '../game/levels';

const brass = '#a38b66';
const dark = '#252331';

function NeonSign({ text, color, position, rotation = 0, width = 3, height = 1.5 }: { text: string; color: string; position: [number, number, number]; rotation?: number; width?: number; height?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#160e20'; ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.strokeRect(12, 12, 488, 232);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = 'bold 79px sans-serif'; ctx.fillText(text, 256, 137);
    ctx.font = '18px monospace'; ctx.fillText('N I G H T   D I S T R I C T   / /   0 7', 256, 202);
    const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position} rotation={[0, rotation, 0]}><planeGeometry args={[width, height]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>;
}

export function District({ levelId }: { levelId: number }) {
  const level = getLevel(levelId);
  const windows = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    let n = 0;
    for (const side of [-1, 1]) for (let building = 0; building < 11; building++) {
      const x = side * (12 + building % 3 * 2.5), z = -9 - building * 9;
      for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) {
        if ((row * 7 + col + building) % 5 === 0) continue;
        scratch.position.set(x + (col - 1.5) * 0.85, 3 + row * 1.7, z + 2.1);
        scratch.scale.set(0.65, 0.9, 0.04); scratch.updateMatrix(); windows.current?.setMatrixAt(n++, scratch.matrix);
      }
    }
    if (windows.current) { windows.current.count = n; windows.current.instanceMatrix.needsUpdate = true; }
  }, [scratch]);
  return <group>
    <instancedMesh ref={windows} args={[undefined, undefined, 600]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={new THREE.Color(level.accent).multiplyScalar(1.6)} toneMapped={false} /></instancedMesh>
    {[-1, 1].map(side => <group key={side}>
      {Array.from({ length: 7 }, (_, i) => <group key={i} position={[side * (12 + i % 3 * 2.5), 0, -9 - i * 9]}>
        <mesh position={[0, 7, 0]}><boxGeometry args={[4.5, 14, 4]} /><meshStandardMaterial color={i % 2 ? '#302033' : '#20283b'} roughness={0.5} metalness={0.7} /></mesh>
        <mesh position={[0, 14.1, 0]}><boxGeometry args={[4.8, 0.22, 4.4]} /><meshStandardMaterial color="#332d40" metalness={0.75} roughness={0.3} /></mesh>
        <mesh position={[-side * 2.28, 6.5, 2.08]}><boxGeometry args={[0.08, 12, 0.09]} /><meshBasicMaterial color={new THREE.Color(level.color).multiplyScalar(2)} toneMapped={false} /></mesh>
      </group>)}
      <NeonSign text={side === -1 ? 'MIRAI' : '夜 CITY'} color={level.color} position={[side * 11.5, 7, -6.85]} width={4} height={2.3} />
      <NeonSign text={side === -1 ? 'ZENITH' : 'NEON'} color={level.accent} position={[side * 15, 11.5, -24.85]} width={5.2} height={2.5} />
      <NeonSign text="2077" color="#73e6ff" position={[side * 15, 4.5, -33.85]} width={3.5} height={2} />
      {[-12, -30].map(z => <group key={z} position={[side * 8.5, 0, z]}>
        <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[1.1, 1.35, 0.4, 8]} /><meshStandardMaterial color={brass} metalness={0.7} roughness={0.3} /></mesh>
        <mesh position={[0, 3.5, 0]}><cylinderGeometry args={[0.8, 0.9, 6.7, 4]} /><meshStandardMaterial color="#302136" metalness={0.6} roughness={0.3} /></mesh>
        <mesh position={[0, 6.9, 0]}><cylinderGeometry args={[1.25, 1, 0.35, 4]} /><meshStandardMaterial color={brass} metalness={0.7} roughness={0.3} /></mesh>
        {[-0.45, 0.45].map(x => <mesh key={x} position={[x, 3.8, 0.66]}><boxGeometry args={[0.065, 4.8, 0.06]} /><meshBasicMaterial color={new THREE.Color(level.accent).multiplyScalar(2)} toneMapped={false} /></mesh>)}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.42, 0]}><ringGeometry args={[1.1, 1.16, 32]} /><meshBasicMaterial color={level.color} toneMapped={false} /></mesh>
      </group>)}
    </group>)}
    <pointLight position={[-7, 4, -8]} color={level.color} intensity={110} distance={35} decay={2} />
    <pointLight position={[7, 5, -22]} color={level.accent} intensity={110} distance={40} decay={2} />
  </group>;
}

export function RobotModel({ kind, color, bossLevel = 1 }: { kind: EnemyKind; color: string; bossLevel?: number }) {
  const flying = ENEMIES[kind].flying;
  const boss = kind === 'boss';
  return <group scale={boss ? [1.65, 1.65, 1.65] : kind === 'heavy' ? [1.15, 1.15, 1.15] : [1, 1, 1]}>
    <mesh><boxGeometry args={[flying ? 1.3 : 0.9, flying ? 0.42 : 1.2, 0.65]} /><meshStandardMaterial color={dark} metalness={0.8} roughness={0.28} /></mesh>
    <mesh position={[0, 0.65, 0.08]}><boxGeometry args={[boss ? 0.66 : 0.5, 0.43, 0.5]} /><meshStandardMaterial color="#433142" metalness={0.8} roughness={0.2} /></mesh>
    <mesh position={[0, 0.69, 0.35]}><boxGeometry args={[0.4, 0.06, 0.05]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    <mesh position={[0, boss ? 0.3 : 0.18, 0.37]}><octahedronGeometry args={[boss ? 0.34 : 0.19]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * (flying ? 0.85 : 0.64), flying ? 0 : 0.25, 0]} rotation={[0, 0, side * 0.12]}><boxGeometry args={[boss ? 0.6 : 0.32, flying ? 0.25 : 0.82, boss ? 0.8 : 0.4]} /><meshStandardMaterial color={brass} metalness={0.7} roughness={0.3} /></mesh>
      <mesh position={[side * (flying ? 0.85 : 0.64), -0.12, 0.38]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.12, 0.15, 0.42, 8]} /><meshStandardMaterial color="#141c2c" metalness={0.8} roughness={0.3} /></mesh>
      <mesh position={[side * (flying ? 0.85 : 0.64), -0.12, 0.62]}><circleGeometry args={[0.09, 12]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      {!flying && <group>
        <mesh position={[side * 0.3, -0.85, 0]}><boxGeometry args={[0.29, 0.75, 0.35]} /><meshStandardMaterial color="#322f40" metalness={0.7} roughness={0.3} /></mesh>
        <mesh position={[side * 0.3, -1.16, 0.14]}><boxGeometry args={[0.38, 0.16, 0.64]} /><meshStandardMaterial color={brass} metalness={0.7} roughness={0.3} /></mesh>
      </group>}
      {flying && <mesh position={[side * 0.85, -0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.18, 0.25, 16]} /><meshBasicMaterial color={color} side={THREE.DoubleSide} toneMapped={false} /></mesh>}
    </group>)}
    {boss && <>
      <mesh position={[0, 0.4, -0.25]} rotation={[0, 0, Math.PI / 4]}><torusGeometry args={[1.3 + bossLevel * 0.07, 0.045, 5, bossLevel === 3 ? 3 : 6]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      {bossLevel >= 4 && [-1, 1].map(side => <mesh key={side} position={[side * 1.75, 0.65, -0.2]} rotation={[0, 0, side * 0.24]}><boxGeometry args={[1.5, 0.16, 0.7]} /><meshStandardMaterial color={brass} emissive={color} emissiveIntensity={0.2} metalness={0.8} roughness={0.3} /></mesh>)}
    </>}
    {kind === 'turret' && <mesh position={[0, -0.95, 0]}><cylinderGeometry args={[0.7, 0.9, 0.35, 6]} /><meshStandardMaterial color={brass} /></mesh>}
  </group>;
}

function EnemyVisual({ index, levelId }: { index: number; levelId: number }) {
  const kind = useSyncExternalStore(game.subscribe, () => game.combat.enemies[index].kind);
  const root = useRef<THREE.Group>(null);
  const robot = useRef<THREE.Group>(null);
  const hp = useRef<THREE.Mesh>(null);
  const weak = useRef<THREE.Mesh>(null);
  const barrier = useRef<THREE.Mesh>(null);
  const warning = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const e = game.combat.enemies[index];
    if (!root.current) return;
    root.current.visible = e.active;
    if (!e.active) return;
    root.current.position.set(e.x, e.y, e.z);
    if (robot.current) { robot.current.rotation.z = Math.sin(e.age * 3 + e.id) * (ENEMIES[e.kind].flying ? 0.12 : 0.025); robot.current.scale.setScalar(e.miniboss ? 1.2 : 1); }
    if (hp.current) { hp.current.scale.x = Math.max(0, e.hp / e.maxHp); hp.current.position.x = (e.hp / e.maxHp - 1) * 0.6; hp.current.position.y = e.kind === 'boss' ? 2.5 : 1.2; }
    if (barrier.current) { barrier.current.visible = e.kind === 'shield' && !e.weak; barrier.current.rotation.y = e.age; }
    if (weak.current) { weak.current.visible = e.hit > 0; weak.current.scale.setScalar(e.radius * 1.1); }
    if (warning.current) { warning.current.visible = e.telegraph > 0; warning.current.position.y = e.kind === 'boss' ? 3 : 1.6; warning.current.scale.setScalar(0.7 + Math.sin(e.age * 18) * 0.15); }
  });
  return <group ref={root} visible={false}>
    <group ref={robot}><RobotModel kind={kind} color={ENEMIES[kind].color} bossLevel={levelId} /></group>
    <mesh ref={hp} position={[0, 1.2, 0.6]}><planeGeometry args={[1.2, 0.08]} /><meshBasicMaterial color="#ff6a9a" depthTest={false} toneMapped={false} /></mesh>
    <mesh ref={weak} visible={false}><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial color="#fff2ca" transparent opacity={0.5} wireframe /></mesh>
    <mesh ref={barrier} visible={false}><icosahedronGeometry args={[1.25, 1]} /><meshBasicMaterial color="#ae87ff" transparent opacity={0.3} wireframe toneMapped={false} /></mesh>
    <mesh ref={warning} position={[0, 1.6, 0]}><octahedronGeometry args={[0.2]} /><meshBasicMaterial color="#ffcd77" toneMapped={false} /></mesh>
  </group>;
}

function CombatEffects() {
  const shots = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<THREE.InstancedMesh>(null);
  const pickups = useRef<THREE.InstancedMesh>(null);
  const hazards = useRef<(THREE.Mesh | null)[]>([]);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    if (!shots.current || !particles.current || !pickups.current) return;
    let n = 0;
    for (const p of game.combat.projectiles) if (p.active) {
      scratch.position.set(p.x, p.y, p.z); scratch.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
      scratch.scale.set(p.radius * 0.8, p.radius * 0.8, p.laser ? 2.6 : p.friendly ? 0.7 : 0.4); scratch.updateMatrix();
      shots.current.setMatrixAt(n, scratch.matrix); shots.current.setColorAt(n++, color.set(p.color).multiplyScalar(2));
    }
    shots.current.count = n; shots.current.instanceMatrix.needsUpdate = true; if (shots.current.instanceColor) shots.current.instanceColor.needsUpdate = true;
    n = 0; scratch.rotation.set(0, 0, 0);
    for (const p of game.combat.particles) if (p.active) {
      scratch.position.set(p.x, p.y, p.z); scratch.scale.setScalar(p.size * Math.min(1, p.ttl / 0.2)); scratch.updateMatrix();
      particles.current.setMatrixAt(n, scratch.matrix); particles.current.setColorAt(n++, color.set(p.color).multiplyScalar(2));
    }
    particles.current.count = n; particles.current.instanceMatrix.needsUpdate = true; if (particles.current.instanceColor) particles.current.instanceColor.needsUpdate = true;
    n = 0;
    for (const p of game.combat.pickups) if (p.active) {
      scratch.position.set(p.x, 0.6 + Math.sin(game.combat.time * 4) * 0.1, p.z); scratch.rotation.set(0, game.combat.time * 2, Math.PI / 4); scratch.scale.setScalar(0.24); scratch.updateMatrix();
      pickups.current.setMatrixAt(n, scratch.matrix); pickups.current.setColorAt(n++, color.set(p.kind === 'health' ? '#9dff7a' : p.kind === 'armor' ? '#b183ff' : p.kind === 'ammo' ? '#65edff' : '#ffe484').multiplyScalar(2));
    }
    pickups.current.count = n; pickups.current.instanceMatrix.needsUpdate = true; if (pickups.current.instanceColor) pickups.current.instanceColor.needsUpdate = true;
    game.combat.hazards.forEach((h, i) => {
      const mesh = hazards.current[i]; if (!mesh) return; mesh.visible = h.active;
      if (!h.active) return;
      mesh.position.set(h.x, h.kind === 'shockwave' ? 0.25 : 0.035, h.z);
      mesh.scale.set(h.kind === 'shockwave' ? 15 : 1.5, h.kind === 'shockwave' ? 0.25 : h.fired ? 4 : 0.04, h.kind === 'shockwave' ? 0.2 : 30);
      (mesh.material as THREE.MeshBasicMaterial).opacity = h.kind === 'shockwave' || h.fired ? 0.8 : 0.15 + Math.sin(h.time * 24) * 0.08;
    });
  });
  return <>
    <instancedMesh ref={shots} args={[undefined, undefined, 180]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>
    <instancedMesh ref={particles} args={[undefined, undefined, 160]} frustumCulled={false}><octahedronGeometry args={[1]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>
    <instancedMesh ref={pickups} args={[undefined, undefined, 12]} frustumCulled={false}><octahedronGeometry args={[1]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>
    {game.combat.hazards.map((_, i) => <mesh key={i} ref={mesh => { hazards.current[i] = mesh; }} visible={false}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#ff497e" transparent opacity={0.5} toneMapped={false} depthWrite={false} /></mesh>)}
  </>;
}

export function CombatScene({ levelId }: { levelId: number }) {
  const root = useRef<THREE.Group>(null);
  const demo = useRef<THREE.Group>(null);
  const tiles = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const vector = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 22), []);
  const point = useMemo(() => new THREE.Vector3(), []);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const level = getLevel(levelId);
  useEffect(() => {
    let n = 0;
    for (let x = -3; x <= 3; x++) for (let z = -9; z <= 1; z++) {
      scratch.position.set(x * 3.8, -0.05, z * 3.8); scratch.scale.set(3.74, 0.1, 3.74); scratch.updateMatrix(); tiles.current?.setMatrixAt(n++, scratch.matrix);
    }
    if (tiles.current) { tiles.current.count = n; tiles.current.instanceMatrix.needsUpdate = true; }
  }, [scratch]);
  useFrame((_, dt) => {
    if (root.current) root.current.visible = game.arena || game.phase === 'menu';
    if (demo.current) demo.current.visible = game.phase === 'menu';
    if (inCombat(game.phase) && (game.combat.aimStick.x || game.combat.aimStick.y)) {
      game.combat.aimActive = true;
      game.combat.aimNdc.x = THREE.MathUtils.clamp(game.combat.aimNdc.x + game.combat.aimStick.x * dt * 0.85, -0.95, 0.95);
      game.combat.aimNdc.y = THREE.MathUtils.clamp(game.combat.aimNdc.y - game.combat.aimStick.y * dt * 0.85, -0.8, 0.85);
    }
    if (!inCombat(game.phase) || !game.combat.aimActive) return;
    ndc.set(game.combat.aimNdc.x, game.combat.aimNdc.y);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(plane, point)) {
      game.combat.aim = { x: Math.max(-20, Math.min(20, point.x)), y: Math.max(0.2, Math.min(10, point.y)), z: point.z };
      game.combat.aimTarget = -1;
      let nearest = Infinity;
      for (const enemy of game.combat.enemies) {
        if (!enemy.active) continue;
        vector.set(enemy.x, enemy.y, enemy.z);
        const distance = raycaster.ray.distanceToPoint(vector);
        const along = vector.distanceTo(camera.position);
        if (distance < enemy.radius * 1.05 && along < nearest) {
          raycaster.ray.closestPointToPoint(vector, point);
          game.combat.aim = { x: enemy.x + (point.x - enemy.x) * 0.5, y: enemy.y + (point.y - enemy.y) * 0.75, z: enemy.z };
          game.combat.aimTarget = enemy.id; nearest = along;
        }
      }
    }
  }, -1);
  return <group ref={root} visible={false}>
    <instancedMesh ref={tiles} args={[undefined, undefined, 80]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshPhysicalMaterial color="#343344" metalness={0.72} roughness={0.28} clearcoat={1} clearcoatRoughness={0.1} /></instancedMesh>
    {[-7.5, 7.5].map(x => <mesh key={x} position={[x, 0.02, -14]}><boxGeometry args={[0.065, 0.03, 38]} /><meshBasicMaterial color={level.accent} toneMapped={false} /></mesh>)}
    {[-5, -13, -25].map(z => <mesh key={z} position={[0, 0.03, z]}><boxGeometry args={[15, 0.03, 0.07]} /><meshBasicMaterial color={level.color} toneMapped={false} /></mesh>)}
    {COVER.map(cover => <group key={cover.x} position={[cover.x, 0, cover.z]}>
      <mesh position={[0, cover.height / 2, 0]}><boxGeometry args={[cover.width, cover.height, 0.8]} /><meshStandardMaterial color="#3b3441" metalness={0.7} roughness={0.32} /></mesh>
      <mesh position={[0, cover.height, 0]}><boxGeometry args={[cover.width + 0.12, 0.06, 0.88]} /><meshBasicMaterial color={level.accent} toneMapped={false} /></mesh>
      {[-0.6, -0.2, 0.2, 0.6].map(x => <mesh key={x} position={[x, 0.56, 0.411]} rotation={[0, 0, -0.55]}><boxGeometry args={[0.11, 0.7, 0.025]} /><meshBasicMaterial color={brass} /></mesh>)}
    </group>)}
    <group ref={demo} position={[0, 2.5, -20]}><RobotModel kind="boss" color={level.color} bossLevel={levelId} /></group>
    {game.combat.enemies.map((_, index) => <EnemyVisual key={index} index={index} levelId={levelId} />)}
    <CombatEffects />
  </group>;
}
