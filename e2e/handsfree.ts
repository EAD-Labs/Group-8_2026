// A hands-free class with a full lesson: the AI's in-depth lesson is woven into the class, the teacher
// asks out loud and the learner answers out loud (check-in, quick check, blank, hint, doubt, commands,
// checkpoint) — no keyboard or mouse after opening the class. Stand-in AI + simulated mic and voice.
import http from "node:http";
import { spawn } from "node:child_process";
import { launch, sleep, SHOTS } from "./browser.mjs";
import { buildPilotModules } from "../src/lib/pilot";
const LESSON = `## Why entropy matters\n\nImagine a hot cup of coffee in a cool room. Energy flows from the coffee to the room until both are at the same temperature. The reverse would not break energy conservation, yet it never happens. Entropy explains why.\n\n## Counting arrangements\n\nEntropy counts how many microscopic arrangements match what we see. Spread-out energy has astronomically more arrangements than concentrated energy. So systems drift toward spread-out states simply because there are so many more of them.\n\n$$S = k_B \\ln W$$\n\n## A worked example\n\nTake two blocks, one at 400 K and one at 300 K. When 100 J flows from hot to cold, the hot block loses 100/400 = 0.25 J/K and the cold block gains 100/300 = 0.33 J/K. The total entropy rises by about 0.08 J/K.`;
const ai = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const j = JSON.parse(b || "{}"); const system: string = j.system ?? ""; const prompt: string = j.messages?.[0]?.content ?? "";
    let text = "";
    if (/brilliant, patient teacher/.test(system)) text = LESSON;
    else if (/THE LEARNER NOW SAYS/.test(prompt)) text = `DOUBT-ANSWER: about “${prompt.match(/THE LEARNER NOW SAYS:\n(.*)/)?.[1] ?? ""}” — entropy never decreases overall because spread-out states vastly outnumber concentrated ones.`;
    else if (/ONE sentence/.test(system)) text = "BRIDGE-LINE: this next step answers what you asked.";
    else { res.statusCode = 503; return res.end("down"); } // anything else falls back to the offline path
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ content: [{ type: "text", text }] }));
  });
}).listen(5801, "127.0.0.1");
const APP = 5199;
if (await fetch(`http://127.0.0.1:${APP}/`).then(() => true, () => false)) { console.log(`FAIL port ${APP} busy`); ai.close(); process.exit(2); }
const dev = spawn("npx", ["vite", "dev", "--port", String(APP), "--host", "127.0.0.1"], { cwd: process.cwd(), detached: true, env: { ...process.env, LOVABLE_API_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "http://127.0.0.1:5801" }, stdio: "ignore" });
const stop = () => { try { process.kill(-dev.pid!, "SIGTERM"); } catch { /* gone */ } ai.close(); };
process.on("exit", stop); setTimeout(() => { console.log("FAIL watchdog"); stop(); process.exit(2); }, 760000);
for (let i = 0; i < 90; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/`)).ok) break; } catch { /* not up */ } await sleep(1000); }
await sleep(2500);
const allConcepts = buildPilotModules().flatMap((m) => m.concepts);
let stages = allConcepts[0]!.stages; // replaced by the lecture that actually opens
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m.slice(0, 230)); if (!c) fails++; };
const { browser, page, logs } = await launch(1440, 900);
// injected as plain JavaScript (the test runner's function renaming would break it inside the page)
await page.evaluateOnNewDocument(`
  if (!sessionStorage.getItem("s")) { sessionStorage.setItem("s", "1"); localStorage.setItem("kyro_settings_v1", JSON.stringify({ popupQuestions: true, graphics: "low", motion: "on", effects: false, autoPlay: true, voiceOn: true, handsFree: true, lessonDepth: "full" })); localStorage.setItem("kyro_ask_hint_v1", "1"); }
  window.__said = []; window.__spoken = []; window.__listening = 0;
  var P = window.SpeechSynthesis && window.SpeechSynthesis.prototype;
  if (P) { P.speak = function (u) { window.__spoken.push(u.text); setTimeout(function () { u.onstart && u.onstart(); setTimeout(function () { u.onend && u.onend(); }, 40); }, 5); }; P.cancel = function () {}; P.getVoices = function () { return []; }; }
  function FakeRec() { this.lang = ""; this.continuous = true; this.interimResults = true; this.t = 0; }
  FakeRec.prototype.start = function () { var self = this; window.__listening++; var next = window.__said.shift();
    self.t = setTimeout(function () { if (next) { var r = [{ transcript: next }]; r.isFinal = true; self.onresult && self.onresult({ resultIndex: 0, results: [r] }); } self.t = setTimeout(function () { self.onend && self.onend(); }, next ? 4000 : 350); }, 250); };
  FakeRec.prototype.stop = function () { var self = this; clearTimeout(self.t); setTimeout(function () { self.onend && self.onend(); }, 5); };
  FakeRec.prototype.abort = function () { this.stop(); };
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
`);
await page.goto(`http://127.0.0.1:${APP}/`, { waitUntil: "domcontentloaded", timeout: 90000 }); await page.waitForSelector("nav button", { timeout: 90000 }); await sleep(1500);
const txt = (s: string) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", s);
const label = () => txt(".speaker-card small");
const total = async () => Number(/of (\d+)/.exec(await txt(".timeline small"))?.[1] ?? 0);
const pill = () => page.evaluate(() => document.querySelector(".hf-pill")?.className ?? "");
/** wait until the class is at a turn whose label matches AND the teacher is listening, then say it */
const sayAt = async (re: RegExp, words: string, ms = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (re.test(await label()) && /listening/.test(await pill())) { await page.evaluate(`window.__said.push(${JSON.stringify(words)})`); return true; } await sleep(250); }
  return false;
};
// the ONLY click: opening the class from the left bar (a browser needs one gesture for the microphone)
await page.evaluate(() => (document.querySelectorAll("nav button")[1] as HTMLElement).click()); await page.waitForSelector(".classroom-page"); await sleep(1500);
const openTitle = (await txt(".concept-strip .active strong")).trim();
stages = allConcepts.find((c) => c.title === openTitle)?.stages ?? stages;
console.log("lecture open:", openTitle, "|", stages.length, "turns");
const T0 = stages.length; // the short class, before the full lesson is woven in
console.log("teach route:", await page.evaluate(`fetch("/api/teach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "Entropy" }) }).then(function (r) { return r.text().then(function (t) { return r.status + " " + t.slice(0, 80); }); })`));
ok(/hf-pill/.test(await pill()), "hands-free is on: the stage shows the microphone status");
ok(/BEFORE WE START/.test(await label()), "the class opens with the check-in");
// ---- the check-in, by voice
ok(await sayAt(/BEFORE WE START/, "a little"), "the teacher asks the check-in out loud and listens");
await sayAt(/BEFORE WE START/, "the maths", 30000);
let ci: { know?: number; tricky?: string } = {};
for (let i = 0; i < 40 && !(ci.know === 1 && ci.tricky); i++) { await sleep(300); ci = JSON.parse(String(await page.evaluate(`(Object.entries(localStorage).find(function (e) { return e[0].indexOf("kyro_thinking_v2") === 0; }) || [0, "{}"])[1]`))); }
await sleep(2500);
ok(ci.know === 1 && ci.tricky === "The maths", "the spoken answers land in the check-in (“a little”, “the maths”)");
ok(!/BEFORE WE START/.test(await label()), "…and the class carries on by itself");
// ---- the full lesson arrives and is part of the class
for (let i = 0; i < 120 && (await total()) <= T0; i++) await sleep(500);
const T1 = await total();
ok(T1 >= T0 + 3, `the full lesson is woven into the class (${T0} → ${T1} turns)`);
const spoke = async (re: RegExp, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(`window.__spoken.some(function (s) { return new RegExp(${JSON.stringify(re.source)}).test(s); })`)) return true; await sleep(300); } return false; };
ok(await spoke(/astronomically more arrangements|hot cup of coffee/), "the teacher speaks the in-depth lesson (the AI's own explanation), not just a definition");
// ---- a doubt, raised by voice while the teacher pauses
let dIn = false;
for (let t0 = Date.now(); Date.now() - t0 < 90000 && !dIn; await sleep(200)) {
  const p = await pill(); const l = await label();
  if (/listening/.test(p) && !/QUICK|BLANK|HINT|CHECK|BEFORE|PULSE|LOOKING|DOUBT/.test(l)) { await page.evaluate("window.__said.push('I have a doubt, why does entropy never decrease in an isolated system')"); dIn = true; }
}
ok(dIn, "between lines the teacher pauses and listens (a moment to raise your hand)");
await page.waitForFunction(() => /YOUR DOUBT/.test(document.querySelector(".speaker-card small")?.textContent ?? "") && /DOUBT-ANSWER/.test(document.querySelector(".speaker-card")?.textContent ?? ""), { timeout: 60000 }).catch(() => {});
ok(/YOUR DOUBT/.test(await label()) && /DOUBT-ANSWER/.test(await txt(".speaker-card")), "“I have a doubt, …” becomes a doubt turn, answered on the stage by the AI");
ok(await spoke(/DOUBT-ANSWER/, 20000) && (await spoke(/Did that clear it up/, 20000)), "the answer is read aloud and the teacher asks whether it helped");
await sayAt(/YOUR DOUBT/, "yes got it", 30000); await sleep(2500);
ok(!/YOUR DOUBT/.test(await label()), "“got it” carries the class on");
// ---- pause and continue by voice
await sayAt(/.*/, "pause", 60000); await sleep(2500);
ok(await page.evaluate(() => !!document.querySelector('.transport button[aria-label="Play"]')), "“pause” pauses the class");
const atPause = await txt(".timeline small"); await sleep(3000);
ok((await txt(".timeline small")) === atPause, "…and it stays paused");
await sayAt(/.*/, "continue", 30000); await sleep(3000);
ok(await page.evaluate(() => !!document.querySelector('.transport button[aria-label="Pause"]')), "“continue” plays it again");
// ---- from here the learner answers whatever the teacher asks, by voice, until the checkpoint is marked
const done = { mcq: false, blank: false, hint: false, checkpoint: false, pulse: false };
const said = (w: string) => page.evaluate(`window.__said.push(${JSON.stringify(w)})`);
const cardText = (k: string) => txt(`[data-card=${k}]`);
for (let t0 = Date.now(); Date.now() - t0 < 300000 && !done.checkpoint; await sleep(300)) {
  if (!/listening/.test(await pill())) continue;
  const l = await label();
  if (/QUICK CHECK/.test(l) && (await page.evaluate(`!!document.querySelector("[data-card=mcq]") && !document.querySelector("[data-card=mcq] .answer-feedback")`))) {
    const ct = await cardText("mcq");
    const st = stages.filter((x) => x.kind === "mcq").map((x) => ({ x, n: x.mcq!.options.filter((o) => ct.includes(o.slice(0, 30))).length })).sort((a, b) => b.n - a.n)[0]!.x;
    const q = st.mcq!; await said(q.qkind === "truefalse" ? q.options[q.answer]! : "option " + "abcd"[q.answer]);
    await page.waitForFunction(() => !!document.querySelector("[data-card=mcq] .answer-feedback"), { timeout: 15000 }).catch(() => {});
    console.log("   [mcq] said:", "option " + "abcd"[q.answer], "| card:", (await cardText("mcq")).replace(/\s+/g, " ").slice(0, 160), "| spoken:", String(await page.evaluate("window.__spoken.slice(-3).join(' || ')")).slice(0, 300));
    if (!done.mcq) ok(/Correct/.test(await cardText("mcq")) || (await spoke(/Correct — \+2 points/, 4000)), "a quick check is asked out loud and answered by voice (“option …”), and the result is read out");
    done.mcq = true; await sleep(1200); continue;
  }
  if (/FILL THE BLANK/.test(l) && (await page.evaluate(`!document.querySelector("[data-card=blank] .blank-result")`))) {
    const ct = await cardText("blank");
    const wordsOf = (x: string) => new Set(x.toLowerCase().match(/[a-z]{3,}/g) ?? []);
    const cw = wordsOf(ct);
    const st = stages.filter((x) => x.kind === "blank").map((x) => ({ x, n: [...wordsOf(x.blank!.before + " " + x.blank!.after)].filter((w) => cw.has(w)).length })).sort((a, b) => b.n - a.n)[0]!.x;
    await said(st.blank!.answer);
    await page.waitForFunction(() => !!document.querySelector("[data-card=blank] .blank-result"), { timeout: 15000 }).catch(() => {});
    console.log("   [blank] said:", st.blank!.answer, "| card:", (await cardText("blank")).replace(/\s+/g, " ").slice(0, 160), "| spoken:", String(await page.evaluate("window.__spoken.slice(-3).join(' || ')")).slice(0, 300));
    if (!done.blank) ok(/Correct/.test(await cardText("blank")) || (await spoke(/Correct/, 4000)), `a blank is filled by saying the word (“${st.blank!.answer}”)`);
    done.blank = true; await sleep(1200); continue;
  }
  if (/HINT/.test(l) && (await page.evaluate(`!document.querySelector("[data-card=hint] .answer-feedback")`))) {
    await said("I think it increases because energy spreads out");
    await page.waitForFunction(() => !!document.querySelector("[data-card=hint] .answer-feedback"), { timeout: 15000 }).catch(() => {});
    if (!done.hint) ok(/Answer/.test(await cardText("hint")) || (await spoke(/Answer:|guess/i, 4000)), "a hint question takes a spoken guess first, then the answer is revealed");
    done.hint = true; await sleep(1200); continue;
  }
  if (/QUICK PULSE/.test(l)) { await said("yes"); if (!done.pulse) ok(true, "the mid-class pulse is answered by voice (“yes”)"); done.pulse = true; await sleep(1500); continue; }
  if (/LOOKING BACK|BEFORE WE START/.test(l)) { await said("skip"); await sleep(1500); continue; }
  if (/CHECKPOINT/.test(l)) {
    await said("Energy is conserved: the change in internal energy equals the heat added minus the work done by the system, so if heat goes in and the gas does work, the internal energy rises only by the difference.");
    let askedSure = false;
    for (let i = 0; i < 80; i++) {
      await sleep(300);
      if (await page.evaluate(`!!document.querySelector(".transcript-response .assessment")`)) break;
      const last = String(await page.evaluate("window.__spoken.slice(-1)[0] || ''"));
      if (!askedSure && /how sure/i.test(last) && /listening/.test(await pill())) { await said("fairly sure"); askedSure = true; }
    }
    await page.waitForFunction(() => !!document.querySelector(".transcript-response .assessment"), { timeout: 60000 }).catch(() => {});
    ok(/%/.test(await txt(".transcript-response .assessment")) || (await spoke(/\d+%/, 5000)), "the checkpoint is asked out loud, answered by speaking, and marked: " + (await txt(".transcript-response .assessment-head")).trim());
    ok(askedSure, "before marking, the teacher asks “how sure are you?” out loud");
    const cp = JSON.parse(String(await page.evaluate(`(Object.entries(localStorage).filter(function (e) { return e[0].indexOf("kyro_thinking_v2") === 0; }).map(function (e) { return e[1]; }).find(function (v) { return v.indexOf("cpConf") >= 0; }) || "{}")`)));
    ok(cp.cpConf === 1 && typeof cp.scorePct === "number", `the spoken confidence (“fairly sure”) is saved with the score (${cp.scorePct}%) for calibration`);
    done.checkpoint = true; continue;
  }
}
ok(done.mcq && done.blank, "quizzes and blanks were all answered by voice on the way to the checkpoint");
await page.screenshot({ path: `${SHOTS}/70-hands-free.png` });
const listens = Number(await page.evaluate("window.__listening"));
ok(listens > 10, `the class ran by voice: the teacher listened ${listens} times — no keyboard or mouse after opening it`);
console.log("console:", logs.filter((l) => !/ERR_NAME|401|404|503|502|Failed to load resource/.test(l)).slice(0, 3).join(" | ") || "clean");
console.log(fails ? fails + " FAILED" : "ALL PASSED"); await browser.close(); stop(); process.exit(fails ? 1 : 0);
