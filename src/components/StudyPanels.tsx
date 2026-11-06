import {
  ArrowRight,
  Check,
  Download,
  FlaskConical,
  Loader2,
  Send,
  Timer,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { nowMs, onClockChange } from "@/lib/clock";
import { recordFor } from "@/lib/knowledge/store";
import { buildSession, type ConceptRef, type Question } from "@/lib/quiz";
import {
  cohortReport,
  isRun,
  newRun,
  runComplete,
  testsOpenAt,
  toCsv,
  type Condition,
  type StudyRun,
  type TestResult,
} from "@/lib/study";
import { assessLocal } from "@/lib/assess";
import { buildReference } from "@/lib/assess";
import { whenLabel } from "@/components/HldPanels";

const KEY = "kyro_study_v1";
const load = (): StudyRun | null => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return isRun(p) ? p : null;
  } catch {
    return null;
  }
};
const save = (r: StudyRun | null) => {
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
const download = (name: string, text: string, type = "application/json") => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
};
const titleOf = (pool: ConceptRef[], key: string) =>
  pool.find((p) => `${p.moduleSlug}:${p.concept.slug}` === key)?.concept.title ?? key;

/** A plain answer with no scaffolding: what an ordinary chat window gives (offline stand-in). */
function plainAnswer(key: string): string {
  const r = recordFor(key);
  if (!r) return "I can't answer that without a configured AI service.";
  const by = (role: string) => r.claims.filter((c) => c.role === role).map((c) => c.text);
  return [
    ...by("define"),
    ...by("mechanism"),
    ...by("example"),
    ...by("pitfall"),
    ...by("formula"),
    ...by("boundary"),
  ].join(" ");
}

// ------------------------------------------------------------------ plain-chat baseline
function ChatBaseline({
  conceptKey,
  title,
  budgetMin,
  onTime,
  onTurn,
  turns,
}: {
  conceptKey: string;
  title: string;
  budgetMin: number;
  onTime: (min: number) => void;
  onTurn: () => void;
  turns: number;
}) {
  const [log, setLog] = useState<Array<{ q: string; a: string; offline?: boolean }>>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const start = useRef(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = Math.round((Date.now() - start.current) / 1000);
      setSecs(s);
      onTime(Math.round((s / 60) * 10) / 10);
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timer only
  }, []);
  const ask = async () => {
    if (!q.trim() || busy) return;
    const question = q.trim();
    setQ("");
    setBusy(true);
    onTurn();
    let a = "";
    let offline = false;
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: `${question}\n(Topic: ${title})`,
          context: "",
          mode: "plain",
        }),
      });
      if (r.ok) a = await r.text();
      else offline = true;
    } catch {
      offline = true;
    }
    if (offline) a = plainAnswer(conceptKey);
    setLog((l) => [...l, { q: question, a, offline }]);
    setBusy(false);
  };
  const left = Math.max(0, budgetMin * 60 - secs);
  return (
    <div className="chat-base">
      <header>
        <b>Plain chat — {title}</b>
        <span className={left === 0 ? "late" : ""}>
          <Timer size={13} /> {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} of{" "}
          {budgetMin} min
        </span>
      </header>
      <div className="chat-log" aria-live="polite">
        {log.length === 0 && (
          <p className="muted">
            Ask anything about “{title}”, the way you normally would with an AI chat tool. Same time
            budget as the classroom condition.
          </p>
        )}
        {log.map((m, i) => (
          <div key={i}>
            <p className="chat-q">{m.q}</p>
            <p className="chat-a">{m.a}</p>
            {m.offline && (
              <small className="muted">Offline sample answer (no AI service configured).</small>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <Textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask a question…"
          aria-label="Plain chat question"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <Button
          size="icon"
          onClick={() => void ask()}
          disabled={!q.trim() || busy}
          aria-label="Send"
        >
          {busy ? <Loader2 className="spin" /> : <Send />}
        </Button>
      </div>
      <small className="muted">
        {turns} message{turns === 1 ? "" : "s"} sent
      </small>
    </div>
  );
}

// ------------------------------------------------------------------ delayed test for one concept
function TestBlock({
  conceptKey,
  pool,
  condition,
  onDone,
  grade,
}: {
  conceptKey: string;
  pool: ConceptRef[];
  condition: Condition;
  onDone: (r: TestResult) => void;
  grade: (key: string, text: string) => Promise<number>;
}) {
  const qs = useMemo<Question[]>(
    () =>
      buildSession({
        mode: "concept",
        pool,
        size: 6,
        now: nowMs(),
        srs: {},
        mastery: () => 40,
        conceptKey,
        seed: 99,
      })
        .filter((x) => x.kind !== "recall")
        .slice(0, 5),
    [conceptKey, pool],
  );
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [transferText, setTransferText] = useState("");
  const [busy, setBusy] = useState(false);
  const rec = recordFor(conceptKey);
  const inQuiz = i < qs.length;
  const q = qs[i];
  const finish = async () => {
    if (!transferText.trim()) return;
    setBusy(true);
    const score = await grade(conceptKey, transferText.trim());
    setBusy(false);
    onDone({
      retention: Math.round((correct / Math.max(1, qs.length)) * 100),
      transfer: score,
      at: nowMs(),
    });
  };
  return (
    <section className="report-card test-block" data-testblock={conceptKey}>
      <h2>
        {titleOf(pool, conceptKey)}{" "}
        <i className="chip">
          {condition === "platform" ? "learned in the classroom" : "learned in plain chat"}
        </i>
      </h2>
      {inQuiz && q ? (
        <>
          <small className="muted">
            Retention question {i + 1} of {qs.length}
          </small>
          <h3>{q.prompt}</h3>
          {q.context && <blockquote>{q.context}</blockquote>}
          <div className="options">
            {q.options.map((o, k) => (
              <button
                key={k}
                type="button"
                disabled={checked}
                className={`option ${checked ? (k === q.answer ? "right" : k === picked ? "wrong" : "") : picked === k ? "picked" : ""}`}
                onClick={() => setPicked(k)}
              >
                <b>{"ABCD"[k]}</b>
                <span>{o}</span>
              </button>
            ))}
          </div>
          <div className="question-actions">
            <span />
            {!checked ? (
              <Button
                disabled={picked === null}
                onClick={() => {
                  setChecked(true);
                  if (picked === q.answer) setCorrect((c) => c + 1);
                }}
              >
                Check
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setI(i + 1);
                  setPicked(null);
                  setChecked(false);
                }}
              >
                Next <ArrowRight />
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <small className="muted">Transfer problem — a situation not covered in class</small>
          <h3>{rec?.transfer ?? "Apply the idea to a new situation."}</h3>
          <Textarea
            value={transferText}
            onChange={(e) => setTransferText(e.target.value)}
            placeholder="Explain how the concept applies…"
            aria-label="Transfer answer"
          />
          <div className="question-actions">
            <span className="muted">
              Retention so far: {correct} of {qs.length}
            </span>
            <Button onClick={() => void finish()} disabled={!transferText.trim() || busy}>
              {busy ? "Scoring…" : "Submit"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ the learner's study screen
export function StudyPanel({
  pool,
  onOpenClass,
  doubtsClosed,
  grade,
}: {
  pool: ConceptRef[];
  onOpenClass: (key: string) => void;
  doubtsClosed: number;
  grade: (key: string, text: string) => Promise<number>;
}) {
  const [run, setRun] = useState<StudyRun | null>(load);
  const [no, setNo] = useState("");
  const [pid, setPid] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    const off = onClockChange(() => tick((x) => x + 1));
    return () => void off();
  }, []);
  const update = (fn: (r: StudyRun) => StudyRun) =>
    setRun((r) => {
      if (!r) return r;
      const n = fn(r);
      save(n);
      return n;
    });
  const keys = run ? Object.keys(run.assignments) : [];
  const chatKey = keys.find((k) => run?.assignments[k] === "chat");
  const platKey = keys.find((k) => run?.assignments[k] === "platform");
  const opens = run ? testsOpenAt(run) : undefined;
  const testsOpen = opens !== undefined && nowMs() >= opens;

  if (!run)
    return (
      <section className="page-view study-page">
        <div className="page-title">
          <div>
            <small>COMPARATIVE STUDY</small>
            <h1>Does this teach better than a chat window?</h1>
            <p>
              You will learn one concept in the classroom and a matched one in a plain chat window,
              with the same time budget. Several days later both are tested, and your own scores are
              compared.
            </p>
          </div>
        </div>
        <section className="settings-card" style={{ maxWidth: 560 }}>
          <div className="setup-custom">
            <input
              value={no}
              onChange={(e) => setNo(e.target.value.replace(/\D/g, ""))}
              placeholder="Participant number (1, 2, 3 …)"
              aria-label="Participant number"
            />
            <input
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              placeholder="Your code or name"
              aria-label="Participant code"
            />
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Your learning artefacts (answers, scores) are stored in this browser and exported as a
            file you hand in. No grades, roll numbers or audio are collected. Questions you ask the
            plain-chat condition go to the configured AI provider.
          </p>
          <Button
            disabled={!no || !pid.trim()}
            onClick={() => {
              const r = newRun(pid.trim(), Number(no), nowMs());
              save(r);
              setRun(r);
            }}
          >
            Join the study <ArrowRight />
          </Button>
        </section>
      </section>
    );

  const allDone = runComplete(run);
  return (
    <section className="page-view study-page">
      <div className="page-title">
        <div>
          <small>COMPARATIVE STUDY · PARTICIPANT {run.participantNo}</small>
          <h1>{run.participantId}</h1>
          <p>
            Matched pair: {titleOf(pool, keys[0]!)} / {titleOf(pool, keys[1]!)} · {run.budgetMin}{" "}
            minutes each · tests {run.delayDays} days after learning.
          </p>
        </div>
      </div>
      <div className="study-grid">
        {keys.map((k) => (
          <article key={k} className={`study-assign ${run.assignments[k]}`}>
            <i className="chip">{run.assignments[k] === "platform" ? "Classroom" : "Plain chat"}</i>
            <b>{titleOf(pool, k)}</b>
            <small>{Math.round((run.minutes[k] ?? 0) * 10) / 10} min used</small>
          </article>
        ))}
      </div>

      {!run.learningDoneAt && (
        <>
          <section className="report-card">
            <h2>1 · Classroom condition — {platKey ? titleOf(pool, platKey) : ""}</h2>
            <p className="muted">
              Learn this one in the classroom (about {run.budgetMin} minutes). Your time is counted
              while the class is open.
            </p>
            <Button
              onClick={() => {
                update((r) => ({
                  ...r,
                  minutes: { ...r.minutes, [platKey!]: Math.max(r.minutes[platKey!] ?? 0, 1) },
                }));
                onOpenClass(platKey!);
              }}
            >
              Open the class
            </Button>
          </section>
          <section className="report-card">
            <h2>2 · Plain-chat condition — {chatKey ? titleOf(pool, chatKey) : ""}</h2>
            <ChatBaseline
              conceptKey={chatKey!}
              title={titleOf(pool, chatKey!)}
              budgetMin={run.budgetMin}
              turns={run.chatTurns[chatKey!] ?? 0}
              onTime={(m) => update((r) => ({ ...r, minutes: { ...r.minutes, [chatKey!]: m } }))}
              onTurn={() =>
                update((r) => ({
                  ...r,
                  chatTurns: { ...r.chatTurns, [chatKey!]: (r.chatTurns[chatKey!] ?? 0) + 1 },
                }))
              }
            />
          </section>
          <Button onClick={() => update((r) => ({ ...r, learningDoneAt: nowMs(), doubtsClosed }))}>
            <Check /> I have finished both — start the {run.delayDays}-day wait
          </Button>
        </>
      )}

      {run.learningDoneAt && !testsOpen && (
        <section className="report-card" role="status">
          <h2>
            <Timer size={16} /> Delayed tests open {whenLabel(opens, nowMs())}
          </h2>
          <p className="muted">
            Come back then: one retention check and one transfer problem for each concept. (For a
            demo, fast-forward the clock in Settings → Demo &amp; evaluation.)
          </p>
        </section>
      )}

      {run.learningDoneAt && testsOpen && !allDone && (
        <>
          {keys
            .filter((k) => !run.tests[k])
            .slice(0, 1)
            .map((k) => (
              <TestBlock
                key={k}
                conceptKey={k}
                pool={pool}
                condition={run.assignments[k]!}
                grade={grade}
                onDone={(res) => update((r) => ({ ...r, tests: { ...r.tests, [k]: res } }))}
              />
            ))}
        </>
      )}

      {allDone && (
        <section className="report-card" role="status">
          <h2>
            <Check size={16} /> Finished — thank you
          </h2>
          <table className="concept-table">
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td>
                    <b>{titleOf(pool, k)}</b>
                    <small>{run.assignments[k] === "platform" ? "Classroom" : "Plain chat"}</small>
                  </td>
                  <td>Retention {run.tests[k]!.retention}%</td>
                  <td>Transfer {run.tests[k]!.transfer}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            onClick={() =>
              download(
                `study-${run.participantId.replace(/\W+/g, "_")}.json`,
                JSON.stringify({ ...run, exportedAt: nowMs() }, null, 2),
              )
            }
          >
            <Download /> Download my study file
          </Button>
          <p className="muted">
            Hand this file to the research team. It contains only the numbers above.
          </p>
        </section>
      )}
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          if (window.confirm("Leave the study and delete your study data from this browser?")) {
            save(null);
            setRun(null);
          }
        }}
      >
        Withdraw and delete my study data
      </button>
    </section>
  );
}

// ------------------------------------------------------------------ cohort report (researcher view)
function synthetic(n: number): StudyRun[] {
  let seed = 11;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, (_, i) => {
    const run = newRun(`SYN-${i + 1}`, i + 1, 1_800_000_000_000);
    const [a, b] = Object.keys(run.assignments) as [string, string];
    const pk = run.assignments[a] === "platform" ? a : b;
    const ck = pk === a ? b : a;
    run.tests[pk] = {
      retention: Math.round(Math.min(100, 68 + r() * 24)),
      transfer: Math.round(Math.min(100, 56 + r() * 30)),
      at: 0,
    };
    run.tests[ck] = {
      retention: Math.round(48 + r() * 26),
      transfer: Math.round(40 + r() * 30),
      at: 0,
    };
    run.doubtsClosed = 1 + Math.round(r() * 4);
    return run;
  });
}
export function EvaluationPanel() {
  const [runs, setRuns] = useState<StudyRun[]>([]);
  const [syn, setSyn] = useState(false);
  const [err, setErr] = useState("");
  const rep = useMemo(() => cohortReport(runs), [runs]);
  const onFiles = async (files: FileList | null) => {
    setErr("");
    const out: StudyRun[] = [];
    for (const f of Array.from(files ?? [])) {
      try {
        const j = JSON.parse(await f.text());
        if (isRun(j)) out.push(j);
        else setErr((e) => `${e} ${f.name}: not a study file.`);
      } catch {
        setErr((e) => `${e} ${f.name}: unreadable.`);
      }
    }
    setSyn(false);
    setRuns((r) => [
      ...r.filter((x) => !x.participantId.startsWith("SYN-")),
      ...out.filter((o) => !r.some((x) => x.participantId === o.participantId)),
    ]);
  };
  const D = ({ d, label }: { d: typeof rep.retention; label: string }) => (
    <article className="report-stat">
      <div>
        <small>{label}</small>
        <strong>{d.n ? `${d.meanDelta >= 0 ? "+" : ""}${d.meanDelta.toFixed(1)} pts` : "—"}</strong>
        <span>
          platform {d.platformMean.toFixed(0)}% vs chat {d.chatMean.toFixed(0)}%
          <br />
          95% CI [{d.ci[0].toFixed(1)}, {d.ci[1].toFixed(1)}] · p ={" "}
          {d.p < 0.001 ? "<0.001" : d.p.toFixed(3)} · dz = {d.dz.toFixed(2)}
        </span>
      </div>
    </article>
  );
  return (
    <section className="page-view study-page">
      <div className="page-title">
        <div>
          <small>STUDY</small>
          <h2>Does the classroom beat a plain chatbot?</h2>
          <p>
            Each learner studies one concept here and a matched concept in a plain chatbot, with the
            same time, and both are tested days later. Load their study files to compare the two.
            Results become reliable from 15 learners.
          </p>
        </div>
      </div>
      <div className="setup-custom" style={{ marginBottom: 14 }}>
        <label className="setting-btn">
          <Upload size={14} /> Load study files
          <input
            type="file"
            accept="application/json,.json"
            multiple
            hidden
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
        <button
          type="button"
          className="setting-btn"
          onClick={() => {
            setRuns(synthetic(20));
            setSyn(true);
          }}
        >
          <FlaskConical size={14} /> Show with synthetic demo data
        </button>
        {runs.length > 0 && (
          <button
            type="button"
            className="setting-btn"
            onClick={() => download("study-results.csv", toCsv(runs), "text/csv")}
          >
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>
      {err && <p className="verify-error">{err}</p>}
      {syn && (
        <p className="synthetic-banner" role="note">
          SYNTHETIC DEMO DATA — generated to show how the report looks. These are not results from
          real learners.
        </p>
      )}
      {runs.length === 0 ? (
        <p className="muted">
          No study files loaded yet. At least 15 completed learners are needed for a reportable
          result.
        </p>
      ) : (
        <>
          <p className={`reportable ${rep.reportable ? "yes" : "no"}`} role="status">
            {rep.n} completed learner{rep.n === 1 ? "" : "s"} —{" "}
            {rep.reportable ? "reportable (≥15)" : `NOT yet reportable (needs 15, has ${rep.n})`}
          </p>
          <div className="report-stats" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <D d={rep.retention} label="Retention delta (3–5 days)" />
            <D d={rep.transfer} label="Transfer delta" />
          </div>
          <div className="report-two">
            <section className="report-card">
              <h2>Concepts reaching Retained (≥60%)</h2>
              <p>
                Platform <b>{Math.round(rep.retainedShare.platform * 100)}%</b> · plain chat{" "}
                <b>{Math.round(rep.retainedShare.chat * 100)}%</b>
              </p>
              <h2>Doubts closed per learner</h2>
              <p>
                <b>{rep.meanDoubtsClosed.toFixed(1)}</b> on average — something the plain chat
                condition cannot record at all.
              </p>
            </section>
            <section className="report-card">
              <h2>Spread across matched pairs</h2>
              <ul className="due-list">
                {Object.entries(rep.byPair).map(([k, v]) => (
                  <li key={k}>
                    <span>{k}</span>
                    <b>{v}</b>
                  </li>
                ))}
              </ul>
              <small className="muted">
                Pairs are balanced so the result is not resting on one topic. Pairs still need a
                TA/instructor difficulty check (D-03).
              </small>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
void assessLocal;
void buildReference;
