import { useFrame } from "@react-three/fiber";
import { Line, RoundedBox } from "@react-three/drei";
import { Text } from "./Text3D";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { BoardPlan } from "./board-topic";

export type BoardTheme = {
  /** main text / line colour */
  ink: string;
  /** secondary text */
  dim: string;
  /** three accent colours used by nodes, bars, circles */
  accents: [string, string, string];
  /** warn / "miss" colour */
  warn: string;
};

// ---------- tiny helpers ----------
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const randn = (r: () => number) => {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function Label({
  children,
  position,
  size = 0.2,
  color,
  maxWidth = 3,
  align = "center",
}: {
  children: string;
  position: [number, number, number];
  size?: number;
  color: string;
  maxWidth?: number;
  align?: "left" | "center" | "right";
}) {
  return (
    <Text
      position={position}
      fontSize={size}
      maxWidth={maxWidth}
      textAlign={align}
      anchorX={align === "left" ? "left" : align === "right" ? "right" : "center"}
      anchorY="middle"
      color={color}
    >
      {children}
    </Text>
  );
}

function NodeBox({
  x,
  y = -0.15,
  label,
  color,
  width,
  refGroup,
}: {
  x: number;
  y?: number;
  label: string;
  color: string;
  width?: number;
  refGroup?: React.RefObject<THREE.Group | null>;
}) {
  const w = width ?? Math.min(2.2, Math.max(1.5, 0.45 + label.length * 0.1));
  return (
    <group {...(refGroup ? { ref: refGroup } : {})} position={[x, y, 0.08]}>
      <RoundedBox args={[w, 0.62, 0.06]} radius={0.08}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} />
      </RoundedBox>
      <Text
        position={[0, 0, 0.05]}
        fontSize={0.17}
        maxWidth={w - 0.14}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color="#ffffff"
      >
        {label}
      </Text>
    </group>
  );
}

// ---------- 1. flow (energy, generic, chemistry, biology, …) ----------
function FlowVisual({
  labels,
  theme,
  above,
  below,
  colors,
}: {
  labels: [string, string, string];
  theme: BoardTheme;
  above?: [string, string];
  below?: [string, string];
  colors?: [string, string, string];
}) {
  const xs = [-2.4, 0, 2.4];
  const cols = colors ?? theme.accents;
  const dots = useRef<Array<THREE.Mesh | null>>([]);
  const mid = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < 6; i++) {
      const seg = i < 3 ? 0 : 1;
      const ph = (t * 0.45 + (i % 3) / 3) % 1;
      const x0 = (xs[seg] ?? 0) + 1.0;
      const x1 = (xs[seg + 1] ?? 0) - 1.0;
      const d = dots.current[i];
      if (d) {
        d.position.set(x0 + (x1 - x0) * ph, -0.15, 0.16);
        d.scale.setScalar(0.5 + 0.7 * Math.sin(Math.PI * ph));
      }
    }
    if (mid.current) mid.current.scale.setScalar(1 + 0.035 * Math.sin(t * 2.2));
  });
  return (
    <group>
      <NodeBox x={xs[0] ?? 0} label={labels[0]} color={cols[0]} />
      <NodeBox x={xs[1] ?? 0} label={labels[1]} color={cols[1]} refGroup={mid} />
      <NodeBox x={xs[2] ?? 0} label={labels[2]} color={cols[2]} />
      {[0, 1].map((s) => (
        <Line
          key={s}
          points={[
            [(xs[s] ?? 0) + 1.0, -0.15, 0.12],
            [(xs[s + 1] ?? 0) - 1.0, -0.15, 0.12],
          ]}
          color={theme.dim}
          lineWidth={1.5}
        />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            dots.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshBasicMaterial color={theme.ink} />
        </mesh>
      ))}
      {above && (
        <>
          <Label position={[-1.2, 0.3, 0.1]} size={0.17} color={theme.dim}>
            {above[0]}
          </Label>
          <Label position={[1.2, 0.3, 0.1]} size={0.17} color={theme.dim}>
            {above[1]}
          </Label>
        </>
      )}
      {below && (
        <>
          <Label position={[-1.2, -0.62, 0.1]} size={0.17} color={theme.dim}>
            {below[0]}
          </Label>
          <Label position={[1.2, -0.62, 0.1]} size={0.17} color={theme.dim}>
            {below[1]}
          </Label>
        </>
      )}
    </group>
  );
}

// ---------- 2. entropy: particles spreading into the whole container ----------
function EntropyVisual({ theme, variant }: { theme: BoardTheme; variant: string }) {
  const N = 56;
  const W = 3.6;
  const H = 1.5;
  const inst = useRef<THREE.InstancedMesh>(null);
  const divider = useRef<THREE.Mesh>(null);
  const data = useMemo(() => {
    const r = mulberry32(7);
    return Array.from({ length: N }, () => ({
      sx: -W / 2 + 0.08 + r() * (W / 2 - 0.16),
      sy: -H / 2 + 0.08 + r() * (H - 0.16),
      ex: -W / 2 + 0.08 + r() * (W - 0.16),
      ey: -H / 2 + 0.08 + r() * (H - 0.16),
      p: r() * 6.28,
    }));
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const c = (t % 10) / 10;
    const k = ease((c - 0.18) / 0.5);
    const mesh = inst.current;
    if (mesh) {
      data.forEach((d, i) => {
        const j = 0.035 * Math.sin(t * 2.4 + d.p);
        dummy.position.set(d.sx + (d.ex - d.sx) * k + j, d.sy + (d.ey - d.sy) * k + j * 0.8, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (divider.current) {
      const m = divider.current.material as THREE.MeshBasicMaterial;
      m.opacity = c < 0.18 ? 1 : Math.max(0, 1 - (c - 0.18) / 0.1);
    }
  });
  return (
    <group position={[-1.75, -0.1, 0.1]}>
      <Line
        points={[
          [-W / 2, -H / 2, 0],
          [W / 2, -H / 2, 0],
          [W / 2, H / 2, 0],
          [-W / 2, H / 2, 0],
          [-W / 2, -H / 2, 0],
        ]}
        color={theme.ink}
        lineWidth={2}
      />
      <mesh ref={divider} position={[0, 0, 0]}>
        <boxGeometry args={[0.04, H, 0.02]} />
        <meshBasicMaterial color={theme.warn} transparent opacity={1} />
      </mesh>
      <instancedMesh ref={inst} args={[undefined, undefined, N]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshBasicMaterial color={theme.accents[0]} />
      </instancedMesh>
      <Label position={[0, -H / 2 - 0.22, 0]} size={0.16} color={theme.dim}>
        remove the divider → energy spreads
      </Label>
      <Label position={[3.85, 0.25, 0]} size={0.26} color={theme.ink} maxWidth={3.2}>
        {variant === "reversibility" ? "ΔS = 0 only in the ideal limit" : "ΔS universe ≥ 0"}
      </Label>
      <Label position={[3.85, -0.35, 0]} size={0.17} color={theme.dim} maxWidth={3.2}>
        {variant === "reversibility"
          ? "Real processes always generate entropy"
          : "Spreading is overwhelmingly more probable than un-spreading"}
      </Label>
    </group>
  );
}

// ---------- 3. Venn diagrams (conditional probability, independence) ----------
function lensShape(r: number, d: number): THREE.Shape {
  const h = Math.sqrt(Math.max(r * r - (d / 2) * (d / 2), 0));
  const alpha = Math.atan2(h, d / 2);
  const s = new THREE.Shape();
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const a = -alpha + (2 * alpha * i) / steps;
    const x = -d / 2 + r * Math.cos(a);
    const y = r * Math.sin(a);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  for (let i = 0; i <= steps; i++) {
    const a = alpha - (2 * alpha * i) / steps;
    s.lineTo(d / 2 - r * Math.cos(a), r * Math.sin(a));
  }
  return s;
}

function VennVisual({ theme, variant }: { theme: BoardTheme; variant: string }) {
  const r = 0.78;
  const d = variant === "independence" ? 1.05 : 0.95;
  const lens = useMemo(() => lensShape(r, d), [d]);
  const lensMat = useRef<THREE.MeshBasicMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (lensMat.current) lensMat.current.opacity = 0.55 + 0.3 * Math.sin(t * 2.2);
    if (ring.current) {
      ring.current.scale.setScalar(1 + 0.04 * Math.sin(t * 2.2));
      (ring.current.material as THREE.MeshBasicMaterial).opacity =
        variant === "conditional" ? 0.9 : 0;
    }
  });
  return (
    <group position={[-1.9, -0.12, 0.1]}>
      <Line
        points={[
          [-1.75, -1.0, 0],
          [1.75, -1.0, 0],
          [1.75, 1.0, 0],
          [-1.75, 1.0, 0],
          [-1.75, -1.0, 0],
        ]}
        color={theme.dim}
        lineWidth={1.5}
      />
      <mesh position={[-d / 2, 0, 0.01]}>
        <circleGeometry args={[r, 48]} />
        <meshBasicMaterial color={theme.accents[0]} transparent opacity={0.5} />
      </mesh>
      <mesh position={[d / 2, 0, 0.02]}>
        <circleGeometry args={[r, 48]} />
        <meshBasicMaterial color={theme.accents[2]} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <shapeGeometry args={[lens]} />
        <meshBasicMaterial ref={lensMat} color={theme.ink} transparent opacity={0.7} />
      </mesh>
      <mesh ref={ring} position={[d / 2, 0, 0.05]}>
        <ringGeometry args={[r - 0.015, r + 0.025, 64]} />
        <meshBasicMaterial color={theme.ink} transparent opacity={0.9} />
      </mesh>
      <Label position={[-d / 2 - 0.35, 0.5, 0.1]} size={0.24} color={theme.ink}>
        A
      </Label>
      <Label position={[d / 2 + 0.35, 0.5, 0.1]} size={0.24} color={theme.ink}>
        B
      </Label>
      <Label position={[0, 0, 0.1]} size={0.13} color="#0b1220" maxWidth={0.6}>
        A ∩ B
      </Label>
      <Label position={[3.55, 0.3, 0]} size={0.24} color={theme.ink} maxWidth={3.6}>
        {variant === "independence" ? "P(A ∩ B) = P(A) · P(B)" : "P(A | B) = P(A ∩ B) / P(B)"}
      </Label>
      <Label position={[3.55, -0.35, 0]} size={0.17} color={theme.dim} maxWidth={3.4}>
        {variant === "independence"
          ? "Knowing B does not change the chance of A"
          : "Shrink the universe to B first, then ask what fraction is also A"}
      </Label>
    </group>
  );
}

// ---------- 4. generic animated bars helper ----------
function useBars(count: number) {
  const refs = useRef<Array<THREE.Mesh | null>>(Array.from({ length: count }, () => null));
  const set = (i: number, h: number, base: number, x?: number) => {
    const m = refs.current[i];
    if (!m) return;
    const hh = Math.max(h, 0.001);
    m.scale.y = hh;
    m.position.y = base + hh / 2;
    if (x !== undefined) m.position.x = x;
  };
  return { refs, set };
}

function BayesVisual({ theme }: { theme: BoardTheme }) {
  const bars = useBars(3);
  const target = [0.1, 0.9, 0.5];
  const names = ["PRIOR  P(H) = 10%", "TEST  P(E|H) = 90%", "POSTERIOR  P(H|E) ≈ 50%"];
  const xs = [-2.5, 0, 2.5];
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % 9;
    for (let i = 0; i < 3; i++) {
      const grow = ease((t - 0.4 - i * 1.6) / 1.1);
      const fade = t > 8 ? 1 - (t - 8) : 1;
      bars.set(i, (target[i] ?? 0) * 1.5 * grow * fade, -0.85);
    }
  });
  return (
    <group position={[0, 0, 0.1]}>
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <mesh
            ref={(m) => {
              bars.refs.current[i] = m;
            }}
            position={[xs[i] ?? 0, -0.85, 0]}
          >
            <boxGeometry args={[1.0, 1, 0.1]} />
            <meshStandardMaterial
              color={theme.accents[i] ?? theme.ink}
              emissive={theme.accents[i] ?? theme.ink}
              emissiveIntensity={0.2}
            />
          </mesh>
          <Label position={[xs[i] ?? 0, -1.05, 0]} size={0.14} color={theme.dim} maxWidth={2.3}>
            {names[i] ?? ""}
          </Label>
        </group>
      ))}
      <Line
        points={[
          [-3.4, -0.85, 0],
          [3.4, -0.85, 0],
        ]}
        color={theme.dim}
        lineWidth={1.5}
      />
    </group>
  );
}

function DistributionVisual({ theme }: { theme: BoardTheme }) {
  const bars = useBars(6);
  const marker = useRef<THREE.Mesh>(null);
  const xs = Array.from({ length: 6 }, (_, i) => -3.1 + i * 0.62);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % 9;
    for (let i = 0; i < 6; i++) bars.set(i, 1.1 * ease((t - 0.2 - i * 0.3) / 0.6), -0.85);
    if (marker.current) {
      const k = ease((t - 2.4) / 1.6);
      const x0 = (xs[0] ?? 0) + 3.5 * 0 - 0.6; // start left of the bars
      const xTarget = (xs[0] ?? 0) + 2.5 * 0.62; // x for the mean 3.5 (between bars 3 and 4)
      marker.current.position.set(x0 + (xTarget - x0) * k, -0.62 + 0.04 * Math.sin(t * 5), 0.1);
      marker.current.visible = t > 2.3;
    }
  });
  return (
    <group position={[0, 0, 0.1]}>
      {xs.map((x, i) => (
        <group key={i}>
          <mesh
            ref={(m) => {
              bars.refs.current[i] = m;
            }}
            position={[x, -0.85, 0]}
          >
            <boxGeometry args={[0.46, 1, 0.1]} />
            <meshStandardMaterial
              color={theme.accents[0]}
              emissive={theme.accents[0]}
              emissiveIntensity={0.2}
            />
          </mesh>
          <Label position={[x, -1.05, 0]} size={0.16} color={theme.dim}>
            {String(i + 1)}
          </Label>
        </group>
      ))}
      <mesh ref={marker} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.12, 0.26, 3]} />
        <meshBasicMaterial color={theme.warn} />
      </mesh>
      <Label position={[2.3, 0.35, 0]} size={0.25} color={theme.ink} maxWidth={2.8}>
        E[X] = Σ x · P(x) = 3.5
      </Label>
      <Label position={[2.3, -0.3, 0]} size={0.16} color={theme.dim} maxWidth={2.6}>
        The long-run average, not a value you can roll
      </Label>
    </group>
  );
}

function SamplingVisual({ theme }: { theme: BoardTheme }) {
  const COUNT = 21;
  const bars = useBars(COUNT);
  const xs = Array.from({ length: COUNT }, (_, i) => -2.6 + i * 0.26 - 0.8);
  const texts = useRef<Array<THREE.Object3D | null>>([]);
  const steps = [1, 4, 16];
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % 12;
    const idx = Math.min(2, Math.floor(t / 4));
    const local = ease((t - idx * 4) / 1.2);
    const prev = idx === 0 ? 1 : 1 / Math.sqrt(steps[idx - 1] ?? 1);
    const cur = 1 / Math.sqrt(steps[idx] ?? 1);
    const s = prev + (cur - prev) * local;
    for (let i = 0; i < COUNT; i++) {
      const x = (xs[i] ?? 0) + 0.8;
      const sigma = 1.1 * s;
      bars.set(i, Math.min(1.45, (0.32 / s) * Math.exp(-(x * x) / (2 * sigma * sigma))), -0.85);
    }
    texts.current.forEach((o, i) => {
      if (o) o.visible = i === idx;
    });
  });
  return (
    <group position={[0, 0, 0.1]}>
      {xs.map((x, i) => (
        <mesh
          key={i}
          ref={(m) => {
            bars.refs.current[i] = m;
          }}
          position={[x, -0.85, 0]}
        >
          <boxGeometry args={[0.22, 1, 0.1]} />
          <meshStandardMaterial
            color={theme.accents[2]}
            emissive={theme.accents[2]}
            emissiveIntensity={0.2}
          />
        </mesh>
      ))}
      {steps.map((n, i) => (
        <group
          key={n}
          ref={(g) => {
            texts.current[i] = g;
          }}
        >
          <Label position={[2.75, 0.45, 0]} size={0.3} color={theme.ink}>
            {`n = ${n}`}
          </Label>
        </group>
      ))}
      <Label position={[2.75, -0.1, 0]} size={0.2} color={theme.ink} maxWidth={2.8}>
        SE = σ / √n
      </Label>
      <Label position={[2.75, -0.55, 0]} size={0.15} color={theme.dim} maxWidth={2.6}>
        Distribution of the sample mean, not of the data
      </Label>
    </group>
  );
}

function IntervalVisual({ theme }: { theme: BoardTheme }) {
  const ROWS = 18;
  const se = 0.42;
  const half = 1.96 * se;
  const rows = useMemo(() => {
    for (let seed = 1; seed < 400; seed++) {
      const r = mulberry32(seed);
      const cs = Array.from({ length: ROWS }, () => randn(r) * se);
      const miss = cs.filter((c) => Math.abs(c) > half).length;
      if (miss === 1) return cs;
    }
    const r = mulberry32(1);
    return Array.from({ length: ROWS }, () => randn(r) * se);
  }, [half]);
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % 10;
    rows.forEach((c, i) => {
      const m = refs.current[i];
      if (!m) return;
      const k = ease((t - 0.3 - i * 0.28) / 0.35) * (t > 9 ? Math.max(0, 10 - t) : 1);
      m.scale.x = Math.max(k, 0.001) * 2 * half;
      m.position.x = c;
    });
  });
  return (
    <group position={[-1.6, -0.05, 0.1]}>
      {rows.map((c, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          position={[c, 0.78 - i * 0.09, 0]}
        >
          <boxGeometry args={[1, 0.05, 0.05]} />
          <meshBasicMaterial color={Math.abs(c) <= half ? theme.accents[1] : theme.warn} />
        </mesh>
      ))}
      <Line
        points={[
          [0, -0.95, 0],
          [0, 0.95, 0],
        ]}
        color={theme.ink}
        lineWidth={2}
      />
      <Label position={[0, -1.12, 0]} size={0.15} color={theme.dim}>
        true value μ (fixed)
      </Label>
      <Label position={[3.6, 0.35, 0]} size={0.22} color={theme.ink} maxWidth={3.6}>
        estimate ± critical value × SE
      </Label>
      <Label position={[3.6, -0.3, 0]} size={0.16} color={theme.dim} maxWidth={3.4}>
        The intervals move between samples. μ does not.
      </Label>
    </group>
  );
}

function ScatterVisual({ theme }: { theme: BoardTheme }) {
  const N = 30;
  const pts = useMemo(() => {
    const r = mulberry32(11);
    return Array.from({ length: N }, () => {
      const x = -1.6 + r() * 3.2;
      return { x, y: 0.38 * x + randn(r) * 0.22 };
    });
  }, []);
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const dots = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const c = t % 9;
    pts.forEach((_, i) => {
      const m = refs.current[i];
      if (m) m.scale.setScalar(Math.max(ease((c - i * 0.12) / 0.3), 0.001));
    });
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.5 + (i % 2) * 0.5) % 1;
      const left = i < 2;
      const sx = 3.3;
      const sy = 0.6;
      const ex = left ? 2.55 : 4.05;
      const ey = -0.5;
      const d = dots.current[i];
      if (d) {
        d.position.set(sx + (ex - sx) * ph, sy + (ey - sy) * ph, 0.05);
        d.scale.setScalar(0.5 + 0.7 * Math.sin(Math.PI * ph));
      }
    }
  });
  return (
    <group position={[-1.9, -0.1, 0.1]}>
      <Line
        points={[
          [-1.85, -0.95, 0],
          [1.85, -0.95, 0],
        ]}
        color={theme.dim}
        lineWidth={1.5}
      />
      <Line
        points={[
          [-1.85, -0.95, 0],
          [-1.85, 0.95, 0],
        ]}
        color={theme.dim}
        lineWidth={1.5}
      />
      {pts.map((p, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          position={[p.x, p.y, 0]}
        >
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshBasicMaterial color={theme.accents[0]} />
        </mesh>
      ))}
      <Line
        points={[
          [-1.65, -0.63, 0.02],
          [1.65, 0.63, 0.02],
        ]}
        color={theme.ink}
        lineWidth={2}
      />
      <Label position={[0, -1.15, 0]} size={0.15} color={theme.dim}>
        X and Y rise together
      </Label>
      {/* confounder */}
      <group position={[3.3, 0.6, 0]}>
        <NodeBox x={0} y={0} label="Z  confounder" color={theme.warn} width={1.6} />
      </group>
      <NodeBox x={2.55} y={-0.5} label="X" color={theme.accents[0]} width={0.9} />
      <NodeBox x={4.05} y={-0.5} label="Y" color={theme.accents[2]} width={0.9} />
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            dots.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshBasicMaterial color={theme.ink} />
        </mesh>
      ))}
      <Label position={[3.3, -1.05, 0]} size={0.14} color={theme.dim} maxWidth={3}>
        Z drives both — X does not cause Y
      </Label>
    </group>
  );
}

function CurvesVisual({ theme, variant }: { theme: BoardTheme; variant: string }) {
  const dot = useRef<THREE.Mesh>(null);
  const tangent = useRef<THREE.Group>(null);
  const market = variant === "market";
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (market && dot.current) {
      const q = 0.6 * Math.sin(t * 0.9); // price adjusts toward equilibrium
      dot.current.position.set(q * 0.55, q * 0.55, 0.05);
      dot.current.scale.setScalar(1 + 0.15 * Math.sin(t * 3));
    }
    if (!market && dot.current) {
      const x = 1.1 * Math.sin(t * 0.7);
      dot.current.position.set(x, x * x * 0.8 - 0.55, 0.05);
      if (tangent.current) {
        tangent.current.position.set(x, x * x * 0.8 - 0.55, 0.04);
        tangent.current.rotation.z = Math.atan(2 * 0.8 * x);
      }
    }
  });
  const parabola: Array<[number, number, number]> = Array.from({ length: 41 }, (_, i) => {
    const x = -1.4 + (i / 40) * 2.8;
    return [x, x * x * 0.8 - 0.55, 0];
  });
  return (
    <group position={[-1.6, -0.05, 0.1]}>
      <Line
        points={[
          [-1.6, -0.9, 0],
          [1.6, -0.9, 0],
        ]}
        color={theme.dim}
        lineWidth={1.5}
      />
      <Line
        points={[
          [-1.6, -0.9, 0],
          [-1.6, 0.9, 0],
        ]}
        color={theme.dim}
        lineWidth={1.5}
      />
      {market ? (
        <>
          <Line
            points={[
              [-1.2, -0.7, 0],
              [1.2, 0.7, 0],
            ]}
            color={theme.accents[0]}
            lineWidth={3}
          />
          <Line
            points={[
              [-1.2, 0.7, 0],
              [1.2, -0.7, 0],
            ]}
            color={theme.accents[2]}
            lineWidth={3}
          />
          <Label position={[1.4, 0.75, 0]} size={0.18} color={theme.accents[0]}>
            S
          </Label>
          <Label position={[1.4, -0.75, 0]} size={0.18} color={theme.accents[2]}>
            D
          </Label>
          <Label position={[-1.35, 0.95, 0]} size={0.14} color={theme.dim}>
            price
          </Label>
          <Label position={[1.2, -1.08, 0]} size={0.14} color={theme.dim}>
            quantity
          </Label>
        </>
      ) : (
        <>
          <Line points={parabola} color={theme.accents[0]} lineWidth={3} />
          <group ref={tangent}>
            <Line
              points={[
                [-0.7, 0, 0],
                [0.7, 0, 0],
              ]}
              color={theme.warn}
              lineWidth={2}
            />
          </group>
        </>
      )}
      <mesh ref={dot}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color={theme.ink} />
      </mesh>
      <Label position={[3.4, 0.3, 0]} size={0.22} color={theme.ink} maxWidth={3.4}>
        {market ? "Equilibrium where supply = demand" : "Slope of the tangent = rate of change"}
      </Label>
      <Label position={[3.4, -0.35, 0]} size={0.16} color={theme.dim} maxWidth={3.2}>
        {market ? "Watch the price adjust toward it" : "Move along the curve and watch the slope"}
      </Label>
    </group>
  );
}

/** Renders the visual chosen by `planBoard`. */
export function BoardVisual({ plan, theme }: { plan: BoardPlan; theme: BoardTheme }) {
  switch (plan.kind) {
    case "energy":
      return (
        <FlowVisual
          labels={["HEAT / Q", "SYSTEM / ΔU", "WORK / W"]}
          colors={["#c0504a", "#237e75", "#4776b8"]}
          theme={theme}
          {...(plan.variant === "signs"
            ? {
                above: ["Q in  → +", "W out → +"] as [string, string],
                below: ["Q out → −", "W in → −"] as [string, string],
              }
            : {})}
        />
      );
    case "entropy":
      return <EntropyVisual theme={theme} variant={plan.variant} />;
    case "venn":
      return <VennVisual theme={theme} variant={plan.variant} />;
    case "bayes":
      return <BayesVisual theme={theme} />;
    case "distribution":
      return <DistributionVisual theme={theme} />;
    case "sampling":
      return <SamplingVisual theme={theme} />;
    case "interval":
      return <IntervalVisual theme={theme} />;
    case "scatter":
      return <ScatterVisual theme={theme} />;
    case "curves":
      return <CurvesVisual theme={theme} variant={plan.variant} />;
    default:
      return <FlowVisual labels={plan.labels} theme={theme} />;
  }
}
