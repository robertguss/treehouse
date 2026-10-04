import { useAnimations, useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { type JSX, useEffect, useMemo, useRef } from "react";
import {
  type AnimationClip,
  type BufferGeometry,
  Euler,
  type Group,
  type InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MODELS, type ModelId } from "./manifest.gen.ts";

// Models come from the shared library (library/models, served at /lib/models) and are
// referenced by typed ids from the generated manifest: never by file path.

export { MODELS, type ModelId };

export function modelInfo(id: ModelId): (typeof MODELS)[ModelId] {
  return MODELS[id];
}

export function preloadModels(ids: readonly ModelId[]): void {
  for (const id of ids) useGLTF.preload(MODELS[id].url, false, false);
}

export interface ModelOptions {
  /** Material name → color, for tinting (e.g. a character's shirt). */
  recolor?: Record<string, string> | undefined;
  shadows?: boolean;
}

/** A private copy of a model's scene, safe to place many times. */
export function useModel(
  id: ModelId,
  options: ModelOptions = {},
): { scene: Group; animations: AnimationClip[] } {
  const gltf = useGLTF(MODELS[id].url, false, false);
  const recolorKey = JSON.stringify(options.recolor ?? {});
  const shadows = options.shadows ?? true;
  const scene = useMemo(() => {
    const copy = cloneSkinned(gltf.scene) as Group;
    const recolor = JSON.parse(recolorKey) as Record<string, string>;
    copy.traverse((object: Object3D) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = shadows;
      object.receiveShadow = shadows;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const tinted = materials.map((material) => {
        const color = recolor[material.name];
        if (!color || !(material instanceof MeshStandardMaterial)) return material;
        const copyMaterial = material.clone();
        copyMaterial.color.set(color);
        return copyMaterial;
      });
      object.material = Array.isArray(object.material) ? tinted : tinted[0];
    });
    return copy;
  }, [gltf.scene, recolorKey, shadows]);
  return { scene, animations: gltf.animations };
}

type GroupProps = JSX.IntrinsicElements["group"];

export function Model({
  model,
  recolor,
  shadows,
  ...props
}: { model: ModelId } & ModelOptions & GroupProps) {
  const { scene } = useModel(model, { recolor, shadows: shadows ?? true });
  return (
    <group {...props}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * An animated model playing one clip at a time, cross-fading on change. Clip names come
 * from the manifest (e.g. "Idle", "Walk").
 */
export function AnimatedModel({
  model,
  clip,
  recolor,
  speed = 1,
  ...props
}: { model: ModelId; clip: string; speed?: number } & ModelOptions & GroupProps) {
  const group = useRef<Group>(null);
  const { scene, animations } = useModel(model, { recolor });
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const action = actions[clip] ?? actions[findClip(Object.keys(actions), clip) ?? ""];
    if (!action) return;
    action.reset().setEffectiveTimeScale(speed).fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, clip, speed]);

  return (
    <group ref={group} {...props}>
      <primitive object={scene} />
    </group>
  );
}

/** Finds a clip by suffix, since packs name them like "CharacterArmature|Walk". */
export function findClip(names: readonly string[], wanted: string): string | undefined {
  const lower = wanted.toLowerCase();
  return (
    names.find((name) => name.toLowerCase() === lower) ??
    names.find((name) => name.toLowerCase().endsWith(`|${lower}`)) ??
    names.find((name) => name.toLowerCase().includes(lower))
  );
}

export interface Placement {
  x: number;
  z: number;
  y?: number;
  scale?: number;
  ry?: number;
}

/**
 * Many copies of one model in a few draw calls (one InstancedMesh per mesh in the model).
 * Use for scenery, crops, and anything repeated. onClick receives the placement index.
 */
export function ModelInstances({
  model,
  placements,
  castShadow = true,
  onClick,
}: {
  model: ModelId;
  placements: readonly Placement[];
  castShadow?: boolean;
  onClick?: (index: number, event: ThreeEvent<MouseEvent>) => void;
}) {
  const gltf = useGLTF(MODELS[model].url, false, false);
  const parts = useMemo(() => {
    const found: { geometry: BufferGeometry; material: Material | Material[] }[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((object: Object3D) => {
      if (!(object instanceof Mesh)) return;
      const geometry = (object.geometry as BufferGeometry).clone();
      geometry.applyMatrix4(object.matrixWorld);
      found.push({ geometry, material: object.material as Material | Material[] });
    });
    return found;
  }, [gltf.scene]);

  return (
    <>
      {parts.map((part, index) => (
        <InstancedPart
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are fixed per model.
          key={index}
          geometry={part.geometry}
          material={part.material}
          placements={placements}
          castShadow={castShadow}
          onClick={onClick}
        />
      ))}
    </>
  );
}

const tmpMatrix = new Matrix4();
const tmpPosition = new Vector3();
const tmpQuaternion = new Quaternion();
const tmpScale = new Vector3();
const tmpEuler = new Euler();

function InstancedPart({
  geometry,
  material,
  placements,
  castShadow,
  onClick,
}: {
  geometry: BufferGeometry;
  material: Material | Material[];
  placements: readonly Placement[];
  castShadow: boolean;
  onClick: ((index: number, event: ThreeEvent<MouseEvent>) => void) | undefined;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    placements.forEach((placement, index) => {
      tmpPosition.set(placement.x, placement.y ?? 0, placement.z);
      tmpQuaternion.setFromEuler(tmpEuler.set(0, placement.ry ?? 0, 0));
      const scale = placement.scale ?? 1;
      tmpScale.set(scale, scale, scale);
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
      instanced.setMatrixAt(index, tmpMatrix);
    });
    instanced.count = placements.length;
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [placements]);

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, Math.max(1, placements.length)]}
      castShadow={castShadow}
      receiveShadow
      {...(onClick && {
        onClick: (event: ThreeEvent<MouseEvent>) => {
          if (event.instanceId !== undefined) onClick(event.instanceId, event);
        },
      })}
    />
  );
}
