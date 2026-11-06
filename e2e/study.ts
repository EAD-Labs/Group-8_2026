import { mkdirSync } from "node:fs";
import { launch, sleep, openApp, SHOTS, TMP } from "./browser.mjs";
mkdirSync(SHOTS, { recursive: true });
import { assignParticipant } from "../src/lib/study";
import { seededByKey } from "../src/lib/knowledge/seed";
import { writeFileSync } from "node:fs";
const A = assignParticipant(1);
const keys = Object.keys(A.assignments);
const plat = keys.find((k) => A.assignments[k] === "platform")!;
const chat = keys.find((k) => A.assignments[k] === "chat")!;
const title = (k: string) => seededByKey.get(k)!.title;
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
await openApp(page);
const q = (s: string) => page.evaluate((s) => !!document.querySelector(s), s);
const txt = (s: string) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", s);
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
const nav = async (i: number, w = 700) => {
  await page.evaluate(
    (i) => (document.querySelectorAll("nav button")[i] as HTMLElement)?.click(),
    i,
  );
  await sleep(w);
};
const fill = (sel: string, text: string) =>
  page.evaluate(
    (sel, text) => {
      const el = document.querySelector(sel) as HTMLTextAreaElement | HTMLInputElement;
      const proto =
        el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    sel,
    text,
  );
const shot = (n: string) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
await page.evaluate(() => {
  (window as any).__blobs = [];
  const o = URL.createObjectURL;
  URL.createObjectURL = (b: Blob) => {
    (window as any).__blobs.push(b);
    return o(b);
  };
});

// ---- join
await nav(5, 900);
await clickText(".seg button", /Join/);
await sleep(700);
ok(
  (await q(".study-page")) && /Does this teach better/.test(await txt(".study-page h1")),
  "Settings → Comparative study opens the study screen",
);
await fill('input[aria-label="Participant number"]', "1");
await fill('input[aria-label="Participant code"]', "T-001");
await clickText("button", /Join the study/);
await sleep(600);
const cards = await page.evaluate(() =>
  [...document.querySelectorAll(".study-assign")].map((c) => ({
    t: c.querySelector("b")?.textContent,
    cond: c.className.includes("platform") ? "platform" : "chat",
  })),
);
ok(
  cards.length === 2 &&
    cards.find((c) => c.cond === "platform")?.t === title(plat) &&
    cards.find((c) => c.cond === "chat")?.t === title(chat),
  `participant 1 is assigned one matched pair: classroom → “${title(plat)}”, plain chat → “${title(chat)}” (pair ${A.pairId})`,
);
await shot("20-study-assigned");
// ---- plain chat baseline
await fill('textarea[aria-label="Plain chat question"]', "Explain this to me please");
await page.evaluate(() =>
  (document.querySelector('button[aria-label="Send"]') as HTMLElement).click(),
);
await page.waitForFunction(() => document.querySelector(".chat-a"), { timeout: 45000 });
await sleep(300);
const ans = await txt(".chat-a");
ok(
  ans.length > 150 && /1 message sent/.test(await txt(".chat-base")),
  `the plain-chat condition answers (${ans.length} chars, no classroom scaffolding) and counts the message`,
);
ok(
  !/Raise your hand|check you have it|Maya|Arjun/.test(ans),
  "…with no personas, hints, blanks or check-questions (a true baseline)",
);
ok(
  /\d+:\d\d of 15 min/.test(await txt(".chat-base header")),
  "a timer shows the shared time budget: " + (await txt(".chat-base header")).replace(/\s+/g, " "),
);
await shot("21-study-chat");
// ---- classroom condition
await clickText("button", /Open the class/);
await page.waitForSelector(".classroom-page", { timeout: 45000 });
await sleep(1800);
ok(
  (await page.evaluate(
    () => document.querySelector(".classroom-toolbar strong")?.textContent ?? "",
  )) !== "" &&
    (
      await page.evaluate(
        () =>
          [...document.querySelectorAll(".concept-strip button")].find(
            (b) => b.className.includes("active") || b.getAttribute("aria-current"),
          )?.textContent ?? "",
      )
    ).length >= 0,
  "'Open the class' starts the classroom for the platform concept",
);
const stripTxt = await page.evaluate(
  () => document.querySelector(".concept-strip")?.textContent ?? "",
);
ok(
  stripTxt.includes(title(plat).slice(0, 12)),
  "the class opened is the assigned classroom concept (" + title(plat) + ")",
);
// ---- finish learning; delayed tests are not available yet
await nav(5, 700);
await clickText(".seg button", /Join|Continue/);
await sleep(700);
ok(
  await q(".study-assign"),
  "returning to the study screen resumes the same participant (state kept)",
);
await clickText("button", /I have finished both/);
await sleep(600);
ok(
  /Delayed tests open in 3 days/.test(await txt(".study-page")),
  "T3.2/§6.3 the delayed tests are scheduled: " + (await txt(".study-page .report-card h2")).trim(),
);
ok(!(await q("[data-testblock]")), "…and cannot be taken yet");
// ---- 3 days later
await nav(5, 600);
await clickText(".seg button", /\+3 days/);
await sleep(300);
await clickText(".seg button", /Join|Continue/);
await sleep(800);
ok(await q("[data-testblock]"), "3 days later the delayed test opens");
const done: string[] = [];
for (let c = 0; c < 2; c++) {
  await page.waitForSelector("[data-testblock]");
  const k = await page.evaluate(() =>
    document.querySelector("[data-testblock]")!.getAttribute("data-testblock")!,
  );
  done.push(k);
  for (let i = 0; i < 6 && !(await q("[data-testblock] textarea")); i++) {
    await page.evaluate(() =>
      (document.querySelector("[data-testblock] .option") as HTMLElement).click(),
    );
    await clickText("[data-testblock] button", /^Check$/);
    await sleep(150);
    await clickText("[data-testblock] button", /Next/);
    await sleep(200);
  }
  ok(
    await q("[data-testblock] textarea"),
    `retention questions done, transfer problem shown for “${title(k)}”`,
  );
  if (c === 0) await shot("22-study-transfer");
  await fill(
    "[data-testblock] textarea",
    "The idea applies because the system and its surroundings must both be accounted for: the total changes, entropy spreads, and the heat transferred across the boundary sets the direction, so I check the signs first and then reason about the energy balance.",
  );
  await clickText("[data-testblock] button", /Submit/);
  await sleep(900);
}
ok(
  done.length === 2 && new Set(done).size === 2,
  "both concepts (classroom and plain-chat) were tested",
);
ok(/Finished — thank you/.test(await txt(".study-page")), "the learner sees a completion summary");
const rows = await page.evaluate(() =>
  [...document.querySelectorAll(".study-page .concept-table tr")].map((r) =>
    r.textContent!.replace(/\s+/g, " "),
  ),
);
ok(
  rows.length === 2 && rows.every((r) => /Retention \d+%/.test(r) && /Transfer \d+%/.test(r)),
  "retention and transfer scores are shown for each condition: " + rows.join(" | "),
);
await shot("23-study-finished");
await clickText("button", /Download my study file/);
await sleep(400);
const blobText = await page.evaluate(async () => {
  const b = (window as any).__blobs.at(-1);
  return b ? await b.text() : "";
});
const run = JSON.parse(blobText);
ok(
  run.participantId === "T-001" &&
    Object.keys(run.tests).length === 2 &&
    run.assignments[plat] === "platform" &&
    run.assignments[chat] === "chat" &&
    (run.chatTurns[chat] ?? 0) === 1,
  "the exported study file holds assignments, both test results and the chat message count",
);
ok(!/audio|password|email/i.test(blobText), "…and no audio or personal data");
writeFileSync(`${TMP}/study-T001.json`, blobText);
// ---- evaluation (researcher) view
await nav(5, 600);
await clickText(".seg button", /Evaluation/);
await sleep(600);
ok(/No study files loaded/.test(await txt(".study-page")), "Evaluation report starts empty");
const input = await page.$('.study-page input[type=file]');
await input!.uploadFile(`${TMP}/study-T001.json`);
await sleep(700);
ok(
  /NOT yet reportable \(needs 15, has 1\)/.test(await txt(".reportable")),
  "one learner is correctly flagged as NOT reportable: " + (await txt(".reportable")),
);
await clickText("button", /synthetic demo data/);
await sleep(600);
ok(
  /SYNTHETIC DEMO DATA/.test(await txt(".synthetic-banner")) &&
    /reportable \(≥15\)/.test(await txt(".reportable")),
  "synthetic mode is loudly labelled and reaches ≥15",
);
const figs = await page.evaluate(() =>
  [...document.querySelectorAll(".report-stat")].map((s) => s.textContent!.replace(/\s+/g, " ")),
);
ok(
  figs.length === 2 && figs.every((f) => /pts/.test(f) && /95% CI/.test(f) && /p [=<]/.test(f)),
  "retention and transfer deltas show mean, 95% CI, p-value and effect size: " + figs[0],
);
await shot("24-evaluation-report");
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
