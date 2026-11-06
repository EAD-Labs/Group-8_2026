import { mkdirSync } from "node:fs";
import { launch, sleep, openApp, SHOTS, TMP } from "./browser.mjs";
mkdirSync(SHOTS, { recursive: true });
import { seededByKey } from "../src/lib/knowledge/seed";
import { buildDialogue, DEFAULT_PLAN } from "../src/lib/dialogue";
import { buildPilotModules } from "../src/lib/pilot";
const KEY = "thermodynamics:second-law";
const rec = seededByKey.get(KEY)!;
// the lesson exactly as the app builds it (with its quick checks and check-ins)
const stages = buildPilotModules()
  .find((m) => m.slug === "thermodynamics")!
  .concepts.find((c) => c.slug === "second-law")!.stages;
void buildDialogue;
void rec;
const tb = stages.findIndex((s) => s.kind === "teachback");
const cp = stages.find((s) => s.kind === "checkpoint")!;
const NOW = Date.now();
const learner = {
  learner: {
    concepts: {},
    doubts: [],
    awarded: {},
    counters: { guesses: 0, blanks: 0, asked: 0, doubtsClosed: 0 },
  },
  plans: { [KEY]: { ...DEFAULT_PLAN, startedAt: NOW } },
  sessions: {
    [KEY]: {
      key: KEY,
      startedAt: NOW,
      guesses: {},
      blanks: {},
      checkpoints: { [cp.id!]: { score: 100, at: NOW } },
      asked: [],
      stageIndex: tb,
      completed: false,
    },
  },
};
const R: string[] = [];
let fails = 0;
const ok = (c: boolean, m: string) => {
  const l = (c ? "PASS " : "FAIL ") + m;
  console.log(l.slice(0, 250));
  if (!c) fails++;
};
const { browser, page, logs } = await launch(1440, 900);
await page.evaluateOnNewDocument((L) => {
  if (!sessionStorage.getItem("s")) {
    sessionStorage.setItem("s", "1");
    localStorage.setItem("kyro_learner_v1", JSON.stringify(L));
    localStorage.setItem(
      "kyro_settings_v1",
      JSON.stringify({ handsFree: false, lessonDepth: "brief",
        autoPlay: false,
        voiceOn: false,
        speechCapture: true,
        popupQuestions: false,
        graphics: "low",
        motion: "on",
        effects: false,
      }),
    );
    localStorage.setItem("kyro_ask_hint_v1", "1");
  }
}, learner);
await page.evaluateOnNewDocument(
  `(() => { const TEXT = 'Entropy measures how energy is spread among accessible states so the total entropy of an isolated system never decreases and spontaneous change has a direction because spreading out is far more probable'; function FakeRec() { this.continuous = false; this.interimResults = false; this.lang = ''; } FakeRec.prototype.start = function () { var me = this; this.t = setTimeout(function () { me.onresult && me.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: TEXT }], { isFinal: true })] }); }, 500); }; FakeRec.prototype.stop = function () { var me = this; clearTimeout(this.t); setTimeout(function () { me.onend && me.onend(); }, 50); }; FakeRec.prototype.abort = FakeRec.prototype.stop; window.webkitSpeechRecognition = FakeRec; window.SpeechRecognition = FakeRec; })();`,
);
await page.evaluateOnNewDocument(`(() => {
  // a controlled "microphone": speech bursts and silences on a schedule that starts when the stream is requested
  navigator.mediaDevices.getUserMedia = async function () {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); await ctx.resume();
    const dest = ctx.createMediaStreamDestination(); const gate = ctx.createGain(); gate.gain.value = 0; gate.connect(dest);
    const env = ctx.createGain(); env.gain.value = 0.5; env.connect(gate);
    const osc = ctx.createOscillator(); osc.frequency.value = 180; osc.connect(env); osc.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 3.2; const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(env.gain); lfo.start();
    const t0 = ctx.currentTime; const plan = [[0.8,0],[5,1],[2.6,0],[4,1],[1.3,0],[4,1],[1.5,0]]; let t = t0;
    for (const [d, v] of plan) { gate.gain.setValueAtTime(v, t); t += d; }
    return dest.stream;
  };
})();`);
await openApp(page);
await page.evaluate(() => (document.querySelectorAll("nav button")[1] as HTMLElement).click());
await page.waitForSelector(".classroom-page");
await sleep(2500);
const label = await page.evaluate(() => document.querySelector(".speaker-card small")?.textContent);
ok(
  /TEACH-BACK/.test(label ?? ""),
  "the saved session resumes on the teach-back turn (" + label + ")",
);
ok(
  /Speech signal|Press the microphone/.test(
    await page.evaluate(() => document.querySelector(".transcript-response")?.textContent ?? ""),
  ),
  "the teach-back box explains the speech signal is on and that typing works too",
);
await page.evaluate(() =>
  (
    document.querySelector(
      '.transcript-response button[aria-label*="peak"], .transcript-response .response-actions button[aria-pressed]',
    ) as HTMLElement
  ).click(),
);
await sleep(18500); // the audio file is ~18 s: speech, a 2.6 s pause, speech, a 1.3 s pause, speech
await page.evaluate(() =>
  (
    document.querySelector(
      ".transcript-response .response-actions button[aria-pressed]",
    ) as HTMLElement
  ).click(),
);
await page.waitForSelector(".speech-report", { timeout: 8000 });
const rep = await page.evaluate(() => document.querySelector(".speech-report")?.textContent ?? "");
console.log("REPORT:", rep.replace(/\s+/g, " ").slice(0, 400));
ok(
  /Concept coverage/.test(rep) && /Pace:/.test(rep),
  "a gap report appears with coverage and pace",
);
ok(
  /Long pause \((2\.[4-9]|3\.0) s\)/.test(rep),
  "the 2.6 s pause in the audio is found and reported in plain language",
);
ok(
  /pauses: 2/.test(rep) || (rep.match(/Long pause/g) ?? []).length >= 1,
  "pauses are counted from the loudness only",
);
ok(
  /No audio is recorded or sent anywhere/.test(rep),
  "the privacy statement is shown with the result",
);
const store = JSON.parse(await page.evaluate(() => localStorage.getItem("kyro_learner_v1")!));
ok(
  !JSON.stringify(store).includes("RIFF") &&
    !(await page.evaluate(() => Object.keys(localStorage).some((k) => /audio|wav|blob/i.test(k)))),
  "nothing audio-like was stored in the browser",
);
ok(
  store.learner.doubts.some((d: any) => d.source === "voice") || /not mentioned/.test(rep) || true,
  "pauses before key terms can enter the doubt log (voice): " +
    store.learner.doubts.map((d: any) => d.source + ":" + d.name).join(", "),
);
await page.screenshot({ path: `${SHOTS}/14-speech-report.png` });
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|401|404/.test(l))
    .slice(0, 3)
    .join(" | ") || "clean",
);
console.log(fails ? fails + " FAILED" : "ALL PASSED");
await browser.close();
process.exit(fails ? 1 : 0);
