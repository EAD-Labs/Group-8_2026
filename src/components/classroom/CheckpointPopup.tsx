import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleHelp, Lightbulb, Loader2, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentType, GradeResult } from "@/lib/evaluation";
import type { QuizQuestion } from "@/lib/quizzes";
import { PASS_MARK } from "@/lib/progress";

const TITLES: Record<AssessmentType, string> = {
  prediction: "Predict before you continue",
  checkpoint: "Checkpoint",
  teach_back: "Teach it back",
  transfer: "Apply it somewhere new",
  retention: "Do you still have it?",
};

const KICKERS: Record<AssessmentType, string> = {
  prediction: "The class is paused until you commit a guess.",
  checkpoint: "Show that the idea landed before the lesson moves on.",
  teach_back: "Explaining it to someone else is the real test.",
  transfer: "Same principle, a situation you have not seen.",
  retention: "A delayed check, to see what stayed.",
};

type Props = {
  assessmentType: AssessmentType;
  conceptTitle: string;
  prompt: string;
  hint: string;
  reference: string;
  quiz: QuizQuestion | null;
  onComplete: (result: GradeResult & { response: string; gradedBy: "ai" | "fallback" }) => void;
  onSkip: () => void;
};

export function CheckpointPopup({
  assessmentType,
  conceptTitle,
  prompt,
  hint,
  reference,
  quiz,
  onComplete,
  onSkip,
}: Props) {
  const [response, setResponse] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<(GradeResult & { gradedBy: "ai" | "fallback" }) | null>(
    null,
  );
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const isQuiz = quiz !== null;
  const ready = isQuiz ? choice !== null : response.trim().length > 0;

  useEffect(() => {
    if (!isQuiz) fieldRef.current?.focus();
  }, [isQuiz]);

  const submit = async () => {
    if (!ready || grading || result) return;
    setGrading(true);

    if (isQuiz && quiz) {
      const correct = choice === quiz.answer;
      const graded = {
        score: correct ? 100 : 35,
        feedback: correct ? "Correct. " + quiz.explanation : "Not quite. " + quiz.explanation,
        strengths: correct
          ? ["You picked the option that matches the principle."]
          : ["You committed to an answer, which is what makes the gap visible."],
        next_step: correct
          ? "Try saying why the other options fail."
          : "Re-read the principle, then retry the transfer question.",
        gradedBy: "fallback" as const,
      };
      setResult(graded);
      setGrading(false);
      return;
    }

    try {
      const r = await fetch("/api/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response, assessmentType, conceptTitle, prompt, reference }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      setResult(data);
    } catch {
      setResult({
        score: 50,
        feedback: "We could not grade this right now, but your answer was recorded.",
        strengths: ["You committed an answer."],
        next_step: "Continue the lesson and revisit this checkpoint later.",
        gradedBy: "fallback",
      });
    }
    setGrading(false);
  };

  const finish = () => {
    if (!result) return;
    onComplete({
      ...result,
      response: isQuiz && quiz ? (quiz.options[choice ?? 0] ?? "") : response,
    });
  };

  const passed = result !== null && result.score >= PASS_MARK;

  return (
    <div
      className="checkpoint-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={TITLES[assessmentType]}
    >
      <div className="checkpoint-card">
        <header className="checkpoint-head">
          <span className={`checkpoint-badge ${assessmentType}`}>
            {assessmentType === "transfer" ? <Target size={13} /> : <CircleHelp size={13} />}
            {assessmentType.replace("_", " ")}
          </span>
          <div>
            <h2>{TITLES[assessmentType]}</h2>
            <small>{KICKERS[assessmentType]}</small>
          </div>
          <button className="checkpoint-skip" onClick={onSkip} aria-label="Skip this checkpoint">
            <X size={15} />
          </button>
        </header>

        <div className="checkpoint-body">
          <p className="checkpoint-concept">{conceptTitle}</p>
          <p className="checkpoint-question">{isQuiz && quiz ? quiz.question : prompt}</p>

          {!result && isQuiz && quiz && (
            <ul className="checkpoint-options">
              {quiz.options.map((option, i) => (
                <li key={option}>
                  <button className={choice === i ? "selected" : ""} onClick={() => setChoice(i)}>
                    <span>{String.fromCharCode(65 + i)}</span>
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!result && !isQuiz && (
            <Textarea
              ref={fieldRef}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Explain your reasoning…"
              className="checkpoint-input"
            />
          )}

          {!result && hintOpen && (
            <p className="checkpoint-hint">
              <Lightbulb size={13} /> {hint}
            </p>
          )}

          {result && (
            <div className={`checkpoint-result ${passed ? "pass" : "work"}`}>
              <div className="checkpoint-score">
                <strong>{result.score}</strong>
                <small>/ 100</small>
                <span>{passed ? "Checkpoint passed" : "Needs another pass"}</span>
              </div>
              <p className="checkpoint-feedback">{result.feedback}</p>
              {result.strengths.length > 0 && (
                <ul className="checkpoint-strengths">
                  {result.strengths.map((s) => (
                    <li key={s}>
                      <CheckCircle2 size={12} /> {s}
                    </li>
                  ))}
                </ul>
              )}
              <p className="checkpoint-next">
                <strong>Next step</strong> {result.next_step}
              </p>
              <small className="checkpoint-source">
                {result.gradedBy === "ai"
                  ? "Graded by the AI teacher"
                  : "Graded by the offline rubric"}
              </small>
            </div>
          )}
        </div>

        <footer className="checkpoint-foot">
          {!result ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setHintOpen(true)}
                disabled={hintOpen || !hint}
              >
                <Lightbulb /> Hint
              </Button>
              <Button onClick={submit} disabled={!ready || grading}>
                {grading ? (
                  <>
                    <Loader2 className="spin" /> Grading…
                  </>
                ) : (
                  "Submit answer"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setResult(null);
                  setResponse("");
                  setChoice(null);
                }}
              >
                Try again
              </Button>
              <Button onClick={finish}>Continue lesson</Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
