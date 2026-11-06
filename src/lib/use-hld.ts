// Classroom logic from the HLD, kept out of the page component: dialogue plans and resumable
// sessions, gated hints, blocking blanks and checkpoints, points, the concept ladder and the doubt log.
import { useCallback, useEffect } from "react";
import { nowMs } from "./clock";
import type { LessonStage, Concept, Module } from "./curriculum";
import { DEFAULT_PLAN } from "./dialogue";
import { getLearnerData, setLearner, setPlan, setSession, useLearner } from "./learner";
import { recordFor } from "./knowledge/store";
import {
  award,
  checkpointResult,
  closeDoubts,
  dialogueCompleted,
  ledgerTotal,
  openDoubt,
  openDoubtIds,
  stateOf,
  transferResult,
  DAY,
} from "./mastery";
import {
  answerMcq,
  canAdvance,
  commitGuess,
  fillBlank,
  newSession,
  POINTS,
  recordCheckpoint,
  revealHint,
  type SessionState,
} from "./session";
import type { Settings } from "./settings";
import type { Srs } from "./srs";

export type Hld = ReturnType<typeof useHld>;
const passMark = 60;

export function useHld(a: {
  panel: string;
  module: Module;
  concept: Concept;
  stage: LessonStage;
  stageIndex: number;
  lastStage: number;
  setStageIndex: (i: number) => void;
  settings: Settings;
  scheduleCheck: (key: string, srs: Srs) => void;
}) {
  const data = useLearner();
  const key = `${a.module.slug}:${a.concept.slug}`;
  const rec = recordFor(key);
  const sess: SessionState = data.sessions[key] ?? newSession(key, 0);
  const gate = canAdvance(a.stage, sess);
  const grant = useCallback(
    (id: string, pts: number) => setLearner((l) => award(l, id, pts).learner),
    [],
  );

  /** Start (or restart) the class for this concept with a fresh plan built from the learner's state. */
  const startSession = useCallback(
    (mode: "full" | "reduced" = a.settings.dialogueMode, k = key) => {
      const { learner } = getLearnerData();
      const r = recordFor(k);
      const now = nowMs();
      setPlan(k, {
        mode,
        openDoubts: openDoubtIds(learner, k),
        revisit: stateOf(learner, k).revise,
        linked: (r?.prereq ?? []).filter((p) => stateOf(learner, p).state !== "not-started"),
        startedAt: now,
      });
      setSession(k, () => newSession(k, now));
      a.setStageIndex(0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key/mode drive this
    [key, a.settings.dialogueMode],
  );

  // Opening a concept: resume the unfinished session, or begin a fresh one (also after completion).
  useEffect(() => {
    if (a.panel !== "classroom" || !rec) return;
    const d = getLearnerData();
    const s = d.sessions[key];
    if (!d.plans[key] || !s || s.completed) startSession();
    else a.setStageIndex(Math.min(s.stageIndex, a.lastStage));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the concept or screen changes
  }, [a.panel, key]);
  // Remember where the learner is (so a dropped connection or reload resumes the dialogue).
  useEffect(() => {
    if (a.panel !== "classroom" || !rec) return;
    const s = getLearnerData().sessions[key];
    if (s && s.stageIndex !== a.stageIndex && !s.completed)
      setSession(key, (x) => ({ ...(x ?? newSession(key, nowMs())), stageIndex: a.stageIndex }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist on position change
  }, [a.stageIndex]);

  const markDoubt = (misId: string | undefined, source: Parameters<typeof openDoubt>[4]) => {
    if (!misId || !rec) return;
    const name = rec.misconceptions.find((m) => m.id === misId)?.name ?? "misconception";
    setLearner((l) => openDoubt(l, key, misId, name, source, nowMs()));
  };
  /** A correct answer closes a doubt only if it was opened in an EARLIER session. */
  const settleDoubt = (misId: string | undefined) => {
    if (!misId) return 0;
    const d = getLearnerData();
    const earlier = d.learner.doubts
      .filter(
        (x) =>
          x.key === key &&
          x.closedAt === undefined &&
          x.misconceptionId === misId &&
          x.openedAt < (d.sessions[key]?.startedAt ?? 0),
      )
      .map((x) => x.misconceptionId);
    if (!earlier.length) return 0;
    let n = 0;
    setLearner((l) => {
      const r = closeDoubts(l, key, earlier, nowMs());
      n = r.closed.length;
      return r.closed.reduce(
        (acc, c) => award(acc, `closed:${c.id}`, POINTS.doubtClosed).learner,
        r.learner,
      );
    });
    return n;
  };

  const guess = (text: string) => {
    if (!a.stage.hintCard) return;
    setSession(key, (s) => commitGuess(s ?? newSession(key, nowMs()), a.stage, text, nowMs()));
    setLearner((l) => ({
      ...l,
      counters: {
        ...l.counters,
        guesses: l.counters.guesses + (sess.guesses[a.stage.hintCard!.id] ? 0 : 1),
      },
    }));
  };
  const reveal = (): "guess-required" | "ok" => {
    const h = a.stage.hintCard;
    const r = revealHint(sess, a.stage);
    if (r.error || !h) return "guess-required";
    setSession(key, () => r.state);
    const g = r.state.guesses[h.id]!;
    if (g.correct) {
      grant(`guess:${h.id}:${sess.startedAt}`, POINTS.guess); // a correct guess made BEFORE the reveal; revealing earns nothing
      settleDoubt(h.misconceptionId);
    } else markDoubt(h.misconceptionId, a.stage.kind === "recall" ? "recall" : "hint");
    if (a.stage.kind === "recall" && a.stage.recallKey) {
      const rk = a.stage.recallKey;
      if (!g.correct) {
        const prevRec = recordFor(rk);
        const mis =
          prevRec?.misconceptions.find((m) => m.id === h.misconceptionId) ??
          prevRec?.misconceptions[0];
        if (mis) setLearner((l) => openDoubt(l, rk, mis.id, mis.name, "recall", nowMs()));
      }
    }
    return "ok";
  };
  const blank = (text: string) => {
    const b = a.stage.blank;
    if (!b) return { correct: false };
    const r = fillBlank(sess, a.stage, text, nowMs());
    setSession(key, () => r.state);
    setLearner((l) => ({
      ...l,
      counters: { ...l.counters, blanks: l.counters.blanks + (sess.blanks[b.id] ? 0 : 1) },
    }));
    if (r.correct && r.state.blanks[b.id]!.attempts === 1) {
      grant(`blank:${b.id}:${sess.startedAt}`, POINTS.blank);
      settleDoubt(b.misconceptionId);
    } else if (!r.correct) markDoubt(b.misconceptionId, "blank");
    return { correct: r.correct };
  };
  /** A quick-check multiple-choice answer: final once given; +2 points for a correct first answer, a wrong one opens a doubt. */
  const mcq = (picked: number) => {
    const q = a.stage.mcq;
    if (!q || sess.mcqs?.[q.id]) return { correct: Boolean(q && sess.mcqs?.[q.id]?.correct) };
    const r = answerMcq(sess, a.stage, picked, nowMs());
    setSession(key, () => r.state);
    if (r.correct) grant(`mcq:${q.id}:${sess.startedAt}`, POINTS.blank);
    else markDoubt(rec?.misconceptions[0]?.id, "mcq");
    return { correct: r.correct };
  };
  const asked = (q: string, ans: string) => {
    setSession(key, (s) => ({
      ...(s ?? newSession(key, nowMs())),
      asked: [...(s?.asked ?? []), { q, a: ans, at: nowMs(), turn: a.stageIndex }],
    }));
    setLearner((l) => ({ ...l, counters: { ...l.counters, asked: l.counters.asked + 1 } }));
  };

  /** Called after any assessed prompt (checkpoint, teach-back, transfer) has been scored. */
  const assessed = (kind: string, score: number) => {
    const now = nowMs();
    const passed = score >= passMark;
    if (kind === "checkpoint") {
      setSession(key, (s) => recordCheckpoint(s ?? newSession(key, now), a.stage, score, now));
      setLearner((l) => checkpointResult(l, key, passed, now, a.settings.retentionDays));
      if (passed) {
        grant(`cp:${key}:${sess.startedAt}`, POINTS.checkpoint);
        for (const m of rec?.misconceptions ?? []) settleDoubt(m.id);
        const days = a.settings.retentionDays;
        a.scheduleCheck(key, {
          due: now + days * DAY,
          interval: days,
          ease: 2.3,
          reps: 1,
          lapses: 0,
          last: now,
        });
      } else markDoubt(rec?.misconceptions[0]?.id, "checkpoint");
    } else if (kind === "teachback") {
      if (!passed) markDoubt(rec?.misconceptions[0]?.id, "teachback");
    } else if (kind === "transfer") {
      setLearner((l) => {
        const r = transferResult(l, key, passed, now);
        return passed
          ? award(r.learner, `tr:${key}:${sess.startedAt}`, POINTS.transfer).learner
          : r.learner;
      });
    }
  };
  /** The dialogue reached its end. */
  const finish = () => {
    if (sess.completed) return;
    setSession(key, (s) => ({ ...(s ?? newSession(key, nowMs())), completed: true }));
    setLearner((l) => dialogueCompleted(l, key, nowMs()));
  };

  /** Pauses before domain terms become doubts named by the misconception that term belongs to (source: voice). */
  const voiceGaps = (terms: string[]) => {
    if (!rec) return;
    for (const term of terms) {
      const claim = rec.claims.find((c) => c.text.toLowerCase().includes(term.toLowerCase()));
      const mis =
        rec.misconceptions.find((m) =>
          [...rec.blanks, ...rec.hints].some(
            (x) => x.claimId === claim?.id && x.misconceptionId === m.id,
          ),
        ) ?? rec.misconceptions[0];
      if (mis) markDoubt(mis.id, "voice");
    }
  };

  return {
    key,
    rec,
    voiceGaps,
    mcq,
    sess,
    gate,
    startSession,
    guess,
    reveal,
    blank,
    asked,
    assessed,
    finish,
    markDoubt,
    ledger: ledgerTotal(data.learner),
    data,
  };
}
