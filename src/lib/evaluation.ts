export type AssessmentType =
  | "prediction"
  | "checkpoint"
  | "teach_back"
  | "transfer"
  | "retention";

export type GradeResult = {
  score: number;
  feedback: string;
  strengths: string[];
  next_step: string;
};

const STOPWORDS = new Set([
  "about","after","again","also","because","before","being","between","could",
  "does","from","have","into","more","only","should","that","their","there",
  "these","they","this","through","using","what","when","where","which","with",
  "would","your","than","then","them","were","will","while","each","same","here",
  "must","need","does","not","and","for","the","you","are","can","how","why",
  "our","its","a","an","to","of","in","is","on","or","as","by","be","it","at"
]);

function tokens(text: string) {
  return text.toLowerCase()
    .replace(/[^a-z0-9ΔΣ_]+/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 4 && !STOPWORDS.has(t));
}

export function fallbackGrade(
  response: string,
  reference: string,
  assessmentType: AssessmentType,
): GradeResult {
  const answer = response.trim();
  const answerTokens = new Set(tokens(answer));
  const expected = [...new Set(tokens(reference))];
  const matched = expected.filter(t => answerTokens.has(t));
  const coverage = expected.length ? matched.length / Math.min(expected.length, 12) : 0;
  const lengthBonus = answer.length >= 90 ? 12 : answer.length >= 45 ? 7 : answer.length >= 20 ? 3 : 0;
  const reasoningBonus = /(because|therefore|since|so that|which means|implies|leads to|depends on|because of)/i.test(answer) ? 10 : 0;
  const misconceptionPenalty = /(always|never|same thing|doesn.t matter|does not matter)/i.test(answer) ? 8 : 0;

  let score = Math.round(35 * coverage + lengthBonus + reasoningBonus + 20 - misconceptionPenalty);
  if (assessmentType === "prediction") score = Math.min(score, 85);
  score = Math.max(0, Math.min(100, score));

  const strengths: string[] = [];
  if (matched.length >= 2) strengths.push("You used relevant concept language.");
  if (reasoningBonus) strengths.push("You connected the idea with a reason.");
  if (answer.length >= 45) strengths.push("You gave enough detail to evaluate the reasoning.");
  if (!strengths.length) strengths.push("You committed to an answer, which gives us something concrete to improve.");

  return {
    score,
    feedback: score >= 80
      ? "Strong explanation. You connected the principle to the situation."
      : score >= 55
        ? "Partly correct. The main idea is there, but the reasoning needs one clearer link."
        : "Good first attempt. The key improvement is to make the principle → situation connection explicit.",
    strengths,
    next_step: score >= 80
      ? "Try the transfer question without looking back at the explanation."
      : score >= 55
        ? "Add the mechanism: explain why your claim follows from the principle."
        : "State the principle first, then connect it to this specific situation.",
  };
}

export function assessmentTypeForStage(kind: string): AssessmentType | null {
  if (kind === "question" || kind === "predict") return "prediction";
  if (kind === "checkpoint") return "checkpoint";
  if (kind === "teachback") return "teach_back";
  if (kind === "transfer") return "transfer";
  return null;
}
