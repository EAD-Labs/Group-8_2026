import { MeshReflectorMaterial, RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import type * as THREE from "three";
import type { BoardPlan } from "./board-topic";
import { GreenSmartBoard, HoloPanel, WhiteDisplay } from "./boards";
import type { RoomSpec } from "./personas";
import {
  Bookshelf,
  CeilingFan,
  Chair,
  Curtain,
  NoticeBoard,
  Plant,
  Poster,
  RoundTable,
  Seat,
  TeacherDesk,
  WallClock,
  WindowUnit,
} from "./props";
import { carpetTexture, concreteTexture, plasterTexture, woodTexture } from "./textures";
import { BlobShadow, DustMotes, Glow, LightShaft } from "./vfx";

type V3 = [number, number, number];
export type Quality = "low" | "medium" | "high";
export type RoomLook = { quality: Quality; night: boolean; fx: boolean };

const HALF_W = 6.5;
const HEIGHT = 6;

const Std = ({
  color,
  rough = 0.8,
  metal = 0,
  map,
  emissive,
  ei = 0,
}: {
  color?: string;
  rough?: number;
  metal?: number;
  map?: THREE.Texture | null;
  emissive?: string;
  ei?: number;
}) => (
  <meshStandardMaterial
    {...(color ? { color } : {})}
    {...(map ? { map } : {})}
    roughness={rough}
    metalness={metal}
    {...(emissive ? { emissive, emissiveIntensity: ei } : {})}
  />
);

/** Floor, walls, ceiling and trim shared by every room. */
function Shell({
  floor,
  floorColor,
  floorRepeat,
  wall,
  wallColor,
  ceilingColor = "#efece4",
  reflect = false,
  wainscot,
}: {
  floor: THREE.Texture | null;
  floorColor: string;
  floorRepeat?: [number, number];
  wall: THREE.Texture | null;
  wallColor: string;
  ceilingColor?: string;
  reflect?: boolean;
  wainscot?: string;
}) {
  void floorRepeat;
  const W = HALF_W * 2;
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 2.5]} receiveShadow>
        <planeGeometry args={[W, 15]} />
        {reflect ? (
          <MeshReflectorMaterial
            blur={[260, 80]}
            resolution={512}
            mixBlur={1}
            mixStrength={0.9}
            mirror={0.35}
            roughness={0.9}
            depthScale={0.4}
            minDepthThreshold={0.6}
            maxDepthThreshold={1.3}
            color={floorColor}
            {...(floor ? { map: floor } : {})}
          />
        ) : (
          <Std color={floorColor} map={floor} rough={0.7} />
        )}
      </mesh>
      <mesh position={[0, HEIGHT / 2, -5.1]} receiveShadow>
        <boxGeometry args={[W + 0.4, HEIGHT, 0.2]} />
        <Std color={wallColor} map={wall} rough={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (HALF_W + 0.1), HEIGHT / 2, 2.5]} receiveShadow>
          <boxGeometry args={[0.2, HEIGHT, 15]} />
          <Std color={wallColor} map={wall} rough={0.95} />
        </mesh>
      ))}
      <mesh position={[0, HEIGHT + 0.05, 2.5]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[W, 15]} />
        <Std color={ceilingColor} rough={0.95} />
      </mesh>
      {/* skirting boards */}
      <mesh position={[0, 0.09, -4.98]}>
        <boxGeometry args={[W, 0.18, 0.06]} />
        <Std color="#f2efe6" rough={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (HALF_W - 0.02), 0.09, 2.5]}>
          <boxGeometry args={[0.06, 0.18, 15]} />
          <Std color="#f2efe6" rough={0.5} />
        </mesh>
      ))}
      {wainscot && (
        <>
          <mesh position={[0, 0.65, -4.97]}>
            <boxGeometry args={[W, 1.0, 0.04]} />
            <Std color={wainscot} rough={0.7} />
          </mesh>
          <mesh position={[0, 1.17, -4.95]}>
            <boxGeometry args={[W, 0.05, 0.08]} />
            <Std color="#f2efe6" rough={0.5} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * (HALF_W - 0.03), 0.65, 2.5]}>
                <boxGeometry args={[0.04, 1.0, 15]} />
                <Std color={wainscot} rough={0.7} />
              </mesh>
              <mesh position={[s * (HALF_W - 0.05), 1.17, 2.5]}>
                <boxGeometry args={[0.08, 0.05, 15]} />
                <Std color="#f2efe6" rough={0.5} />
              </mesh>
            </group>
          ))}
        </>
      )}
    </>
  );
}

/** Light panel set into the ceiling. */
function CeilingPanels({
  rows,
  cols,
  night,
  color = "#fff6dd",
}: {
  rows: number[];
  cols: number[];
  night: boolean;
  color?: string;
}) {
  return (
    <>
      {rows.flatMap((z) =>
        cols.map((x) => (
          <group key={`${x}:${z}`} position={[x, HEIGHT - 0.02, z]}>
            <mesh>
              <boxGeometry args={[1.5, 0.05, 0.5]} />
              <Std color="#f4f1e8" />
            </mesh>
            <mesh position={[0, -0.03, 0]}>
              <planeGeometry args={[1.38, 0.38]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          </group>
        )),
      )}
      {rows.flatMap((z) =>
        cols.map((x) => (
          <pointLight
            key={`l${x}:${z}`}
            position={[x, HEIGHT - 0.6, z]}
            intensity={night ? 5 : 2.2}
            distance={9}
            color={color}
          />
        )),
      )}
    </>
  );
}

function Seats({ room, seatColor, wood }: { room: RoomSpec; seatColor: string; wood: string }) {
  const all = useMemo(
    () => [
      room.mayaSeat,
      room.arjunSeat,
      ...room.classmates.map((c) => c.position),
      ...room.emptySeats,
    ],
    [room],
  );
  return (
    <>
      {all.map((p, i) => (
        <Seat
          key={i}
          position={p as V3}
          seed={i + 2}
          chair={seatColor}
          wood={wood}
          items={i % 3 !== 2}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
export function GreenHallRoom({
  room,
  plan,
  concept,
  look,
}: {
  room: RoomSpec;
  plan: BoardPlan;
  concept: string;
  look: RoomLook;
}) {
  const { night, quality, fx } = look;
  const floor = useMemo(() => woodTexture("#9a6a3f", [6, 7]), []);
  const wall = useMemo(() => plasterTexture("#e2dac5", [4, 2]), []);
  if (floor) floor.repeat.set(6, 7);
  const winZ = [-3.4, -0.3, 2.8];
  const shaft = quality !== "low" && fx;
  return (
    <>
      <Shell
        floor={floor}
        floorColor="#ffffff"
        wall={wall}
        wallColor="#ffffff"
        wainscot="#2f6f5a"
      />
      {/* left-wall windows, curtains and sunlight */}
      {winZ.map((z, i) => (
        <group key={z}>
          <WindowUnit
            position={[-HALF_W + 0.005, 3.2, z]}
            rotation={Math.PI / 2}
            night={night}
            scenery="trees"
          />
          <Curtain
            position={[-HALF_W + 0.1, 3.0, z - 1.05]}
            rotation={Math.PI / 2}
            width={0.7}
            phase={i}
            color="#d9c9a8"
          />
          <Curtain
            position={[-HALF_W + 0.1, 3.0, z + 1.05]}
            rotation={Math.PI / 2}
            width={0.7}
            phase={i + 2}
            color="#d9c9a8"
          />
          {shaft && !night && (
            <LightShaft
              from={[-HALF_W + 0.3, 3.5, z]}
              dir={[1, -0.55, 0.1]}
              width={1.7}
              length={9.5}
              opacity={0.17}
              phase={i * 1.7}
            />
          )}
          {shaft && night && (
            <LightShaft
              from={[-HALF_W + 0.3, 3.5, z]}
              dir={[1, -0.45, 0.1]}
              width={1.7}
              length={8}
              opacity={0.05}
              color="#9db7ff"
              phase={i}
            />
          )}
          {fx && (
            <Glow
              position={[-HALF_W + 0.6, 3.3, z]}
              size={3.2}
              color={night ? "#8fa8ff" : "#fff3c8"}
              opacity={night ? 0.1 : 0.22}
            />
          )}
        </group>
      ))}
      {fx && quality !== "low" && (
        <DustMotes
          position={[-2.4, 2.6, 1.2]}
          scale={[8, 4, 12]}
          count={quality === "high" ? 120 : 60}
          color={night ? "#b5c6ff" : "#fff1c4"}
          opacity={night ? 0.25 : 0.6}
        />
      )}
      {/* front wall dressing */}
      <NoticeBoard position={[-5.0, 2.7, -4.96]} size={[1.7, 1.1]} />
      <Poster
        position={[-3.2, 3.9, -4.97]}
        color="#3b6fc4"
        accent="#f3b13e"
        label="LAWS OF NATURE"
      />
      <Poster position={[3.3, 4.0, -4.97]} color="#2f8a6e" accent="#f6e27a" label="THINK · TEST" />
      <WallClock position={[5.1, 4.9, -4.93]} />
      <group position={[5.4, 0, -4.93]}>
        <mesh position={[0, 1.2, 0]} castShadow>
          <boxGeometry args={[1.25, 2.4, 0.1]} />
          <Std color="#a8784f" rough={0.55} />
        </mesh>
        <mesh position={[0, 1.55, 0.06]}>
          <boxGeometry args={[0.5, 0.7, 0.02]} />
          <Std color="#9fd6e6" rough={0.1} />
        </mesh>
        <mesh position={[0.45, 1.05, 0.07]}>
          <sphereGeometry args={[0.04, 10, 8]} />
          <Std color="#c9b27a" metal={0.8} rough={0.3} />
        </mesh>
      </group>
      <Bookshelf position={[-5.6, 0, -4.7]} width={1.7} rows={4} seed={2} />
      <TeacherDesk position={[3.95, 0, -3.75]} rotation={0.15} />
      <Plant position={[-6.05, 0, -4.35]} scale={1.1} seed={4} />
      <Plant position={[6.0, 0, -4.4]} scale={0.95} seed={9} leaf="#3d7a5b" />
      <CeilingFan position={[0, HEIGHT - 0.5, 1.4]} />
      <CeilingFan position={[0, HEIGHT - 0.5, 4.8]} speed={1.9} />
      <CeilingPanels rows={[-1.5, 2.2, 5.6]} cols={[-3.6, 3.6]} night={night} />
      <Seats room={room} seatColor="#3d5a80" wood="#b98a5a" />
      <GreenSmartBoard plan={plan} concept={concept} fx={fx} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
export function LectureRoom({
  room,
  plan,
  concept,
  look,
}: {
  room: RoomSpec;
  plan: BoardPlan;
  concept: string;
  look: RoomLook;
}) {
  const { night, quality, fx } = look;
  const carpet = useMemo(() => carpetTexture("#4a5a74", [7, 7]), []);
  const wall = useMemo(() => plasterTexture("#e6e9ee", [4, 2]), []);
  const slats = Array.from({ length: 14 }, (_, i) => i);
  return (
    <>
      <Shell
        floor={carpet}
        floorColor="#ffffff"
        wall={wall}
        wallColor="#ffffff"
        ceilingColor="#f4f5f7"
      />
      {/* acoustic wood slats */}
      {[-1, 1].flatMap((side) =>
        slats.map((i) => (
          <mesh key={`${side}-${i}`} position={[side * (4.7 + i * 0.13), 3.0, -4.94]} castShadow>
            <boxGeometry args={[0.08, 5.6, 0.1]} />
            <Std color={i % 3 === 0 ? "#a77949" : "#b88b5a"} rough={0.55} />
          </mesh>
        )),
      )}
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i} position={[-HALF_W + 0.1, 2.6, -4.4 + i * 0.5]} castShadow>
          <boxGeometry args={[0.1, 4.2, 0.07]} />
          <Std color={i % 3 === 0 ? "#a77949" : "#b88b5a"} rough={0.55} />
        </mesh>
      ))}
      {/* tiers with glowing edge strips */}
      {[
        { z: 3.1, y: 0.42, d: 2.4 },
        { z: 5.4, y: 0.84, d: 2.4 },
      ].map((t) => (
        <group key={t.y}>
          <mesh position={[0, t.y / 2, t.z]} receiveShadow castShadow>
            <boxGeometry args={[HALF_W * 2 - 0.2, t.y, t.d]} />
            <Std color="#ffffff" map={carpet} rough={1} />
          </mesh>
          <mesh position={[0, t.y - 0.05, t.z - t.d / 2 - 0.005]}>
            <boxGeometry args={[HALF_W * 2 - 0.3, 0.04, 0.02]} />
            <meshBasicMaterial color={night ? "#7be9ff" : "#d9f4ff"} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* ceiling baffles and lights */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-5 + i * 2, HEIGHT - 0.5, 1.5]}>
          <boxGeometry args={[0.22, 0.9, 12]} />
          <Std color="#f6f7f9" rough={0.7} />
        </mesh>
      ))}
      <CeilingPanels
        rows={[-2.5, 1.2, 4.8]}
        cols={[-4, -1.3, 1.3, 4]}
        night={night}
        color="#eef6ff"
      />
      {/* clerestory windows + daylight */}
      {[-3.0, 1.2].map((z, i) => (
        <group key={z}>
          <WindowUnit
            position={[-HALF_W + 0.005, 4.0, z]}
            rotation={Math.PI / 2}
            size={[1.6, 1.7]}
            night={night}
            scenery="city"
          />
          {quality !== "low" && fx && !night && (
            <LightShaft
              from={[-HALF_W + 0.3, 4.3, z]}
              dir={[1, -0.5, 0.05]}
              width={1.5}
              length={8}
              opacity={0.12}
              phase={i * 2}
            />
          )}
        </group>
      ))}
      {/* projector with a beam to the display */}
      <group position={[0, HEIGHT - 0.8, 2.6]}>
        <mesh>
          <boxGeometry args={[0.5, 0.18, 0.4]} />
          <Std color="#2d3238" rough={0.4} metal={0.3} />
        </mesh>
        <mesh position={[0, -0.02, -0.22]}>
          <cylinderGeometry args={[0.07, 0.07, 0.1, 14]} />
          <meshBasicMaterial color="#cfe4ff" toneMapped={false} />
        </mesh>
      </group>
      {fx && quality !== "low" && (
        <LightShaft
          from={[0, HEIGHT - 0.9, 2.3]}
          dir={[0, -1.3, -7]}
          width={3.6}
          length={8.2}
          opacity={0.07}
          color="#dbe9ff"
          flicker={0.05}
        />
      )}
      {fx && quality !== "low" && (
        <DustMotes
          position={[0, 3.4, 0]}
          scale={[7, 3.6, 9]}
          count={quality === "high" ? 90 : 45}
          color="#e9f2ff"
          opacity={0.5}
        />
      )}
      {/* lectern with microphone */}
      <group position={[3.7, 0, -3.0]}>
        <RoundedBox args={[0.95, 1.1, 0.6]} radius={0.04} position={[0, 0.55, 0]} castShadow>
          <Std color="#8a6234" rough={0.45} />
        </RoundedBox>
        <mesh position={[0, 1.13, 0.02]} rotation-x={-0.3} castShadow>
          <boxGeometry args={[0.7, 0.04, 0.45]} />
          <Std color="#7a5530" rough={0.45} />
        </mesh>
        <mesh position={[0.2, 1.3, 0.05]}>
          <cylinderGeometry args={[0.006, 0.006, 0.34, 6]} />
          <Std color="#222" />
        </mesh>
        <mesh position={[0.2, 1.48, 0.05]}>
          <sphereGeometry args={[0.025, 10, 8]} />
          <Std color="#111" />
        </mesh>
      </group>
      <Plant position={[-6.0, 0, -4.2]} scale={1.15} pot="#3a4658" seed={6} />
      <Plant position={[6.0, 0, -4.2]} scale={1.15} pot="#3a4658" seed={7} leaf="#3f8a64" />
      <Seats room={room} seatColor="#c0504a" wood="#cfd3da" />
      <WhiteDisplay plan={plan} concept={concept} fx={fx} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
export function StudioRoom({
  room,
  plan,
  concept,
  look,
}: {
  room: RoomSpec;
  plan: BoardPlan;
  concept: string;
  look: RoomLook;
}) {
  const { night, quality, fx } = look;
  const concrete = useMemo(() => concreteTexture("#6a6f74", [6, 6]), []);
  const wall = useMemo(() => plasterTexture("#27323d", [4, 2]), []);
  const books = useMemo(() => [0x6ea8d8, 0xe0a447, 0xd8695f, 0x7bb894, 0xb59bd6, 0xe8e1d0], []);
  const slats = Array.from({ length: 22 }, (_, i) => i);
  const rugTex = useMemo(() => carpetTexture("#3b4b5c", [5, 5]), []);
  const tables: Array<[V3, number]> = [
    [[room.mayaSeat[0], 0, room.mayaSeat[2] - 1.1], 0.8],
    [[room.arjunSeat[0], 0, room.arjunSeat[2] - 1.1], 0.8],
    [[-2.8, 0, 2.3], 0.7],
    [[2.8, 0, 2.3], 0.7],
  ];
  return (
    <>
      <Shell
        floor={concrete}
        floorColor="#ffffff"
        wall={wall}
        wallColor="#ffffff"
        ceilingColor="#1f2730"
        reflect={quality === "high"}
      />
      {/* wood slat feature wall behind the panel */}
      {slats.map((i) => (
        <mesh key={i} position={[-4.6 + i * 0.44, 3.3, -4.9]} castShadow>
          <boxGeometry args={[0.32, 6, 0.08]} />
          <Std color={i % 2 ? "#6b4a2f" : "#7a5638"} rough={0.6} />
        </mesh>
      ))}
      {/* tall window with the view outside */}
      <WindowUnit
        position={[5.55, 3.3, -4.96]}
        size={[1.9, 4.6]}
        night={night}
        scenery="city"
        panes={2}
      />
      {fx && (
        <Glow
          position={[5.5, 3.3, -4.4]}
          size={5}
          color={night ? "#6f86ff" : "#fff3c8"}
          opacity={night ? 0.12 : 0.2}
        />
      )}
      {quality !== "low" && fx && !night && (
        <LightShaft
          from={[5.5, 4.4, -4.8]}
          dir={[-0.5, -0.7, 1]}
          width={1.8}
          length={8}
          opacity={0.12}
        />
      )}
      {/* bookshelf and floor lamp */}
      <Bookshelf position={[-5.7, 0, -4.7]} width={1.7} rows={5} frame="#3a2c22" seed={8} />
      <group position={[-4.4, 0, -4.3]}>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.8, 6]} />
          <Std color="#222" metal={0.6} />
        </mesh>
        <mesh position={[0, 1.85, 0]}>
          <coneGeometry args={[0.2, 0.3, 14, 1, true]} />
          <meshStandardMaterial
            color="#f4d9a0"
            emissive="#ffcf8f"
            emissiveIntensity={1.2}
            side={2}
          />
        </mesh>
        <pointLight position={[0, 1.7, 0.1]} color="#ffcf8f" intensity={4} distance={7} />
        {fx && <Glow position={[0, 1.8, 0]} size={1.6} color="#ffcf8f" opacity={0.5} />}
      </group>
      {/* rug */}
      <mesh position={[0, 0.012, 0.6]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[4.9, 64]} />
        <Std color="#ffffff" rough={1} map={rugTex} />
      </mesh>
      <mesh position={[0, 0.014, 0.6]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[4.7, 4.9, 64]} />
        <Std color="#c9a24b" rough={0.6} />
      </mesh>
      {/* tables, seats, pendant lamps */}
      {tables.map(([p, r], i) => (
        <group key={i}>
          <BlobShadow position={[p[0], 0, p[2]]} size={[r * 3, r * 3]} opacity={0.35} />
          <RoundTable position={p} radius={r} top={i < 2 ? "#c9b08a" : "#b89d78"} />
          <mesh position={[p[0], 0.8, p[2]]}>
            <cylinderGeometry args={[0.11, 0.11, 0.18, 14]} />
            <Std color="#f3efe2" />
          </mesh>
        </group>
      ))}
      {[room.mayaSeat, room.arjunSeat, ...room.classmates.map((c) => c.position)].map((p, i) => (
        <Chair
          key={i}
          position={p as V3}
          color={["#d9774f", "#2f8a6e", "#b59bd6", "#e0a447"][i % 4] ?? "#d9774f"}
          frame="#2d3640"
        />
      ))}
      {[-3, 0, 3].map((x) => (
        <group key={x} position={[x, HEIGHT - 1.7, 0.4]}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 1.8, 6]} />
            <meshBasicMaterial color="#111" />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.26, 18, 14]} />
            <meshStandardMaterial color="#ffe3b0" emissive="#ffcf8f" emissiveIntensity={2.2} />
          </mesh>
          <pointLight
            color="#ffcf8f"
            intensity={night ? 12 : 5}
            distance={10}
            position={[0, -0.3, 0]}
          />
          {fx && <Glow position={[0, 0, 0]} size={1.9} color="#ffcf8f" opacity={0.5} />}
        </group>
      ))}
      {fx && quality !== "low" && (
        <DustMotes
          position={[0, 2.6, 0]}
          scale={[9, 4, 10]}
          count={quality === "high" ? 90 : 40}
          color="#ffe6bd"
          opacity={0.45}
        />
      )}
      <Plant position={[-4.9, 0, -3.6]} scale={1.2} pot="#2a3138" leaf="#3d7a5b" seed={5} />
      <Plant position={[5.8, 0, -3.8]} scale={1.0} pot="#2a3138" leaf="#487963" seed={12} />
      <HoloPanel plan={plan} concept={concept} fx={fx} />
    </>
  );
}
