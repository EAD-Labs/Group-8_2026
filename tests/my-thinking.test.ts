import {
  EMPTY_MY_THINKING,
  loadMyThinking,
  myThinkingStorageKey,
  saveMyThinking,
} from "../src/lib/my-thinking";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

let failures = 0;
const check = (condition: boolean, message: string) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) failures++;
};

const storage = new MemoryStorage();
const aliceKey = myThinkingStorageKey("learner-a", "module-one", "concept-one");
const bobKey = myThinkingStorageKey("learner-b", "module-one", "concept-one");
const otherTopicKey = myThinkingStorageKey("learner-a", "module-one", "concept-two");
const reflection = {
  ...EMPTY_MY_THINKING,
  priorKnowledge: "I know the basics",
  predictions: "I expect to learn the process",
  initialConfidence: 2,
  confusion: "Step three is unclear",
  finalConfidence: 4,
  updatedAt: "2026-11-03T00:00:00.000Z",
};

check(saveMyThinking(storage, aliceKey, reflection), "reflection writes successfully");
check(
  loadMyThinking(storage, aliceKey).priorKnowledge === "I know the basics",
  "reflection restores after a fresh read",
);
check(
  loadMyThinking(storage, aliceKey).finalConfidence === 4,
  "confidence check-ins persist as numbers",
);
check(
  loadMyThinking(storage, bobKey).priorKnowledge === "",
  "another learner cannot read this learner's reflection",
);
check(
  loadMyThinking(storage, otherTopicKey).priorKnowledge === "",
  "another concept has a separate reflection",
);
check(
  loadMyThinking(storage, aliceKey).predictions === "I expect to learn the process",
  "prediction and reflection fields round-trip",
);

const corrupt = new MemoryStorage();
corrupt.values.set(aliceKey, "{not-json");
check(
  loadMyThinking(corrupt, aliceKey).priorKnowledge === "",
  "corrupt saved data safely falls back to an empty journal",
);
corrupt.values.set(aliceKey, JSON.stringify({ initialConfidence: 99, priorKnowledge: 42 }));
const sanitized = loadMyThinking(corrupt, aliceKey);
check(
  sanitized.initialConfidence === 3 && sanitized.priorKnowledge === "",
  "invalid saved field types and confidence values are sanitized",
);
const blocked = {
  getItem: () => null,
  setItem: () => {
    throw new Error("quota");
  },
};
check(
  !saveMyThinking(blocked, aliceKey, reflection),
  "storage failures are reported without crashing the classroom",
);

console.log(failures ? `${failures} FAILED` : "ALL MY THINKING TESTS PASSED");
process.exit(failures ? 1 : 0);
