import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  RotateCcw,
  Target,
  Shuffle,
  CalendarClock,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { recordGuess, type Bucket } from "@/lib/calibration";
import { nowMs } from "@/lib/clock";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import {
  buildSession,
  dueConcepts,
  refKey,
  summarise,
  type Answer,
  type ConceptRef,
  type Mode,
  type Question,
} from "@/lib/quiz";
import { DAY, daysUntil, dueState, type Srs } from "@/lib/srs";

export type ConceptOutcome = {
  conceptKey: string;
  title: string;
  from: number;
  to: number;
  nextDue: number;
  correct: number;
  total: number;
};
export type SessionDone = { points: number; outcomes: ConceptOutcome[] };

type Props = {
  pool: ConceptRef[];
  srs: Record<string, Srs>;
  masteryOf: (r: ConceptRef) => number;
  goal: number;
  /** open straight into a session (from the dashboard shortcuts) */
  start?: { mode: Mode; conceptKey?: string; nonce: number } | null;
  grade: (q: Question, text: string) => Promise<{ score: number; feedback: string[] }>;
  onComplete: (questions: Question[], answers: Answer[]) => SessionDone;
  onOpenReport: () => void;
  bloom: (b: string) => string;
};

export function dueLabel(
  t: ReturnType<typeof useI18n>["t"],
  tp: ReturnType<typeof useI18n>["tp"],
  s: Srs | undefined,
  now: number,
): string {
  if (!s) return t("due.never");
  const d = daysUntil(s, now);
  if (d < 0) return tp("due.overdue", -d);
  if (d === 0 || s.due <= now) return t("due.today");
  if (d === 1) return t("due.tomorrow");
  return tp("due.days", d);
}

export function ReviewPanel({
  pool,
  srs,
  masteryOf,
  goal,
  start,
  grade,
  onComplete,
  onOpenReport,
  bloom,
}: Props) {
  const { t, tp } = useI18n();
  const [now] = useState(() => nowMs());
  const [phase, setPhase] = useState<"home" | "quiz" | "result">("home");
  /** "how many will you get right?" asked before the first question (calibration) */
  const [predicted, setPredicted] = useState<Bucket | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(false);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [done, setDone] = useState<SessionDone | null>(null);
  const [conceptKey, setConceptKey] = useState(pool[0] ? refKey(pool[0]) : "");
  const nextRef = useRef<HTMLButtonElement>(null);

  const due = useMemo(() => dueConcepts(pool, srs, now), [pool, srs, now]);
  const upcoming = useMemo(
    () =>
      pool
        .filter((p) => srs[refKey(p)] && dueState(srs[refKey(p)], now) !== "due")
        .sort((a, b) => (srs[refKey(a)]?.due ?? 0) - (srs[refKey(b)]?.due ?? 0))
        .slice(0, 6),
    [pool, srs, now],
  );

  const begin = (mode: Mode, key?: string) => {
    const qs = buildSession({
      mode,
      pool,
      size: goal,
      now: nowMs(),
      srs,
      mastery: masteryOf,
      ...(key ? { conceptKey: key } : {}),
      seed: Math.floor(Math.random() * 1e9),
    });
    if (!qs.length) return;
    setQuestions(qs);
    setIdx(0);
    setPicked(null);
    setText("");
    setChecked(false);
    setFeedback([]);
    setAnswers([]);
    setDone(null);
    setPredicted(null);
    setPredicting(true);
    setPhase("quiz");
  };
  // shortcuts from the dashboard
  const lastNonce = useRef<number | null>(null);
  useEffect(() => {
    if (start && start.nonce !== lastNonce.current) {
      lastNonce.current = start.nonce;
      begin(start.mode, start.conceptKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per shortcut press
  }, [start?.nonce]);

  const q = questions[idx];
  const isRecall = q?.kind === "recall";
  const record = (a: Answer) =>
    setAnswers((all) => [...all.filter((x) => x.questionId !== a.questionId), a]);

  const check = async () => {
    if (!q || checked) return;
    if (isRecall) {
      if (!text.trim()) return;
      setGrading(true);
      const g = await grade(q, text.trim());
      setGrading(false);
      setFeedback(g.feedback);
      record({
        questionId: q.id,
        correct: g.score >= 60,
        picked: null,
        text: text.trim(),
        score: g.score,
      });
    } else {
      if (picked === null) return;
      record({ questionId: q.id, correct: picked === q.answer, picked });
    }
    setChecked(true);
    window.setTimeout(() => nextRef.current?.focus(), 30);
  };
  const advance = () => {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      setPicked(null);
      setText("");
      setChecked(false);
      setFeedback([]);
    } else {
      setDone(onComplete(questions, answers));
      if (predicted !== null) {
        const right = answers.filter((a) => (a as { correct?: boolean }).correct).length;
        recordGuess(localStorage, {
          at: nowMs(),
          predicted,
          scorePct: questions.length ? Math.round((right / questions.length) * 100) : 0,
          concepts: [
            ...new Set(
              questions.map((q) => (q as { conceptKey?: string; key?: string }).conceptKey ?? ""),
            ),
          ].filter(Boolean),
        });
      }
      setPhase("result");
    }
  };
  // keyboard: 1-4 pick an option, Enter checks / continues
  useEffect(() => {
    if (phase !== "quiz") return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      if (!checked && q && !isRecall && /^[1-9]$/.test(e.key)) {
        const n = Number(e.key) - 1;
        if (n < q.options.length) setPicked(n);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (checked) advance();
        else void check();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const summary = useMemo(() => summarise(questions, answers), [questions, answers]);

  // ------------------------------------------------------------ home
  if (phase === "home") {
    const hasAny = pool.length > 0;
    return (
      <section className="page-view review-page">
        <div className="page-title">
          <div>
            <small>{t("nav.review").toUpperCase()}</small>
            <h1>{t("review.title")}</h1>
            <p>{t("review.subtitle")}</p>
          </div>
        </div>
        <div className="review-hero">
          <div className="review-due">
            <small>{t("review.dueNow")}</small>
            <strong>{due.length}</strong>
            <span>
              {due.length
                ? tp("review.dueCount", due.length)
                : Object.keys(srs).length
                  ? t("review.dueNone")
                  : t("review.dueNoneNew")}
            </span>
          </div>
          <div className="review-hero-actions">
            <Button disabled={!hasAny} onClick={() => begin("due")}>
              {due.length ? t("review.start") : t("review.practice")} <ArrowRight />
            </Button>
            <small>{t("review.size", { n: goal })}</small>
          </div>
        </div>
        <div className="review-modes">
          <article className="review-mode">
            <span>
              <Shuffle />
            </span>
            <div>
              <h3>{t("review.mixed")}</h3>
              <p>{t("review.mixedHelp")}</p>
            </div>
            <Button variant="outline" disabled={!hasAny} onClick={() => begin("mixed")}>
              {t("review.start")}
            </Button>
          </article>
          <article className="review-mode">
            <span>
              <Target />
            </span>
            <div>
              <h3>{t("review.concept")}</h3>
              <p>{t("review.conceptHelp")}</p>
              <select
                className="setting-select"
                aria-label={t("review.choose")}
                value={conceptKey}
                onChange={(e) => setConceptKey(e.target.value)}
              >
                {pool.map((p) => (
                  <option key={refKey(p)} value={refKey(p)}>
                    {p.concept.title}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              disabled={!hasAny}
              onClick={() => begin("concept", conceptKey)}
            >
              {t("review.start")}
            </Button>
          </article>
        </div>
        <section className="review-upcoming">
          <h2>
            <CalendarClock /> {t("review.upcoming")}
          </h2>
          {upcoming.length === 0 && due.length === 0 ? (
            <p className="muted">{hasAny ? t("review.noUpcoming") : t("review.empty")}</p>
          ) : (
            <ul>
              {[...due, ...upcoming].slice(0, 8).map((p) => (
                <li key={refKey(p)}>
                  <span>{p.concept.title}</span>
                  <small>{p.moduleTitle}</small>
                  <em className={dueState(srs[refKey(p)], now) === "due" ? "late" : ""}>
                    {dueLabel(t, tp, srs[refKey(p)], now)}
                  </em>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    );
  }

  // ------------------------------------------------------------ result
  if (phase === "result" && done) {
    return (
      <section className="page-view review-page">
        <div className="page-title">
          <div>
            <small>{t("review.result").toUpperCase()}</small>
            <h1>
              {summary.score}% ·{" "}
              {t("review.ofCorrect", { correct: summary.correct, total: summary.total })}
              {predicted !== null && (
                <span className="predict-note">
                  {" "}
                  · you predicted “{["only a few", "about half", "most"][predicted]}”
                </span>
              )}
            </h1>
            <p>{done.points > 0 ? t("review.points", { n: done.points }) : ""}</p>
          </div>
        </div>
        <div className="review-result-grid">
          <section className="review-card">
            <h2>{t("review.masteryChange")}</h2>
            <ul className="outcome-list">
              {done.outcomes.map((o) => (
                <li key={o.conceptKey}>
                  <div>
                    <strong>{o.title}</strong>
                    <small>
                      {o.correct}/{o.total} · {t("review.nextReview")}:{" "}
                      {dueLabel(
                        t,
                        tp,
                        { due: o.nextDue, interval: 0, ease: 0, reps: 0, lapses: 0, last: 0 },
                        nowMs(),
                      )}
                    </small>
                  </div>
                  <span className={o.to >= o.from ? "up" : "down"}>
                    {o.from}% → {o.to}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="review-card">
            <h2>{t("review.worthAnother")}</h2>
            {summary.correct === summary.total ? (
              <p className="muted">{t("review.correct")}</p>
            ) : (
              <ul className="missed-list">
                {questions
                  .filter((x) => !answers.find((a) => a.questionId === x.id)?.correct)
                  .map((x) => (
                    <li key={x.id}>
                      <b>{x.conceptTitle}</b>
                      <small>{x.explanation}</small>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
        <div className="review-actions">
          <Button onClick={() => setPhase("home")}>
            <RotateCcw /> {t("review.again")}
          </Button>
          <Button variant="outline" onClick={onOpenReport}>
            {t("review.toReport")} <ArrowRight />
          </Button>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------ quiz
  if (!q) return null;
  if (predicting)
    return (
      <section className="page-view review-page">
        <div className="question-card predict-card" aria-live="polite">
          <small>BEFORE YOU START</small>
          <h2>How many of these {questions.length} do you expect to get right?</h2>
          <p>Say what you really think — afterwards you will see how close your guess was.</p>
          <div className="chip-row" role="group" aria-label="Your prediction">
            {(["Only a few", "About half", "Most of them"] as const).map((l, i) => (
              <button
                key={l}
                type="button"
                className="chip"
                onClick={() => {
                  setPredicted(i as Bucket);
                  setPredicting(false);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <button type="button" className="link-btn" onClick={() => setPredicting(false)}>
            Skip
          </button>
        </div>
      </section>
    );
  const myAnswer = answers.find((a) => a.questionId === q.id);
  const letters = ["A", "B", "C", "D"];
  return (
    <section className="page-view review-page">
      <div className="review-top">
        <div className="review-meta">
          <strong>{t("review.qOf", { n: idx + 1, total: questions.length })}</strong>
          <span className="chip">
            {q.conceptTitle} · {bloom(q.bloom)}
          </span>
        </div>
        <Progress value={((idx + (checked ? 1 : 0)) / questions.length) * 100} />
        <button type="button" className="link-btn" onClick={() => setPhase("home")}>
          {t("review.quit")}
        </button>
      </div>
      <div className="question-card" aria-live="polite">
        <h2>{q.prompt}</h2>
        {q.context && <blockquote>{q.context}</blockquote>}
        {isRecall ? (
          <>
            <Textarea
              value={text}
              disabled={checked || grading}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("review.typeAnswer")}
              aria-label={q.prompt}
            />
            <small className="muted">{t("review.recallHint")}</small>
          </>
        ) : (
          <div
            className={`options ${q.kind === "truefalse" ? "two" : ""}`}
            role="radiogroup"
            aria-label={q.prompt}
          >
            {q.options.map((o, i) => {
              const state = checked
                ? i === q.answer
                  ? "right"
                  : i === picked
                    ? "wrong"
                    : ""
                : picked === i
                  ? "picked"
                  : "";
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={picked === i}
                  disabled={checked}
                  className={`option ${state}`}
                  onClick={() => setPicked(i)}
                >
                  <b>{q.kind === "truefalse" ? "" : letters[i]}</b>
                  <span>{o}</span>
                  {checked && i === q.answer && <CircleCheck />}
                  {checked && i === picked && i !== q.answer && <CircleX />}
                </button>
              );
            })}
          </div>
        )}
        {checked && myAnswer && (
          <div className={`answer-feedback ${myAnswer.correct ? "ok" : "bad"}`} role="status">
            <strong>
              {myAnswer.correct ? <Check /> : <CircleX />}{" "}
              {myAnswer.correct ? t("review.correct") : t("review.incorrect")}
              {isRecall && typeof myAnswer.score === "number" ? ` ${myAnswer.score}%` : ""}
            </strong>
            {!isRecall && !myAnswer.correct && (
              <p>{t("review.correctWas", { answer: q.options[q.answer] ?? "" })}</p>
            )}
            {feedback.map((f, i) => (
              <p key={i}>{f}</p>
            ))}
            <p className="why">
              <b>{t("review.why")}:</b> {q.explanation}
            </p>
          </div>
        )}
        <div className="question-actions">
          <small className="muted">{!isRecall && !checked ? t("review.keys") : ""}</small>
          {!checked ? (
            <Button
              onClick={() => void check()}
              disabled={grading || (isRecall ? !text.trim() : picked === null)}
            >
              {grading ? t("review.grading") : t("review.check")}
            </Button>
          ) : (
            <Button ref={nextRef} onClick={advance}>
              {idx + 1 < questions.length ? t("review.next") : t("review.finish")} <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export { DAY };
