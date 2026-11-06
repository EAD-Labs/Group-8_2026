// Part 1 data model: a "verified record" is the one reconciled, segmented account of a concept that
// everything in the classroom is generated from.

export type Bloom = "Remember" | "Understand" | "Apply" | "Analyse";
export type ClaimRole = "define" | "mechanism" | "pitfall" | "example" | "boundary" | "formula";

export type Claim = { id: string; role: ClaimRole; text: string };
export type Misconception = { id: string; name: string; wrong: string; right: string };
export type BlankItem = {
  id: string;
  before: string;
  answer: string;
  after: string;
  accept: string[];
  claimId: string;
  misconceptionId?: string;
};
export type HintItem = {
  id: string;
  question: string;
  hint: string;
  answer: string;
  accept: string[];
  claimId: string;
  misconceptionId?: string;
};

export type Disagreement = {
  id: string;
  point: string;
  positions: Array<{ agent: string; claim: string }>;
  resolution: string;
  reasoning: string;
  claimId?: string;
};

export type Provenance = {
  /** who produced the content: real provider names, or "seeded-reference" for pre-authored records */
  providers: string[];
  disagreements: Disagreement[];
  confidence: "high" | "medium" | "low";
  verifiedAt: string;
  /** "seeded" = authored reference record shipped with the app; "verified" = produced by the live engine */
  origin: "seeded" | "verified";
  /** "single": drafted then reviewed by one AI (capped at medium confidence); "multi": several independent agents */
  mode?: "single" | "multi";
  note?: string;
  failedProviders?: string[];
};

export type VerifiedRecord = {
  id: string;
  /** `${moduleSlug}:${conceptSlug}` for pilot concepts; a slug of the topic for live topics */
  key: string;
  topic: string;
  title: string;
  bloom: Bloom;
  claims: Claim[];
  misconceptions: Misconception[];
  /** foundational questions the basic student asks */
  basic: string[];
  /** boundary / edge-case probes the advanced student raises */
  probes: string[];
  blanks: BlankItem[];
  hints: HintItem[];
  example: string;
  equation: string;
  transfer: string;
  /** concept keys this one builds on (used to re-test earlier material in context) */
  prereq: string[];
  provenance: Provenance;
};

export const normTopic = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
export const topicKey = (s: string) => {
  const n = normTopic(s);
  let h = 5381;
  for (let i = 0; i < n.length; i++) h = ((h << 5) + h + n.charCodeAt(i)) | 0;
  return `topic:${n.slice(0, 40).replace(/ /g, "-")}:${(h >>> 0).toString(36)}`;
};

/** Key for a live (engine-verified) topic: `verified:<slug>`, shaped like the pilot keys `module:concept`. */
export const liveKey = (topic: string) =>
  `verified:${topicKey(topic)
    .replace(/^topic:/, "")
    .replace(/:/g, "-")}`;
