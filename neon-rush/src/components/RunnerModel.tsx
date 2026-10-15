import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { RunnerAppearance } from '../game/runnerStyle';
import type { WeaponId } from '../game/weapons';
import { weaponById } from '../game/weapons';
import { getRigJoints, poseRig } from '../game/rigAnimation';
import type { RigJoints, RigMotion } from '../game/rigAnimation';

export const RUNNER_GLB = '/models/neon-runner.glb?v=expressive';
// Some distributions use only the built-in procedural character.
const hasBundledRunner = Object.keys(import.meta.glob('/public/models/neon-runner.glb')).length > 0;

type Vec3 = [number, number, number];
type PoseFn = () => { motion: RigMotion; time: number };
type RunnerProps = {
  style: RunnerAppearance;
  weapon?: WeaponId;
  wireframe?: boolean;
  modelRef?: RefObject<THREE.Group | null>;
  pose: PoseFn;
};

function Plate({ position, size, color, rotation, glow = false, wireframe = false }: { position: Vec3; size: Vec3; color: string; rotation?: Vec3; glow?: boolean; wireframe?: boolean }) {
  const radius = Math.min(0.05, Math.min(size[0], size[1], size[2]) * 0.35);
  const geometry = useMemo(() => new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius), [size, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={position} rotation={rotation} geometry={geometry}>
    <meshStandardMaterial color={color} metalness={glow ? 0.2 : 0.72} roughness={glow ? 0.28 : 0.32} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 2.4 : 0} wireframe={wireframe} />
  </mesh>;
}

export function WeaponModel({ weapon, wireframe = false }: { weapon: WeaponId; wireframe?: boolean }) {
  const spec = weaponById(weapon);
  const long = weapon === 'laser' || weapon === 'pulse';
  const length = long ? 0.88 : weapon === 'shotgun' ? 0.65 : 0.4;
  return <group name="NR_weapon_mesh" rotation={[-Math.PI / 2, 0, 0]}>
    <Plate position={[0, 0, -length / 2]} size={[weapon === 'shotgun' ? 0.23 : 0.17, 0.2, length]} color="#202937" wireframe={wireframe} />
    <Plate position={[0, -0.15, -0.08]} size={[0.12, 0.24, 0.14]} rotation={[0.2, 0, 0]} color="#101823" wireframe={wireframe} />
    <Plate position={[0, 0.105, -length / 2]} size={[0.06, 0.025, length * 0.8]} color={spec.color} glow wireframe={wireframe} />
    {(weapon === 'shotgun' ? [-0.075, 0.075] : [0]).map(x => <mesh key={x} position={[x, 0, -length - 0.04]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.057, 0.065, 0.2, 12]} /><meshStandardMaterial color="#9eaeb9" metalness={0.8} roughness={0.28} wireframe={wireframe} />
    </mesh>)}
    {long && [0, 1, 2, 3].map(i => <Plate key={i} position={[0, 0, -0.25 - i * 0.13]} size={[0.19, 0.22, 0.035]} color={spec.color} glow wireframe={wireframe} />)}
  </group>;
}

export function applyRunnerFinish(root: THREE.Object3D, style: RunnerAppearance, wireframe = false) {
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.wireframe = wireframe;
      const name = material.name;
      if (name.includes('GLOW') || name === 'Black') {
        if (name.includes('GLOW')) {
          material.color.set(style.color);
          material.emissive.set(style.color);
          material.emissiveIntensity = 3.4;
          material.toneMapped = false;
        } else {
          material.color.set('#121b28');
          material.metalness = 0.72;
          material.roughness = 0.34;
        }
      } else if (name.includes('TRIM') || name === 'Grey') {
        material.color.set(style.trim);
        material.metalness = 0.58;
        material.roughness = 0.22;
        material.emissive.set('#000000');
      } else if (name.includes('ARMOR') || name === 'Main') {
        material.color.set(style.armor);
        material.metalness = 0.84;
        material.roughness = 0.26;
        material.emissive.set(style.color);
        material.emissiveIntensity = 0.18;
      }
    }
  });
}

function ProceduralRunner({ style, weapon = 'blaster', wireframe = false, modelRef, pose }: RunnerProps) {
  const root = useRef<THREE.Group>(null);
  const joints = useRef<RigJoints | null>(null);
  useLayoutEffect(() => {
    if (root.current) joints.current = getRigJoints(root.current);
    if (modelRef) modelRef.current = root.current;
    return () => { if (modelRef) modelRef.current = null; };
  }, [modelRef]);
  useFrame(() => { const state = pose(); if (joints.current) poseRig(joints.current, state.motion, state.time); });
  const plate = { color: style.armor, wireframe };
  const glow = { color: style.color, glow: true as const, wireframe };
  return <group ref={root} name="NEON_RUSH_RUNNER">
    <group name="NR_body">
      <mesh position={[0, 1.18, 0.02]}><capsuleGeometry args={[0.28, 0.42, 8, 16]} /><meshStandardMaterial color={style.armor} metalness={0.78} roughness={0.3} wireframe={wireframe} /></mesh>
      <Plate position={[0, 1.22, -0.02]} size={[0.58, 0.52, 0.38]} {...plate} />
      <Plate position={[0, 0.9, 0]} size={[0.42, 0.18, 0.3]} color="#1c2935" wireframe={wireframe} />
      <mesh position={[0, 1.22, -0.24]}><sphereGeometry args={[0.12, 16, 12]} /><meshStandardMaterial color={style.color} emissive={style.color} emissiveIntensity={2.6} wireframe={wireframe} /></mesh>
      <Plate position={[0, 1.22, 0.28]} size={[0.42, 0.38, 0.16]} color="#152231" wireframe={wireframe} />
      {[-0.12, 0.12].map(x => <group key={x} position={[x, 1.18, 0.38]} rotation={[0.7, 0, 0]}>
        <mesh><cylinderGeometry args={[0.09, 0.06, 0.22, 12]} /><meshStandardMaterial color={style.trim} metalness={0.7} roughness={0.28} wireframe={wireframe} /></mesh>
        <mesh position={[0, 0.14, 0]}><cylinderGeometry args={[0.045, 0.045, 0.08, 12]} /><meshStandardMaterial color={style.color} emissive={style.color} emissiveIntensity={2.8} wireframe={wireframe} /></mesh>
      </group>)}
      {[-1, 1].map(side => <group key={side}>
        <Plate position={[side * 0.2, 1.36, -0.18]} size={[0.28, 0.24, 0.12]} rotation={[0, 0, side * 0.16]} color={style.trim} wireframe={wireframe} />
        <Plate position={[side * 0.2, 1.34, -0.26]} size={[0.18, 0.04, 0.02]} rotation={[0, 0, side * 0.16]} {...glow} />
      </group>)}
      <group name="NR_head" position={[0, 1.72, 0]}>
        <mesh><sphereGeometry args={[0.26, 18, 14]} /><meshStandardMaterial color={style.armor} metalness={0.74} roughness={0.28} wireframe={wireframe} /></mesh>
        <Plate position={[0, 0.02, -0.22]} size={[0.38, 0.12, 0.08]} color="#07131e" wireframe={wireframe} />
        <Plate position={[0, 0.02, -0.27]} size={[0.32, 0.045, 0.02]} {...glow} />
        <Plate position={[0, 0.22, 0]} size={[0.05, 0.03, 0.3]} {...glow} />
      </group>
      {[-1, 1].map(side => <group key={side} name={side < 0 ? 'NR_arm_L' : 'NR_arm_R'} position={[side * 0.42, 1.4, 0]}>
        <mesh><sphereGeometry args={[0.13, 12, 10]} /><meshStandardMaterial color="#152231" metalness={0.7} roughness={0.32} wireframe={wireframe} /></mesh>
        <mesh position={[side * 0.02, -0.2, 0]}><capsuleGeometry args={[0.09, 0.22, 6, 12]} /><meshStandardMaterial color={style.trim} metalness={0.7} roughness={0.3} wireframe={wireframe} /></mesh>
        <mesh position={[0, -0.42, 0]}><sphereGeometry args={[0.08, 10, 8]} /><meshStandardMaterial color="#172332" wireframe={wireframe} /></mesh>
        <mesh position={[0, -0.62, -0.02]}><capsuleGeometry args={[0.085, 0.2, 6, 12]} /><meshStandardMaterial {...plate} metalness={0.75} roughness={0.3} /></mesh>
        <Plate position={[0, -0.5, -0.14]} size={[0.06, 0.16, 0.02]} {...glow} />
        {side > 0 && <group position={[0, -0.78, -0.08]}><WeaponModel weapon={weapon} wireframe={wireframe} /></group>}
      </group>)}
      {[-1, 1].map(side => <group key={side} name={side < 0 ? 'NR_leg_L' : 'NR_leg_R'} position={[side * 0.18, 0.86, 0]}>
        <mesh position={[0, -0.16, 0]}><capsuleGeometry args={[0.11, 0.22, 6, 12]} /><meshStandardMaterial {...plate} metalness={0.75} roughness={0.3} /></mesh>
        <group name={side < 0 ? 'NR_knee_L' : 'NR_knee_R'} position={[0, -0.36, 0]}>
          <mesh><sphereGeometry args={[0.1, 10, 8]} /><meshStandardMaterial color="#172332" wireframe={wireframe} /></mesh>
          <mesh position={[0, -0.22, 0]}><capsuleGeometry args={[0.1, 0.2, 6, 12]} /><meshStandardMaterial {...plate} metalness={0.75} roughness={0.3} /></mesh>
          <Plate position={[0, -0.4, -0.06]} size={[0.24, 0.12, 0.4]} color="#1b2b39" wireframe={wireframe} />
          <Plate position={[0, -0.47, -0.06]} size={[0.25, 0.025, 0.42]} {...glow} />
        </group>
      </group>)}
    </group>
  </group>;
}

function WeaponSocket({ scene, weapon, wireframe }: { scene: THREE.Object3D; weapon: WeaponId; wireframe: boolean }) {
  const gun = useRef<THREE.Group>(null);
  const inverse = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const socket = scene.getObjectByName('NR_weapon') || scene.getObjectByName('Hand.R');
    const mesh = gun.current;
    if (!socket || !mesh?.parent) return;
    socket.updateWorldMatrix(true, false);
    mesh.parent.updateWorldMatrix(true, false);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(inverse.copy(mesh.parent.matrixWorld).invert().multiply(socket.matrixWorld));
  });
  return <group ref={gun}><group scale={0.7} rotation={[-Math.PI / 2, Math.PI, 0]}><WeaponModel weapon={weapon} wireframe={wireframe} /></group></group>;
}

function GltfRunner({ style, weapon = 'blaster', wireframe = false, modelRef, pose }: RunnerProps) {
  const root = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, RUNNER_GLB);
  const scene = useMemo(() => {
    const copy = cloneSkinned(gltf.scene) as THREE.Group;
    copy.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material => material.clone()) : mesh.material.clone();
    });
    return copy;
  }, [gltf]);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const clips = useMemo(() => {
    const byName = Object.fromEntries(gltf.animations.map(clip => [clip.name, clip]));
    return {
      idle: byName.idle ?? byName.Idle,
      run: byName.run ?? byName.Running,
      jump: byName.jump ?? byName.Jump,
      aim: byName.aim ?? byName.Punch,
    } as Record<string, THREE.AnimationClip | undefined>;
  }, [gltf.animations]);
  const current = useRef('');
  const action = useRef<THREE.AnimationAction | null>(null);

  useLayoutEffect(() => {
    scene.scale.set(1, 1, 1);
    scene.position.set(0, 0, 0);
    scene.rotation.set(0, 0, 0);
    applyRunnerFinish(scene, style, wireframe);
    if (root.current) {
      root.current.userData.clips = (['idle', 'run', 'jump', 'aim'] as const)
        .map(name => {
          const source = clips[name];
          if (!source) return null;
          const clip = source.clone();
          clip.name = name;
          return clip;
        })
        .filter((clip): clip is THREE.AnimationClip => Boolean(clip));
    }
    if (modelRef) modelRef.current = root.current;
    return () => { if (modelRef) modelRef.current = null; };
  }, [modelRef, scene, style, wireframe, clips]);

  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(scene); }, [mixer, scene]);

  useFrame((_, dt) => {
    const motion = pose().motion;
    const clip = clips[motion];
    if (clip && motion !== current.current) {
      const next = mixer.clipAction(clip);
      next.reset();
      next.setLoop(motion === 'jump' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = motion === 'jump';
      next.fadeIn(current.current ? 0.14 : 0).play();
      action.current?.fadeOut(0.14);
      action.current = next;
      current.current = motion;
    }
    mixer.update(Math.min(dt, 0.05));
  });

  return <group ref={root} name="NEON_RUSH_RUNNER" scale={0.78}>
    <primitive object={scene} />
    <WeaponSocket scene={scene} weapon={weapon} wireframe={wireframe} />
  </group>;
}

class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function RunnerModel(props: RunnerProps) {
  const fallback = <ProceduralRunner {...props} />;
  if (!hasBundledRunner) return fallback;
  return <ModelBoundary fallback={fallback}>
    <Suspense fallback={fallback}>
      <GltfRunner {...props} />
    </Suspense>
  </ModelBoundary>;
}

if (hasBundledRunner) useLoader.preload(GLTFLoader, RUNNER_GLB);
