// Calibration: does the learner know how well they know it? Confidence is asked BEFORE the result is shown
// (at the checkpoint, and before each retention quiz) and compared with the actual score.
export type Bucket = 0 | 1 | 2; // 0 low / guessing / "few", 1 middle / fairly sure / "about half", 2 high / certain / "most"
/** what a score means on the same 3-step scale as the confidence question */
export const scoreBucket = (pct: number): Bucket => (pct < 50 ? 0 : pct < 80 ? 1 : 2);
/** the score each confidence level claims, for the size of the gap */
export const CLAIMED = [30, 65, 90] as const;
export type Judgement = "matched" | "over" | "under";
export const judge = (conf: number, pct: number): Judgement => {
  const b = scoreBucket(pct);
  return conf === b ? "matched" : conf > b ? "over" : "under";
};

/** a prediction made before a retention quiz, and the result */
export type RetentionGuess = {
  at: number;
  predicted: Bucket;
  scorePct: number;
  concepts: string[];
};
const KEY = "kyro_retention_guesses_v1";
export function loadGuesses(storage: Pick<Storage, "getItem">): RetentionGuess[] {
  try {
    const a = JSON.parse(storage.getItem(KEY) ?? "[]");
    return Array.isArray(a)
      ? a.filter(
          (g) =>
            g &&
            [0, 1, 2].includes(g.predicted) &&
            typeof g.scorePct === "number" &&
            Array.isArray(g.concepts),
        )
      : [];
  } catch {
    return [];
  }
}
export function recordGuess(storage: Pick<Storage, "getItem" | "setItem">, g: RetentionGuess) {
  try {
    storage.setItem(KEY, JSON.stringify([...loadGuesses(storage), g].slice(-200)));
  } catch {
    /* storage full: the quiz still counts */
  }
}
