import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Loader2,
  Lock,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Module } from "@/lib/curriculum";
import { verifyOnServer, type VerifyStep } from "@/lib/knowledge/client";
import { allRecords, recordFor, useLiveRecords } from "@/lib/knowledge/store";
import type { VerifiedRecord } from "@/lib/knowledge/types";
import type { LearnerData } from "@/lib/learner";
import { clockOffsetDays, nowMs, onClockChange, skipDays } from "@/lib/clock";
import { DAY, LADDER, moduleBadge, participationBadges, stateOf, type Ladder } from "@/lib/mastery";
import type { Settings } from "@/lib/settings";

const LADDER_LABEL: Record<Ladder, string> = {
  "not-started": "Not started",
  exposed: "Exposed",
  understood: "Understood",
  retained: "Retained",
  mastered: "Mastered",
};
/** "2 corrections made" (AI-reviewed topics) or "1 documented conflict resolved" (pre-verified records). */
export function issuesLabel(r: VerifiedRecord): string {
  const n = r.provenance.disagreements.length;
  return r.provenance.mode === "single"
    ? `${n} correction${n === 1 ? "" : "s"} made`
    : `${n} documented conflict${n === 1 ? "" : "s"} resolved`;
}
export const ladderLabel = (l: Ladder) => LADDER_LABEL[l];

export function whenLabel(ts: number | undefined, now = nowMs()): string {
  if (!ts) return "—";
  const d = Math.ceil((ts - now) / DAY);
  return d < 0
    ? `${-d} day${d === -1 ? "" : "s"} overdue`
    : d === 0
      ? "due today"
      : d === 1
        ? "tomorrow"
        : `in ${d} days`;
}

// ------------------------------------------------------------------ Topic Setup (screen 3)
const STEPS: Array<[VerifyStep, string]> = [
  ["agents", "The AI drafts the topic"],
  ["compare", "The AI reviews its own draft"],
  ["resolve", "Mistakes corrected"],
  ["compose", "Classroom prepared"],
  ["store", "Verified record stored"],
];

export function TopicSetup({
  modules,
  data,
  settings,
  update,
  onStart,
  onResume,
}: {
  modules: Module[];
  data: LearnerData;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  onStart: (key: string) => void;
  onResume: (key: string) => void;
}) {
  const live = useLiveRecords();
  const [sel, setSel] = useState<string>(
    () => `${modules[0]?.slug}:${modules[0]?.concepts[1]?.slug}`,
  );
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<VerifyStep[]>([]);
  const [err, setErr] = useState<{ message: string; retry: boolean } | null>(null);
  const [found, setFound] = useState<VerifiedRecord | null>(null);
  void live;
  const verify = async (force = false) => {
    if (!custom.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setDone([]);
    setFound(null);
    const r = await verifyOnServer(custom.trim(), (s) => setDone((d) => [...d, s]), force);
    setBusy(false);
    if (r.ok) {
      setFound(r.record);
      setSel(r.record.key);
    } else setErr({ message: r.message, retry: r.retry });
  };
  const sess = data.sessions[sel];
  const selRec = recordFor(sel);
  return (
    <section className="page-view setup-page">
      <div className="page-title">
        <div>
          <small>TOPIC SETUP</small>
          <h1>What do you want to understand today?</h1>
          <p>
            Pick a pre-verified topic, or type your own — the app's AI will draft it, review its own
            draft and correct mistakes before the class opens.
          </p>
        </div>
      </div>
      <div className="setup-grid">
        <div>
          {modules
            .filter((m) => m.slug !== "verified")
            .map((m) => (
              <section key={m.slug} className="setup-module">
                <h2>
                  {m.title} <small>{m.code}</small>
                </h2>
                <div className="setup-topics">
                  {m.concepts.map((c) => {
                    const key = `${m.slug}:${c.slug}`;
                    const st = stateOf(data.learner, key).state;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`setup-topic ${sel === key ? "on" : ""}`}
                        aria-pressed={sel === key}
                        onClick={() => setSel(key)}
                      >
                        <b>{c.title}</b>
                        <span>
                          <i className="chip">{c.bloom}</i>{" "}
                          <i className={`ladder-chip ${st}`}>{ladderLabel(st)}</i>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          <section className="setup-module">
            <h2>Or enter your own topic</h2>
            <div className="setup-custom">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void verify()}
                placeholder="e.g. Carnot efficiency, or a question you are stuck on"
                aria-label="Your own topic"
              />
              <Button onClick={() => void verify()} disabled={!custom.trim() || busy}>
                {busy ? <Loader2 className="spin" /> : <ShieldCheck />} Verify &amp; prepare
              </Button>
            </div>
            {(busy || done.length > 0 || found) && (
              <ol className="verify-steps" aria-live="polite">
                {STEPS.map(([k, label]) => {
                  const ok = done.includes(k);
                  const active = busy && !ok && done.length === STEPS.findIndex(([x]) => x === k);
                  return (
                    <li key={k} className={ok ? "ok" : active ? "active" : ""}>
                      {ok ? (
                        <Check size={14} />
                      ) : active ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <span className="dot" />
                      )}{" "}
                      {label}
                    </li>
                  );
                })}
              </ol>
            )}
            {found && (
              <p className="verify-found" role="status">
                <BadgeCheck size={15} /> “{found.title}” is ready —{" "}
                {found.provenance.origin === "seeded"
                  ? "a pre-verified record, opened instantly"
                  : found.provenance.mode === "single"
                    ? `drafted and reviewed by the AI, ${found.provenance.disagreements.length} correction${found.provenance.disagreements.length === 1 ? "" : "s"} made`
                    : `verified, ${issuesLabel(found)}`}
                . Confidence: {found.provenance.confidence}.
              </p>
            )}
            {err && (
              <p className="verify-error" role="alert">
                <CircleAlert size={15} /> {err.message}{" "}
                {err.retry && (
                  <button type="button" className="link-btn" onClick={() => void verify(true)}>
                    <RefreshCw size={12} /> Retry
                  </button>
                )}
              </p>
            )}
            <small className="muted">
              New topics are drafted and then reviewed by the app's AI (the same one used for chat
              and assessment), so they need that AI configured. The pilot topics above are
              pre-verified and work offline.
            </small>
          </section>
        </div>
        <aside className="setup-side">
          <section className="settings-card">
            <h2>
              <span>
                <Users />
              </span>
              Dialogue mode
            </h2>
            <div className="mode-cards" role="radiogroup" aria-label="Dialogue mode">
              {(
                [
                  [
                    "full",
                    "Full class",
                    "Teacher, a basic student and an advanced student. Best if you often don't know what to ask.",
                  ],
                  [
                    "reduced",
                    "Reduced",
                    "Advanced student only, shorter, harder transfer. For self-directed learners.",
                  ],
                ] as const
              ).map(([v, t, d]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={settings.dialogueMode === v}
                  className={`mode-card ${settings.dialogueMode === v ? "on" : ""}`}
                  onClick={() => update({ dialogueMode: v })}
                >
                  <b>{t}</b>
                  <small>{d}</small>
                </button>
              ))}
            </div>
            <div className="setting-row">
              <div>
                <strong>
                  <Mic size={13} /> Speech signal (opt-in, this device only)
                </strong>
                <small>
                  When you explain a topic aloud, speech rate and pauses show where understanding
                  thins. Nothing is recorded or uploaded; the microphone is never used unless you
                  press the button. No camera, ever.
                </small>
              </div>
              <Switch
                checked={settings.speechCapture}
                onCheckedChange={(v) => update({ speechCapture: v })}
                aria-label="Speech signal"
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Delayed retention check</strong>
                <small>Brought back this many days after you pass the checkpoint.</small>
              </div>
              <div className="seg" role="radiogroup" aria-label="Retention interval">
                {([3, 4, 5] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={settings.retentionDays === d}
                    className={settings.retentionDays === d ? "on" : ""}
                    onClick={() => update({ retentionDays: d })}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className="settings-card start-card">
            <p>
              <b>{selRec?.title ?? "Choose a topic"}</b>
              {selRec && (
                <>
                  <br />
                  <small className="muted">
                    {selRec.provenance.origin === "seeded"
                      ? "Pre-verified record"
                      : "Verified live"}{" "}
                    · {selRec.claims.length} addressable claims · {issuesLabel(selRec)}
                  </small>
                </>
              )}
            </p>
            <Button className="start-btn" onClick={() => onStart(sel)} disabled={!selRec}>
              Start class <ArrowRight />
            </Button>
            {sess && !sess.completed && sess.stageIndex > 0 && (
              <button type="button" className="link-btn" onClick={() => onResume(sel)}>
                Resume where you left off (turn {sess.stageIndex + 1})
              </button>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Verified knowledge (Part 1 on its own)
export function KnowledgePanel() {
  useLiveRecords();
  const [open, setOpen] = useState<string | null>(null);
  const recs = allRecords();
  return (
    <section className="page-view knowledge-page">
      <div className="page-title">
        <div>
          <small>VERIFIED KNOWLEDGE ENGINE · PART 1</small>
          <h1>One trustworthy account of every topic</h1>
          <p>
            Everything the classroom says is generated from these records. Each lists who produced
            it, what was corrected or disputed, how it was settled and why — and every claim has an
            id the dialogue draws on.
          </p>
        </div>
      </div>
      <div className="know-list">
        {recs.map((r) => {
          const isOpen = open === r.key;
          return (
            <article key={r.key} className="know-card">
              <button
                type="button"
                className="know-head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.key)}
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <b>{r.title}</b>
                <i className="chip">{r.bloom}</i>
                <i className={`conf ${r.provenance.confidence}`}>
                  {r.provenance.confidence} confidence
                </i>
                <span className="muted">
                  {r.provenance.origin === "seeded"
                    ? "pre-verified reference"
                    : `verified by ${r.provenance.providers.join(", ")}`}{" "}
                  · {issuesLabel(r)}
                </span>
              </button>
              {isOpen && (
                <div className="know-body">
                  {r.provenance.note && <p className="muted">{r.provenance.note}</p>}
                  <h3>Corrections and resolved conflicts</h3>
                  {r.provenance.disagreements.map((d) => (
                    <div key={d.id} className="disagree">
                      <b>{d.point}</b>
                      <ul>
                        {d.positions.map((p, i) => (
                          <li key={i}>
                            <em>{p.agent}:</em> {p.claim}
                          </li>
                        ))}
                      </ul>
                      <p className="resolution">
                        <Check size={13} /> <b>Resolution:</b> {d.resolution}
                      </p>
                      <p className="muted">
                        <b>Why:</b> {d.reasoning}
                      </p>
                    </div>
                  ))}
                  <h3>Claims ({r.claims.length}, each addressable)</h3>
                  <table className="concept-table">
                    <tbody>
                      {r.claims.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <code>{c.id}</code>
                          </td>
                          <td>
                            <i className="chip">{c.role}</i>
                          </td>
                          <td>{c.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h3>Named misconceptions</h3>
                  <ul>
                    {r.misconceptions.map((m) => (
                      <li key={m.id}>
                        <b>{m.name}</b> — “{m.wrong}” → {m.right}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Progress: concept ladder, doubt log, badges
export function LadderSection({
  data,
  modules,
  onStudy,
}: {
  data: LearnerData;
  modules: Module[];
  onStudy: (key: string) => void;
}) {
  const now = nowMs();
  const open = data.learner.doubts.filter((d) => d.closedAt === undefined);
  const closed = data.learner.doubts.filter((d) => d.closedAt !== undefined);
  const mods = modules.filter((m) => m.slug !== "verified" || m.concepts.length);
  const badges = [
    ...mods.map((m) =>
      moduleBadge(
        data.learner,
        m.slug,
        m.title,
        m.concepts.map((c) => `${m.slug}:${c.slug}`),
      ),
    ),
    ...participationBadges(data.learner),
  ];
  return (
    <>
      <section className="report-card ladder-card">
        <h2>Concept ladder</h2>
        <small className="muted">
          A concept moves up only on evidence — and back down if a later check is failed. It cannot
          reach Retained on the day it was learned.
        </small>
        {mods.map((m) => (
          <div key={m.slug} className="ladder-module">
            <h3>{m.title}</h3>
            {m.concepts.map((c) => {
              const key = `${m.slug}:${c.slug}`;
              const cs = stateOf(data.learner, key);
              const dbts = open.filter((d) => d.key === key);
              return (
                <div key={key} className="ladder-row">
                  <div className="ladder-name">
                    <b>{c.title}</b>
                    <small>
                      Target Bloom level: {c.bloom}
                      {cs.nextCheckAt && cs.state !== "not-started"
                        ? ` · next delayed check ${whenLabel(cs.nextCheckAt, now)}`
                        : ""}
                    </small>
                    {dbts.length > 0 && (
                      <small className="doubt-line">
                        Open doubts: {dbts.map((d) => d.name).join("; ")}
                      </small>
                    )}
                  </div>
                  <ol className="ladder-steps" aria-label={`State: ${ladderLabel(cs.state)}`}>
                    {LADDER.map((l, i) => (
                      <li
                        key={l}
                        className={`${i <= LADDER.indexOf(cs.state) ? "reached" : ""} ${l === cs.state ? "current" : ""}`}
                      >
                        <i />
                        <span>{ladderLabel(l)}</span>
                      </li>
                    ))}
                  </ol>
                  <button type="button" className="link-btn no-print" onClick={() => onStudy(key)}>
                    {cs.state === "not-started" ? "Start" : "Study again"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </section>
      <div className="report-two">
        <section className="report-card">
          <h2>Doubt log</h2>
          <small className="muted">
            Named misconceptions, not just topics. A doubt closes only when you answer correctly on
            a later occasion.
          </small>
          {open.length === 0 && closed.length === 0 ? (
            <p className="muted">
              No doubts logged yet — wrong blanks, hints and checkpoint slips will appear here.
            </p>
          ) : (
            <ul className="doubt-list">
              {open.map((d) => (
                <li key={d.id}>
                  <header>
                    <strong>{d.name}</strong>
                    <span className="late">open</span>
                  </header>
                  <small>
                    from a {d.source} · {d.key.split(":")[1]}
                  </small>
                </li>
              ))}
              {closed.map((d) => (
                <li key={d.id} className="closed">
                  <header>
                    <strong>{d.name}</strong>
                    <span className="up">closed</span>
                  </header>
                  <small>closed {whenLabel(d.closedAt, now).replace("due today", "today")}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="report-card">
          <h2>Badges</h2>
          <ul className="badge-list">
            {badges.map((b) => (
              <li key={b.id} className={b.earned ? "earned" : ""}>
                <span>{b.earned ? <BadgeCheck /> : <Lock />}</span>
                <div>
                  <b>{b.title}</b>
                  <small>{b.description}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ guided user journey
const JKEY = "kyro_journey_v1";
export type JourneyFlags = { on: boolean; setupSeen: boolean; verifiedSeen: boolean };
export const loadJourney = (): JourneyFlags => {
  try {
    const p = JSON.parse(localStorage.getItem(JKEY) ?? "{}") as Partial<JourneyFlags>;
    return { on: !!p.on, setupSeen: !!p.setupSeen, verifiedSeen: !!p.verifiedSeen };
  } catch {
    return { on: false, setupSeen: false, verifiedSeen: false };
  }
};
export const saveJourney = (j: JourneyFlags) => {
  try {
    localStorage.setItem(JKEY, JSON.stringify(j));
  } catch {
    /* ignore */
  }
};

export function JourneyGuide({
  flags,
  setFlags,
  data,
  panel,
  go,
  due,
}: {
  flags: JourneyFlags;
  setFlags: (f: JourneyFlags) => void;
  data: LearnerData;
  panel: string;
  go: (p: string) => void;
  due: number;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const off = onClockChange(() => tick((x) => x + 1));
    return () => void off();
  }, []);
  const sessions = Object.values(data.sessions);
  const c = data.learner.counters;
  const concepts = Object.values(data.learner.concepts);
  const anyUnderstood = concepts.some((x) => x.state !== "not-started" && x.state !== "exposed");
  const anyRetained = concepts.some((x) => x.state === "retained" || x.state === "mastered");
  const steps = [
    {
      n: 1,
      title: "Select a topic",
      done: flags.setupSeen || sessions.length > 0,
      hint: "Open Topic Setup and pick a topic (or type your own).",
      action: ["Open Topic Setup", () => go("setup")] as const,
    },
    {
      n: 2,
      title: "Verified knowledge",
      done: flags.verifiedSeen,
      hint: "Every topic is a verified record: pre-verified, or drafted and reviewed by the AI. Open it to see what was corrected and why.",
      action: ["See verification", () => go("knowledge")] as const,
    },
    {
      n: 3,
      title: "The classroom opens",
      done: sessions.some((s) => s.stageIndex > 0 || Object.keys(s.blanks).length > 0),
      hint: "Teacher, a basic student and an advanced student work toward the answer.",
      action: ["Go to the class", () => go("classroom")] as const,
    },
    {
      n: 4,
      title: "Hints and blanks",
      done: c.blanks >= 1 && c.guesses >= 1,
      hint: "Guess before a hint's answer unlocks, and fill a blank — the dialogue waits for you.",
      action: ["Go to the class", () => go("classroom")] as const,
    },
    {
      n: 5,
      title: "Ask as the third student",
      done: c.asked >= 1,
      hint: "Use the ASK A DOUBT bar. The answer refers back to what was said.",
      action: ["Go to the class", () => go("classroom")] as const,
    },
    {
      n: 6,
      title: "Checkpoint → retention",
      done: anyRetained,
      hint: !anyUnderstood
        ? "Reach the checkpoint (it cannot be skipped) and pass it."
        : due > 0
          ? "A retention quiz is due. Take it."
          : "Passed! Fast-forward the clock to see the delayed retention quiz return.",
      action: !anyUnderstood
        ? (["Go to the class", () => go("classroom")] as const)
        : due > 0
          ? (["Take the retention quiz", () => go("review")] as const)
          : (["Skip ahead 3 days", () => skipDays(3)] as const),
    },
  ];
  const current = steps.find((s) => !s.done);
  if (!flags.on) return null;
  return (
    <aside className="journey" aria-label="Guided user journey">
      <header>
        <b>
          <Sparkles size={14} /> User journey
        </b>
        <button
          type="button"
          className="link-btn"
          onClick={() => setFlags({ ...flags, on: false })}
          aria-label="Hide the guide"
        >
          Hide
        </button>
      </header>
      <ol>
        {steps.map((s) => (
          <li key={s.n} className={s.done ? "done" : s === current ? "current" : ""}>
            <span>{s.done ? <Check size={12} /> : s.n}</span>
            {s.title}
          </li>
        ))}
      </ol>
      {current ? (
        <div className="journey-next">
          <p>{current.hint}</p>
          <Button size="sm" onClick={() => current.action[1]()}>
            {current.action[0]} <ArrowRight />
          </Button>
        </div>
      ) : (
        <div className="journey-next">
          <p>
            <BadgeCheck size={14} /> Journey complete — a concept is Retained after a delayed check.
            See the Report Card for the ladder, doubts and badges.
          </p>
          <Button size="sm" onClick={() => go("progress")}>
            Open Report Card
          </Button>
        </div>
      )}
      <footer>
        <small>
          Panel: {panel} · demo clock +{clockOffsetDays()}d
        </small>
      </footer>
    </aside>
  );
}
void useMemo;
