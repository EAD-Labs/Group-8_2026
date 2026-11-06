import { verifyTopic, VerifyError, cacheClear, type Provider } from "../src/lib/knowledge/engine";
import { SEEDED } from "../src/lib/knowledge/seed";
import { normTopic } from "../src/lib/knowledge/types";
let f = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) f++;
};

const RIGHT = "Carnot efficiency is 1 − Tc/Th, with temperatures in kelvin.";
const WRONG = "Carnot efficiency is 1 − Th/Tc, with temperatures in kelvin.";
const base = (extra: string) => [
  { role: "define", text: "A Carnot engine is a reversible cycle between two reservoirs." },
  { role: "mechanism", text: "Its efficiency depends only on the two reservoir temperatures." },
  {
    role: "pitfall",
    text: "No real engine can exceed the Carnot efficiency between the same reservoirs.",
  },
  { role: "example", text: "Between 600 K and 300 K the Carnot efficiency is 50%." },
  { role: "formula", text: extra },
];
const calls: Record<string, number> = {};
const mock = (
  name: string,
  mode: "good" | "wrong" | "fail" | "failAdj" = "good",
  adj?: (bundle: string) => unknown,
): Provider => ({
  name,
  complete: async (system, prompt) => {
    calls[name] = (calls[name] ?? 0) + 1;
    if (mode === "fail") throw new Error("503");
    if (system.includes("adjudicator")) {
      if (mode === "failAdj") throw new Error("boom");
      return (
        "```json\n" +
        JSON.stringify(
          adj
            ? adj(prompt)
            : {
                claims: base(RIGHT),
                disagreements: [
                  {
                    point: "Which temperature ratio appears in the Carnot efficiency?",
                    positions: [
                      { agent: "agentB", claim: WRONG },
                      { agent: "agentA", claim: RIGHT },
                    ],
                    resolution: "η = 1 − Tc/Th (cold over hot).",
                    reasoning:
                      "Efficiency must be below 1 and rise as the hot reservoir gets hotter; Th/Tc > 1 would give a negative efficiency.",
                    rejected: ["agentB"],
                  },
                ],
                confidence: "high",
              },
        ) +
        "\n```"
      );
    }
    if (system.includes("VERIFIED claims"))
      return JSON.stringify({
        title: "Carnot efficiency",
        equation: "η = 1 − Tc/Th",
        example: "600 K / 300 K → 50%",
        transfer: "Could a 700 K / 300 K engine reach 60%?",
        misconceptions: [
          { name: "temperature ratio inverted", wrong: "η = 1 − Th/Tc", right: "η = 1 − Tc/Th" },
        ],
        basic: ["Why kelvin?", "What is a reservoir?", "Why can't we reach 100%?"],
        probes: ["Is a real engine ever Carnot?", "What if Tc = 0?"],
        blanks: [
          {
            before: "Carnot efficiency is 1 minus Tc over",
            answer: "Th",
            after: ".",
            accept: ["th", "t_h"],
            claimIndex: 4,
          },
          {
            before: "Temperatures must be in",
            answer: "kelvin",
            after: ".",
            accept: ["kelvin", "k"],
            claimIndex: 4,
          },
        ],
        hints: [
          {
            question: "Efficiency between 600 K and 300 K?",
            hint: "1 − 300/600",
            answer: "50%",
            accept: ["50", "0.5", "half"],
            claimIndex: 3,
          },
          {
            question: "Can a real engine beat Carnot?",
            hint: "Second law.",
            answer: "No",
            accept: ["no"],
            claimIndex: 2,
          },
        ],
      });
    return JSON.stringify({ claims: mode === "wrong" ? base(WRONG) : base(RIGHT) });
  },
});
const T = "Carnot efficiency";

cacheClear();
const A = mock("agentA"),
  B = mock("agentB", "wrong"),
  C = mock("agentC");
const steps: string[] = [];
const r1 = await verifyTopic(T, [A, B, C], { onProgress: (s) => steps.push(s) });
const rec = r1.record;
ok(
  !r1.cached &&
    rec.provenance.providers.join() === "agentA,agentB,agentC" &&
    rec.provenance.origin === "verified",
  "T1.1 a verified record is stored and lists the contributing providers (" +
    rec.provenance.providers.join(", ") +
    ")",
);
ok(
  steps.join(",") === "agents,compare,resolve,compose,store",
  "progress is reported step by step: " + steps.join(" → "),
);
const d = rec.provenance.disagreements[0]!;
ok(
  !!d && d.positions.length === 2 && d.resolution.length > 5 && d.reasoning.length > 10,
  "T1.2 the disagreement, its resolution AND the reasoning are stored, not just the winning answer",
);
ok(
  rec.claims.some((c) => c.text === RIGHT) && !rec.claims.some((c) => c.text === WRONG),
  "T1.3 the incorrect claim does not survive into the record",
);
ok(
  rec.provenance.confidence === "high",
  "confidence is annotated (3 agents, disagreement resolved → " + rec.provenance.confidence + ")",
);
// safety net: adjudicator mistakenly keeps the rejected claim
cacheClear();
const sloppy = (_: string) => ({
  claims: [...base(RIGHT), { role: "formula", text: WRONG }],
  disagreements: [
    {
      point: "ratio",
      positions: [{ agent: "agentB", claim: WRONG }],
      resolution: "Tc/Th",
      reasoning: "Th/Tc exceeds 1.",
      rejected: ["agentB"],
    },
  ],
  confidence: "high",
});
const r1b = await verifyTopic(T, [mock("agentA", "good", sloppy), mock("agentB", "wrong")], {});
ok(
  !r1b.record.claims.some((c) => c.text === WRONG),
  "…even if the adjudicator carelessly leaves a rejected statement in, the engine removes it",
);
// T1.4 cache
cacheClear();
await verifyTopic(T, [A, B, C]);
const before = A_calls();
function A_calls() {
  return Object.values(calls).reduce((a, b) => a + b, 0);
}
const r4 = await verifyTopic("  carnot EFFICIENCY! ", [A, B, C]);
ok(
  r4.cached && A_calls() === before,
  "T1.4 a repeated topic (even re-typed differently) is served from cache with no new provider calls",
);
// T1.5 one provider down
cacheClear();
const r5 = await verifyTopic(T, [A, mock("down", "fail"), C]);
ok(
  r5.record.provenance.confidence === "low" &&
    r5.record.provenance.failedProviders?.join() === "down" &&
    r5.record.provenance.providers.length === 2,
  "T1.5 one provider unavailable: the others proceed and the record is marked lower confidence",
);
// T1.6 all down
cacheClear();
let err: unknown;
try {
  await verifyTopic(T, [mock("x", "fail"), mock("y", "fail")]);
} catch (e) {
  err = e;
}
ok(
  err instanceof VerifyError && err.code === "all-failed" && /retry/i.test(err.message),
  "T1.6 all providers unavailable: a recoverable error with a retry message",
);
ok(
  !(await verifyTopic(T, [A, B, C])).cached,
  "…and nothing was cached by the failed attempt (a retry runs normally)",
);
// adjudicator fallback & errors
cacheClear();
const r6 = await verifyTopic(T, [mock("badAdj", "failAdj"), A]);
ok(r6.record.claims.length >= 5, "if one agent fails as adjudicator another takes over");
cacheClear();
let e2: unknown;
try {
  await verifyTopic(T, []);
} catch (e) {
  e2 = e;
}
ok(
  e2 instanceof VerifyError && e2.code === "no-providers",
  "no providers configured → a clear 'no-providers' error",
);
let e3: unknown;
try {
  await verifyTopic("   ", [A]);
} catch (e) {
  e3 = e;
}
ok(e3 instanceof VerifyError, "an empty topic is rejected");
// T1.7 structure
const ids = new Set(rec.claims.map((c) => c.id));
ok(
  rec.claims.every((c) => c.id && c.role && c.text) &&
    ids.size === rec.claims.length &&
    [...rec.blanks, ...rec.hints].every((x) => ids.has(x.claimId)),
  "T1.7 content is segmented into addressable claims and every blank/hint points at a real claim id",
);
ok(
  rec.blanks.length === 2 &&
    rec.hints.length === 2 &&
    rec.basic.length === 3 &&
    rec.probes.length === 2 &&
    rec.misconceptions.length >= 1,
  "the record carries what the classroom needs: 2 blanks, 2 hints, basic and advanced questions, named misconceptions",
);
// seeded short-circuit
const seeded = await verifyTopic("Second law & entropy", [], {
  seeded: (t) => SEEDED.find((x) => normTopic(x.title) === normTopic(t)),
});
ok(
  seeded.cached && seeded.record.provenance.origin === "seeded",
  "seeded pilot topics open instantly with no provider at all",
);

// ---- single-AI mode (the app's one AI): draft, then review the draft
{
  cacheClear();
  let n = 0;
  const one = (reviewMode: "fix" | "clean" | "fail"): Provider => ({
    name: "ai",
    complete: async (system) => {
      n++;
      if (system.includes("careful reviewer")) {
        if (reviewMode === "fail") throw new Error("503");
        if (reviewMode === "clean")
          return JSON.stringify({ claims: base(RIGHT), disagreements: [], confidence: "medium" });
        return JSON.stringify({
          claims: base(RIGHT),
          disagreements: [
            {
              point: "Which ratio is in the Carnot efficiency?",
              positions: [
                { agent: "first draft", claim: WRONG },
                { agent: "review", claim: RIGHT },
              ],
              resolution: "η = 1 − Tc/Th.",
              reasoning: "Th/Tc exceeds 1 and would give a negative efficiency.",
              rejected: ["first draft"],
            },
          ],
          confidence: "medium",
        });
      }
      if (system.includes("VERIFIED claims")) return mock("x").complete(system, "");
      return JSON.stringify({ claims: base(WRONG) }); // the first draft contains the error
    },
  });
  const steps2: string[] = [];
  const s1 = await verifyTopic("Carnot efficiency", [one("fix")], {
    onProgress: (x) => steps2.push(x),
  });
  const r = s1.record;
  ok(
    r.provenance.mode === "single" && r.provenance.providers.join() === "ai (draft),ai (review)",
    "single AI: the record says it was drafted then reviewed by the same AI (" +
      r.provenance.providers.join(", ") +
      ")",
  );
  ok(
    !r.claims.some((c) => c.text === WRONG) && r.claims.some((c) => c.text === RIGHT),
    "single AI: the error in the first draft is corrected by the review pass and does not survive",
  );
  ok(
    r.provenance.disagreements.length === 1 &&
      r.provenance.disagreements[0]!.positions.map((p) => p.agent).join() ===
        "first draft,review" &&
      r.provenance.disagreements[0]!.reasoning.length > 10,
    "single AI: the correction is recorded with both versions and the reasoning",
  );
  ok(
    r.provenance.confidence === "medium" && /capped at medium/.test(r.provenance.note ?? ""),
    "single AI: confidence is capped at medium and the record says why",
  );
  ok(
    steps2.join(",") === "agents,compare,resolve,compose,store",
    "single AI: the same five steps are reported",
  );
  const before2 = n;
  const again = await verifyTopic("carnot efficiency", [one("fix")]);
  ok(
    again.cached && n === before2,
    "single AI: a repeated topic is served from cache with no new AI calls",
  );
  cacheClear();
  const clean = await verifyTopic("Carnot efficiency", [one("clean")]);
  ok(
    clean.record.provenance.disagreements.length === 0 &&
      clean.record.provenance.confidence === "medium",
    "single AI: a clean review finds nothing to correct, still capped at medium (never 'high')",
  );
  cacheClear();
  const failed = await verifyTopic("Carnot efficiency", [one("fail")]);
  ok(
    failed.record.provenance.confidence === "low" &&
      /unreviewed draft/.test(failed.record.provenance.note ?? "") &&
      failed.record.claims.length >= 5,
    "single AI: if the review cannot run, the draft is kept but honestly marked low confidence",
  );
  cacheClear();
  let e4: unknown;
  try {
    await verifyTopic("Carnot efficiency", [
      {
        name: "ai",
        complete: async () => {
          throw new Error("down");
        },
      },
    ]);
  } catch (e) {
    e4 = e;
  }
  ok(
    e4 instanceof VerifyError && e4.code === "all-failed",
    "single AI: if the AI is down entirely, a recoverable error (no record is stored)",
  );
}
console.log(f ? `${f} FAILED` : "ALL PASSED");
process.exit(f ? 1 : 0);
