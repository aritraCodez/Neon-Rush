import { Component, Suspense, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { arenaWeapon } from '../../shared/arena.js';
import type { ArenaCover, ArenaMapSpec } from '../../shared/arena.js';
import type { ArenaSnapshot } from '../../shared/multiplayer';

class AssetBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ImportedProp({ asset, width, depth, height }: { asset: string; width: number; depth: number; height: number }) {
  const { scene } = useLoader(GLTFLoader, `/models/arena/${asset}.glb`);
  const model = useMemo(() => {
    const copy = scene.clone(true);
    const box = new THREE.Box3().setFromObject(copy), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const group = new THREE.Group(); group.add(copy);
    copy.position.set(-center.x, -box.min.y, -center.z);
    group.scale.set(width / Math.max(size.x, 0.01), height / Math.max(size.y, 0.01), depth / Math.max(size.z, 0.01));
    return group;
  }, [scene, width, depth, height]);
  return <primitive object={model} dispose={null} />;
}

function Cover({ box, index, color }: { box: ArenaCover; index: number; color: string }) {
  const height = box.height ?? (index === 4 ? 2.4 : 1.4);
  const fallback = <mesh position={[0, height / 2, 0]}><boxGeometry args={[box.width, height, box.depth]} /><meshStandardMaterial color="#2b3b52" metalness={0.6} roughness={0.36} /></mesh>;
  return <group position={[box.x, 0, box.z]}>
    {box.asset ? <AssetBoundary fallback={fallback}><Suspense fallback={fallback}><ImportedProp asset={box.asset} width={box.width} depth={box.depth} height={height} /></Suspense></AssetBoundary> : fallback}
    <mesh position={[0, 0.04, 0]}><boxGeometry args={[box.width + 0.08, 0.08, box.depth + 0.08]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} /></mesh>
  </group>;
}

export function ArenaEnvironment({ map }: { map: ArenaMapSpec }) {
  return <>
    {map.cover.map((box, index) => <Cover key={`${map.id}-${index}`} box={box} index={index} color={map.color} />)}
    {map.id === 'foundry' && <>
      {[-1, 1].map(side => <group key={side}>
        <group position={[side * (map.width / 2 + 3), 0, -10]}><AssetBoundary fallback={null}><Suspense fallback={null}><ImportedProp asset="antenna" width={2.5} depth={2.5} height={6} /></Suspense></AssetBoundary></group>
        <mesh position={[side * 4, 0.03, 0]}><boxGeometry args={[0.12, 0.04, map.depth - 4]} /><meshBasicMaterial color="#ffc558" transparent opacity={0.45} /></mesh>
      </group>)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><ringGeometry args={[4.6, 4.75, 48]} /><meshBasicMaterial color="#ffc558" /></mesh>
    </>}
  </>;
}

function Pickup({ id, room }: { id: string; room: RefObject<ArenaSnapshot> }) {
  const root = useRef<THREE.Group>(null), icon = useRef<THREE.Group>(null);
  const point = room.current.pickups.find(p => p.id === id)!;
  const color = point.kind === 'health' ? '#68ffb4' : point.kind === 'armor' ? '#a59aff' : arenaWeapon(point.kind).color;
  useFrame(({ clock }) => {
    if (!root.current || !icon.current) return;
    const state = room.current.pickups.find(p => p.id === id);
    root.current.visible = Boolean(state && state.availableIn <= 0);
    icon.current.position.y = 0.7 + Math.sin(clock.elapsedTime * 2.5) * 0.13;
    icon.current.rotation.y = clock.elapsedTime;
  });
  return <group ref={root} position={[point.x, 0, point.z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><ringGeometry args={[0.65, 0.8, 24]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    <group ref={icon} position={[0, 0.7, 0]}>
      {point.kind === 'health' ? <>
        <mesh><boxGeometry args={[0.22, 0.8, 0.22]} /><meshBasicMaterial color={color} /></mesh>
        <mesh><boxGeometry args={[0.8, 0.22, 0.22]} /><meshBasicMaterial color={color} /></mesh>
      </> : point.kind === 'armor' ? <mesh><octahedronGeometry args={[0.5]} /><meshBasicMaterial color={color} wireframe /></mesh> : <>
        <mesh><boxGeometry args={[0.25, 0.25, 0.95]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
        <mesh position={[0, -0.22, 0.2]}><boxGeometry args={[0.18, 0.4, 0.18]} /><meshStandardMaterial color="#ddeaff" /></mesh>
      </>}
    </group>
  </group>;
}
export function ArenaPickups({ room }: { room: RefObject<ArenaSnapshot> }) {
  return <>{room.current.pickups?.map(point => <Pickup key={`${room.current.mapId}-${point.id}`} id={point.id} room={room} />)}</>;
}
