// Pure data: classrooms, teacher personas, student personas and their avatar "looks".
// Kept free of three.js imports so it can be used from both the UI and tests.

export type Speaker = "teacher" | "maya" | "arjun";
export type ModelKey = "teacher" | "maya" | "arjun";
export type Accessory = "glasses-dark" | "glasses-gold" | "badge";
export type RoomId = "green-hall" | "lecture-theatre" | "studio";
export type BoardStyle = "smart-green" | "interactive-white" | "holo";

/** A look recolours a base model per material name, can hide meshes and add accessories. */
export type Look = {
  model: ModelKey;
  /** material name -> sRGB hex colour */
  colors: Record<string, string>;
  /** mesh names to hide (e.g. "Backpack") */
  hide?: string[];
  accessories?: Accessory[];
  scale?: number;
};

export type VoiceProfile = {
  gender: "female" | "male";
  /** preferred BCP-47 language tags, best first */
  langs: string[];
  rate: number;
  pitch: number;
};

export type Persona = {
  id: string;
  name: string;
  /** short spoken/visible role line */
  role: string;
  look: Look;
  voice: VoiceProfile;
};

/** `position` is where the person sits (x, platform height, z); desk and chair are derived from it. */
export type ClassmateSpec = { look: Look; position: [number, number, number]; scale?: number };

export type RoomSpec = {
  id: RoomId;
  /** short label for the room picker */
  name: string;
  tagline: string;
  board: BoardStyle;
  teacher: Persona;
  /** where the teacher stands */
  teacherPosition: [number, number, number];
  /** where the two main learners sit */
  mayaSeat: [number, number, number];
  arjunSeat: [number, number, number];
  classmates: ClassmateSpec[];
  /** extra empty desks that make the room feel lived-in */
  emptySeats: Array<[number, number, number]>;
};

// ---------- Students (same two learners in every room) ----------
export const MAYA: Persona = {
  id: "maya",
  name: "Maya",
  role: "foundational learner",
  look: {
    model: "maya",
    colors: {
      Skin: "#c58a63",
      Hair_Blond: "#3a2216",
      Hair_Brown: "#2a170f",
      White: "#69a7d8",
      Orange: "#3e5e8c",
      Grey: "#e9e9e9",
    },
    scale: 0.92,
  },
  voice: { gender: "female", langs: ["en-IN", "en-GB", "en-US"], rate: 1.04, pitch: 1.18 },
};

export const ARJUN: Persona = {
  id: "arjun",
  name: "Arjun",
  role: "probing learner",
  look: {
    model: "arjun",
    colors: {
      Skin: "#9a6644",
      Hair: "#241a14",
      Eyebrows: "#241a14",
      Green: "#c9792f",
      LightGreen: "#e0a24f",
      Brown2: "#4a4036",
      Brown: "#5a4a3a",
    },
    scale: 0.95,
  },
  voice: { gender: "male", langs: ["en-IN", "en-US", "en-GB"], rate: 1.02, pitch: 0.98 },
};

// ---------- Teachers: three clearly different people ----------
export const DR_RAO: Persona = {
  id: "rao",
  name: "Dr Rao",
  role: "Professor of Engineering Sciences",
  look: {
    model: "teacher",
    colors: {
      Skin: "#a86f48",
      Hair: "#6b6a68",
      Eyebrows: "#55524f",
      Suit: "#27344a",
      White: "#eef1f4",
      Tie: "#8a2f2f",
      Black: "#161616",
    },
    accessories: ["glasses-dark"],
    scale: 1.04,
  },
  voice: { gender: "male", langs: ["en-IN", "en-GB", "en-US"], rate: 0.93, pitch: 0.82 },
};

export const PROF_MEERA: Persona = {
  id: "meera",
  name: "Prof. Meera",
  role: "Professor of Data & Statistics",
  look: {
    model: "maya",
    colors: {
      Skin: "#b9805a",
      Hair_Blond: "#1d1511",
      Hair_Brown: "#1d1511",
      White: "#7b2d4f",
      Orange: "#2b3036",
      Grey: "#1c1c1c",
    },
    accessories: ["glasses-gold", "badge"],
    scale: 1.04,
  },
  voice: { gender: "female", langs: ["en-IN", "en-GB", "en-US"], rate: 0.97, pitch: 1.02 },
};

export const PROF_KABIR: Persona = {
  id: "kabir",
  name: "Prof. Kabir",
  role: "Seminar lead, applied topics",
  look: {
    model: "arjun",
    hide: ["Backpack"],
    colors: {
      Skin: "#8d5b3d",
      Hair: "#17120f",
      Eyebrows: "#17120f",
      Green: "#2f4b63",
      LightGreen: "#4b6f8c",
      Brown2: "#3b3f45",
      Brown: "#2f3338",
      Gold: "#c8a24a",
      Black: "#161616",
      Grey: "#2a2a2a",
    },
    accessories: ["badge"],
    scale: 1.06,
  },
  voice: { gender: "male", langs: ["en-GB", "en-AU", "en-IN"], rate: 1.0, pitch: 1.0 },
};

// ---------- Background classmates (vary per room) ----------
const mayaVariant = (colors: Record<string, string>): Look => ({
  model: "maya",
  colors: { Hair_Brown: colors["Hair_Blond"] ?? "#2a170f", ...colors },
});
const arjunVariant = (colors: Record<string, string>, hide?: string[]): Look => ({
  model: "arjun",
  colors,
  ...(hide ? { hide } : {}),
});

const CL_A = mayaVariant({
  Skin: "#8a5a3c",
  Hair_Blond: "#150f0c",
  White: "#d9534f",
  Orange: "#2e3b4e",
});
const CL_B = arjunVariant({
  Skin: "#c08a62",
  Hair: "#4b3424",
  Eyebrows: "#4b3424",
  Green: "#3d7a5b",
  LightGreen: "#5ea184",
});
const CL_C = mayaVariant({
  Skin: "#d3a07a",
  Hair_Blond: "#6a4630",
  White: "#8c6bb1",
  Orange: "#554a3a",
});
const CL_D = arjunVariant(
  {
    Skin: "#a06f4c",
    Hair: "#111111",
    Eyebrows: "#111111",
    Green: "#7a3b3b",
    LightGreen: "#a65b5b",
  },
  ["Backpack"],
);

// ---------- The three classrooms ----------
export const ROOMS: RoomSpec[] = [
  {
    id: "green-hall",
    name: "Green Smart Board Hall",
    tagline: "Dr Rao · chalk-green smart board",
    board: "smart-green",
    teacher: DR_RAO,
    teacherPosition: [-0.6, 0, -3.35],
    mayaSeat: [-2.5, 0, 1.2],
    arjunSeat: [2.5, 0, 1.2],
    classmates: [
      { look: CL_D, position: [-2.5, 0, 3.2] },
      { look: CL_C, position: [2.5, 0, 3.2] },
      { look: CL_A, position: [0, 0, 3.2] },
      { look: CL_B, position: [-2.5, 0, 5.2] },
    ],
    emptySeats: [
      [0, 0, 1.2],
      [2.5, 0, 5.2],
      [0, 0, 5.2],
    ],
  },
  {
    id: "lecture-theatre",
    name: "Tiered Lecture Theatre",
    tagline: "Prof. Meera · interactive display",
    board: "interactive-white",
    teacher: PROF_MEERA,
    teacherPosition: [-2.9, 0, -3.1],
    mayaSeat: [-2.4, 0, 1.0],
    arjunSeat: [2.4, 0, 1.0],
    classmates: [
      { look: CL_A, position: [0, 0, 1.0] },
      { look: CL_B, position: [-2.4, 0.42, 3.1] },
      { look: CL_D, position: [2.4, 0.42, 3.1] },
      { look: CL_C, position: [0.0, 0.84, 5.2] },
    ],
    emptySeats: [
      [0, 0.42, 3.1],
      [-2.4, 0.84, 5.2],
      [2.4, 0.84, 5.2],
    ],
  },
  {
    id: "studio",
    name: "Seminar Studio",
    tagline: "Prof. Kabir · holographic panel",
    board: "holo",
    teacher: PROF_KABIR,
    teacherPosition: [3.1, 0, -3.0],
    mayaSeat: [-2.8, 0, 1.0],
    arjunSeat: [2.8, 0, 1.0],
    classmates: [
      { look: CL_C, position: [-2.8, 0, 3.4] },
      { look: CL_B, position: [2.8, 0, 3.4] },
      { look: CL_D, position: [-0.2, 0, 2.2] },
    ],
    emptySeats: [],
  },
];

export const roomById = (id: RoomId): RoomSpec => ROOMS.find((r) => r.id === id) ?? ROOMS[0]!;

/** Which classroom a module opens in by default. Learners can switch freely afterwards. */
export function defaultRoomForModule(moduleSlug: string): RoomId {
  if (moduleSlug === "thermodynamics") return "green-hall";
  if (moduleSlug === "probability") return "lecture-theatre";
  return "studio"; // custom / AI-generated / user-material modules
}

export function personaFor(room: RoomSpec, speaker: Speaker): Persona {
  return speaker === "teacher" ? room.teacher : speaker === "maya" ? MAYA : ARJUN;
}
