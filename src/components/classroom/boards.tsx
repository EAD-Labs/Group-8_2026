import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BoardVisual, type BoardTheme } from "./board-visuals";
import type { BoardPlan } from "./board-topic";
import type { BoardStyle } from "./personas";
import { Text } from "./Text3D";
import { DustMotes, Glow } from "./vfx";

type V3 = [number, number, number];

function GridLines({
  w,
  h,
  step,
  color,
  opacity,
}: {
  w: number;
  h: number;
  step: number;
  color: string;
  opacity: number;
}) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) pts.push(x, -h / 2, 0, x, h / 2, 0);
    for (let y = -h / 2; y <= h / 2 + 1e-6; y += step) pts.push(-w / 2, y, 0, w / 2, y, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [w, h, step]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

// ---------------------------------------------------------------- boards
export const THEMES: Record<BoardStyle, BoardTheme> = {
  "smart-green": {
    ink: "#f5f2e8",
    dim: "#b8cfc4",
    accents: ["#5b8fd6", "#2fa597", "#e0a447"],
    warn: "#ff7b6b",
  },
  "interactive-white": {
    ink: "#1d2733",
    dim: "#5c6a7a",
    accents: ["#3b6fc4", "#1f8a7e", "#c98a2b"],
    warn: "#d2483c",
  },
  holo: {
    ink: "#d8f6ff",
    dim: "#7fb4c7",
    accents: ["#2bd0e8", "#8b7cff", "#ffb64a"],
    warn: "#ff6b81",
  },
};

/** A thin bright line that sweeps down the panel, like a hologram being re-projected. */
function Scanline({ w, h, color }: { w: number; h: number; color: string }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (m.current) m.current.position.y = h / 2 - ((clock.getElapsedTime() * 0.35) % 1) * h;
  });
  return (
    <mesh ref={m} position={[0, 0, 0.07]} renderOrder={7}>
      <planeGeometry args={[w, 0.05]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.28}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function BoardContent({
  plan,
  theme,
  title,
  status,
  headingColor,
}: {
  plan: BoardPlan;
  theme: BoardTheme;
  title: string;
  status: string;
  headingColor: string;
}) {
  const showCaption = plan.kind === "flow" || plan.kind === "energy";
  return (
    <group position={[0, 0, 0.12]}>
      <Text
        position={[0, 1.0, 0]}
        fontSize={0.26}
        maxWidth={7.2}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={headingColor}
      >
        {plan.heading}
      </Text>
      <BoardVisual plan={plan} theme={theme} />
      {showCaption && (
        <Text
          position={[0, -1.0, 0]}
          fontSize={0.2}
          maxWidth={7}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color={theme.ink}
        >
          {plan.caption}
        </Text>
      )}
      <Text
        position={[-3.85, 1.43, -0.02]}
        fontSize={0.11}
        anchorX="left"
        anchorY="middle"
        color={theme.dim}
      >
        {`●  ${title}`}
      </Text>
      <Text
        position={[3.85, 1.43, -0.02]}
        fontSize={0.11}
        anchorX="right"
        anchorY="middle"
        color={theme.dim}
      >
        {status}
      </Text>
    </group>
  );
}

/** Dark-green smart board: aluminium bezel, glowing panel, pen tray and a floating toolbar. */
export function GreenSmartBoard({
  plan,
  concept,
  fx = true,
}: {
  plan: BoardPlan;
  concept: string;
  fx?: boolean;
}) {
  const theme = THEMES["smart-green"];
  return (
    <group position={[0, 3.6, -4.7]}>
      <RoundedBox args={[8.5, 3.55, 0.2]} radius={0.06} position={[0, 0, -0.06]} castShadow>
        <meshStandardMaterial color="#b9c2c8" metalness={0.6} roughness={0.35} />
      </RoundedBox>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[8.1, 3.15, 0.05]} />
        <meshStandardMaterial
          color="#134236"
          emissive="#0f4a39"
          emissiveIntensity={0.55}
          roughness={0.55}
        />
      </mesh>
      <mesh position={[0, 1.5, 0.092]}>
        <boxGeometry args={[8.1, 0.3, 0.02]} />
        <meshStandardMaterial color="#0b2e25" emissive="#0b2e25" emissiveIntensity={0.4} />
      </mesh>
      <group position={[0, 0, 0.09]}>
        <GridLines w={8} h={3} step={0.5} color="#9fd8c4" opacity={0.07} />
      </group>
      <BoardContent
        plan={plan}
        theme={theme}
        title={`SMART BOARD · ${concept.toUpperCase().slice(0, 40)}`}
        status="LIVE"
        headingColor="#fff3b0"
      />
      <RoundedBox args={[1.9, 0.24, 0.04]} radius={0.1} position={[0, -1.36, 0.12]}>
        <meshStandardMaterial color="#0b2e25" emissive="#0b2e25" emissiveIntensity={0.4} />
      </RoundedBox>
      {["#ff7b6b", "#ffd166", "#6fd3a5", "#6aa6ff"].map((c, i) => (
        <mesh key={c} position={[-0.65 + i * 0.43, -1.36, 0.15]}>
          <circleGeometry args={[0.07, 16]} />
          <meshBasicMaterial color={c} />
        </mesh>
      ))}
      {/* pen tray */}
      <mesh position={[0, -1.82, 0.16]}>
        <boxGeometry args={[4.6, 0.1, 0.28]} />
        <meshStandardMaterial color="#9aa3a9" metalness={0.5} roughness={0.4} />
      </mesh>
      {["#ff7b6b", "#ffd166", "#6aa6ff"].map((c, i) => (
        <mesh key={c} position={[-0.8 + i * 0.5, -1.74, 0.18]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.035, 0.035, 0.4, 10]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
      <mesh position={[1.4, -1.73, 0.18]}>
        <boxGeometry args={[0.38, 0.1, 0.14]} />
        <meshStandardMaterial color="#e8e4d8" />
      </mesh>
      <pointLight position={[0, 0, 1.5]} color="#7ee0b9" intensity={1.2} distance={8} />
      {fx && <Glow position={[0, 0, 0.9]} size={9.5} color="#5fd6a6" opacity={0.1} />}
      {fx && (
        <DustMotes
          position={[0, -0.2, 1.4]}
          scale={[7, 3, 1.6]}
          count={26}
          color="#e8fff4"
          opacity={0.35}
          size={2}
        />
      )}
    </group>
  );
}

/** White interactive display with slim black bezel and a light UI bar. */
export function WhiteDisplay({
  plan,
  concept,
  fx = true,
}: {
  plan: BoardPlan;
  concept: string;
  fx?: boolean;
}) {
  const theme = THEMES["interactive-white"];
  return (
    <group position={[0, 3.55, -4.7]}>
      <RoundedBox args={[8.7, 3.5, 0.16]} radius={0.05} position={[0, 0, -0.05]} castShadow>
        <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[8.4, 3.2, 0.04]} />
        <meshStandardMaterial
          color="#f6f7f9"
          emissive="#ffffff"
          emissiveIntensity={0.5}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, 1.5, 0.075]}>
        <boxGeometry args={[8.4, 0.3, 0.015]} />
        <meshStandardMaterial color="#e1e6ec" emissive="#e1e6ec" emissiveIntensity={0.3} />
      </mesh>
      <BoardContent
        plan={plan}
        theme={theme}
        title={`INTERACTIVE DISPLAY · ${concept.toUpperCase().slice(0, 36)}`}
        status="LIVE"
        headingColor="#1d2733"
      />
      {/* dock */}
      <RoundedBox args={[2.4, 0.22, 0.03]} radius={0.1} position={[0, -1.42, 0.11]}>
        <meshStandardMaterial color="#d9dee5" />
      </RoundedBox>
      {["#3b6fc4", "#1f8a7e", "#c98a2b", "#d2483c", "#6b5bd6"].map((c, i) => (
        <mesh key={c} position={[-0.8 + i * 0.4, -1.42, 0.135]}>
          <circleGeometry args={[0.07, 16]} />
          <meshBasicMaterial color={c} />
        </mesh>
      ))}
      <mesh position={[0, 1.95, 0.0]}>
        <boxGeometry args={[1.2, 0.12, 0.22]} />
        <meshStandardMaterial color="#cfd5dc" metalness={0.4} roughness={0.4} />
      </mesh>
      {fx && <Glow position={[0, 0, 0.9]} size={9.8} color="#ffffff" opacity={0.1} />}
      <pointLight position={[0, 0, 1.6]} color="#f2f7ff" intensity={0.9} distance={8} />
    </group>
  );
}

/** Dark glass holographic panel with glowing cyan border. */
export function HoloPanel({
  plan,
  concept,
  fx = true,
}: {
  plan: BoardPlan;
  concept: string;
  fx?: boolean;
}) {
  const theme = THEMES.holo;
  const edge = "#2bd0e8";
  const W = 8.2;
  const H = 3.3;
  return (
    <group position={[0, 3.6, -4.55]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[W, H, 0.06]} />
        <meshStandardMaterial
          color="#071322"
          emissive="#0a2b40"
          emissiveIntensity={0.55}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>
      <group position={[0, 0, 0.04]}>
        <GridLines w={W - 0.3} h={H - 0.3} step={0.4} color="#2bd0e8" opacity={0.1} />
      </group>
      {[
        [0, H / 2, W, 0.045],
        [0, -H / 2, W, 0.045],
        [-W / 2, 0, 0.045, H],
        [W / 2, 0, 0.045, H],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x ?? 0, y ?? 0, 0.04]}>
          <boxGeometry args={[w ?? 0, h ?? 0, 0.03]} />
          <meshBasicMaterial color={edge} />
        </mesh>
      ))}
      <BoardContent
        plan={plan}
        theme={theme}
        title={`HOLO PANEL · ${concept.toUpperCase().slice(0, 40)}`}
        status="LIVE"
        headingColor="#9ff0ff"
      />
      {/* wall standoffs */}
      {[-3.6, 3.6].map((x) => (
        <mesh key={x} position={[x, 0, -0.25]}>
          <cylinderGeometry args={[0.06, 0.06, 0.4, 10]} />
          <meshStandardMaterial color="#53606a" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      <pointLight position={[0, 0, 1.8]} color="#47d8ee" intensity={1.8} distance={9} />
      {fx && <Scanline w={W - 0.2} h={H - 0.2} color="#7be9ff" />}
      {fx && <Glow position={[0, 0, 0.8]} size={10.5} color="#2bd0e8" opacity={0.13} />}
      {fx && (
        <DustMotes
          position={[0, 0, 1.2]}
          scale={[8, 3.4, 2.2]}
          count={46}
          color="#7be9ff"
          opacity={0.7}
          size={2.6}
        />
      )}
    </group>
  );
}
