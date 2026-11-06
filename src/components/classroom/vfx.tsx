import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { beamTexture, glowTexture } from "./textures";

type V3 = [number, number, number];

/** Floating dust motes drifting through a lit area. */
export function DustMotes({
  position,
  scale,
  count = 60,
  color = "#fff1c4",
  opacity = 0.55,
  size = 2.4,
}: {
  position: V3;
  scale: V3;
  count?: number;
  color?: string;
  opacity?: number;
  size?: number;
}) {
  if (count <= 0) return null;
  return (
    <Sparkles
      position={position}
      scale={scale}
      count={count}
      size={size}
      speed={0.12}
      opacity={opacity}
      color={color}
      noise={0.5}
    />
  );
}

/**
 * A soft shaft of light, e.g. sun through a window. `dir` is the direction the light travels; the
 * quad is `width` wide (along the window) and `length` long (along `dir`).
 */
export function LightShaft({
  from,
  dir,
  width = 1.7,
  length = 7,
  color = "#fff0c4",
  opacity = 0.2,
  flicker = 0.12,
  phase = 0,
}: {
  from: V3;
  dir: V3;
  width?: number;
  length?: number;
  color?: string;
  opacity?: number;
  flicker?: number;
  phase?: number;
}) {
  const tex = useMemo(() => beamTexture(), []);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const d = useMemo(() => new THREE.Vector3(...dir).normalize(), [dir]);
  const alongZ = Math.abs(d.z) > Math.abs(d.x);
  const center: V3 = [
    from[0] + (d.x * length) / 2,
    from[1] + (d.y * length) / 2,
    from[2] + (d.z * length) / 2,
  ];
  useFrame(({ clock }) => {
    if (mat.current)
      mat.current.opacity =
        opacity *
        (1 - flicker + flicker * (0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 0.6 + phase)));
  });
  const material = (
    <meshBasicMaterial
      ref={mat}
      map={tex}
      color={color}
      transparent
      opacity={opacity}
      blending={THREE.AdditiveBlending}
      depthWrite={false}
      side={THREE.DoubleSide}
      toneMapped={false}
    />
  );
  // beam running mostly along X (sun through a side window): width along Z, tilt about Z
  // beam running mostly along Z (projector): width along X, tilt about X
  return alongZ ? (
    <group position={center} rotation-x={Math.atan2(d.z, d.y)}>
      <mesh renderOrder={5}>
        <planeGeometry args={[width, length]} />
        {material}
      </mesh>
    </group>
  ) : (
    <group position={center} rotation-z={Math.atan2(-d.x, d.y)}>
      <mesh rotation-y={Math.PI / 2} renderOrder={5}>
        <planeGeometry args={[width, length]} />
        {material}
      </mesh>
    </group>
  );
}

/** Soft glowing disc (lamp halo, screen bloom). Always faces the camera. */
export function Glow({
  position,
  size = 1.4,
  color = "#ffd9a0",
  opacity = 0.6,
}: {
  position: V3;
  size?: number;
  color?: string;
  opacity?: number;
}) {
  const tex = useMemo(() => glowTexture(), []);
  return (
    <sprite position={position} scale={[size, size, 1]} renderOrder={6}>
      <spriteMaterial
        map={tex}
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

/** A ring of light on the floor under whoever is speaking, pulsing gently. */
export function SpeakerSpot({
  position,
  active,
  color = "#ffd37a",
}: {
  position: V3;
  active: boolean;
  color?: string;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.SpotLight>(null);
  const k = useRef(0);
  useFrame(({ clock }, delta) => {
    k.current += ((active ? 1 : 0) - k.current) * Math.min(1, delta * 4);
    const t = clock.getElapsedTime();
    const pulse = 1 + 0.06 * Math.sin(t * 3);
    if (ring.current) {
      ring.current.scale.setScalar(pulse);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.75 * k.current;
    }
    if (halo.current) (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.22 * k.current;
    if (light.current) light.current.intensity = 14 * k.current;
  });
  return (
    <group position={[position[0], position[1] + 0.012, position[2]]}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} renderOrder={4}>
        <ringGeometry args={[0.5, 0.58, 56]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={halo} rotation-x={-Math.PI / 2} renderOrder={3}>
        <circleGeometry args={[0.95, 40]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <spotLight
        ref={light}
        position={[0, 4.2, 0.6]}
        angle={0.42}
        penumbra={0.9}
        intensity={0}
        distance={9}
        color={color}
      />
    </group>
  );
}

/** Cheap soft shadow under furniture and people (a dark radial blob on the floor). */
export function BlobShadow({
  position,
  size = [1, 1],
  opacity = 0.35,
}: {
  position: V3;
  size?: [number, number];
  opacity?: number;
}) {
  const tex = useMemo(() => glowTexture(), []);
  return (
    <mesh
      position={[position[0], position[1] + 0.006, position[2]]}
      rotation-x={-Math.PI / 2}
      renderOrder={1}
    >
      <planeGeometry args={size} />
      <meshBasicMaterial
        map={tex}
        color="#000000"
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
