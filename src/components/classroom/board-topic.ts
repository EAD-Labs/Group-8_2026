// Decides which smart-board visual to show. Pure and dependency-free so it can be unit tested.
//
// The previous implementation matched loose regexes against the *whole conversation text*, so a
// word like "worked" or "network" in a probability lesson could trigger the thermodynamics
// "heat/work" diagram. Here the choice is driven by the concept/module title (word-boundary
// matching) and only falls back to generic phrases from the lesson text for unknown topics.

export type VisualKind =
  | "energy"
  | "entropy"
  | "venn"
  | "bayes"
  | "distribution"
  | "sampling"
  | "interval"
  | "scatter"
  | "curves"
  | "flow";

export type BoardPlan = {
  kind: VisualKind;
  variant: string;
  /** three labels used by flow-style visuals */
  labels: [string, string, string];
  /** short caption under the visual */
  caption: string;
  /** heading written at the top of the board */
  heading: string;
};

const has = (text: string, re: RegExp) => re.test(text);

const FLOW_PRESETS: Array<{
  re: RegExp;
  labels: [string, string, string];
  caption: string;
}> = [
  {
    re: /\b(reaction|chemical|chemistry|stoichiometr\w*|equilibrium|catalyst|acid|oxidation|reduction)\b/,
    labels: ["REACTANTS", "REACTION", "PRODUCTS"],
    caption: "Track species, conditions and conservation",
  },
  {
    re: /\b(cell|biology|organism|genes?|dna|protein|enzyme|ecosystem|photosynthesis|respiration|evolution)\b/,
    labels: ["STRUCTURE", "PROCESS", "FUNCTION"],
    caption: "Connect biological structure to its role",
  },
  {
    re: /\b(algorithms?|code|programs?|programming|computers?|machine learning|neural networks?|data structures?|complexity|databases?|artificial intelligence)\b/,
    labels: ["INPUT / DATA", "ALGORITHM", "OUTPUT"],
    caption: "Inspect assumptions, steps and result",
  },
  {
    re: /\b(history|historical|revolution|empire|war|civili[sz]ation|colonial|treaty|century)\b/,
    labels: ["CONTEXT", "TURNING POINT", "CONSEQUENCE"],
    caption: "Trace cause, decision and consequence",
  },
];

const clean = (s: string) =>
  s
    .replace(
      /\b(the|and|with|from|that|this|into|when|what|which|where|your|their|about|after|before|because|through|using|between|concept|explain|understand|lesson)\b/gi,
      " ",
    )
    .replace(/[^\p{L}\p{N} ΔΣ=+−*/().%-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Up to three short, distinct phrases pulled from the lesson text (for unknown topics). */
export function phrases(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.split(/[.!?;:\n→]+/).map(clean)) {
    if (chunk.length <= 3) continue;
    const short = chunk.split(/\s+/).slice(0, 4).join(" ");
    if (short && !out.some((x) => x.toLowerCase() === short.toLowerCase())) out.push(short);
    if (out.length === 3) break;
  }
  return out;
}

export function planBoard(input: {
  moduleTitle: string;
  conceptTitle: string;
  board: string;
  lessonText?: string;
}): BoardPlan {
  const concept = input.conceptTitle.toLowerCase();
  const scope = `${input.moduleTitle} ${input.conceptTitle}`.toLowerCase();
  const board = input.board.trim();
  const heading = (board || input.conceptTitle || "Today's concept").slice(0, 60);
  const base = {
    variant: "",
    labels: ["", "", ""] as [string, string, string],
    caption: "",
    heading,
  };

  // 1. Concept-level matches (specific beats general)
  if (has(concept, /\bsign convention/))
    return {
      ...base,
      kind: "energy",
      variant: "signs",
      caption: "Heat in and work out are positive",
    };
  if (has(concept, /\b(first law|energy accounting|enthalpy|exergy)\b|\bheat\b/))
    return { ...base, kind: "energy", variant: "first-law", caption: "ΔU = Q − W" };
  if (has(concept, /\b(reversible|irreversible|reversibility)\b/))
    return {
      ...base,
      kind: "entropy",
      variant: "reversibility",
      caption: "Reversible: ΔS = 0 · Irreversible: ΔS > 0",
    };
  if (has(concept, /\b(second law|entropy)\b/))
    return { ...base, kind: "entropy", variant: "second-law", caption: "ΔS universe ≥ 0" };
  if (has(concept, /\bconditional\b/))
    return { ...base, kind: "venn", variant: "conditional", caption: "P(A | B) = P(A ∩ B) / P(B)" };
  if (has(concept, /\bbayes\b/))
    return {
      ...base,
      kind: "bayes",
      variant: "",
      caption: "Rare event + imperfect test → posterior is much lower than the test accuracy",
    };
  if (has(concept, /\bindependen\w*/))
    return {
      ...base,
      kind: "venn",
      variant: "independence",
      caption: "Independent: P(A ∩ B) = P(A) · P(B)",
    };
  if (has(concept, /\b(expectation|random variables?)\b/))
    return { ...base, kind: "distribution", variant: "", caption: "E[X] = Σ x · P(x)" };
  if (has(concept, /\bsampling\b/))
    return {
      ...base,
      kind: "sampling",
      variant: "",
      caption: "Quadruple n → standard error halves: SE = σ/√n",
    };
  if (has(concept, /\bconfidence\b/))
    return {
      ...base,
      kind: "interval",
      variant: "",
      caption: "≈95% of intervals from a valid procedure cover the true value",
    };
  if (has(concept, /\b(correlation|causation|regression)\b/))
    return {
      ...base,
      kind: "scatter",
      variant: "",
      caption: "Association ≠ intervention effect — look for confounders",
    };

  // 2. Module-level subject (custom modules etc.)
  if (has(scope, /\b(thermodynamic\w*)\b/))
    return { ...base, kind: "energy", variant: "first-law", caption: "ΔU = Q − W" };
  if (has(scope, /\b(probability|statistics|statistical)\b/))
    return {
      ...base,
      kind: "distribution",
      variant: "",
      caption: "Describe the distribution, then reason about it",
    };
  if (
    has(
      scope,
      /econom|\b(market|supply|demand|inflation|finance|investment|profit|revenue|portfolio)\b/,
    )
  )
    return {
      ...base,
      kind: "curves",
      variant: "market",
      caption: "Separate assumptions from observed evidence",
    };
  if (has(scope, /\b(derivative|integral|function|calculus|optimi[sz]ation|geometry|algebra)\b/))
    return {
      ...base,
      kind: "curves",
      variant: "function",
      caption: "State conditions, solve, then verify",
    };
  for (const p of FLOW_PRESETS)
    if (has(scope, p.re)) return { ...base, kind: "flow", labels: p.labels, caption: p.caption };

  // 3. Unknown topic: build a three-part flow from the actual lesson text
  const found = phrases(input.lessonText || board || input.conceptTitle);
  const steps = has(
    `${board} ${input.lessonText ?? ""}`.toLowerCase(),
    /predict|claim|mechanism|evidence|teach-back/,
  );
  return {
    ...base,
    kind: "flow",
    variant: "generic",
    labels: [
      (found[0] || "Core idea").toUpperCase(),
      (found[1] || "How it works").toUpperCase(),
      (found[2] || "Apply & check").toUpperCase(),
    ],
    caption: steps
      ? "Predict → explain → test your idea"
      : "Explore the idea → connect it → apply it",
  };
}
