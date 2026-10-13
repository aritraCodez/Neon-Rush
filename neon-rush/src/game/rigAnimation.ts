import * as THREE from 'three';

export type RigMotion = 'idle' | 'run' | 'jump' | 'aim';
export const RIG_JOINTS = ['NR_body', 'NR_head', 'NR_arm_L', 'NR_arm_R', 'NR_leg_L', 'NR_leg_R', 'NR_knee_L', 'NR_knee_R'] as const;
export type RigJoints = Record<typeof RIG_JOINTS[number], THREE.Object3D>;

export function getRigJoints(root: THREE.Object3D): RigJoints {
  return Object.fromEntries(RIG_JOINTS.map(name => [name, root.getObjectByName(name)!])) as RigJoints;
}

// The same pose function drives gameplay, the showroom, and exported animation clips.
export function poseRig(joints: RigJoints, motion: RigMotion, time: number) {
  const run = motion === 'run';
  const jump = motion === 'jump' ? Math.max(0, Math.sin(time * Math.PI)) : 0;
  const stride = run ? Math.sin(time * Math.PI * 4) * 0.78 : 0;
  const breathe = motion === 'idle' ? Math.sin(time * Math.PI) * 0.014 : 0;
  joints.NR_body.position.y = run ? Math.abs(Math.cos(time * Math.PI * 4)) * 0.055 : jump * 0.6 + breathe;
  joints.NR_body.rotation.set(run ? -0.1 : 0, 0, run ? stride * 0.045 : 0);
  joints.NR_head.rotation.set(run ? 0.1 : 0, motion === 'idle' ? Math.sin(time * Math.PI * 0.5) * 0.12 : 0, 0);
  joints.NR_leg_L.rotation.x = stride - jump * 0.65;
  joints.NR_leg_R.rotation.x = -stride + jump * 0.4;
  joints.NR_knee_L.rotation.x = run ? Math.max(0, -stride) * 1.2 : jump * 0.9;
  joints.NR_knee_R.rotation.x = run ? Math.max(0, stride) * 1.2 : jump * 0.6;
  joints.NR_arm_L.rotation.set(-stride * 0.7 - jump * 0.9, 0, -0.09);
  joints.NR_arm_R.rotation.set(motion === 'aim' ? 1.12 : stride * 0.7 - jump * 0.6, 0, 0.09);
}

export function createRigClips(root: THREE.Object3D): THREE.AnimationClip[] {
  const joints = getRigJoints(root);
  return (['idle', 'run', 'jump', 'aim'] as RigMotion[]).map(motion => {
    const duration = motion === 'idle' ? 4 : motion === 'jump' ? 2 : 1;
    const times: number[] = [];
    const rotations = RIG_JOINTS.map(() => [] as number[]);
    const positions: number[] = [];
    for (let frame = 0; frame <= duration * 30; frame++) {
      const time = frame / 30;
      times.push(time);
      poseRig(joints, motion, time);
      RIG_JOINTS.forEach((name, index) => rotations[index].push(...joints[name].quaternion.toArray()));
      positions.push(...joints.NR_body.position.toArray());
    }
    const tracks: THREE.KeyframeTrack[] = RIG_JOINTS.map((name, index) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, rotations[index]));
    tracks.push(new THREE.VectorKeyframeTrack('NR_body.position', times, positions));
    return new THREE.AnimationClip(motion, duration, tracks);
  });
}
