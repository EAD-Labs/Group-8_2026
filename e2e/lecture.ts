// Lecture mode: the AI's full lesson is shown on a large board — formulas typeset, graphs drawn — beside
// the teacher, with the line being taught highlighted. Stand-in AI, so no key is needed.
import http from "node:http";
import { spawn } from "node:child_process";
import { launch, sleep, SHOTS } from "./browser.mjs";
const LESSON = [
  "## How efficient can an engine be?",
  "",
  "A heat engine takes heat $Q_h$ from a hot reservoir at temperature $T_h$, turns part of it into work $W$, and dumps the rest into a cold reservoir at $T_c$. The **efficiency** is the fraction turned into work.",
  "",
  "$$\\eta = \\frac{W}{Q_h} = 1 - \\frac{Q_c}{Q_h}$$",
  "",
  "For the best possible (reversible) engine, the heats are in the same ratio as the temperatures, which gives the Carnot limit:",
  "",
  "$$\\eta_{\\text{Carnot}} = 1 - \\frac{T_c}{T_h}$$",
  "",
  "```plot",
  '{"title":"Carnot efficiency with the cold side at 300 K","x":{"label":"Hot temperature T_h (K)","min":300,"max":1500},"y":{"label":"Efficiency","min":0,"max":1},"series":[{"label":"1 - 300/T_h","expr":"1 - 300/x"}]}',
  "```",
  "",
  "## Why no engine can beat it",
  "",
  "- Every real engine has friction and heat flowing across finite temperature differences.",
  "- Those irreversibilities create entropy, which must be carried away as extra waste heat.",
].join("\n");
const ai = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const j = JSON.parse(b || "{}");
    if (/brilliant, patient teacher/.test(j.system ?? "")) { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ content: [{ type: "text", text: LESSON }] })); }
    res.statusCode = 503; res.end("down");
  });
}).listen(5801, "127.0.0.1");
const APP = 5199;
if (await fetch(`http://127.0.0.1:${APP}/`).then(() => true, () => false)) { console.log(`FAIL port ${APP} busy`); ai.close(); process.exit(2); }
const dev = spawn("npx", ["vite", "dev", "--port", String(APP), "--host", "127.0.0.1"], { cwd: process.cwd(), detached: true, env: { ...process.env, LOVABLE_API_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "http://127.0.0.1:5801" }, stdio: "ignore" });
const stop = () => { try { process.kill(-dev.pid!, "SIGTERM"); } catch { /* gone */ } ai.close(); };
process.on("exit", stop); setTimeout(() => { console.log("FAIL watchdog"); stop(); process.exit(2); }, 300000);
for (let i = 0; i < 90; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/`)).ok) break; } catch { /* not up */ } await sleep(1000); }
await sleep(2500);
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m.slice(0, 220)); if (!c) fails++; };
const { browser, page, logs } = await launch(1440, 900);
await page.evaluateOnNewDocument(`if (!sessionStorage.getItem("s")) { sessionStorage.setItem("s","1"); localStorage.setItem("kyro_settings_v1", JSON.stringify({ graphics: "low", motion: "on", effects: false, handsFree: false, autoPlay: false, voiceOn: false, popupQuestions: false, lessonDepth: "full" })); localStorage.setItem("kyro_ask_hint_v1","1"); }`);
await page.goto(`http://127.0.0.1:${APP}/`, { waitUntil: "domcontentloaded", timeout: 90000 }); await page.waitForSelector("nav button", { timeout: 90000 }); await sleep(1500);
await page.evaluate(`document.querySelectorAll("nav button")[1].click()`); await page.waitForSelector(".classroom-page"); await sleep(3000);
const q = (s: string) => page.evaluate(`!!document.querySelector(${JSON.stringify(s)})`);
const txt = (s: string) => page.evaluate(`(document.querySelector(${JSON.stringify(s)}) || {}).textContent || ""`) as Promise<string>;
const next = async () => { await page.evaluate(`(document.querySelector('.transport button[aria-label="Next turn"]') || {}).click && document.querySelector('.transport button[aria-label="Next turn"]').click()`); await sleep(500); };
for (let i = 0; i < 40 && !(await q(".lecture-board")); i++) { if (await page.evaluate(`!!(document.querySelector('.transport button[aria-label="Next turn"]') || {}).disabled`)) break; await next(); }
ok(await q(".lecture-board") && await q(".classroom-stage.lecture-mode"), "the full lesson switches the class into lecture mode: a large board beside the teacher");
ok(/How efficient can an engine be/.test(await txt(".lecture-board h3")), "the board shows the lesson's own section: " + (await txt(".lecture-board h3")));
ok(Number(await page.evaluate(`document.querySelectorAll(".lecture-board .katex").length`)) >= 3, "formulas are typeset (KaTeX), inline and on their own lines");
ok(await q(".lecture-board .lb-plot svg path"), "the graph is drawn on the board");
ok(/Carnot efficiency with the cold side at 300 K/.test(await txt(".lb-plot")), "…with its title and axes");
ok(await q(".lb-block.is-active"), "the part being taught is highlighted");
const firstActive = await page.evaluate(`Array.from(document.querySelectorAll(".lb-block")).findIndex(function (b) { return b.classList.contains("is-active"); })`);
await page.screenshot({ path: `${SHOTS}/80-lecture-board.png` });
await next();
const secondActive = await page.evaluate(`Array.from(document.querySelectorAll(".lb-block")).findIndex(function (b) { return b.classList.contains("is-active"); })`);
ok(Number(secondActive) > Number(firstActive), `the highlight moves with the teacher (block ${firstActive} → ${secondActive})`);
for (let i = 0; i < 8 && !(await q(".lb-block.lb-math.is-active, .lb-block.lb-plot.is-active")); i++) await next();
ok(await q(".lb-block.lb-math.is-active, .lb-block.lb-plot.is-active"), "the teacher reaches formulas and the graph in order");
ok(Number(await page.evaluate(`(function(){ var m=document.querySelector(".lb-block .lb-math .katex-display"); return m ? m.getBoundingClientRect().height : 0; })()`)) > 24, "display formulas have their full height on the board");
await sleep(14000);
await page.screenshot({ path: `${SHOTS}/82-lecture-after-load.png` });
await page.screenshot({ path: `${SHOTS}/81-lecture-formula.png` });
ok(/over/.test(await txt(".speaker-card")) || /T c|eta/.test(await txt(".speaker-card")), "a formula is read aloud in words, not as code: " + (await txt(".speaker-card p")).slice(0, 80));
console.log("console:", logs.filter((l) => !/ERR_NAME|401|404|503|502|Failed to load resource/.test(l)).slice(0, 3).join(" | ") || "clean");
console.log(fails ? fails + " FAILED" : "ALL PASSED"); await browser.close(); stop(); process.exit(fails ? 1 : 0);
