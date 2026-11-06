import { ArrowRight, Check, CircleHelp, Eye, Lock, Mic, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LessonStage } from "@/lib/curriculum";
import type { GapReport } from "@/lib/speech-signal";
import type { SessionState } from "@/lib/session";

/** Fill-in-the-blank: blocking. The dialogue cannot continue until it is attempted. */
export function BlankCard({
  stage,
  sess,
  onFill,
  onContinue,
  canContinue,
  popup,
}: {
  stage: LessonStage;
  sess: SessionState;
  onFill: (text: string) => void;
  onContinue: () => void;
  canContinue: boolean;
  popup: boolean;
}) {
  const b = stage.blank;
  const [value, setValue] = useState("");
  if (!b) return null;
  const tried = sess.blanks[b.id];
  return (
    <div className={`transcript-response blank-card ${popup ? "in-popup" : ""}`} data-card="blank">
      <small>FILL THE BLANK · REQUIRED TO CONTINUE</small>
      <p className="blank-sentence">
        {b.before}{" "}
        {tried ? (
          <mark className={tried.correct ? "ok" : "bad"}>
            {tried.correct ? tried.text : b.answer}
          </mark>
        ) : (
          <input
            className="blank-input"
            value={value}
            autoFocus={popup}
            aria-label="Fill the blank"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) onFill(value);
            }}
            placeholder="type here"
          />
        )}{" "}
        {b.after}
      </p>
      {!tried ? (
        <div className="response-actions">
          <span className="blank-lock">
            <Lock size={13} /> The lesson continues once you answer.
          </span>
          <Button onClick={() => onFill(value)} disabled={!value.trim()}>
            Check
          </Button>
        </div>
      ) : (
        <>
          <p
            className={`blank-result ${tried.correct ? "ok" : "bad"}`}
            role="status"
            aria-live="polite"
          >
            {tried.correct ? <Check size={15} /> : <X size={15} />}{" "}
            {tried.correct
              ? "Correct."
              : `Not quite — the word is “${b.answer}”. We have noted it so it can come back.`}
          </p>
          <div className="response-actions">
            <span />
            <Button onClick={onContinue} disabled={!canContinue}>
              Continue <ArrowRight />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Hint card: a guess must be committed before the answer can be revealed. */
export function HintCard({
  stage,
  sess,
  onGuess,
  onReveal,
  onContinue,
  popup,
}: {
  stage: LessonStage;
  sess: SessionState;
  onGuess: (text: string) => void;
  onReveal: () => void;
  onContinue: () => void;
  popup: boolean;
}) {
  const h = stage.hintCard;
  const [text, setText] = useState("");
  const [nudge, setNudge] = useState(false);
  if (!h) return null;
  const g = sess.guesses[h.id];
  const committed = Boolean(g);
  return (
    <div className={`transcript-response hint-card ${popup ? "in-popup" : ""}`} data-card="hint">
      <small>
        {stage.kind === "recall" ? "BUILDING ON EARLIER · GUESS FIRST" : "HINT · GUESS FIRST"}
      </small>
      <p>{h.question}</p>
      <Textarea
        value={committed ? g!.text : text}
        disabled={committed}
        autoFocus={popup}
        aria-label="Your guess"
        onChange={(e) => setText(e.target.value)}
        placeholder="Commit a guess before the answer can be revealed…"
      />
      {nudge && <p className="feedback-text">Nudge: {h.hint}</p>}
      <div className="response-actions">
        <Button variant="ghost" onClick={() => setNudge((v) => !v)}>
          <CircleHelp /> {nudge ? "Hide nudge" : "Need a nudge?"}
        </Button>
        {!committed ? (
          <Button onClick={() => onGuess(text)} disabled={!text.trim()}>
            Commit guess
          </Button>
        ) : (
          <Button onClick={onReveal} disabled={g!.revealed} aria-label="Reveal answer">
            <Eye /> Reveal answer
          </Button>
        )}
      </div>
      {!committed && (
        <p className="blank-lock" role="note">
          <Lock size={13} /> “Reveal answer” unlocks after you commit a guess.
        </p>
      )}
      {g?.revealed && (
        <div
          className={`answer-feedback ${g.correct ? "ok" : "bad"}`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {g.correct ? <Check /> : <X />}{" "}
            {g.correct ? "Your guess matched — +3 points." : "Not quite — compare with the answer."}
          </strong>
          <p>
            <b>Answer:</b> {h.answer}
          </p>
        </div>
      )}
      {g?.revealed && (
        <div className="response-actions">
          <span />
          <Button onClick={onContinue}>
            Continue <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Coverage report + speech markers after a spoken teach-back. Raw audio is never stored. */
export function SpeechReportCard({
  report,
  optedIn,
}: {
  report: GapReport | null;
  optedIn: boolean;
}) {
  if (!report)
    return (
      <p className="blank-lock" role="note">
        <Mic size={13} />{" "}
        {optedIn
          ? "Press the microphone and explain it aloud — you will see your pace and pauses. Typing works just as well."
          : "Speech signal is off. Turn it on in Topic Setup to see your pace and pauses; nothing is recorded or uploaded."}
      </p>
    );
  const s = report.signal;
  return (
    <div className="speech-report" role="status" aria-live="polite">
      <strong>Gap report</strong>
      <p>
        Concept coverage: <b>{report.coverage}%</b>
        {report.missing.length > 0 && (
          <> · not mentioned: {report.missing.slice(0, 4).join(", ")}</>
        )}
      </p>
      {s.reliable ? (
        <>
          <p>
            Pace: <b>{s.speechRate} wpm</b> (speaking {s.articulationRate} wpm) · pauses:{" "}
            <b>{s.pauses.length}</b> · hesitation index <b>{s.hesitationIndex}</b>
          </p>
          {s.markers.length > 0 ? (
            <ul>
              {s.markers.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No long pauses — a steady explanation.</p>
          )}
        </>
      ) : (
        <p className="muted">
          Too short to measure pace reliably — try explaining for at least 10 seconds.
        </p>
      )}
      <small className="muted">
        Measured in your browser from loudness only. No audio is recorded or sent anywhere.
      </small>
    </div>
  );
}

/** Quick check: a multiple-choice question (fill-in-the-blank with choices, definition match, example match, true/false). */
export function McqCard({
  stage,
  sess,
  onAnswer,
  onContinue,
  popup,
}: {
  stage: LessonStage;
  sess: SessionState;
  onAnswer: (picked: number) => void;
  onContinue: () => void;
  popup: boolean;
}) {
  const q = stage.mcq;
  const [pick, setPick] = useState<number | null>(null);
  if (!q) return null;
  const done = sess.mcqs?.[q.id];
  const two = q.qkind === "truefalse";
  // short options (single words) sit in a 2×2 grid; long ones (definitions) stack in one column
  const short = !two && q.options.every((o) => o.length <= 24);
  return (
    <div className={`transcript-response mcq-card ${popup ? "in-popup" : ""}`} data-card="mcq">
      <small>
        QUICK CHECK ·{" "}
        {q.qkind === "cloze"
          ? "FILL THE BLANK"
          : q.qkind === "truefalse"
            ? "TRUE OR FALSE"
            : "CHOOSE THE BEST ANSWER"}
      </small>
      {/* a fill-in-the-blank shows its sentence directly; the label above already says what to do */}
      {!(q.qkind === "cloze" && q.context) && <p className="mcq-prompt">{q.prompt}</p>}
      {q.context && <blockquote>{q.context}</blockquote>}
      <div
        className={`options ${two ? "two" : short ? "short" : ""}`}
        role="radiogroup"
        aria-label={q.prompt}
      >
        {q.options.map((o, i) => {
          const state = done
            ? i === q.answer
              ? "right"
              : i === done.picked
                ? "wrong"
                : ""
            : pick === i
              ? "picked"
              : "";
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={(done ? done.picked : pick) === i}
              disabled={Boolean(done)}
              className={`option ${state}`}
              onClick={() => setPick(i)}
            >
              <b>{two ? "" : "ABCD"[i]}</b>
              <span>{o}</span>
              {done && i === q.answer && <Check />}
              {done && i === done.picked && i !== q.answer && <X />}
            </button>
          );
        })}
      </div>
      {done && (
        <div
          className={`answer-feedback ${done.correct ? "ok" : "bad"}`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {done.correct ? <Check /> : <X />}{" "}
            {done.correct ? "Correct — +2 points." : "Not quite."}
          </strong>
          {!done.correct && <p>Correct answer: {q.options[q.answer]}</p>}
          <p className="why">{q.explanation}</p>
        </div>
      )}
      <div className="response-actions">
        <span />
        {!done ? (
          <Button onClick={() => pick !== null && onAnswer(pick)} disabled={pick === null}>
            Check answer
          </Button>
        ) : (
          <Button onClick={onContinue}>
            Continue <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}
