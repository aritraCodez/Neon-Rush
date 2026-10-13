import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RunnerAppearance } from '../game/runnerStyle';
import type { WeaponId } from '../game/weapons';
import { weaponById } from '../game/weapons';
import { getRigJoints, poseRig } from '../game/rigAnimation';
import type { RigJoints, RigMotion } from '../game/rigAnimation';

type Vec3 = [number, number, number];
function Plate({ position, size, color, rotation, glow = false, wireframe = false }: { position: Vec3; size: Vec3; color: string; rotation?: Vec3; glow?: boolean; wireframe?: boolean }) {
  return <mesh position={position} rotation={rotation}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} metalness={glow ? 0.25 : 0.65} roughness={glow ? 0.32 : 0.38} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 2.2 : 0} wireframe={wireframe} />
  </mesh>;
}

export function WeaponModel({ weapon, wireframe = false }: { weapon: WeaponId; wireframe?: boolean }) {
  const spec = weaponById(weapon);
  const long = weapon === 'laser' || weapon === 'pulse';
  const length = long ? 0.88 : weapon === 'shotgun' ? 0.65 : 0.4;
  return <group name="NR_weapon" rotation={[-Math.PI / 2, 0, 0]}>
    <Plate position={[0, 0, -length / 2]} size={[weapon === 'shotgun' ? 0.23 : 0.17, 0.2, length]} color="#202937" wireframe={wireframe} />
    <Plate position={[0, -0.15, -0.08]} size={[0.12, 0.24, 0.14]} rotation={[0.2, 0, 0]} color="#101823" wireframe={wireframe} />
    <Plate position={[0, 0.105, -length / 2]} size={[0.06, 0.025, length * 0.8]} color={spec.color} glow wireframe={wireframe} />
    {(weapon === 'shotgun' ? [-0.075, 0.075] : [0]).map(x => <mesh key={x} position={[x, 0, -length - 0.04]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.057, 0.065, 0.2, 8]} /><meshStandardMaterial color="#9eaeb9" metalness={0.8} roughness={0.28} wireframe={wireframe} />
    </mesh>)}
    {long && [0, 1, 2, 3].map(i => <Plate key={i} position={[0, 0, -0.25 - i * 0.13]} size={[0.19, 0.22, 0.035]} color={spec.color} glow wireframe={wireframe} />)}
  </group>;
}

export function RunnerModel({ style, weapon = 'blaster', wireframe = false, modelRef, pose }: {
  style: RunnerAppearance; weapon?: WeaponId; wireframe?: boolean; modelRef?: RefObject<THREE.Group | null>;
  pose: () => { motion: RigMotion; time: number };
}) {
  const root = useRef<THREE.Group>(null);
  const joints = useRef<RigJoints | null>(null);
  useLayoutEffect(() => {
    if (root.current) joints.current = getRigJoints(root.current);
    if (modelRef) modelRef.current = root.current;
    return () => { if (modelRef) modelRef.current = null; };
  }, [modelRef]);
  useFrame(() => { const state = pose(); if (joints.current) poseRig(joints.current, state.motion, state.time); });
  const plate = { color: style.armor, wireframe };
  const glow = { color: style.color, glow: true, wireframe };
  return <group ref={root} name="NEON_RUSH_RUNNER">
    <group name="NR_body">
      <Plate position={[0, 1.21, 0]} size={[0.61, 0.6, 0.35]} {...plate} />
      <Plate position={[0, 0.87, 0]} size={[0.44, 0.2, 0.3]} color="#1c2935" wireframe={wireframe} />
      {[-1, 1].map(side => <group key={side}>
        <Plate position={[side * 0.18, 1.34, -0.2]} size={[0.3, 0.28, 0.1]} rotation={[0, 0, side * 0.16]} color={style.trim} wireframe={wireframe} />
        <Plate position={[side * 0.18, 1.31, -0.26]} size={[0.21, 0.038, 0.018]} rotation={[0, 0, side * 0.16]} {...glow} />
        <Plate position={[side * 0.23, 1.08, -0.19]} size={[0.11, 0.19, 0.08]} rotation={[0, 0, side * -0.2]} color="#243442" wireframe={wireframe} />
        <mesh position={[side * 0.18, 1.27, 0.29]}><cylinderGeometry args={[0.105, 0.075, 0.46, 8]} /><meshStandardMaterial color="#263747" metalness={0.7} roughness={0.35} wireframe={wireframe} /></mesh>
        <Plate position={[side * 0.18, 1.25, 0.39]} size={[0.045, 0.27, 0.02]} {...glow} />
      </group>)}
      <mesh position={[0, 1.19, -0.205]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 0.06, 6]} /><meshStandardMaterial color={style.color} emissive={style.color} emissiveIntensity={2.4} wireframe={wireframe} /></mesh>
      <group name="NR_head" position={[0, 1.74, 0]}>
        <mesh rotation={[0, Math.PI / 8, 0]}><cylinderGeometry args={[0.245, 0.28, 0.43, 8]} /><meshStandardMaterial {...plate} metalness={0.7} roughness={0.3} /></mesh>
        <Plate position={[0, 0.035, -0.245]} size={[0.4, 0.14, 0.06]} color="#07131e" wireframe={wireframe} />
        <Plate position={[0, 0.035, -0.28]} size={[0.35, 0.045, 0.016]} {...glow} />
        <Plate position={[0, -0.12, -0.235]} size={[0.2, 0.1, 0.08]} color={style.trim} wireframe={wireframe} />
        <Plate position={[0, 0.235, 0]} size={[0.055, 0.028, 0.34]} {...glow} />
        {[-1, 1].map(side => <mesh key={side} position={[side * 0.27, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.075, 0.075, 0.075, 8]} /><meshStandardMaterial color={style.trim} metalness={0.65} roughness={0.32} wireframe={wireframe} /></mesh>)}
      </group>
      {[-1, 1].map(side => <group key={side} name={side < 0 ? 'NR_arm_L' : 'NR_arm_R'} position={[side * 0.43, 1.42, 0]}>
        <mesh><sphereGeometry args={[0.14, 10, 8]} /><meshStandardMaterial color="#152231" metalness={0.7} roughness={0.35} wireframe={wireframe} /></mesh>
        <Plate position={[side * 0.04, 0.015, 0]} size={[0.25, 0.23, 0.34]} rotation={[0, 0, side * 0.2]} color={style.trim} wireframe={wireframe} />
        <Plate position={[side * 0.13, 0.02, -0.05]} size={[0.025, 0.11, 0.22]} {...glow} />
        <Plate position={[0, -0.22, 0]} size={[0.16, 0.27, 0.19]} {...plate} />
        <mesh position={[0, -0.38, 0]}><sphereGeometry args={[0.085, 8, 6]} /><meshStandardMaterial color="#172332" wireframe={wireframe} /></mesh>
        <Plate position={[0, -0.52, -0.025]} size={[0.21, 0.25, 0.24]} {...plate} />
        <Plate position={[0, -0.5, -0.152]} size={[0.075, 0.17, 0.018]} {...glow} />
        <Plate position={[0, -0.7, -0.025]} size={[0.16, 0.13, 0.18]} color="#172332" wireframe={wireframe} />
        {side > 0 && <group position={[0, -0.7, -0.07]}><WeaponModel weapon={weapon} wireframe={wireframe} /></group>}
      </group>)}
      {[-1, 1].map(side => <group key={side} name={side < 0 ? 'NR_leg_L' : 'NR_leg_R'} position={[side * 0.2, 0.82, 0]}>
        <Plate position={[0, -0.16, 0]} size={[0.235, 0.33, 0.28]} {...plate} />
        <Plate position={[0, -0.17, -0.153]} size={[0.08, 0.23, 0.02]} color={style.trim} wireframe={wireframe} />
        <group name={side < 0 ? 'NR_knee_L' : 'NR_knee_R'} position={[0, -0.35, 0]}>
          <mesh><sphereGeometry args={[0.105, 8, 6]} /><meshStandardMaterial color="#172332" wireframe={wireframe} /></mesh>
          <Plate position={[0, 0, -0.08]} size={[0.21, 0.16, 0.12]} color={style.trim} wireframe={wireframe} />
          <Plate position={[0, -0.19, 0]} size={[0.21, 0.28, 0.25]} {...plate} />
          <Plate position={[0, -0.19, -0.135]} size={[0.06, 0.21, 0.025]} {...glow} />
          <Plate position={[0, -0.37, -0.08]} size={[0.25, 0.16, 0.43]} color="#1b2b39" wireframe={wireframe} />
          <Plate position={[0, -0.44, -0.08]} size={[0.26, 0.025, 0.44]} {...glow} />
        </group>
      </group>)}
    </group>
  </group>;
}
