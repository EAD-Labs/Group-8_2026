// Evaluation, in plain words: what is measured and where to see it, the results on this device, and the
// pooled pilot report from every tester's file. The classroom-vs-plain-chat study follows below it.
import { useMemo, useState } from "react";
import {
  Brain,
  Download,
  FileUp,
  GraduationCap,
  MessageSquare,
  RotateCcw,
  Scale,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  buildPilotFile,
  parsePilotFile,
  pilotReport,
  type PilotFile,
  type PilotReport,
} from "@/lib/pilot-file";

const MEASURES = [
  {
    Icon: GraduationCap,
    title: "Understanding",
    how: "The checkpoint at the end of every class: the learner explains the idea in their own words and it is scored.",
    where: "Report Card → concept ladder (“Understood”)",
  },
  {
    Icon: RotateCcw,
    title: "Retention",
    how: "A short quiz 3–5 days after the checkpoint. Passing it is the only way a concept becomes “Retained”.",
    where: "Review → quizzes due",
  },
  {
    Icon: Brain,
    title: "Self-assessment",
    how: "After the checkpoint: did the score match how the learner felt? Judging yourself correctly is the metacognitive skill.",
    where: "This page",
  },
  {
    Icon: MessageSquare,
    title: "Learner feedback",
    how: "At the end of each class: how useful it was (1–5) and one thing to improve.",
    where: "This page",
  },
  {
    Icon: Scale,
    title: "Compared with plain chat",
    how: "In study mode each learner learns one concept here and a matched one in plain chat; both are tested days later.",
    where: "Study section, below",
  },
];
const LADDER_SHOWN: Array<[string, string]> = [
  ["exposed", "Exposed"],
  ["understood", "Understood"],
  ["retained", "Retained"],
  ["mastered", "Mastered"],
];

function ReportView({ r }: { r: PilotReport }) {
  const c = r.calibration;
  const felt = r.felt.expected + r.felt.better + r.felt.worse;
  const max = Math.max(1, ...r.usefulness.counts);
  return (
    <div className="eval-results">
      <div className="eval-stats">
        <div className="eval-stat">
          <small>Learners</small>
          <b>{r.learners}</b>
          <span>
            {r.classes} class{r.classes === 1 ? "" : "es"} with check-ins
          </span>
        </div>
        <div className="eval-stat">
          <small>Usefulness</small>
          <b>{r.usefulness.mean === null ? "—" : `${r.usefulness.mean} / 5`}</b>
          <span>
            {r.usefulness.n} rating{r.usefulness.n === 1 ? "" : "s"}
          </span>
        </div>
        <div className="eval-stat">
          <small>Felt the score was right (asked after)</small>
          <b>{felt ? `${r.felt.expected} of ${felt}` : "—"}</b>
          <span>
            {felt
              ? `${r.felt.worse} over-confident · ${r.felt.better} under-confident`
              : "after a checkpoint"}
          </span>
        </div>
        <div className="eval-stat">
          <small>Confidence after class</small>
          <b>{r.confidence.n ? `${r.confidence.up} up` : "—"}</b>
          <span>
            {r.confidence.n
              ? `${r.confidence.same} same · ${r.confidence.down} down`
              : "before vs after"}
          </span>
        </div>
      </div>
      <div className="eval-two">
        <section className="eval-box" aria-label="Usefulness ratings">
          <h3>Usefulness ratings</h3>
          {r.usefulness.n ? (
            <div className="eval-bars">
              {r.usefulness.counts.map((c, i) => (
                <div key={i} className="eval-bar">
                  <span>{i + 1}</span>
                  <i style={{ width: `${(c / max) * 100}%` }} />
                  <b>{c}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="eval-empty">No ratings yet — asked at the end of each class.</p>
          )}
        </section>
        <section className="eval-box" aria-label="Progress on the concept ladder">
          <h3>Progress (concepts)</h3>
          <div className="eval-ladder">
            {LADDER_SHOWN.map(([k, l]) => (
              <div key={k}>
                <b>{r.ladder[k] ?? 0}</b>
                <span>{l}</span>
              </div>
            ))}
          </div>
          <p className="eval-note">
            Doubts: {r.doubtsClosed} cleared · {r.doubtsOpen} still open
          </p>
        </section>
      </div>
      <section className="eval-box" aria-label="Self-assessment (calibration)">
        <h3>Self-assessment — do learners know how well they know it?</h3>
        <p className="eval-note">
          Confidence is asked before the result is shown, then compared with the score. This is the
          metacognitive skill the classroom trains.
        </p>
        <div className="eval-stats">
          <div className="eval-stat">
            <small>Checkpoint: confidence matched the score</small>
            <b>{c.checkpoint.n ? `${c.checkpoint.matched} of ${c.checkpoint.n}` : "—"}</b>
            <span>
              {c.checkpoint.n
                ? `${c.checkpoint.over} over-confident · ${c.checkpoint.under} under-confident · average gap ${c.checkpoint.gap} points`
                : "asked just before the checkpoint answer"}
            </span>
          </div>
          <div className="eval-stat">
            <small>Getting better at it?</small>
            <b>
              {c.trend.early !== null && c.trend.late !== null
                ? `${c.trend.early}% → ${c.trend.late}%`
                : "—"}
            </b>
            <span>
              {c.trend.learners
                ? `matched in earlier vs later classes (${c.trend.learners} learner${c.trend.learners === 1 ? "" : "s"} with 2+ classes)`
                : "needs 2+ classes per learner"}
            </span>
          </div>
          <div className="eval-stat">
            <small>Retention quiz: prediction matched the result</small>
            <b>{c.retention.n ? `${c.retention.matched} of ${c.retention.n}` : "—"}</b>
            <span>
              {c.retention.n
                ? `${c.retention.over} over · ${c.retention.under} under`
                : "asked before each review quiz"}
            </span>
          </div>
          <div className="eval-stat">
            <small>“Certain” at the checkpoint → passed the quiz days later</small>
            <b>
              {c.certainThenRetained.n
                ? `${c.certainThenRetained.passed} of ${c.certainThenRetained.n}`
                : "—"}
            </b>
            <span>is their certainty justified?</span>
          </div>
        </div>
        <p className="eval-note">
          Mid-class pulse — “Is this making sense?”: {c.pulse.yes} yes · {c.pulse.mostly} mostly ·{" "}
          {c.pulse.lost} lost me
        </p>
      </section>
      {r.comments.length > 0 && (
        <section className="eval-box" aria-label="What learners would improve">
          <h3>What learners would improve</h3>
          <ul className="eval-comments">
            {r.comments.slice(0, 12).map((c, i) => (
              <li key={i}>“{c}”</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function EvaluationHub({ participant }: { participant: string }) {
  const [files, setFiles] = useState<PilotFile[]>([]);
  const [msg, setMsg] = useState("");
  const mine = useMemo(
    () => (typeof window === "undefined" ? null : buildPilotFile(localStorage, participant)),
    [participant],
  );
  const myReport = mine ? pilotReport([mine]) : null;
  const deviceEmpty =
    !myReport ||
    (myReport.classes === 0 &&
      Object.values(myReport.ladder).every((v) => v === 0) &&
      Object.keys(mine?.ladder ?? {}).length === 0);
  const pooled = files.length ? pilotReport(files) : null;
  const download = () => {
    if (!mine) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(buildPilotFile(localStorage, participant), null, 1)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `aikyro-pilot-${participant.slice(0, 8)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const load = async (list: FileList | null) => {
    if (!list?.length) return;
    const got: PilotFile[] = [];
    let bad = 0;
    for (const f of Array.from(list)) {
      const p = parsePilotFile(await f.text());
      if (p) got.push(p);
      else bad++;
    }
    setFiles((prev) => [...prev, ...got]);
    setMsg(
      `${got.length} pilot file${got.length === 1 ? "" : "s"} loaded${bad ? ` · ${bad} not a pilot file (skipped)` : ""}.`,
    );
  };
  return (
    <div className="page-view eval-hub">
      <header>
        <p className="eyebrow">EVALUATION</p>
        <h1>How AI KYRO measures learning</h1>
        <p className="lede">
          Learning is judged by evidence — not by time spent or points. Five things are measured:
        </p>
      </header>
      <div className="eval-measures">
        {MEASURES.map(({ Icon, title, how, where }) => (
          <div key={title} className="eval-measure">
            <span className="eval-icon" aria-hidden="true">
              <Icon />
            </span>
            <b>{title}</b>
            <p>{how}</p>
            <small>{where}</small>
          </div>
        ))}
      </div>

      <h2>On this device</h2>
      {deviceEmpty || !myReport ? (
        <p className="eval-empty">
          Nothing yet. Take one class (it ends with a checkpoint and two quick feedback questions)
          and the results appear here.
        </p>
      ) : (
        <ReportView r={myReport} />
      )}

      <h2>Pilot: all testers</h2>
      <ol className="eval-steps">
        <li>Each tester takes one class on their own device.</li>
        <li>
          They open <b>Evaluation</b> and tap <b>Download this device’s file</b> (no audio, no names
          — answers and progress only).
        </li>
        <li>Load everyone’s files here to see the pooled results.</li>
      </ol>
      <div className="eval-actions">
        <Button variant="outline" onClick={download}>
          <Download /> Download this device’s file
        </Button>
        <label className="eval-upload">
          <FileUp aria-hidden="true" /> Load pilot files
          <input
            type="file"
            accept=".json,application/json"
            multiple
            onChange={(e) => void load(e.target.files)}
          />
        </label>
        {files.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setFiles([]);
              setMsg("");
            }}
          >
            Clear
          </Button>
        )}
      </div>
      {msg && (
        <p className="eval-note" role="status">
          {msg}
        </p>
      )}
      {pooled ? (
        <ReportView r={pooled} />
      ) : (
        <p className="eval-empty">No pilot files loaded yet.</p>
      )}
      <h2 className="eval-study-title">Study: classroom vs plain chat</h2>
    </div>
  );
}
