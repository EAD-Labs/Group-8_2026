// "My thinking" as a conversation: a coach asks ONE short question at a time, you tap an answer (or skip).
// Three moments in a class — before, during, after — and a few answers change what happens next.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Brain, GraduationCap, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LessonStage } from "@/lib/curriculum";
import {
  KNOW_LEVELS,
  KNOW_REPLY,
  SURE_LEVELS,
  changeLine,
  type ThinkingLog,
} from "@/lib/thinking-chat";

type Bubble = { who: "coach" | "you"; text: string };
type Reply = { reply: string; next: number | "done"; handedOff?: boolean };
type Step = {
  ask: string;
  options?: string[];
  input?: boolean;
  onPick: (label: string, i: number) => Reply;
};

const quickMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function CheckinCard({
  stage,
  topic,
  popup,
  log,
  score,
  shakyOptions,
  onSave,
  onDoubt,
  onPractise,
  onNextTopic,
  onDone,
}: {
  stage: LessonStage;
  topic: string;
  popup: boolean;
  log: ThinkingLog;
  /** the checkpoint score (0–100) once there is one */
  score?: number;
  /** the main points of the class so far, offered when something "feels shaky" */
  shakyOptions: string[];
  onSave: (patch: Partial<ThinkingLog>) => void;
  onDoubt: (question: string) => void;
  onPractise: () => void;
  onNextTopic: () => void;
  onDone: () => void;
}) {
  const phase = stage.checkin?.phase ?? "before";
  const steps = buildSteps(phase, {
    topic,
    log,
    score,
    shakyOptions,
    onSave,
    onDoubt,
    onPractise,
    onNextTopic,
  });
  const [trail, setTrail] = useState<Bubble[]>(() => [{ who: "coach", text: steps[0]!.ask }]);
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [finished, setFinished] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const [text, setText] = useState("");
  const timers = useRef<number[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const list = timers.current;
    return () => {
      list.forEach((t) => window.clearTimeout(t));
    };
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [trail, typing]);

  const later = (ms: number, f: () => void) => {
    if (quickMotion()) f();
    else timers.current.push(window.setTimeout(f, ms));
  };
  const advance = (youSaid: string | null, r: Reply | null) => {
    const nextStep = r && r.next !== "done" ? steps[r.next] : undefined;
    if (youSaid) setTrail((t) => [...t, { who: "you", text: youSaid }]);
    setTyping(true);
    later(260, () => {
      if (r) setTrail((t) => [...t, { who: "coach", text: r.reply }]);
      if (r?.handedOff) setHandedOff(true);
      if (nextStep && r && r.next !== "done") {
        later(340, () => {
          setStep(r.next as number);
          setTrail((t) => [...t, { who: "coach", text: nextStep.ask }]);
          setTyping(false);
        });
      } else {
        setTyping(false);
        setFinished(true);
      }
    });
  };
  const pick = (label: string, i: number) => advance(label, steps[step]!.onPick(label, i));
  const skip = () => {
    const n = step + 1;
    if (steps[n]) {
      setTyping(true);
      later(200, () => {
        setStep(n);
        setTrail((t) => [...t, { who: "coach", text: steps[n]!.ask }]);
        setTyping(false);
      });
    } else setFinished(true);
  };
  const cur = steps[step]!;

  return (
    <div
      className={`transcript-response checkin-card ${popup ? "in-popup" : ""}`}
      data-card="checkin"
      data-phase={phase}
    >
      <small>
        {phase === "before"
          ? "BEFORE WE START"
          : phase === "during"
            ? "QUICK PULSE"
            : "LOOKING BACK"}{" "}
        · ONE TAP EACH
      </small>
      <div className="chat-trail" role="log" aria-live="polite" aria-label="Check-in conversation">
        {trail.map((b, i) => (
          <div key={i} className={`bubble ${b.who}`}>
            {b.who === "coach" && (
              <span className="bubble-avatar" aria-hidden="true">
                <GraduationCap />
              </span>
            )}
            <p>{b.text}</p>
          </div>
        ))}
        {typing && (
          <div className="bubble coach typing" aria-label="typing">
            <span className="bubble-avatar" aria-hidden="true">
              <GraduationCap />
            </span>
            <p>
              <i />
              <i />
              <i />
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {!typing && !finished && (
        <>
          {cur.options && (
            <div className="chip-row" role="group" aria-label={cur.ask}>
              {cur.options.map((o, i) => (
                <button key={o} type="button" className="chip" onClick={() => pick(o, i)}>
                  {o}
                </button>
              ))}
            </div>
          )}
          {cur.input && (
            <form
              className="chip-input"
              onSubmit={(e) => {
                e.preventDefault();
                const v = text.trim();
                if (!v) return;
                setText("");
                pick(v, 0);
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type it in your own words…"
                aria-label="Your answer"
                maxLength={200}
              />
              <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim()}>
                <Send />
              </Button>
            </form>
          )}
          <div className="response-actions">
            <button type="button" className="skip-link" onClick={skip}>
              Skip
            </button>
          </div>
        </>
      )}
      {finished && !handedOff && (
        <div className="response-actions">
          <span />
          <Button onClick={onDone}>
            Continue <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}

function buildSteps(
  phase: "before" | "during" | "after",
  c: {
    topic: string;
    log: ThinkingLog;
    score: number | undefined;
    shakyOptions: string[];
    onSave: (p: Partial<ThinkingLog>) => void;
    onDoubt: (q: string) => void;
    onPractise: () => void;
    onNextTopic: () => void;
  },
): Step[] {
  if (phase === "before")
    return [
      {
        ask: `Before we start — how much do you already know about ${c.topic}?`,
        options: [...KNOW_LEVELS],
        onPick: (_l, i) => {
          c.onSave({ know: i });
          return { reply: KNOW_REPLY[i] ?? "Thanks.", next: 1 };
        },
      },
      {
        ask: "Anything you expect to be tricky?",
        options: ["The terms", "The maths", "The examples", "Nothing really", "Not sure"],
        onPick: (l) => {
          c.onSave({ tricky: l });
          return {
            reply:
              l === "Nothing really" || l === "Not sure"
                ? "Fair enough. If something trips you up, the doubt bar is always open."
                : `Noted — I'll watch for ${l.toLowerCase()} with you.`,
            next: "done",
          };
        },
      },
    ];
  if (phase === "during")
    return [
      {
        ask: "Quick pulse: is this making sense so far?",
        options: ["Yes", "Mostly", "Lost me"],
        onPick: (_l, i) => {
          c.onSave({ pulse: (["yes", "mostly", "lost"] as const)[i] ?? "yes" });
          return i === 0
            ? { reply: "Great — on we go.", next: "done" }
            : {
                reply:
                  i === 1
                    ? "Good — let's tighten the bit that isn't clear."
                    : "Okay, let's fix that right now.",
                next: 1,
              };
        },
      },
      {
        ask: "Which part feels shakiest?",
        options: [...c.shakyOptions, "Something else"],
        onPick: (l) => {
          if (l === "Something else") return { reply: "Tell me in your own words.", next: 2 };
          c.onSave({ shaky: l });
          c.onDoubt(`I'm not sure about ${l.toLowerCase()} — can you explain it differently?`);
          return {
            reply: "Watch the board — I'm explaining that now.",
            next: "done",
            handedOff: true,
          };
        },
      },
      {
        ask: "What's confusing?",
        input: true,
        onPick: (l) => {
          c.onSave({ shaky: l.slice(0, 120) });
          c.onDoubt(l);
          return {
            reply: "Good — let me answer that on the board.",
            next: "done",
            handedOff: true,
          };
        },
      },
    ];
  const afterSteps: Array<(n: number) => Step> = [];
  if (c.score !== undefined)
    afterSteps.push((n) => ({
      ask: `You scored ${c.score}% on the checkpoint. Did that match how you felt?`,
      options: ["I expected it", "Better than I thought", "Worse than I thought"],
      onPick: (_l, i) => {
        const felt = (["expected", "better", "worse"] as const)[i] ?? "expected";
        c.onSave({ felt, scorePct: c.score as number });
        return {
          reply:
            felt === "expected"
              ? "Good calibration — you know where you stand."
              : felt === "better"
                ? "Nice surprise — you know more than you gave yourself credit for."
                : "Useful to know — that gap is exactly what we'll go back over first.",
          next: n + 1,
        };
      },
    }));
  afterSteps.push((n) => ({
    ask: `How sure are you about ${c.topic} now?`,
    options: [...SURE_LEVELS],
    onPick: (_l, i) => {
      c.onSave({ sureNow: i });
      return { reply: changeLine({ ...c.log, sureNow: i }) ?? "Thanks — noted.", next: n + 1 };
    },
  }));
  afterSteps.push((n) => ({
    ask: "How useful was this class for you? 1 is not at all, 5 is very.",
    options: ["1", "2", "3", "4", "5"],
    onPick: (_l, i) => {
      c.onSave({ useful: i + 1 });
      return {
        reply:
          i >= 3
            ? "Thank you — glad it helped."
            : "Thanks for being honest — that helps us fix it.",
        next: n + 1,
      };
    },
  }));
  afterSteps.push((n) => ({
    ask: "One thing that would make it better? Say or type it — or skip.",
    input: true,
    onPick: (l) => {
      c.onSave({ improve: l.slice(0, 200) });
      return { reply: "Noted. Thank you.", next: n + 1 };
    },
  }));
  afterSteps.push(() => ({
    ask: "What would help most next?",
    options: ["Practise more", "Next topic", "Explain something again", "I'm good"],
    onPick: (l, i) => {
      c.onSave({ next: l });
      if (i === 0) {
        c.onPractise();
        return { reply: "Opening a short practice set.", next: "done", handedOff: true };
      }
      if (i === 1) {
        c.onNextTopic();
        return { reply: "On to the next topic.", next: "done", handedOff: true };
      }
      if (i === 2) {
        c.onDoubt("Explain the main idea again, from a different angle.");
        return { reply: "Okay — watch the board.", next: "done", handedOff: true };
      }
      return { reply: "Great. Teach-back is next if you'd like it.", next: "done" };
    },
  }));
  return afterSteps.map((mk, i) => mk(i));
}

/** After a doubt is answered on the board: did that clear it up? One tap, and the class carries on from there. */
export function DoubtCard({
  stage,
  onGotIt,
  onAgain,
  onExample,
}: {
  stage: LessonStage;
  onGotIt: () => void;
  onAgain: () => void;
  onExample: () => void;
}) {
  return (
    <div className="transcript-response doubt-card" data-card="doubt">
      <small>YOUR DOUBT</small>
      {stage.asked && <p className="doubt-q">“{stage.asked}”</p>}
      {stage.pending ? (
        <p className="doubt-note" role="status">
          Your teacher is working on that…
        </p>
      ) : (
        <>
          {stage.viaNotes && (
            <p className="doubt-note" role="note">
              Answered from the verified notes — the AI teacher couldn't be reached just now.
            </p>
          )}
          <p className="doubt-ask">Did that clear it up?</p>
          <div className="chip-row">
            <button type="button" className="chip primary" onClick={onGotIt}>
              Got it
            </button>
            <button type="button" className="chip" onClick={onAgain}>
              Not clear — explain differently
            </button>
            <button type="button" className="chip" onClick={onExample}>
              Show me an example
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The "My thinking" recap: what you said at each check-in, as a short conversation — nothing to fill in. */
export function ThinkingSummary({
  log,
  topic,
  onClose,
}: {
  log: ThinkingLog;
  topic: string;
  onClose: () => void;
}) {
  const lines: Array<[string, string]> = [];
  if (log.know !== undefined)
    lines.push([`How much did you know about ${topic}?`, KNOW_LEVELS[log.know] ?? ""]);
  if (log.tricky) lines.push(["What did you expect to be tricky?", log.tricky]);
  if (log.pulse)
    lines.push([
      "Was it making sense?",
      { yes: "Yes", mostly: "Mostly", lost: "Lost me" }[log.pulse],
    ]);
  if (log.shaky) lines.push(["What felt shaky?", log.shaky]);
  if (log.felt)
    lines.push([
      `Checkpoint${log.scorePct !== undefined ? ` (${log.scorePct}%)` : ""} — did it match how you felt?`,
      { expected: "I expected it", better: "Better than I thought", worse: "Worse than I thought" }[
        log.felt
      ],
    ]);
  if (log.sureNow !== undefined)
    lines.push([`How sure are you about ${topic} now?`, SURE_LEVELS[log.sureNow] ?? ""]);
  if (log.next) lines.push(["What would help next?", log.next]);
  const change = changeLine(log);
  return (
    <section
      id="my-thinking-panel"
      className="my-thinking-chat"
      aria-labelledby="my-thinking-title"
    >
      <header>
        <span className="my-thinking-icon">
          <Brain aria-hidden="true" />
        </span>
        <div>
          <p>MY THINKING</p>
          <h2 id="my-thinking-title">What you've told me about {topic}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>
      {lines.length === 0 ? (
        <p className="thinking-empty">
          Nothing yet. Short one-tap check-ins pop up as you go through the class — this page fills
          itself in. You can turn them off in Settings.
        </p>
      ) : (
        <div className="chat-trail">
          {lines.map(([q, a]) => (
            <div key={q}>
              <div className="bubble coach">
                <span className="bubble-avatar" aria-hidden="true">
                  <GraduationCap />
                </span>
                <p>{q}</p>
              </div>
              <div className="bubble you">
                <p>{a}</p>
              </div>
            </div>
          ))}
          {change && <p className="thinking-change">{change}</p>}
        </div>
      )}
    </section>
  );
}
