import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { skyTexture } from "./textures";
import { Text } from "./Text3D";
import { BlobShadow } from "./vfx";

type V3 = [number, number, number];

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const Mat = ({
  color,
  rough = 0.7,
  metal = 0,
  emissive,
  ei = 0,
}: {
  color: string;
  rough?: number;
  metal?: number;
  emissive?: string;
  ei?: number;
}) => (
  <meshStandardMaterial
    color={color}
    roughness={rough}
    metalness={metal}
    {...(emissive ? { emissive, emissiveIntensity: ei } : {})}
  />
);

/** Student chair: moulded seat + back on a metal frame. Seat height 0.46 m. */
export function Chair({
  position,
  rotation = 0,
  color = "#3d5a80",
  frame = "#4a5560",
}: {
  position: V3;
  rotation?: number;
  color?: string;
  frame?: string;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox
        args={[0.46, 0.05, 0.44]}
        radius={0.02}
        position={[0, 0.45, 0]}
        castShadow
        receiveShadow
      >
        <Mat color={color} rough={0.55} />
      </RoundedBox>
      <RoundedBox
        args={[0.44, 0.34, 0.04]}
        radius={0.02}
        position={[0, 0.7, 0.2]}
        rotation-x={-0.08}
        castShadow
      >
        <Mat color={color} rough={0.55} />
      </RoundedBox>
      {[-0.19, 0.19].flatMap((x) =>
        [-0.17, 0.17].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.22, z]} castShadow>
            <cylinderGeometry args={[0.015, 0.015, 0.44, 8]} />
            <Mat color={frame} metal={0.6} rough={0.4} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Student desk with a shelf and things on it. Top at 0.76 m. */
export function SchoolDesk({
  position,
  rotation = 0,
  wood = "#b98a5a",
  frame = "#536874",
  items = true,
  seed = 1,
}: {
  position: V3;
  rotation?: number;
  wood?: string;
  frame?: string;
  items?: boolean;
  seed?: number;
}) {
  const r = useMemo(() => mulberry(seed * 977), [seed]);
  const stuff = useMemo(() => {
    const books = ["#c0504a", "#3b6fc4", "#e0a447", "#2f8a6e"];
    return {
      book: books[Math.floor(r() * 4)] ?? "#3b6fc4",
      note: r() > 0.4,
      bottle: r() > 0.5,
      x: (r() - 0.5) * 0.5,
    };
  }, [r]);
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox
        args={[1.5, 0.045, 0.64]}
        radius={0.015}
        position={[0, 0.755, 0]}
        castShadow
        receiveShadow
      >
        <Mat color={wood} rough={0.6} />
      </RoundedBox>
      <mesh position={[0, 0.5, 0.05]} castShadow>
        <boxGeometry args={[1.4, 0.03, 0.5]} />
        <Mat color={frame} metal={0.4} rough={0.6} />
      </mesh>
      {[-0.68, 0.68].flatMap((x) =>
        [-0.26, 0.26].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.38, z]} castShadow>
            <boxGeometry args={[0.045, 0.76, 0.045]} />
            <Mat color={frame} metal={0.55} rough={0.45} />
          </mesh>
        )),
      )}
      {items && (
        <>
          <mesh position={[stuff.x, 0.795, 0.02]} rotation-y={0.2} castShadow>
            <boxGeometry args={[0.24, 0.035, 0.32]} />
            <Mat color={stuff.book} rough={0.8} />
          </mesh>
          {stuff.note && (
            <mesh position={[-0.35, 0.782, 0.1]} rotation-y={-0.15}>
              <boxGeometry args={[0.21, 0.012, 0.29]} />
              <Mat color="#f3efe2" rough={0.9} />
            </mesh>
          )}
          {stuff.bottle && (
            <mesh position={[0.62, 0.9, -0.12]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 0.24, 14]} />
              <Mat color="#5bb7d6" rough={0.2} />
            </mesh>
          )}
          <mesh position={[0.3, 0.785, 0.18]} rotation-z={Math.PI / 2} rotation-y={0.6}>
            <cylinderGeometry args={[0.007, 0.007, 0.17, 6]} />
            <Mat color="#e0a447" />
          </mesh>
        </>
      )}
    </group>
  );
}

/** A student seat: desk in front, chair under the person. `position` = where the pelvis sits. */
export function Seat({
  position,
  wood,
  chair,
  seed = 1,
  items = true,
}: {
  position: V3;
  wood?: string;
  chair?: string;
  seed?: number;
  items?: boolean;
}) {
  return (
    <group>
      <BlobShadow
        position={[position[0], position[1], position[2] - 0.35]}
        size={[2.1, 2.6]}
        opacity={0.32}
      />
      <Chair
        position={[position[0], position[1], position[2]]}
        {...(chair ? { color: chair } : {})}
      />
      <SchoolDesk
        position={[position[0], position[1], position[2] - 0.92]}
        seed={seed}
        items={items}
        {...(wood ? { wood } : {})}
      />
    </group>
  );
}

export function RoundTable({
  position,
  radius = 0.95,
  top = "#c9b08a",
}: {
  position: V3;
  radius?: number;
  top?: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.06, 48]} />
        <Mat color={top} rough={0.45} />
      </mesh>
      <mesh position={[0, 0.37, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 0.74, 14]} />
        <Mat color="#2d3640" metal={0.6} rough={0.35} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.42, 0.45, 0.04, 28]} />
        <Mat color="#2d3640" metal={0.6} rough={0.35} />
      </mesh>
    </group>
  );
}

export function Plant({
  position,
  scale = 1,
  pot = "#253039",
  leaf = "#487963",
  seed = 3,
}: {
  position: V3;
  scale?: number;
  pot?: string;
  leaf?: string;
  seed?: number;
}) {
  const leaves = useMemo(() => {
    const r = mulberry(seed * 131);
    return Array.from({ length: 16 }, (_, i) => ({
      a: (i / 16) * 6.28 + r(),
      tilt: 0.45 + r() * 0.7,
      h: 0.8 + r() * 0.75,
      s: 0.7 + r() * 0.6,
      c: r(),
    }));
  }, [seed]);
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.22, 0.6, 18]} />
        <Mat color={pot} rough={0.6} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.27, 0.27, 0.04, 18]} />
        <Mat color="#3a2a1d" rough={1} />
      </mesh>
      {leaves.map((l, i) => (
        <mesh
          key={i}
          position={[Math.cos(l.a) * 0.14, 0.6 + l.h * 0.5, Math.sin(l.a) * 0.14]}
          rotation={[Math.sin(l.a) * l.tilt, l.a, Math.cos(l.a) * -l.tilt]}
          scale={[0.16 * l.s, 0.9 * l.s, 0.05]}
          castShadow
        >
          <sphereGeometry args={[0.5, 10, 8]} />
          <Mat color={l.c > 0.5 ? leaf : "#3d7a5b"} rough={0.7} />
        </mesh>
      ))}
    </group>
  );
}

export function Bookshelf({
  position,
  rotation = 0,
  width = 2.4,
  rows = 4,
  frame = "#6b4a2f",
  seed = 5,
}: {
  position: V3;
  rotation?: number;
  width?: number;
  rows?: number;
  frame?: string;
  seed?: number;
}) {
  const books = useMemo(() => {
    const r = mulberry(seed * 37);
    const cols = [
      "#c0504a",
      "#3b6fc4",
      "#e0a447",
      "#2f8a6e",
      "#8a63b8",
      "#e8e1d0",
      "#d9774f",
      "#4a7f9b",
    ];
    const out: Array<{ x: number; row: number; w: number; h: number; c: string; lean: number }> =
      [];
    for (let row = 0; row < rows; row++) {
      let x = -width / 2 + 0.1;
      while (x < width / 2 - 0.15) {
        const w = 0.04 + r() * 0.05;
        out.push({
          x: x + w / 2,
          row,
          w,
          h: 0.24 + r() * 0.12,
          c: cols[Math.floor(r() * cols.length)] ?? "#888",
          lean: r() > 0.93 ? 0.25 : 0,
        });
        x += w + 0.004;
        if (r() > 0.95) x += 0.18;
      }
    }
    return out;
  }, [seed, width, rows]);
  const h = rows * 0.42 + 0.1;
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, h / 2, -0.04]} castShadow receiveShadow>
        <boxGeometry args={[width, h, 0.28]} />
        <Mat color={frame} rough={0.8} />
      </mesh>
      {Array.from({ length: rows }, (_, i) => (
        <mesh key={i} position={[0, 0.06 + i * 0.42 + 0.02, 0.12]}>
          <boxGeometry args={[width - 0.06, 0.03, 0.06]} />
          <Mat color={frame} />
        </mesh>
      ))}
      {books.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, 0.09 + b.row * 0.42 + b.h / 2 + 0.02, 0.06]}
          rotation-z={b.lean}
          castShadow
        >
          <boxGeometry args={[b.w, b.h, 0.2]} />
          <Mat color={b.c} rough={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Wall clock whose hands show the real local time. */
export function WallClock({ position }: { position: V3 }) {
  const hour = useRef<THREE.Group>(null);
  const min = useRef<THREE.Group>(null);
  const sec = useRef<THREE.Group>(null);
  useFrame(() => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    if (sec.current) sec.current.rotation.z = -(s / 60) * Math.PI * 2;
    if (min.current) min.current.rotation.z = -(m / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(h / 12) * Math.PI * 2;
  });
  return (
    <group position={position}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.42, 0.42, 0.06, 40]} />
        <Mat color="#2a2f33" rough={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.035]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.38, 0.38, 0.02, 40]} />
        <Mat color="#f6f3ea" rough={0.6} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={i}
          position={[Math.sin((i / 12) * 6.283) * 0.32, Math.cos((i / 12) * 6.283) * 0.32, 0.05]}
          rotation-z={-(i / 12) * 6.283}
        >
          <boxGeometry args={[0.02, i % 3 === 0 ? 0.07 : 0.04, 0.01]} />
          <Mat color="#222" />
        </mesh>
      ))}
      <group ref={hour} position={[0, 0, 0.06]}>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.03, 0.22, 0.01]} />
          <Mat color="#1d1d1d" />
        </mesh>
      </group>
      <group ref={min} position={[0, 0, 0.07]}>
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[0.02, 0.32, 0.01]} />
          <Mat color="#1d1d1d" />
        </mesh>
      </group>
      <group ref={sec} position={[0, 0, 0.08]}>
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[0.008, 0.34, 0.008]} />
          <Mat color="#c0392b" />
        </mesh>
      </group>
    </group>
  );
}

export function CeilingFan({ position, speed = 2.2 }: { position: V3; speed?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (g.current) g.current.rotation.y += d * speed;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.7, 6]} />
        <Mat color="#444" />
      </mesh>
      <group ref={g}>
        <mesh>
          <cylinderGeometry args={[0.16, 0.16, 0.12, 16]} />
          <Mat color="#555" metal={0.5} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            position={[
              Math.cos((i * Math.PI) / 2) * 0.62,
              -0.02,
              Math.sin((i * Math.PI) / 2) * 0.62,
            ]}
            rotation-y={-(i * Math.PI) / 2}
            rotation-z={0.06}
          >
            <boxGeometry args={[1.0, 0.018, 0.2]} />
            <Mat color="#d7d2c4" rough={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Window: frame, sky/scenery behind the glass, sill and a soft glow. */
export function WindowUnit({
  position,
  rotation = 0,
  size = [1.7, 2.6],
  night = false,
  scenery = "trees",
  panes = 2,
}: {
  position: V3;
  rotation?: number;
  size?: [number, number];
  night?: boolean;
  scenery?: "trees" | "city";
  panes?: number;
}) {
  const sky = useMemo(() => skyTexture(night, scenery), [night, scenery]);
  const [w, h] = size;
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          {...(sky ? { map: sky } : { color: night ? "#26325e" : "#bfe3f3" })}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial
          color="#cfe9f2"
          transparent
          opacity={0.12}
          roughness={0.05}
          metalness={0}
        />
      </mesh>
      {[
        [0, h / 2 + 0.04, w + 0.16, 0.08],
        [0, -h / 2 - 0.04, w + 0.16, 0.08],
        [-w / 2 - 0.04, 0, 0.08, h],
        [w / 2 + 0.04, 0, 0.08, h],
      ].map(([x, y, bw, bh], i) => (
        <mesh key={i} position={[x ?? 0, y ?? 0, 0.02]} castShadow>
          <boxGeometry args={[bw ?? 0, bh ?? 0, 0.1]} />
          <Mat color="#f2efe6" rough={0.5} />
        </mesh>
      ))}
      {Array.from({ length: panes - 1 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + ((i + 1) * w) / panes, 0, 0.03]}>
          <boxGeometry args={[0.035, h, 0.05]} />
          <Mat color="#f2efe6" rough={0.5} />
        </mesh>
      ))}
      <mesh position={[0, h * 0.02, 0.03]}>
        <boxGeometry args={[w, 0.035, 0.05]} />
        <Mat color="#f2efe6" rough={0.5} />
      </mesh>
      <mesh position={[0, -h / 2 - 0.1, 0.12]} castShadow>
        <boxGeometry args={[w + 0.3, 0.05, 0.3]} />
        <Mat color="#ece7da" rough={0.5} />
      </mesh>
    </group>
  );
}

/** A curtain that sways very slightly, as if from an open window. */
export function Curtain({
  position,
  rotation = 0,
  width = 0.9,
  height = 2.9,
  color = "#d9c9a8",
  phase = 0,
}: {
  position: V3;
  rotation?: number;
  width?: number;
  height?: number;
  color?: string;
  phase?: number;
}) {
  const folds = 7;
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((m, i) => {
      if (m) m.rotation.x = Math.sin(t * 0.7 + phase + i * 0.6) * 0.025 * (0.3 + i / folds);
    });
  });
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, height / 2 + 0.05, 0]}>
        <cylinderGeometry args={[0.025, 0.025, width + 0.2, 8]} />
        <Mat color="#4a3d2c" metal={0.4} />
      </mesh>
      {Array.from({ length: folds }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          position={[-width / 2 + (i + 0.5) * (width / folds), 0, i % 2 ? 0.05 : -0.02]}
          castShadow
        >
          <boxGeometry args={[width / folds + 0.012, height, 0.035]} />
          <Mat color={color} rough={0.95} />
        </mesh>
      ))}
    </group>
  );
}

export function NoticeBoard({
  position,
  size = [1.5, 1.0],
  rotation = 0,
}: {
  position: V3;
  size?: [number, number];
  rotation?: number;
}) {
  const [w, h] = size;
  const papers = useMemo(() => {
    const r = mulberry(11);
    const cols = ["#fff6d6", "#cfe8ff", "#ffd9d2", "#dff3d4", "#f4e1ff"];
    return Array.from({ length: 7 }, (_, i) => ({
      x: (r() - 0.5) * (w - 0.35),
      y: (r() - 0.5) * (h - 0.3),
      rz: (r() - 0.5) * 0.25,
      c: cols[i % cols.length] ?? "#fff",
      s: 0.2 + r() * 0.12,
    }));
  }, [w, h]);
  return (
    <group position={position} rotation-y={rotation}>
      <mesh castShadow>
        <boxGeometry args={[w + 0.1, h + 0.1, 0.05]} />
        <Mat color="#6b4a2f" rough={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[w, h, 0.02]} />
        <Mat color="#b88a5a" rough={1} />
      </mesh>
      {papers.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0.05]} rotation-z={p.rz}>
          <boxGeometry args={[p.s, p.s * 1.25, 0.004]} />
          <Mat color={p.c} rough={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export function Poster({
  position,
  size = [0.7, 0.95],
  color = "#3b6fc4",
  accent = "#f3b13e",
  rotation = 0,
  label,
}: {
  position: V3;
  size?: [number, number];
  color?: string;
  accent?: string;
  rotation?: number;
  label?: string;
}) {
  const [w, h] = size;
  return (
    <group position={position} rotation-y={rotation}>
      <mesh>
        <boxGeometry args={[w + 0.04, h + 0.04, 0.02]} />
        <Mat color="#2a2f33" />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, h * 0.18, 0.014]}>
        <circleGeometry args={[w * 0.28, 24]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>
      {label && (
        <Text
          position={[0, -h * 0.3, 0.02]}
          fontSize={0.07}
          color="#ffffff"
          maxWidth={w - 0.1}
          bold
        >
          {label}
        </Text>
      )}
    </group>
  );
}

export function TeacherDesk({
  position,
  rotation = 0,
  wood = "#7a5530",
}: {
  position: V3;
  rotation?: number;
  wood?: string;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox
        args={[1.7, 0.06, 0.8]}
        radius={0.015}
        position={[0, 0.78, 0]}
        castShadow
        receiveShadow
      >
        <Mat color={wood} rough={0.5} />
      </RoundedBox>
      <mesh position={[-0.75, 0.38, 0]} castShadow>
        <boxGeometry args={[0.1, 0.76, 0.75]} />
        <Mat color={wood} rough={0.6} />
      </mesh>
      <mesh position={[0.75, 0.38, 0]} castShadow>
        <boxGeometry args={[0.1, 0.76, 0.75]} />
        <Mat color={wood} rough={0.6} />
      </mesh>
      <mesh position={[0, 0.5, -0.35]}>
        <boxGeometry args={[1.4, 0.5, 0.04]} />
        <Mat color={wood} rough={0.6} />
      </mesh>
      {/* laptop */}
      <mesh position={[-0.35, 0.815, 0.05]} castShadow>
        <boxGeometry args={[0.36, 0.015, 0.25]} />
        <Mat color="#aeb4bb" metal={0.6} rough={0.35} />
      </mesh>
      <mesh position={[-0.35, 0.93, -0.07]} rotation-x={-0.25} castShadow>
        <boxGeometry args={[0.36, 0.23, 0.01]} />
        <Mat color="#aeb4bb" metal={0.6} rough={0.35} />
      </mesh>
      <mesh position={[-0.35, 0.93, -0.062]} rotation-x={-0.25}>
        <planeGeometry args={[0.33, 0.2]} />
        <meshBasicMaterial color="#9fd6ff" toneMapped={false} />
      </mesh>
      {/* mug + papers */}
      <mesh position={[0.45, 0.855, 0.1]} castShadow>
        <cylinderGeometry args={[0.04, 0.035, 0.09, 14]} />
        <Mat color="#f3efe2" rough={0.4} />
      </mesh>
      <mesh position={[0.1, 0.815, 0.15]} rotation-y={0.3}>
        <boxGeometry args={[0.22, 0.01, 0.3]} />
        <Mat color="#f6f3ea" rough={0.9} />
      </mesh>
      <Chair position={[0, 0, 0.75]} rotation={Math.PI} color="#2f3f52" />
    </group>
  );
}
