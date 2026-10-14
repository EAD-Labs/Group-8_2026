import type { AssessmentType } from "./evaluation";

export type Attempt = {
  id: string;
  moduleSlug: string;
  conceptSlug: string;
  conceptTitle: string;
  assessmentType: AssessmentType;
  score: number;
  response: string;
  feedback: string;
  nextStep: string;
  gradedBy: "ai" | "fallback";
  at: string;
};

const KEY = "kyro_attempts";
const PASS = 70;
const REVIEW_AFTER_DAYS = 2;

export function loadAttempts(): Attempt[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? (raw as Attempt[]) : [];
  } catch {
    return [];
  }
}

export function saveAttempt(attempt: Attempt): Attempt[] {
  const next = [...loadAttempts(), attempt];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A full or blocked store must not break the lesson flow.
  }
  return next;
}

export type ConceptEvidence = {
  conceptSlug: string;
  conceptTitle: string;
  moduleSlug: string;
  mastery: number;
  attempts: number;
  checkpointScore: number | null;
  transferScore: number | null;
  retained: boolean;
  dueForReview: boolean;
  lastSeen: string;
  weakest: Attempt | null;
};

function bestOf(attempts: Attempt[], type: AssessmentType): number | null {
  const scores = attempts.filter((a) => a.assessmentType === type).map((a) => a.score);
  return scores.length ? Math.max(...scores) : null;
}

export function conceptEvidence(attempts: Attempt[]): ConceptEvidence[] {
  const groups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const list = groups.get(a.conceptSlug);
    if (list) list.push(a);
    else groups.set(a.conceptSlug, [a]);
  }

  return [...groups.values()].map((group) => {
    const latest = group.reduce((a, b) => (a.at > b.at ? a : b));
    const checkpointScore = bestOf(group, "checkpoint");
    const transferScore = bestOf(group, "transfer");
    const bestPerType = (
      ["prediction", "checkpoint", "teach_back", "transfer", "retention"] as const
    )
      .map((t) => bestOf(group, t))
      .filter((s): s is number => s !== null);
    const ageDays = (Date.now() - new Date(latest.at).getTime()) / 86_400_000;

    return {
      conceptSlug: latest.conceptSlug,
      conceptTitle: latest.conceptTitle,
      moduleSlug: latest.moduleSlug,
      mastery: Math.round(bestPerType.reduce((s, n) => s + n, 0) / bestPerType.length),
      attempts: group.length,
      checkpointScore,
      transferScore,
      retained:
        checkpointScore !== null &&
        checkpointScore >= PASS &&
        transferScore !== null &&
        transferScore >= PASS,
      dueForReview: ageDays >= REVIEW_AFTER_DAYS || bestPerType.some((s) => s < PASS),
      lastSeen: latest.at,
      weakest: group.reduce((a, b) => (a.score <= b.score ? a : b)),
    };
  });
}

export type EvidenceSummary = {
  conceptsAttempted: number;
  conceptsRetained: number;
  checkpointsPassed: number;
  checkpointsTaken: number;
  transferScore: number | null;
  dueForReview: number;
  totalAttempts: number;
};

export function summarise(attempts: Attempt[]): EvidenceSummary {
  const evidence = conceptEvidence(attempts);
  const checkpoints = attempts.filter((a) => a.assessmentType === "checkpoint");
  const transfers = attempts.filter((a) => a.assessmentType === "transfer");

  return {
    conceptsAttempted: evidence.length,
    conceptsRetained: evidence.filter((e) => e.retained).length,
    checkpointsPassed: checkpoints.filter((a) => a.score >= PASS).length,
    checkpointsTaken: checkpoints.length,
    transferScore: transfers.length
      ? Math.round(transfers.reduce((s, a) => s + a.score, 0) / transfers.length)
      : null,
    dueForReview: evidence.filter((e) => e.dueForReview).length,
    totalAttempts: attempts.length,
  };
}

export const PASS_MARK = PASS;
