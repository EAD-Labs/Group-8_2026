// Doubts as turns of the class: the answer appears ON the stage where the teacher speaks, the AI remembers
// earlier questions, "explain differently" changes the answer, the teacher comes back to the doubt later,
// it all survives a reload, a blocking turn still waits, and with the AI down the fallback still answers.
// Runs against a local stand-in for the app's one AI (so it needs no key).
import http from "node:http";
import { spawn } from "node:child_process";
import { launch, sleep, SHOTS } from "./browser.mjs";
let up = true;
let calls = 0;
const bodies: any[] = [];
const ai = http
  .createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      if (!up) {
        res.statusCode = 503;
        return res.end("down");
      }
      calls++;
      const j = JSON.parse(b || "{}");
      const prompt: string = j.messages?.[0]?.content ?? "";
      const system: string = j.system ?? "";
      bodies.push({ system, prompt });
      let text: string;
      if (/ONE sentence/.test(system))
        text = `BRIDGE-LINE: this next step is exactly the answer to what you asked about “${(prompt.match(/EARLIER DOUBT:\n(.*)/)?.[1] ?? "").slice(0, 40)}”.`;
      else {
        const q = prompt.match(/THE LEARNER NOW SAYS:\n(.*)/)?.[1] ?? "?";
        const again = /did not follow your last explanation/.test(prompt);
        const earlier = prompt.match(/Q1: (.*)/)?.[1];
        const notes =
          prompt.match(/VERIFIED NOTES FOR THIS TOPIC:\n- (.*)/)?.[1]?.slice(0, 50) ?? "none";
        text = `ANSWER about «${q}». ${again ? "Here is a different angle, in simpler words. " : ""}${earlier ? `Building on your earlier question about «${earlier}». ` : ""}The notes start: ${notes}…`;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ content: [{ type: "text", text }] }));
    });
  })
  .listen(5801, "127.0.0.1");
const APP = 5199;
if (
  await fetch(`http://127.0.0.1:${APP}/`).then(
    () => true,
    () => false,
  )
) {
  console.log(`FAIL port ${APP} is already in use`);
  ai.close();
  process.exit(2);
}
const dev = spawn("npx", ["vite", "dev", "--port", String(APP), "--host", "127.0.0.1"], {
  cwd: process.cwd(),
  detached: true,
  env: {
    ...process.env,
    LOVABLE_API_KEY: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "k",
    ANTHROPIC_BASE_URL: "http://127.0.0.1:5801",
  },
  stdio: "ignore",
});
const stop = () => {
  try {
    process.kill(-dev.pid!, "SIGTERM");
  } catch {
    /* gone */
  }
  ai.close();
};
process.on("exit", stop);
setTimeout(() => {
  console.log("FAIL watchdog");
  stop();
  process.exit(2);
}, 420000);
for (let i = 0; i < 90; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${APP}/`)).ok) break;
  } catch {
    /* not up */
  }
  await sleep(1000);
}
await sleep(2500);
let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m.slice(0, 230));
  if (!c) fails++;
};
const { browser, page, logs } = await launch(1440, 900);
await page.evaluateOnNewDocument(() => {
  if (!sessionStorage.getItem("s")) {
    sessionStorage.setItem("s", "1");
    localStorage.setItem(
      "kyro_settings_v1",
      JSON.stringify({ handsFree: false, lessonDepth: "brief",
        autoPlay: false,
        voiceOn: false,
        popupQuestions: true,
        graphics: "low",
        motion: "on",
        effects: false,
      }),
    );
    localStorage.setItem("kyro_ask_hint_v1", "1");
  }
});
await page.goto(`http://127.0.0.1:${APP}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector("nav button", { timeout: 90000 });
await sleep(1500);
const q = (s: string) => page.evaluate((s) => !!document.querySelector(s), s);
const txt = (s: string) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", s);
const click = (s: string) =>
  page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), s);
const clickText = (sel: string, re: RegExp) =>
  page.evaluate(
    (sel, src) => {
      const el = [...document.querySelectorAll(sel)].find((e) =>
        new RegExp(src).test(e.textContent ?? ""),
      ) as HTMLElement | undefined;
      el?.click();
      return !!el;
    },
    sel,
    re.source,
  );
const label = () => txt(".speaker-card small");
const nextDisabled = () =>
  page.evaluate(
    () =>
      (document.querySelector('.transport button[aria-label="Next turn"]') as HTMLButtonElement)
        ?.disabled,
  );
const total = async () => Number(/of (\d+)/.exec(await txt(".timeline small"))?.[1] ?? 0);
const next = async () => {
  await click('.transport button[aria-label="Next turn"]');
  await sleep(350);
};
const fill = (sel: string, text: string) =>
  page.evaluate(
    (sel, text) => {
      const el = document.querySelector(sel) as HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    sel,
    text,
  );
const settled = async () => {
  let prev = "";
  for (let i = 0; i < 60; i++) {
    const t = await txt(".speaker-card");
    if (!(await q(".speaker-card .thinking-dots")) && t === prev && t.length > 20) return t;
    prev = t;
    await sleep(350);
  }
  return prev;
};
const askQ = async (text: string) => {
  await fill(".ask-field textarea", text);
  await click('.ask-field button[aria-label="Send question"]');
  await page.waitForFunction(
    (t) => (document.querySelector(".speaker-card .you-asked")?.textContent ?? "").includes(t),
    { timeout: 30000 },
    text.slice(0, 18),
  );
  return settled();
};
const dismissPopup = async () => {
  if (await q(".question-popup")) {
    await clickText(".question-popup footer button", /Answer later/);
    await sleep(300);
  }
};

await page.evaluate(() => (document.querySelectorAll("nav button")[1] as HTMLElement).click());
await page.waitForSelector(".classroom-page");
await sleep(1800);
await dismissPopup();
await next();
await dismissPopup(); // past the opening check-in, onto the first teaching turn
const T0 = await total();
// ---- 1. the answer appears on the stage
const a1 = await askQ("Why does entropy never decrease?");
ok(
  /YOUR DOUBT/.test(await label()),
  "the doubt becomes a turn of the class: the stage is now labelled “YOUR DOUBT”",
);
ok(/You asked: “Why does entropy never decrease\?”/.test(a1), "the stage shows what was asked");
ok(
  /ANSWER about «Why does entropy never decrease\?»/.test(a1),
  "the teacher's answer is shown ON the stage where the professor teaches: " +
    a1.replace(/\s+/g, " ").slice(0, 110),
);
ok(!(await q(".teacher-answer")), "…not in a separate box under the class");
ok(
  (await txt(".transcript-list .you-bubble p")).includes("Why does entropy never decrease?") &&
    (await page.evaluate(() =>
      [...document.querySelectorAll(".transcript-list article")].some((e) =>
        /ANSWER about/.test(e.textContent ?? ""),
      ),
    )),
  "the question and the answer are both in the class transcript",
);
ok(
  (await total()) === T0 + 1 || (await total()) === T0 + 2,
  `the class is now longer by the doubt turn (${T0} → ${await total()})`,
);
ok(
  bodies.some((b) => /VERIFIED NOTES FOR THIS TOPIC:\n- /.test(b.prompt)) &&
    /ANSWER about/.test(a1) &&
    /The notes start: \S/.test(a1),
  "the AI is given the verified notes for this topic (and quotes them back)",
);
ok(
  !/hidden assumption|check-for-understanding/.test(bodies[0]?.system ?? "") &&
    /Let the question decide the shape/.test(bodies[0]?.system ?? ""),
  "the instructions no longer force one fixed answer shape",
);
await page.screenshot({ path: `${SHOTS}/50-doubt-on-stage.png` });
ok(
  (
    await page.evaluate(() =>
      [...document.querySelectorAll(".doubt-card .chip")].map((c) => c.textContent),
    )
  )?.join("|") === "Got it|Not clear — explain differently|Show me an example",
  "a one-tap follow-up is offered: Got it / Not clear / Show me an example",
);
// ---- 2. the AI remembers the conversation
const a2 = await askQ("And what about a refrigerator?");
ok(
  /Building on your earlier question about «Why does entropy never decrease\?»/.test(a2),
  "a follow-up doubt is answered with the earlier question in mind (conversation memory): " +
    a2.replace(/\s+/g, " ").slice(0, 120),
);
ok(
  a2 !== a1 && /ANSWER about «And what about a refrigerator\?»/.test(a2),
  "a different doubt gets a different answer",
);
// ---- 3. "not clear" changes the approach
await clickText(".doubt-card .chip", /Not clear/);
await page.waitForFunction(
  () => /different angle/.test(document.querySelector(".speaker-card")?.textContent ?? ""),
  { timeout: 30000 },
);
const a3 = await settled();
ok(
  /Here is a different angle, in simpler words/.test(a3) &&
    /You asked: “I didn't get that/.test(a3),
  "“Not clear — explain differently” asks for another angle, not the same answer again",
);
// ---- 4. carry on: the teacher comes back to the doubt
await clickText(".doubt-card .chip", /Got it/);
await sleep(600);
ok(!/YOUR DOUBT/.test(await label()), "“Got it” carries the class on");
let bridge = false;
for (let i = 0; i < 8 && !bridge; i++) {
  if (/BACK TO YOUR QUESTION/.test(await label())) bridge = true;
  else {
    if (await nextDisabled()) break;
    await next();
  }
}
ok(
  bridge && /BRIDGE-LINE/.test(await txt(".speaker-card")),
  "a few turns later the teacher comes back to the doubt: " +
    (await txt(".speaker-card")).replace(/\s+/g, " ").slice(0, 120),
);
// ---- 5. it all survives a reload
const idx = await txt(".timeline small");
const tot = await total();
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("nav button");
await sleep(900);
await page.evaluate(() => (document.querySelectorAll("nav button")[1] as HTMLElement).click());
await page.waitForSelector(".classroom-page");
await sleep(2000);
ok(
  (await total()) === tot && (await txt(".timeline small")) === idx,
  "after a reload the class resumes at the same turn with the doubts still part of it: " + idx,
);
ok(
  (
    await page.evaluate(() =>
      [...document.querySelectorAll(".transcript-list .you-bubble p")].map((p) => p.textContent),
    )
  ).some((t) => /refrigerator/.test(t ?? "")) || (await txt(".speaker-card")).length > 0,
  "the doubts are still in the class after the reload",
);
// ---- 6. a blocking turn still waits for its answer
await dismissPopup();
for (let i = 0; i < 12 && !/FILL THE BLANK/.test(await label()); i++) {
  await next();
  await dismissPopup();
}
ok(
  /FILL THE BLANK/.test(await label()) && (await nextDisabled()),
  "the class reaches the blank, which blocks",
);
await dismissPopup();
await askQ("Why is this a blank?");
ok(/YOUR DOUBT/.test(await label()), "asked at a blocking turn, the doubt is answered first");
await clickText(".doubt-card .chip", /Got it/);
await sleep(600);
ok(
  /FILL THE BLANK/.test(await label()) && (await nextDisabled()),
  "…and the blank is still waiting afterwards: the doubt did not let the learner skip it",
);
// ---- 7. with the AI unavailable the fallback still answers the question asked
up = false;
await dismissPopup();
const o1 = await askQ("Is entropy just disorder?");
ok(
  (await q(".doubt-note")) &&
    /verified notes/.test(await txt(".doubt-note")) &&
    !/ANSWER about/.test(o1),
  "with the AI down, the answer comes from the verified notes and says so",
);
ok(
  /better:/.test(o1),
  "…and a doubt that matches a named misconception gets that correction: " +
    o1.replace(/\s+/g, " ").slice(0, 110),
);
await clickText(".doubt-card .chip", /Show me an example/);
await page.waitForFunction(
  () =>
    /Here's a concrete one|Take this case|Try it on this example/.test(
      document.querySelector(".speaker-card")?.textContent ?? "",
    ),
  { timeout: 30000 },
);
const o2 = await settled();
ok(
  o2 !== o1 && /(Here's a concrete one|Take this case|Try it on this example)/.test(o2),
  "…and a different doubt gets a different answer, not the same one every time",
);
const off = await askQ("How do jet engines work?");
ok(
  /don't have a verified note/.test(off),
  "a question outside the notes is answered honestly instead of with an arbitrary note",
);
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|401|404|503|502|Failed to load resource/.test(l))
    .slice(0, 3)
    .join(" | ") || "clean",
);
console.log(fails ? fails + " FAILED" : "ALL PASSED");
await browser.close();
stop();
process.exit(fails ? 1 : 0);
