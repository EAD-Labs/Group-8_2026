import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  RoundedBox,
  Text,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

type Speaker = "teacher" | "maya" | "arjun";

const C = {
  wall: "#dcd4c0",
  wallLower: "#b9ae95",
  trim: "#8d7f63",
  floor: "#9a6f49",
  floorAlt: "#8a6240",
  rug: "#3f6b60",
  wood: "#b08455",
  woodDark: "#7d5a37",
  metal: "#55687a",
  dark: "#273138",
  board: "#16352e",
  boardFrame: "#6f5436",
  chalk: "#f6f3e9",
  window: "#bfe4e8",
  sky: "#d9f0f2",
  glow: "#fff3d4",
  teacher: "#2f6f71",
  maya: "#d06a52",
  arjun: "#d7a83e",
  poster: "#e8dfc8",
  plant: "#4a7d64",
  plantPot: "#a85f41",
  book: ["#b5543f", "#2f6f71", "#d7a83e", "#4a7d64", "#7a5aa0", "#c2724a"],
};

const A = "CharacterArmature|";
const SEATS: Record<Speaker, { cam: THREE.Vector3; look: THREE.Vector3 }> = {
  teacher: { cam: new THREE.Vector3(0, 3.0, 7.4), look: new THREE.Vector3(0, 2.5, -4.4) },
  // Students face the board, so their cameras sit on the board side looking back at them,
  // high enough that the desk in front never crosses the sight line.
  maya: { cam: new THREE.Vector3(-0.6, 2.6, -2.75), look: new THREE.Vector3(-2.8, 1.25, 0.55) },
  arjun: { cam: new THREE.Vector3(0.6, 2.6, -2.75), look: new THREE.Vector3(2.8, 1.25, 0.55) },
};

function Avatar({
  url,
  position,
  rotation = 0,
  scale = 1,
  speaking,
  faceTo,
}: {
  url: string;
  position: [number, number, number];
  rotation?: number;
  scale?: number;
  speaking: boolean;
  faceTo?: [number, number];
}) {
  const { scene, animations } = useGLTF(url);
  const model = useMemo(() => {
    const c = cloneSkinned(scene);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const idle = actions[A + "Idle_Neutral"] ?? actions[A + "Idle"];
    if (!speaking) {
      idle?.reset().fadeIn(0.5).play();
      return () => {
        idle?.fadeOut(0.5);
      };
    }
    // The character pack has no talking clip, so a slow Interact/Idle blend stands in for gesturing.
    const seq = [A + "Interact", A + "Idle_Neutral"];
    let i = 0;
    let cur = actions[seq[0]!] ?? idle;
    cur?.reset().fadeIn(0.45).play();
    const t = window.setInterval(() => {
      const next = actions[seq[++i % seq.length]!];
      if (next && next !== cur) {
        cur?.fadeOut(0.55);
        next.reset().fadeIn(0.55).play();
        cur = next;
      }
    }, 3400);
    return () => {
      window.clearInterval(t);
      cur?.fadeOut(0.5);
    };
  }, [speaking, actions]);

  // A gentle breathing bob keeps the low-poly characters from reading as statues.
  const bob = useRef(Math.random() * Math.PI * 2);
  useFrame((_, delta) => {
    bob.current += delta * (speaking ? 2.1 : 1.25);
    if (group.current)
      group.current.position.y = position[1] + Math.sin(bob.current) * (speaking ? 0.022 : 0.012);
  });

  const rotY = faceTo ? Math.atan2(faceTo[0] - position[0], faceTo[1] - position[2]) : rotation;
  return (
    <group>
      <group ref={group} position={position} rotation-y={rotY} scale={scale}>
        <primitive object={model} />
      </group>
      {speaking && <SpeakerRing position={position} />}
    </group>
  );
}

function SpeakerRing({ position }: { position: [number, number, number] }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const pulse = 0.78 + Math.sin(clock.elapsedTime * 2.6) * 0.07;
    if (ring.current) {
      ring.current.scale.setScalar(pulse);
      (ring.current.material as THREE.MeshBasicMaterial).opacity =
        0.3 + Math.sin(clock.elapsedTime * 2.6) * 0.1;
    }
  });
  return (
    <mesh ref={ring} position={[position[0], 0.03, position[2]]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.52, 0.72, 40]} />
      <meshBasicMaterial color={C.glow} transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}

["/models/teacher.glb", "/models/maya.glb", "/models/arjun.glb"].forEach((u) => useGLTF.preload(u));

function Desk({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox
        args={[1.8, 0.1, 0.72]}
        radius={0.03}
        position={[0, 0.78, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={C.wood} roughness={0.62} />
      </RoundedBox>
      <RoundedBox args={[1.8, 0.06, 0.2]} radius={0.02} position={[0, 0.72, 0.3]} castShadow>
        <meshStandardMaterial color={C.woodDark} roughness={0.7} />
      </RoundedBox>
      {[-0.78, 0.78].flatMap((x) =>
        [-0.24, 0.24].map((z, i) => (
          <mesh key={`${x}-${i}`} position={[x, 0.39, z]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.78, 8]} />
            <meshStandardMaterial color={C.metal} metalness={0.55} roughness={0.42} />
          </mesh>
        )),
      )}
      <mesh position={[-0.45, 0.84, 0.05]} rotation-x={-Math.PI / 2} castShadow>
        <boxGeometry args={[0.3, 0.42, 0.02]} />
        <meshStandardMaterial color={C.chalk} roughness={0.92} />
      </mesh>
      <mesh position={[0.3, 0.85, 0.02]} rotation-z={0.5} castShadow>
        <cylinderGeometry args={[0.016, 0.016, 0.2, 6]} />
        <meshStandardMaterial color={C.arjun} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Chair({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox args={[0.5, 0.07, 0.48]} radius={0.03} position={[0, 0.45, 0]} castShadow>
        <meshStandardMaterial color={C.woodDark} roughness={0.7} />
      </RoundedBox>
      <RoundedBox args={[0.5, 0.5, 0.06]} radius={0.03} position={[0, 0.72, -0.22]} castShadow>
        <meshStandardMaterial color={C.woodDark} roughness={0.7} />
      </RoundedBox>
      {[
        [-0.2, -0.2],
        [0.2, -0.2],
        [-0.2, 0.2],
        [0.2, 0.2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x!, 0.22, z!]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.45, 6]} />
          <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function Bookshelf({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 2.2, 0.42]} />
        <meshStandardMaterial color={C.woodDark} roughness={0.8} />
      </mesh>
      {[0.45, 1.0, 1.55].map((y, shelf) => (
        <group key={y}>
          <mesh position={[0, y - 0.04, 0.02]}>
            <boxGeometry args={[1.56, 0.04, 0.38]} />
            <meshStandardMaterial color={C.wood} roughness={0.75} />
          </mesh>
          {Array.from({ length: 9 }).map((_, i) => {
            const h = 0.3 + ((i * 7 + shelf * 3) % 5) * 0.035;
            return (
              <mesh key={i} position={[-0.66 + i * 0.16, y + h / 2, 0.04]} castShadow>
                <boxGeometry args={[0.12, h, 0.3]} />
                <meshStandardMaterial
                  color={C.book[(i + shelf * 2) % C.book.length] ?? C.wood}
                  roughness={0.85}
                />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function Poster({
  position,
  rotation = 0,
  title,
  accent,
}: {
  position: [number, number, number];
  rotation?: number;
  title: string;
  accent: string;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh castShadow>
        <boxGeometry args={[1.5, 1.05, 0.04]} />
        <meshStandardMaterial color={C.poster} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.36, 0.03]}>
        <boxGeometry args={[1.26, 0.16, 0.01]} />
        <meshStandardMaterial color={accent} />
      </mesh>
      <Text
        position={[0, 0.36, 0.05]}
        fontSize={0.11}
        color={C.chalk}
        anchorX="center"
        anchorY="middle"
        maxWidth={1.2}
      >
        {title}
      </Text>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.1, 0.1 - i * 0.17, 0.03]}>
          <boxGeometry args={[i % 2 ? 0.78 : 1.02, 0.035, 0.01]} />
          <meshStandardMaterial color={C.trim} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function WallClock({ position }: { position: [number, number, number] }) {
  const hand = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (hand.current) hand.current.rotation.z = -clock.elapsedTime * 0.22;
  });
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.07, 28]} rotation-x={Math.PI / 2} />
        <meshStandardMaterial color={C.dark} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <circleGeometry args={[0.22, 28]} />
        <meshStandardMaterial color={C.chalk} roughness={0.85} />
      </mesh>
      <mesh ref={hand} position={[0, 0, 0.055]}>
        <boxGeometry args={[0.025, 0.16, 0.01]} />
        <meshStandardMaterial color={C.dark} />
      </mesh>
      <mesh position={[0, 0, 0.05]} rotation-z={1.1}>
        <boxGeometry args={[0.02, 0.11, 0.01]} />
        <meshStandardMaterial color={C.maya} />
      </mesh>
    </group>
  );
}

function CeilingLight({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 6.4, z]}>
      <mesh>
        <boxGeometry args={[2.4, 0.09, 0.5]} />
        <meshStandardMaterial color={C.chalk} emissive={C.glow} emissiveIntensity={0.85} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[2.5, 0.12, 0.6]} />
        <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.5} />
      </mesh>
      <pointLight position={[0, -0.5, 0]} intensity={9} distance={11} decay={2} color={C.glow} />
    </group>
  );
}

function DustMotes() {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(170 * 3);
    for (let i = 0; i < 170; i++) {
      p[i * 3] = (Math.random() - 0.5) * 13;
      p[i * 3 + 1] = Math.random() * 5 + 0.4;
      p[i * 3 + 2] = (Math.random() - 0.5) * 13;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (points.current) points.current.rotation.y = clock.elapsedTime * 0.016;
  });
  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.045}
        color={C.glow}
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function CameraRig({ speaker }: { speaker: Speaker }) {
  const { camera } = useThree();
  const look = useRef(SEATS.teacher.look.clone());
  useFrame((_, delta) => {
    const seat = SEATS[speaker];
    const k = 1 - Math.exp(-2.2 * Math.min(delta, 0.05));
    camera.position.lerp(seat.cam, k);
    look.current.lerp(seat.look, k);
    camera.lookAt(look.current);
  });
  return null;
}

function Room({ speaker, board }: { speaker: Speaker; board: string }) {
  const spot = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const at =
      speaker === "teacher"
        ? [0, 1.5, -3.2]
        : speaker === "maya"
          ? [-2.8, 1.4, 0.55]
          : [2.8, 1.4, 0.55];
    target.position.set(at[0]!, at[1]!, at[2]!);
    target.updateMatrixWorld();
    if (spot.current) spot.current.target = target;
  });

  return (
    <>
      <CameraRig speaker={speaker} />
      <color attach="background" args={[C.wall]} />
      <fog attach="fog" args={[C.wall, 17, 34]} />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={[C.sky, C.floor, 0.55]} />
      <directionalLight
        position={[-7, 9, 4]}
        intensity={1.35}
        color={C.glow}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <spotLight
        ref={spot}
        position={[0, 6, 3]}
        angle={0.58}
        penumbra={0.85}
        intensity={16}
        distance={16}
        color={C.glow}
      />
      <Environment>
        <Lightformer intensity={1.8} position={[0, 7, 0]} scale={[12, 12, 1]} />
        <Lightformer
          intensity={1.5}
          color={C.window}
          position={[-7, 4, 0]}
          rotation-y={Math.PI / 2}
          scale={[7, 5, 1]}
        />
      </Environment>

      {/* shell */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[18, 20]} />
        <meshStandardMaterial color={C.floor} roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 1.6]} receiveShadow>
        <planeGeometry args={[7.5, 6]} />
        <meshStandardMaterial color={C.rug} roughness={0.97} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 6.6, 0]}>
        <planeGeometry args={[18, 20]} />
        <meshStandardMaterial color={C.chalk} roughness={0.98} />
      </mesh>
      <mesh position={[0, 3.3, -5]} receiveShadow>
        <boxGeometry args={[18, 6.6, 0.2]} />
        <meshStandardMaterial color={C.wall} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.9, -4.88]} receiveShadow>
        <boxGeometry args={[18, 1.8, 0.06]} />
        <meshStandardMaterial color={C.wallLower} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.82, -4.86]}>
        <boxGeometry args={[18, 0.1, 0.09]} />
        <meshStandardMaterial color={C.trim} roughness={0.7} />
      </mesh>
      <mesh position={[-8.9, 3.3, 0]} receiveShadow>
        <boxGeometry args={[0.2, 6.6, 20]} />
        <meshStandardMaterial color={C.wall} roughness={0.95} />
      </mesh>
      <mesh position={[8.9, 3.3, 0]} receiveShadow>
        <boxGeometry args={[0.2, 6.6, 20]} />
        <meshStandardMaterial color={C.wall} roughness={0.95} />
      </mesh>

      {/* windows on the left wall */}
      {[-1.4, 2.4].map((z) => (
        <group key={z} position={[-8.76, 3.5, z]}>
          <mesh>
            <boxGeometry args={[0.08, 3.1, 2.5]} />
            <meshStandardMaterial color={C.sky} emissive={C.sky} emissiveIntensity={0.75} />
          </mesh>
          <mesh position={[0.06, 0, 0]}>
            <boxGeometry args={[0.05, 3.2, 0.1]} />
            <meshStandardMaterial color={C.trim} />
          </mesh>
          <mesh position={[0.06, 0, 0]}>
            <boxGeometry args={[0.05, 0.1, 2.6]} />
            <meshStandardMaterial color={C.trim} />
          </mesh>
          <mesh position={[0.07, 0, 0]}>
            <boxGeometry args={[0.04, 3.4, 2.8]} />
            <meshStandardMaterial color={C.trim} roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* chalkboard */}
      <RoundedBox
        args={[8.6, 3.5, 0.14]}
        radius={0.05}
        position={[0, 3.7, -4.84]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={C.boardFrame} roughness={0.78} />
      </RoundedBox>
      <mesh position={[0, 3.72, -4.74]} receiveShadow>
        <boxGeometry args={[8.1, 3.05, 0.06]} />
        <meshStandardMaterial color={C.board} roughness={0.96} />
      </mesh>
      <Text
        position={[0, 3.78, -4.69]}
        fontSize={0.36}
        maxWidth={7}
        lineHeight={1.3}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={C.chalk}
      >
        {board}
      </Text>
      <mesh position={[0, 2.06, -4.66]} castShadow>
        <boxGeometry args={[8.3, 0.09, 0.26]} />
        <meshStandardMaterial color={C.boardFrame} roughness={0.75} />
      </mesh>
      {[-0.8, -0.5, -0.2].map((x) => (
        <mesh key={x} position={[x, 2.14, -4.6]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.028, 0.028, 0.16, 7]} />
          <meshStandardMaterial color={C.chalk} roughness={0.95} />
        </mesh>
      ))}

      {/* wall fittings */}
      <Poster position={[5.2, 3.9, -4.82]} title="SCIENTIFIC METHOD" accent={C.teacher} />
      <Poster position={[-5.2, 3.9, -4.82]} title="ASK · TEST · REVISE" accent={C.maya} />
      <WallClock position={[0, 5.6, -4.78]} />
      <Bookshelf position={[7.4, 0, -3.4]} rotation={-Math.PI / 2} />
      <CeilingLight x={0} z={-2.4} />
      <CeilingLight x={0} z={2.4} />

      {/* door */}
      <mesh position={[8.74, 1.5, 3.4]}>
        <boxGeometry args={[0.12, 3, 1.3]} />
        <meshStandardMaterial color={C.woodDark} roughness={0.8} />
      </mesh>
      <mesh position={[8.66, 1.45, 3.9]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color={C.metal} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* teacher's desk + the class */}
      <group position={[0, 0, -3.95]}>
        <RoundedBox
          args={[2.5, 0.12, 0.9]}
          radius={0.04}
          position={[0, 0.82, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={C.wood} roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, 0.41, 0]} castShadow>
          <boxGeometry args={[2.3, 0.82, 0.78]} />
          <meshStandardMaterial color={C.woodDark} roughness={0.8} />
        </mesh>
        <mesh position={[0.78, 0.93, 0.1]} rotation-x={-0.35} castShadow>
          <boxGeometry args={[0.34, 0.02, 0.24]} />
          <meshStandardMaterial color={C.chalk} roughness={0.9} />
        </mesh>
      </group>
      <Avatar
        url="/models/teacher.glb"
        position={[0, 0, -3.2]}
        speaking={speaker === "teacher"}
        faceTo={[0, 6]}
      />

      <Desk position={[-2.8, 0, -0.2]} rotation={-0.05} />
      <Chair position={[-2.8, 0, 0.62]} rotation={Math.PI} />
      <Avatar
        url="/models/maya.glb"
        position={[-2.8, 0, 0.55]}
        scale={0.92}
        speaking={speaker === "maya"}
        faceTo={[0, -3.2]}
      />
      <Desk position={[2.8, 0, -0.2]} rotation={0.05} />
      <Chair position={[2.8, 0, 0.62]} rotation={Math.PI} />
      <Avatar
        url="/models/arjun.glb"
        position={[2.8, 0, 0.55]}
        scale={0.95}
        speaking={speaker === "arjun"}
        faceTo={[0, -3.2]}
      />

      <Desk position={[-2.7, 0, 3.1]} />
      <Chair position={[-2.7, 0, 3.92]} rotation={Math.PI} />
      <Avatar
        url="/models/arjun.glb"
        position={[-2.7, 0, 3.85]}
        scale={0.9}
        speaking={false}
        faceTo={[0, -3.2]}
      />
      <Desk position={[2.7, 0, 3.1]} />
      <Chair position={[2.7, 0, 3.92]} rotation={Math.PI} />
      <Avatar
        url="/models/maya.glb"
        position={[2.7, 0, 3.85]}
        scale={0.9}
        speaking={false}
        faceTo={[0, -3.2]}
      />
      <Desk position={[0, 0, 5.4]} />
      <Chair position={[0, 0, 6.2]} rotation={Math.PI} />

      {/* plants */}
      {[
        [-7.5, -2.2],
        [7.6, 4.6],
      ].map(([x, z]) => (
        <group key={`${x}`} position={[x!, 0, z!]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.38, 0.28, 0.6, 14]} />
            <meshStandardMaterial color={C.plantPot} roughness={0.85} />
          </mesh>
          <mesh position={[0, 1.15, 0]} castShadow>
            <sphereGeometry args={[0.68, 14, 11]} />
            <meshStandardMaterial color={C.plant} roughness={0.95} />
          </mesh>
          <mesh position={[0.3, 0.82, 0.18]} castShadow>
            <sphereGeometry args={[0.36, 12, 9]} />
            <meshStandardMaterial color={C.plant} roughness={0.95} />
          </mesh>
        </group>
      ))}

      <ContactShadows
        position={[0, 0.015, 0]}
        opacity={0.42}
        scale={20}
        blur={2.1}
        far={5}
        resolution={512}
        color="#2a1d10"
      />
      <DustMotes />
    </>
  );
}

export function ClassroomScene({ speaker, board }: { speaker: Speaker; board: string }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 3.0, 7.4], fov: 46 }}
      gl={{ antialias: true }}
    >
      <Suspense fallback={null}>
        <Room speaker={speaker} board={board} />
      </Suspense>
    </Canvas>
  );
}
