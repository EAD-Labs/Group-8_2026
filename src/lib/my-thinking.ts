export type MyThinkingReflection = {
  priorKnowledge: string;
  predictions: string;
  expectedDifficulties: string;
  initialConfidence: number;
  makesSense: string;
  confusion: string;
  realizations: string;
  confidenceCheck: number;
  learned: string;
  remainingGaps: string;
  predictionReflection: string;
  finalConfidence: number;
  selfAssessment: string;
  nextSteps: string;
  updatedAt: string | null;
};

export const EMPTY_MY_THINKING: MyThinkingReflection = {
  priorKnowledge: "",
  predictions: "",
  expectedDifficulties: "",
  initialConfidence: 3,
  makesSense: "",
  confusion: "",
  realizations: "",
  confidenceCheck: 3,
  learned: "",
  remainingGaps: "",
  predictionReflection: "",
  finalConfidence: 3,
  selfAssessment: "",
  nextSteps: "",
  updatedAt: null,
};

export interface ReflectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_PREFIX = "kyro_my_thinking_v1";

export function myThinkingStorageKey(learnerId: string, moduleSlug: string, conceptSlug: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(learnerId)}:${encodeURIComponent(moduleSlug)}:${encodeURIComponent(conceptSlug)}`;
}

export function loadMyThinking(storage: ReflectionStorage, key: string): MyThinkingReflection {
  try {
    const raw = storage.getItem(key);
    if (!raw) return { ...EMPTY_MY_THINKING };
    const saved = JSON.parse(raw) as Partial<MyThinkingReflection>;
    const text = (value: unknown, fallback: string) =>
      typeof value === "string" ? value : fallback;
    const confidence = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
        ? value
        : fallback;
    return {
      priorKnowledge: text(saved.priorKnowledge, ""),
      predictions: text(saved.predictions, ""),
      expectedDifficulties: text(saved.expectedDifficulties, ""),
      initialConfidence: confidence(saved.initialConfidence, 3),
      makesSense: text(saved.makesSense, ""),
      confusion: text(saved.confusion, ""),
      realizations: text(saved.realizations, ""),
      confidenceCheck: confidence(saved.confidenceCheck, 3),
      learned: text(saved.learned, ""),
      remainingGaps: text(saved.remainingGaps, ""),
      predictionReflection: text(saved.predictionReflection, ""),
      finalConfidence: confidence(saved.finalConfidence, 3),
      selfAssessment: text(saved.selfAssessment, ""),
      nextSteps: text(saved.nextSteps, ""),
      updatedAt: typeof saved.updatedAt === "string" ? saved.updatedAt : null,
    };
  } catch {
    return { ...EMPTY_MY_THINKING };
  }
}

export function saveMyThinking(
  storage: ReflectionStorage,
  key: string,
  reflection: MyThinkingReflection,
): boolean {
  try {
    storage.setItem(key, JSON.stringify(reflection));
    return true;
  } catch {
    return false;
  }
}
