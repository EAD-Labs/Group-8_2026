import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Billboard,
  Environment,
  Lightformer,
  RoundedBox,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { addAccessories, applyLookMaterials, makeSeatedClip } from "./avatar-look";
import { planBoard, type BoardPlan } from "./board-topic";
import {
  ARJUN,
  MAYA,
  roomById,
  type Look,
  type RoomId,
  type RoomSpec,
  type Speaker,
} from "./personas";
import { GreenHallRoom, LectureRoom, StudioRoom, type Quality, type RoomLook } from "./rooms";
import { Text } from "./Text3D";
import { SpeakerSpot } from "./vfx";

export type { Speaker, RoomId } from "./personas";
export type { Quality } from "./rooms";

const A = "CharacterArmature|";
type V3 = [number, number, number];

/** Honour the OS "reduce motion" setting: the scene then renders on demand instead of animating. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------- avatars
const tmpQ1 = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpE = new THREE.Euler(0, 0, 0, "YXZ");
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function Avatar({
  look,
  position,
  speaking,
  faceTo,
  name,
  active,
  seed = 0,
  scale,
  seated = false,
  lookAt,
  showTag = true,
  gesture = false,
}: {
  look: Look;
  position: V3;
  speaking: boolean;
  /** reach toward the board (lecture mode, while explaining a formula or graph) */
  gesture?: boolean;
  faceTo: [number, number];
  name?: string;
  active?: boolean;
  seed?: number;
  /** overrides look.scale (kept out of `look` so the look object stays referentially stable) */
  scale?: number;
  seated?: boolean;
  /** world x/z of what this person is looking at (their head turns toward it) */
  lookAt?: [number, number];
  showTag?: boolean;
}) {
  const { scene, animations } = useGLTF(`/models/${look.model}.glb`);
  const model = useMemo(() => {
    const c = cloneSkinned(scene);
    applyLookMaterials(c, look);
    addAccessories(c, look.accessories);
    return c;
  }, [scene, look]);
  const clips = useMemo(() => {
    if (!seated) return animations;
    const idle = animations.find((a) => a.name === A + "Idle_Neutral");
    const sit = idle ? makeSeatedClip(model, idle) : null;
    return sit ? [...animations, sit] : animations;
  }, [animations, model, seated]);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(clips, group);
  useEffect(() => {
    const idle = seated
      ? actions["Seated_Idle"]
      : (actions[A + "Idle_Neutral"] ?? actions[A + "Idle"]);
    if (seated || !speaking) {
      idle?.reset().fadeIn(0.4).play();
      // de-synchronise background people so the room does not move in lockstep
      if (idle) idle.time = ((seed * 0.37) % 1) * idle.getClip().duration;
      return () => {
        idle?.fadeOut(0.4);
      };
    }
    // a standing teacher gestures while speaking — and keeps reaching toward the board while explaining it
    const seq = gesture ? [A + "Interact"] : [A + "Interact", A + "Idle", A + "Wave"];
    let i = 0;
    let cur = actions[seq[0]!];
    cur?.reset().fadeIn(0.35).play();
    const t = window.setInterval(() => {
      const next = actions[seq[++i % seq.length]!];
      if (next && next !== cur) {
        cur?.fadeOut(0.4);
        next.reset().fadeIn(0.4).play();
        cur = next;
      }
    }, 2600);
    return () => {
      window.clearInterval(t);
      cur?.fadeOut(0.4);
    };
  }, [speaking, actions, seed, seated, gesture]);

  const rotY = Math.atan2(faceTo[0] - position[0], faceTo[1] - position[2]);
  // Head: turns toward what the person is looking at, and nods while they talk.
  const head = useMemo(() => model.getObjectByName("Head") ?? null, [model]);
  const yaw = useRef(0);
  const talk = useRef(0);
  useFrame(({ clock }, delta) => {
    if (!head || !head.parent) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    talk.current += ((speaking ? 1 : 0) - talk.current) * Math.min(1, dt * 6);
    let target = 0;
    head.updateWorldMatrix(true, false);
    if (lookAt) {
      head.getWorldPosition(tmpV);
      target = Math.max(
        -0.95,
        Math.min(0.95, wrap(Math.atan2(lookAt[0] - tmpV.x, lookAt[1] - tmpV.z) - rotY)),
      );
    }
    yaw.current += (target - yaw.current) * Math.min(1, dt * 2.6);
    const amp = talk.current;
    const nod = (Math.sin(t * 7.3 + seed) * 0.05 + Math.sin(t * 3.1) * 0.035) * amp;
    const sway = Math.sin(t * 2.2 + seed) * 0.05 * amp;
    tmpE.set(nod, yaw.current + sway, 0, "YXZ");
    tmpQ1.setFromEuler(tmpE);
    head.getWorldQuaternion(tmpQ2);
    tmpQ1.multiply(tmpQ2);
    head.parent.getWorldQuaternion(tmpQ2).invert();
    head.quaternion.copy(tmpQ2.multiply(tmpQ1));
  });

  const s = scale ?? look.scale ?? 1;
  return (
    <group ref={group} position={position} rotation-y={rotY} scale={s}>
      <primitive object={model} />
      {name && showTag && (
        <Billboard position={[0, seated ? 1.75 : 2.05, 0]}>
          <RoundedBox args={[Math.max(0.9, name.length * 0.115), 0.26, 0.02]} radius={0.06}>
            <meshBasicMaterial
              color={active ? "#f3b13e" : "#1d2733"}
              transparent
              opacity={active ? 0.95 : 0.7}
            />
          </RoundedBox>
          <Text position={[0, 0, 0.02]} fontSize={0.14} color={active ? "#1d2733" : "#ffffff"} bold>
            {name}
          </Text>
        </Billboard>
      )}
    </group>
  );
}
(["teacher", "maya", "arjun"] as const).forEach((n) => useGLTF.preload(`/models/${n}.glb`));

// ---------------------------------------------------------------- camera
function CameraRig({
  speaker,
  room,
  reduced,
  lecture = false,
}: {
  speaker: Speaker;
  room: RoomSpec;
  reduced: boolean;
  lecture?: boolean;
}) {
  const { camera, invalidate } = useThree();
  const shot = useMemo(() => {
    if (lecture) {
      const tp = room.teacherPosition;
      return {
        pos: new THREE.Vector3(tp[0] - 0.9, 2.15, tp[2] + 3.6),
        look: new THREE.Vector3(tp[0] - 1.25, 1.75, tp[2]),
      };
    }
    const seat = speaker === "maya" ? room.mayaSeat : room.arjunSeat;
    if (speaker === "teacher")
      return {
        pos: new THREE.Vector3(0, 3.1, 8.8),
        look: new THREE.Vector3(room.teacherPosition[0] * 0.3, 2.2, -2),
      };
    return {
      pos: new THREE.Vector3(seat[0] + (seat[0] < 0 ? 1.1 : -1.1), seat[1] + 1.55, seat[2] - 3.3),
      look: new THREE.Vector3(
        seat[0] + (seat[0] < 0 ? 0.55 : -0.55),
        seat[1] + 0.95,
        seat[2] - 0.3,
      ),
    };
  }, [speaker, room, lecture]);
  useEffect(() => {
    if (!reduced) return;
    camera.position.copy(shot.pos);
    camera.lookAt(shot.look);
    invalidate();
  }, [reduced, shot, camera, invalidate]);
  const look = useRef(new THREE.Vector3());
  useFrame(({ clock }, delta) => {
    if (reduced) return;
    const t = clock.getElapsedTime();
    const k = 1 - Math.exp(-1.8 * Math.min(delta, 0.3)); // time-based, so it also settles on slow devices
    // a very slight handheld sway so the shot never feels frozen
    tmpV.set(
      shot.pos.x + Math.sin(t * 0.31) * 0.07,
      shot.pos.y + Math.sin(t * 0.43) * 0.04,
      shot.pos.z,
    );
    camera.position.lerp(tmpV, k);
    look.current.lerp(shot.look, k);
    camera.lookAt(look.current);
  });
  return null;
}

const STYLE: Record<RoomId, { dayWall: string; nightWall: string; fog: [number, number] }> = {
  "green-hall": { dayWall: "#d8d1bf", nightWall: "#2b2f3a", fog: [16, 34] },
  "lecture-theatre": { dayWall: "#e6e9ee", nightWall: "#2a3040", fog: [18, 36] },
  studio: { dayWall: "#27323d", nightWall: "#161b24", fog: [14, 30] },
};

function Lighting({ room, night, quality }: { room: RoomSpec; night: boolean; quality: Quality }) {
  const studio = room.id === "studio";
  const sm = quality === "high" ? 2048 : quality === "medium" ? 1024 : 512;
  return (
    <>
      <ambientLight
        intensity={night ? 0.32 : studio ? 0.4 : 0.55}
        color={night ? "#9fb0ff" : "#fff8ee"}
      />
      <hemisphereLight
        args={[night ? "#6677b8" : "#fff6e5", night ? "#2a2030" : "#8a6d4d", night ? 0.45 : 0.6]}
      />
      <directionalLight
        position={[-7, 9, 3]}
        intensity={night ? 0.55 : studio ? 1.0 : 1.9}
        color={night ? "#9db4ff" : "#fff1d2"}
        castShadow={quality !== "low"}
        shadow-mapSize-width={sm}
        shadow-mapSize-height={sm}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <Environment resolution={64}>
        <Lightformer
          intensity={night ? 0.4 : studio ? 0.8 : 1.8}
          position={[0, 7, 0]}
          scale={[12, 12, 1]}
        />
        <Lightformer
          intensity={night ? 0.3 : 1}
          color={night ? "#8fa8ff" : "#a9d9df"}
          position={[-7, 4, 0]}
          rotation-y={Math.PI / 2}
          scale={[7, 4, 1]}
        />
      </Environment>
    </>
  );
}

function Room({
  room,
  speaker,
  plan,
  concept,
  reduced,
  look,
  nameTags,
  lecture = false,
  pointing = false,
}: {
  room: RoomSpec;
  speaker: Speaker;
  plan: BoardPlan;
  concept: string;
  reduced: boolean;
  look: RoomLook;
  nameTags: boolean;
  lecture?: boolean;
  pointing?: boolean;
}) {
  const st = STYLE[room.id];
  const bg = look.night ? st.nightWall : st.dayWall;
  const tp = room.teacherPosition;
  const pos = (s: Speaker): [number, number] =>
    s === "teacher"
      ? [tp[0], tp[2]]
      : s === "maya"
        ? [room.mayaSeat[0], room.mayaSeat[2]]
        : [room.arjunSeat[0], room.arjunSeat[2]];
  /** the speaker looks at the class (or the teacher); everyone else looks at the speaker */
  const gaze = (who: Speaker): [number, number] =>
    who === speaker ? (who === "teacher" ? [0, 8] : [tp[0], tp[2]]) : pos(speaker);
  const Shell3 =
    room.id === "green-hall"
      ? GreenHallRoom
      : room.id === "lecture-theatre"
        ? LectureRoom
        : StudioRoom;
  return (
    <>
      <CameraRig speaker={speaker} room={room} reduced={reduced} lecture={lecture} />
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, st.fog[0], st.fog[1]]} />
      <Lighting room={room} night={look.night} quality={look.quality} />
      <Shell3 room={room} plan={plan} concept={concept} look={look} />

      <Avatar
        key={`${room.id}-teacher`}
        look={room.teacher.look}
        position={tp}
        speaking={speaker === "teacher"}
        // in lecture mode the teacher turns toward the board (on the left of the stage) to explain it
        faceTo={pointing ? [tp[0] - 4, tp[2] + 2.5] : [tp[0] * 0.3, 8]}
        lookAt={pointing ? [tp[0] - 4, tp[2] + 2.5] : gaze("teacher")}
        gesture={pointing}
        name={room.teacher.name}
        active={speaker === "teacher"}
        showTag={nameTags && speaker === "teacher" && !lecture}
        seed={1}
      />
      <Avatar
        key={`${room.id}-maya`}
        look={MAYA.look}
        position={room.mayaSeat}
        speaking={speaker === "maya"}
        faceTo={[room.mayaSeat[0], -10]}
        lookAt={gaze("maya")}
        seated
        name={MAYA.name}
        active={speaker === "maya"}
        showTag={nameTags && speaker === "teacher"}
        seed={2}
      />
      <Avatar
        key={`${room.id}-arjun`}
        look={ARJUN.look}
        position={room.arjunSeat}
        speaking={speaker === "arjun"}
        faceTo={[room.arjunSeat[0], -10]}
        lookAt={gaze("arjun")}
        seated
        name={ARJUN.name}
        active={speaker === "arjun"}
        showTag={nameTags && speaker === "teacher"}
        seed={3}
      />
      {room.classmates.map((c, i) => (
        <Avatar
          key={`${room.id}-cm-${i}`}
          look={c.look}
          position={c.position}
          speaking={false}
          faceTo={[c.position[0], -10]}
          lookAt={pos(speaker)}
          seated
          showTag={false}
          seed={i + 4}
        />
      ))}
      {look.fx && look.quality !== "low" && (
        <>
          <SpeakerSpot
            position={tp}
            active={speaker === "teacher"}
            color={room.id === "studio" ? "#7be9ff" : "#ffd37a"}
          />
          <SpeakerSpot position={room.mayaSeat} active={speaker === "maya"} color="#ffb88a" />
          <SpeakerSpot position={room.arjunSeat} active={speaker === "arjun"} color="#ffd37a" />
        </>
      )}
    </>
  );
}

const DPR: Record<Quality, [number, number]> = { low: [1, 1], medium: [1, 1.5], high: [1, 2] };
// Module constants: passing fresh objects would hand the renderer a new configuration on every
// render of the page (every keystroke in the doubt bar, for instance).
const CAMERA = { position: [0, 3.1, 8.8] as [number, number, number], fov: 48 };
const GL_HIGH = { antialias: true, powerPreference: "high-performance" as const };
const GL_LOW = { antialias: false, powerPreference: "high-performance" as const };
/**
 * Measure the canvas from offsetWidth/offsetHeight rather than getBoundingClientRect, and without
 * debouncing. getBoundingClientRect returns the *scaled* box wherever the page is zoomed or
 * transformed (the desktop app's browser pane does this), and a measurement that arrives as 0 is
 * never retried — the canvas then keeps its default 300×150 and the classroom renders as a blank
 * white rectangle until something else resizes it.
 */
const RESIZE = { offsetSize: true, debounce: 0, scroll: false };

/**
 * react-three-fiber builds its renderer only once it has measured the canvas at a non-zero size,
 * and it does not retry a measurement that arrives as zero. That happens whenever the classroom
 * mounts while the page is not being painted — a background tab, a hidden panel, a window that is
 * still opening — and the canvas is then left at its default 300×150: the room shows as a blank
 * white rectangle for the rest of the session. Any resize repairs it, because that re-measures.
 *
 * So watch for the stuck state and nudge it. This is cheap (it stops as soon as the canvas has a
 * real size) and it is what made the classroom appear to "fix itself" when the doubt bar changed
 * height as you typed.
 */
function useCanvasSizeGuard(canvas: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    let tries = 0;
    let timer = 0;
    const stuck = () => {
      const c = canvas.current;
      if (!c?.isConnected) return false;
      // 300×150 is the HTML default, i.e. a canvas three.js has never sized. The canvas's own
      // client size is stuck at that default too, so the container is what says there is room.
      const box = c.parentElement?.getBoundingClientRect();
      return c.width <= 300 && c.height <= 150 && (box?.width ?? 0) > 300 && (box?.height ?? 0) > 0;
    };
    const check = () => {
      if (!stuck()) return;
      window.dispatchEvent(new Event("resize"));
      if (++tries <= 20) timer = window.setTimeout(check, 250);
    };
    const start = () => {
      tries = 0;
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 100);
    };
    start();
    // becoming visible is the usual moment the first measurement could finally succeed
    document.addEventListener("visibilitychange", start);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", start);
    };
  }, [canvas]);
}

/**
 * Memoised on purpose. The whole page is one component, so every keystroke in the ask-a-doubt box
 * re-renders it — and without this, each of those re-renders walked the entire 3D scene graph
 * again (measured: 10 keystrokes = 22 scene renders and 140 avatar renders), which is what made
 * the classroom stutter while typing. Every prop below is a string or a boolean, so the default
 * shallow comparison is exactly right: the scene re-renders when the lesson changes, not when the
 * text in an unrelated input does.
 */
export const ClassroomScene = memo(function ClassroomScene({
  speaker,
  roomId,
  board,
  moduleTitle,
  conceptTitle,
  lessonText = "",
  reduced: reducedProp,
  quality = "medium",
  night = false,
  effects = true,
  nameTags = true,
  lecture = false,
  pointing = false,
}: {
  speaker: Speaker;
  roomId: RoomId;
  board: string;
  moduleTitle: string;
  conceptTitle: string;
  lessonText?: string;
  reduced?: boolean;
  quality?: Quality;
  night?: boolean;
  effects?: boolean;
  nameTags?: boolean;
  /** lecture mode: close shot of the teacher next to the lecture board */
  lecture?: boolean;
  /** the teacher is explaining something on the board */
  pointing?: boolean;
}) {
  const sys = usePrefersReducedMotion();
  const reduced = reducedProp ?? sys;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSizeGuard(canvasRef);
  return (
    <Canvas
      ref={canvasRef}
      shadows={quality !== "low" ? "soft" : false}
      frameloop={reduced ? "demand" : "always"}
      dpr={DPR[quality]}
      camera={CAMERA}
      gl={quality !== "low" ? GL_HIGH : GL_LOW}
      resize={RESIZE}
    >
      <Suspense fallback={null}>
        <ClassroomWorld
          speaker={speaker}
          roomId={roomId}
          board={board}
          moduleTitle={moduleTitle}
          conceptTitle={conceptTitle}
          lessonText={lessonText}
          reduced={reduced}
          quality={quality}
          night={night}
          effects={effects}
          nameTags={nameTags}
          lecture={lecture}
          pointing={pointing}
        />
      </Suspense>
    </Canvas>
  );
});

/** Everything that lives inside the Canvas (exported so it can be rendered headlessly in tests). */
export function ClassroomWorld({
  speaker,
  roomId,
  board,
  moduleTitle,
  conceptTitle,
  lessonText = "",
  reduced = false,
  quality = "medium",
  night = false,
  effects = true,
  nameTags = true,
  lecture = false,
  pointing = false,
}: {
  speaker: Speaker;
  roomId: RoomId;
  board: string;
  moduleTitle: string;
  conceptTitle: string;
  lessonText?: string;
  reduced?: boolean;
  quality?: Quality;
  night?: boolean;
  effects?: boolean;
  nameTags?: boolean;
  /** lecture mode: close shot of the teacher next to the lecture board */
  lecture?: boolean;
  /** the teacher is explaining something on the board */
  pointing?: boolean;
}) {
  const room = roomById(roomId);
  const plan = useMemo(
    () => planBoard({ moduleTitle, conceptTitle, board, lessonText }),
    [moduleTitle, conceptTitle, board, lessonText],
  );
  const look = useMemo<RoomLook>(
    () => ({ quality, night, fx: effects && quality !== "low" }),
    [quality, night, effects],
  );
  return (
    <Room
      room={room}
      speaker={speaker}
      plan={plan}
      concept={conceptTitle}
      reduced={reduced}
      look={look}
      nameTags={nameTags}
      lecture={lecture}
      pointing={pointing}
    />
  );
}
