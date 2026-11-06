import { useState } from "react";
import { Brain, Check, ChevronDown, Save } from "lucide-react";

import {
  EMPTY_MY_THINKING,
  loadMyThinking,
  myThinkingStorageKey,
  saveMyThinking,
  type MyThinkingReflection,
} from "@/lib/my-thinking";

type Reflection = MyThinkingReflection;
type TextReflectionKey = Exclude<
  keyof Reflection,
  "initialConfidence" | "confidenceCheck" | "finalConfidence" | "updatedAt"
>;

function Confidence({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="thinking-confidence">
      <legend>{label}</legend>
      <div className="thinking-confidence-options" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={value === n ? "selected" : ""}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <small>
        1 · Not confident <span>5 · Very confident</span>
      </small>
    </fieldset>
  );
}

export function MyThinkingPanel({
  learnerId,
  moduleTitle,
  moduleSlug,
  conceptTitle,
  conceptSlug,
}: {
  learnerId: string;
  moduleTitle: string;
  moduleSlug: string;
  conceptTitle: string;
  conceptSlug: string;
}) {
  // Each browser-only record is isolated by account (or anonymous browser) and exact lesson concept.
  const storageKey = myThinkingStorageKey(learnerId, moduleSlug, conceptSlug);
  const [reflection, setReflection] = useState<Reflection>(() => {
    try {
      return loadMyThinking(localStorage, storageKey);
    } catch {
      return { ...EMPTY_MY_THINKING };
    }
  });
  const [saveState, setSaveState] = useState<"ready" | "saved" | "unavailable">("ready");

  const update = <K extends keyof Reflection>(field: K, value: Reflection[K]) => {
    const next: Reflection = { ...reflection, [field]: value, updatedAt: new Date().toISOString() };
    setReflection(next);
    try {
      setSaveState(saveMyThinking(localStorage, storageKey, next) ? "saved" : "unavailable");
    } catch {
      setSaveState("unavailable");
    }
  };
  const confidenceDelta = reflection.finalConfidence - reflection.initialConfidence;
  const confidenceChange =
    confidenceDelta > 0
      ? `Your confidence increased by ${confidenceDelta} ${confidenceDelta === 1 ? "point" : "points"}.`
      : confidenceDelta < 0
        ? `Your confidence decreased by ${Math.abs(confidenceDelta)} ${Math.abs(confidenceDelta) === 1 ? "point" : "points"}.`
        : "Your confidence stayed the same.";
  const field = (key: TextReflectionKey, label: string, placeholder: string) => (
    <label className="thinking-field" key={key}>
      <span>{label}</span>
      <textarea
        value={String(reflection[key] ?? "")}
        onChange={(event) => update(key, event.target.value)}
        placeholder={placeholder}
        rows={2}
      />
    </label>
  );

  return (
    <section id="my-thinking-panel" className="my-thinking" aria-labelledby="my-thinking-title">
      <header className="my-thinking-header">
        <div className="my-thinking-heading">
          <span className="my-thinking-icon">
            <Brain aria-hidden="true" />
          </span>
          <div>
            <p>METACOGNITIVE JOURNAL</p>
            <h2 id="my-thinking-title">My Thinking</h2>
            <small>
              {moduleTitle} <span>·</span> {conceptTitle}
            </small>
          </div>
        </div>
        <div className={`thinking-save-status ${saveState}`} role="status" aria-live="polite">
          {saveState === "saved" ? <Check /> : <Save />}
          {saveState === "saved"
            ? "Saved on this device"
            : saveState === "ready"
              ? "Edits save automatically"
              : "Could not save — browser storage unavailable"}
        </div>
      </header>

      <div className="thinking-sections">
        <details className="thinking-section" open>
          <summary>
            <span className="thinking-step">01</span>
            <span>
              <b>Before learning</b>
              <small>Surface what you bring into the lesson</small>
            </span>
            <ChevronDown />
          </summary>
          <div className="thinking-fields">
            {field(
              "priorKnowledge",
              "What do I already know?",
              "Write what you know, have seen, or can explain already…",
            )}
            {field(
              "predictions",
              "What do I predict I will learn?",
              "What do you expect the key idea or outcome to be?",
            )}
            {field(
              "expectedDifficulties",
              "What might be difficult?",
              "Which terms, steps, or ideas might challenge you?",
            )}
            <Confidence
              label="How confident am I before starting?"
              value={reflection.initialConfidence}
              onChange={(v) => update("initialConfidence", v)}
            />
          </div>
        </details>

        <details className="thinking-section" open>
          <summary>
            <span className="thinking-step">02</span>
            <span>
              <b>During learning</b>
              <small>Notice understanding as it changes</small>
            </span>
            <ChevronDown />
          </summary>
          <div className="thinking-fields">
            {field(
              "makesSense",
              "What makes sense so far?",
              "Capture an idea you can now explain in your own words…",
            )}
            {field(
              "confusion",
              "What is confusing or what questions do I have?",
              "Note the exact point where your thinking gets stuck…",
            )}
            {field(
              "realizations",
              "What have I just realised?",
              "Record a connection, correction, or useful insight…",
            )}
            <Confidence
              label="How confident am I right now?"
              value={reflection.confidenceCheck}
              onChange={(v) => update("confidenceCheck", v)}
            />
          </div>
        </details>

        <details className="thinking-section" open>
          <summary>
            <span className="thinking-step">03</span>
            <span>
              <b>After learning</b>
              <small>Reflect, evaluate, and decide what comes next</small>
            </span>
            <ChevronDown />
          </summary>
          <div className="thinking-fields">
            {field(
              "learned",
              "What did I learn?",
              "Summarise the most important things you can now explain…",
            )}
            {field(
              "remainingGaps",
              "What gaps remain?",
              "What still feels uncertain or needs another example?",
            )}
            {field(
              "predictionReflection",
              "How did my predictions compare?",
              "Which predictions were right, partly right, or mistaken?",
            )}
            <Confidence
              label="How confident am I after this lesson?"
              value={reflection.finalConfidence}
              onChange={(v) => update("finalConfidence", v)}
            />
            <p className="thinking-confidence-change" aria-live="polite">
              {confidenceChange}{" "}
              <span>
                Before: {reflection.initialConfidence}/5 · After: {reflection.finalConfidence}/5
              </span>
            </p>
            {field(
              "selfAssessment",
              "How well did I understand it?",
              "What evidence from your answers or explanations supports your judgement?",
            )}
            {field(
              "nextSteps",
              "What should I do next?",
              "Choose a useful next action: revisit, practise, explain, or explore…",
            )}
          </div>
        </details>
      </div>
      <p className="thinking-footnote">
        Your entries are saved automatically as you edit. They stay separate for each learner and
        concept on this browser.
      </p>
    </section>
  );
}
