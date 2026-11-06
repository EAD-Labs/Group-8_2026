import {
  analyseSpeech,
  segments,
  gapReport,
  domainTerms,
  FRAME_MS,
} from "../src/lib/speech-signal";
let f = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) f++;
};
// build a synthetic loudness trace: [seconds, loud?] blocks with a little noise
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const trace = (blocks: Array<[number, boolean]>) =>
  blocks.flatMap(([s, loud]) =>
    Array.from({ length: Math.round((s * 1000) / FRAME_MS) }, () =>
      loud ? 0.12 + rnd() * 0.08 : 0.004 + rnd() * 0.004,
    ),
  );
const TX =
  "Entropy measures how energy is spread among accessible states so the total entropy of an isolated system never decreases and spontaneous change has a direction";
const terms = ["entropy", "energy", "spread", "isolated", "decreases"];
// fluent: 14 s of continuous speech with only tiny dips
const fluent = trace([
  [1, false],
  [4, true],
  [0.15, false],
  [5, true],
  [0.2, false],
  [5, true],
  [1, false],
]);
const a = analyseSpeech(fluent, TX, terms);
ok(
  a.reliable && a.pauses.length === 0 && a.hesitationIndex === 0,
  "fluent speech: no pauses, hesitation 0 (tiny dips are bridged)",
);
ok(
  a.speechRate > 100 && a.speechRate < 160,
  `speech rate is plausible: ${a.speechRate} wpm over ${a.span.toFixed(1)} s`,
);
// hesitant: a 2.5 s pause right where the transcript reaches "isolated"
const hes = trace([
  [1, false],
  [5, true],
  [2.5, false],
  [3, true],
  [1.2, false],
  [4, true],
  [1, false],
]);
const b = analyseSpeech(hes, TX, terms);
ok(
  b.pauses.length === 2 && Math.abs(b.pauses[0]!.length - 2.5) < 0.2,
  `two long pauses found (${b.pauses.map((p) => p.length.toFixed(1) + "s").join(", ")})`,
);
ok(
  b.longestPause >= 2.4 && b.hesitationIndex > 20,
  `hesitation index rises (${b.hesitationIndex}) vs fluent (${a.hesitationIndex})`,
);
ok(
  b.markers.length === 2 && /Long pause \(2\.5 s\) before/.test(b.markers[0]!),
  "markers read in plain language: " + b.markers.join(" | "),
);
ok(
  b.speechRate < a.speechRate || b.articulationRate > b.speechRate,
  `pauses lower the overall rate (${b.speechRate} wpm) but not the articulation rate (${b.articulationRate} wpm)`,
);
ok(
  b.pauses.some((p) => p.term),
  "a pause before a domain term is flagged as a candidate gap: " +
    b.pauses.map((p) => `${p.term ?? "(" + p.nextWord + ")"}`).join(", "),
);
// robustness
ok(
  !analyseSpeech(
    Array.from({ length: 200 }, () => 0.01),
    TX,
    terms,
  ).reliable,
  "silence / a flat trace is not treated as speech",
);
ok(
  !analyseSpeech(fluent, "hello", terms).reliable && !analyseSpeech([], TX, terms).reliable,
  "too few words or no data -> not reliable, never a made-up score",
);
ok(
  !analyseSpeech(
    trace([
      [1, false],
      [2, true],
      [1, false],
    ]),
    TX,
    terms,
  ).reliable,
  "a very short answer is flagged unreliable",
);
ok(
  segments(
    trace([
      [1, true],
      [0.1, false],
      [1, true],
    ]),
  ).length === 1,
  "a 100 ms dip inside speech is bridged",
);
// noisy room: constant background hum must not read as speech or pauses
const hum = trace([
  [1, false],
  [4, true],
  [2, false],
  [4, true],
  [1, false],
]).map((v) => v + 0.02);
ok(
  analyseSpeech(hum, TX, terms).pauses.length === 1,
  "a constant background hum is ignored; the real pause is still found",
);
// gap report
const g = gapReport(
  "Entropy is about how energy is spread out",
  ["entropy", "energy", "spread", "isolated", "decreases"],
  b,
);
ok(
  g.coverage === 60 && g.missing.includes("isolated") && g.missing.includes("decreases"),
  `coverage report: ${g.coverage}% covered, missing ${g.missing.join(", ")}`,
);
ok(
  domainTerms("Second law & entropy", ["decrease", "spread"]).includes("entropy"),
  "domain terms are derived from the concept",
);
console.log(f ? `${f} FAILED` : "ALL PASSED");
process.exit(f ? 1 : 0);
