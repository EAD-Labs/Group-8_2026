// Measurement layer (HLD §6.6): the five-state concept ladder, the doubt log and badges.
// A concept advances only by evidence and can be demoted, so the display shows current standing.

export const DAY = 86_400_000;
export type Ladder = "not-started" | "exposed" | "understood" | "retained" | "mastered";
export const LADDER: Ladder[] = ["not-started", "exposed", "understood", "retained", "mastered"];

export type ConceptState = {
  state: Ladder;
  exposedAt?: number;
  understoodAt?: number;
  retainedAt?: number;
  masteredAt?: number;
  /** when the next delayed check becomes due */
  nextCheckAt?: number;
  demotions: number;
  /** a delayed check was failed: the next dialogue opens by revisiting the doubts */
  revise: boolean;
  transferPassed: boolean;
};
export type DoubtSource =
  "blank" | "hint" | "checkpoint" | "teachback" | "retention" | "voice" | "recall" | "mcq";
export type Doubt = {
  id: string;
  key: string;
  misconceptionId: string;
  name: string;
  source: DoubtSource;
  openedAt: number;
  closedAt?: number;
};
export type Learner = {
  concepts: Record<string, ConceptState>;
  doubts: Doubt[];
  /** points ledger: each learning event awards once */
  awarded: Record<string, number>;
  /** counters behind the participation badges */
  counters: { guesses: number; blanks: number; asked: number; doubtsClosed: number };
};
export const emptyLearner = (): Learner => ({
  concepts: {},
  doubts: [],
  awarded: {},
  counters: { guesses: 0, blanks: 0, asked: 0, doubtsClosed: 0 },
});
export const blankConcept = (): ConceptState => ({
  state: "not-started",
  demotions: 0,
  revise: false,
  transferPassed: false,
});
export const stateOf = (l: Learner, key: string): ConceptState => l.concepts[key] ?? blankConcept();
const rank = (s: Ladder) => LADDER.indexOf(s);
const put = (l: Learner, key: string, c: ConceptState): Learner => ({
  ...l,
  concepts: { ...l.concepts, [key]: c },
});

/** The dialogue was completed: the concept is at least Exposed. */
export function dialogueCompleted(l: Learner, key: string, now: number): Learner {
  const c = stateOf(l, key);
  return rank(c.state) >= 1 ? l : put(l, key, { ...c, state: "exposed", exposedAt: now });
}
/** Day-0 checkpoint. Passing makes the concept Understood and schedules the delayed check. */
export function checkpointResult(
  l: Learner,
  key: string,
  passed: boolean,
  now: number,
  delayDays: number,
): Learner {
  const c = stateOf(l, key);
  const base = rank(c.state) < 1 ? { ...c, state: "exposed" as Ladder, exposedAt: now } : c;
  if (!passed) return put(l, key, base);
  if (rank(base.state) >= 2) return put(l, key, base); // already Understood or beyond: the checkpoint cannot promote further
  return put(l, key, {
    ...base,
    state: "understood",
    understoodAt: now,
    nextCheckAt: now + delayDays * DAY,
  });
}
/**
 * A delayed check. Only a check taken on or after `nextCheckAt` can promote (so a long session on the
 * day of learning cannot reach Retained). Failing demotes to Understood and re-queues for tomorrow.
 */
export function delayedCheck(
  l: Learner,
  key: string,
  passed: boolean,
  now: number,
  delayDays: number,
): { learner: Learner; promoted: boolean; demoted: boolean; counted: boolean } {
  const c = stateOf(l, key);
  if (rank(c.state) < 2) return { learner: l, promoted: false, demoted: false, counted: false };
  const due = (c.nextCheckAt ?? 0) <= now;
  if (!due) return { learner: l, promoted: false, demoted: false, counted: false }; // early practice is not evidence either way
  if (!passed) {
    return {
      learner: put(l, key, {
        ...c,
        state: "understood",
        nextCheckAt: now + DAY,
        demotions: c.demotions + (rank(c.state) > 2 ? 1 : 0),
        revise: true,
        transferPassed: false,
      }),
      promoted: false,
      demoted: rank(c.state) > 2,
      counted: true,
    };
  }
  const next = Math.max(delayDays * 2, 7) * DAY;
  if (c.state === "understood")
    return {
      learner: put(l, key, {
        ...c,
        state: "retained",
        retainedAt: now,
        nextCheckAt: now + next,
        revise: false,
      }),
      promoted: true,
      demoted: false,
      counted: true,
    };
  return {
    learner: put(l, key, { ...c, nextCheckAt: now + next, revise: false }),
    promoted: false,
    demoted: false,
    counted: true,
  };
}
/** A transfer problem. Passing it on a Retained concept makes it Mastered; otherwise it is only recorded. */
export function transferResult(
  l: Learner,
  key: string,
  passed: boolean,
  now: number,
): { learner: Learner; promoted: boolean } {
  const c = stateOf(l, key);
  if (passed && c.state === "retained")
    return {
      learner: put(l, key, { ...c, state: "mastered", masteredAt: now, transferPassed: true }),
      promoted: true,
    };
  return { learner: l, promoted: false };
}

// ---------------------------------------------------------------- doubt log
export function openDoubt(
  l: Learner,
  key: string,
  misconceptionId: string,
  name: string,
  source: DoubtSource,
  now: number,
): Learner {
  if (!misconceptionId) return l;
  if (
    l.doubts.some(
      (d) => d.key === key && d.misconceptionId === misconceptionId && d.closedAt === undefined,
    )
  )
    return l;
  return {
    ...l,
    doubts: [
      ...l.doubts,
      {
        id: `${key}#${misconceptionId}#${l.doubts.length + 1}`,
        key,
        misconceptionId,
        name,
        source,
        openedAt: now,
      },
    ],
  };
}
/** A doubt is closed only by a correct answer on a LATER occasion than the one that opened it. */
export function closeDoubts(
  l: Learner,
  key: string,
  misconceptionIds: string[],
  now: number,
  minAfter = 0,
): { learner: Learner; closed: Doubt[] } {
  const closed: Doubt[] = [];
  const doubts = l.doubts.map((d) => {
    if (
      d.key === key &&
      d.closedAt === undefined &&
      misconceptionIds.includes(d.misconceptionId) &&
      now > d.openedAt + minAfter
    ) {
      const c = { ...d, closedAt: now };
      closed.push(c);
      return c;
    }
    return d;
  });
  return {
    learner: {
      ...l,
      doubts,
      counters: { ...l.counters, doubtsClosed: l.counters.doubtsClosed + closed.length },
    },
    closed,
  };
}
export const openDoubtIds = (l: Learner, key: string) =>
  l.doubts.filter((d) => d.key === key && d.closedAt === undefined).map((d) => d.misconceptionId);

// ---------------------------------------------------------------- points ledger
export function award(
  l: Learner,
  id: string,
  points: number,
): { learner: Learner; gained: number } {
  if (l.awarded[id] !== undefined || points <= 0) return { learner: l, gained: 0 };
  return { learner: { ...l, awarded: { ...l.awarded, [id]: points } }, gained: points };
}
export const ledgerTotal = (l: Learner) => Object.values(l.awarded).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- badges
export type Badge = {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  module?: string;
};
/** A module badge needs EVERY concept Retained (or Mastered) and none currently demoted. */
export function moduleBadge(
  l: Learner,
  moduleSlug: string,
  moduleTitle: string,
  conceptKeys: string[],
): Badge {
  const ok = conceptKeys.length > 0 && conceptKeys.every((k) => rank(stateOf(l, k).state) >= 3);
  return {
    id: `module-${moduleSlug}`,
    title: `${moduleTitle} — Retained`,
    description: "Every concept in the module reached Retained, and none has since been demoted.",
    earned: ok,
    module: moduleSlug,
  };
}
export function participationBadges(l: Learner): Badge[] {
  const c = l.counters;
  return [
    {
      id: "first-guess",
      title: "First guess",
      description: "Committed a guess before revealing a hint.",
      earned: c.guesses >= 1,
    },
    {
      id: "blank-builder",
      title: "Blank builder",
      description: "Filled 5 blanks in dialogues.",
      earned: c.blanks >= 5,
    },
    {
      id: "curious",
      title: "Curious mind",
      description: "Asked 3 questions as the third student.",
      earned: c.asked >= 3,
    },
    {
      id: "doubt-closer",
      title: "Doubt closer",
      description: "Closed 3 doubts.",
      earned: c.doubtsClosed >= 3,
    },
  ];
}
