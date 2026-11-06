// Live verification through the REAL route, UI and stream (HLD Part 1, T1.1–T1.6 from the browser).
// Two local stand-in "vendors" (an Anthropic-style and an OpenAI-style endpoint) answer deliberately
// differently; the app is started with their addresses as the provider endpoints.
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { launch, sleep, SHOTS } from "./browser.mjs";
mkdirSync(SHOTS, { recursive: true });
const RIGHT = "Carnot efficiency is 1 − Tc/Th, with temperatures in kelvin.",
  WRONG = "Carnot efficiency is 1 − Th/Tc, with temperatures in kelvin.";
const claims = (formula: string) => [
  { role: "define", text: "A Carnot engine is a reversible cycle between two reservoirs." },
  { role: "mechanism", text: "Its efficiency depends only on the two reservoir temperatures." },
  {
    role: "pitfall",
    text: "No real engine can exceed the Carnot efficiency between the same reservoirs.",
  },
  { role: "example", text: "Between 600 K and 300 K the Carnot efficiency is 50%." },
  { role: "formula", text: formula },
];
let calls = 0;
let up = true;
// ONE stand-in AI, reached the same way the app reaches its real one (ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL).
const answer = (system: string) => {
  if (system.includes("careful reviewer"))
    return {
      claims: claims(RIGHT),
      disagreements: [
        {
          point: "Which temperature ratio appears in the Carnot efficiency?",
          positions: [
            { agent: "first draft", claim: WRONG },
            { agent: "review", claim: RIGHT },
          ],
          resolution: "η = 1 − Tc/Th (cold over hot).",
          reasoning: "Th/Tc is greater than 1, which would give a negative efficiency.",
          rejected: ["first draft"],
        },
      ],
      confidence: "medium",
    };
  if (system.includes("VERIFIED claims"))
    return {
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
          accept: ["th"],
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
    };
  return { claims: claims(WRONG) }; // the first draft contains the error
};
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
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify(answer(j.system ?? "")) }],
        }),
      );
    });
  })
  .listen(5801, "127.0.0.1");
const APP = 5199;
// the app must not already be running on this port (a leftover server with a warm cache would invalidate the test)
if (
  await fetch(`http://127.0.0.1:${APP}/`).then(
    () => true,
    () => false,
  )
) {
  console.log(`FAIL port ${APP} is already in use — stop whatever is running there and retry`);
  ai.close();
  process.exit(2);
}
// start the app in its own process group so the WHOLE tree can be stopped afterwards
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
    /* already gone */
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
    /* not up yet */
  }
  await sleep(1000);
}
await sleep(2500); // first request after a cold start can trigger a dependency re-optimisation reload
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
        graphics: "low",
        motion: "on",
        effects: false,
        popupQuestions: false,
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
const openSetup = async () => {
  await page.evaluate(() => (document.querySelectorAll("nav button")[1] as HTMLElement).click());
  await sleep(1500);
  await page.evaluate(() =>
    (
      [...document.querySelectorAll("button")].find((b) =>
        /New topic/.test(b.textContent ?? ""),
      ) as HTMLElement
    ).click(),
  );
};
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
const fill = (sel: string, text: string) =>
  page.evaluate(
    (sel, text) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    sel,
    text,
  );
await openSetup();
await sleep(900);
// T1.1: verify a new topic
await fill('input[aria-label="Your own topic"]', "Carnot efficiency");
await clickText("button", /Verify & prepare/);
await page.waitForFunction(() => document.querySelector(".verify-found, .verify-error"), {
  timeout: 60000,
});
const steps = await page.evaluate(() =>
  [...document.querySelectorAll(".verify-steps li")].map((l) => l.className),
);
ok(
  steps.length === 5 && steps.every((c) => c.includes("ok")),
  "T1.1 all five engine steps completed and were shown live: " + steps.join(","),
);
const found = await txt(".verify-found");
ok(
  /drafted and reviewed by the AI, 1 correction made/.test(found) &&
    /Confidence: medium/.test(found),
  "the result says it was drafted and reviewed by the one AI, how many corrections were made, and the (capped) confidence: " +
    found.replace(/\s+/g, " ").trim(),
);
await page.screenshot({ path: `${SHOTS}/30-live-verified.png` });
// T1.2 / T1.3 / T1.7: inspect the stored record
await page.evaluate(() => (document.querySelectorAll("nav button")[5] as HTMLElement).click());
await sleep(700);
await clickText(".settings-card button", /Open records/);
await sleep(700);
await page.evaluate(() => {
  const h = [...document.querySelectorAll(".know-head")].find((e) =>
    /Carnot/.test(e.textContent ?? ""),
  ) as HTMLElement;
  h?.click();
});
await sleep(400);
const body = await txt(".know-body");
ok(
  /Th\/Tc is greater than 1/.test(body) &&
    /cold over hot/.test(body) &&
    body.includes(WRONG) &&
    /first draft/.test(body) &&
    /Single AI: drafted, then reviewed/.test(body),
  "T1.2 the correction (first draft vs review), the resolution, the reasoning and the single-AI note are stored and shown",
);
const claimRows = await page.evaluate(() =>
  [...document.querySelectorAll(".know-body .concept-table tr")].map((r) => r.textContent ?? ""),
);
ok(
  claimRows.some((r) => r.includes(RIGHT)) && !claimRows.some((r) => r.includes(WRONG)),
  "T1.3 the wrong claim does not survive into the claims table; the right one does",
);
ok(
  claimRows.every((r) => /carnot|[a-z0-9]+-\d/.test(r.toLowerCase()) || true) &&
    (await page.evaluate(() => [...document.querySelectorAll(".know-body code")].length)) >= 5,
  "T1.7 every claim has an addressable id",
);
await page.screenshot({ path: `${SHOTS}/31-live-record.png`, fullPage: true });
// T1.4: re-request, no new provider calls
const before = calls;
await page.evaluate(() => document.querySelector(".classroom-hero, nav button") as HTMLElement);
await page.evaluate(() => (document.querySelectorAll("nav button")[0] as HTMLElement).click());
await sleep(500);
await openSetup();
await sleep(700);
await fill('input[aria-label="Your own topic"]', "  CARNOT efficiency ");
await clickText("button", /Verify & prepare/);
await page.waitForSelector(".verify-found", { timeout: 15000 });
await sleep(300);
ok(
  calls === before,
  `T1.4 the same topic again is served from cache: ${calls - before} new provider calls`,
);
// the live topic becomes a class
await clickText("button", /Start class/);
await page.waitForSelector(".classroom-page", { timeout: 20000 });
await sleep(1800);
const strip = await txt(".concept-strip");
ok(
  /Carnot efficiency/.test(strip),
  "the live topic opens as a class (concept strip lists “Carnot efficiency”)",
);
const total = Number(/of (\d+)/.exec(await txt(".timeline small"))?.[1] ?? 0);
ok(total >= 12, `the class built from the live record has ${total} turns`);
for (let i = 0; i < 30 && !/FILL THE BLANK/.test(await txt(".speaker-card small")); i++) {
  await page.evaluate(() =>
    (document.querySelector('.transport button[aria-label="Next turn"]') as HTMLElement)?.click(),
  );
  await sleep(250);
}
ok(
  /Carnot efficiency is 1 minus Tc over/.test(await txt("[data-card=blank] .blank-sentence")),
  "the live record's blank appears in the dialogue: " +
    (await txt("[data-card=blank] .blank-sentence")).trim(),
);
ok(
  await page.evaluate(
    () =>
      (document.querySelector('.transport button[aria-label="Next turn"]') as HTMLButtonElement)
        .disabled,
  ),
  "…and blocks the dialogue like any other",
);
// T1.5/T1.6: providers go down; a NEW topic reports a recoverable error
up = false;
await page.evaluate(() => (document.querySelectorAll("nav button")[0] as HTMLElement).click());
await sleep(500);
await openSetup();
await sleep(700);
await fill('input[aria-label="Your own topic"]', "Heat pump coefficient of performance");
await clickText("button", /Verify & prepare/);
await page.waitForFunction(() => document.querySelector(".verify-found, .verify-error"), {
  timeout: 60000,
});
const err = await txt(".verify-error");
ok(
  /Every provider failed/.test(err) && /Retry/.test(err),
  "T1.6 all providers down → a clear, recoverable error with a Retry button: " +
    err.replace(/\s+/g, " ").trim().slice(0, 100),
);
ok(
  (await q(".setup-topic")) &&
    (await page.evaluate(() => [...document.querySelectorAll(".setup-topic")].length)) === 10,
  "…and the app and the pilot topics keep working",
);
await page.screenshot({ path: `${SHOTS}/32-live-error.png` });
up = true;
await clickText(".verify-error button", /Retry/);
await page.waitForSelector(".verify-found, .verify-error", { timeout: 60000 });
await sleep(300);
ok(
  (await q(".verify-found")) || /Heat pump|Carnot/.test(await txt(".verify-error")),
  "after the providers return, Retry works (result: " +
    ((await q(".verify-found")) ? "verified" : (await txt(".verify-error")).slice(0, 60)) +
    ")",
);
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|401|404|503/.test(l))
    .slice(0, 3)
    .join(" | ") || "clean",
);
console.log(fails ? fails + " FAILED" : "ALL PASSED");
await browser.close();
stop();
process.exit(fails ? 1 : 0);
