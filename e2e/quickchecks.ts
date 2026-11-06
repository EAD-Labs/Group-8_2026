// Quick-check popups (multiple choice / fill-in-the-blank with choices) and the Hint option on answer boxes.
import { mkdirSync } from "node:fs";
import { launch, sleep, openApp, SHOTS } from "./browser.mjs";
import { buildPilotModules } from "../src/lib/pilot";
mkdirSync(SHOTS, { recursive: true });
setTimeout(() => {
  console.log("FAIL watchdog");
  process.exit(2);
}, 400000);
const stages = buildPilotModules()
  .find((m) => m.slug === "thermodynamics")!
  .concepts.find((c) => c.slug === "second-law")!.stages;
const checks = stages.filter((s) => s.kind === "mcq");
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
await openApp(page);
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
const points = async () => Number((await txt(".points")).replace(/\D+.*/, "") || 0);
const next = async () => {
  await click('.transport button[aria-label="Next turn"]');
  await sleep(300);
};
const fill = (sel: string, text: string) =>
  page.evaluate(
    (sel, text) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
      const proto =
        el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    sel,
    text,
  );
const handle = async () => {
  // attempt a blank / guess so a blocking turn lets the class move on
  if (await q("[data-card=blank]")) {
    if (!(await q("[data-card=blank] mark"))) {
      await fill("[data-card=blank] .blank-input", "x");
      await click("[data-card=blank] .response-actions button:last-child");
      await sleep(250);
    }
    await clickText("[data-card=blank] button", /Continue/);
    await sleep(300);
    return true;
  }
  if (await q("[data-card=hint]")) {
    if (!(await q("[data-card=hint] .answer-feedback"))) {
      if (await q("[data-card=hint] textarea:not([disabled])")) {
        await fill("[data-card=hint] textarea", "guess");
        await clickText("[data-card=hint] button", /Commit guess/);
        await sleep(200);
      }
      await click("[data-card=hint] button[aria-label='Reveal answer']");
      await sleep(250);
    }
    await clickText("[data-card=hint] button", /Continue/);
    await sleep(300);
    return true;
  }
  return false;
};
const goTo = async (re: RegExp, skip = 0) => {
  let seen = 0;
  for (let i = 0; i < 40; i++) {
    if (re.test(await label())) {
      if (seen++ >= skip) return true;
    }
    if (await nextDisabled()) {
      if (!(await handle())) return false;
      continue;
    }
    await next();
  }
  return false;
};

await page.evaluate(() => (document.querySelectorAll("nav button")[1] as HTMLElement).click());
await page.waitForSelector(".classroom-page");
await sleep(1800);
// ---- the Hint option on an ordinary answer box
ok(await q(".question-popup [data-card=checkin]"), "the class opens with the one-tap check-in");
await clickText(".question-popup footer button", /Answer later/);
await sleep(300);

// ---- first quick check: a fill-in-the-blank with choices
ok(await goTo(/QUICK CHECK/), "the class reaches a QUICK CHECK turn");
await sleep(500);
const c1 = checks[0]!.mcq!;
ok(await q(".question-popup [data-card=mcq]"), "the quick check pops up over the class");
ok(!(await nextDisabled()), "it does not block the class (the Next arrow stays available)");
ok(
  /FILL THE BLANK/.test(await txt("[data-card=mcq] small")) &&
    (await txt("[data-card=mcq] blockquote")).includes("_____"),
  "it is a fill-in-the-blank with choices: “" +
    (await txt("[data-card=mcq] blockquote")).trim().slice(0, 90) +
    "”",
);
ok(
  (await page.evaluate(() => document.querySelectorAll("[data-card=mcq] .option").length)) ===
    c1.options.length,
  `${c1.options.length} options are offered`,
);
ok(
  await page.evaluate(
    () =>
      (
        document.querySelector(
          "[data-card=mcq] .response-actions button:last-child",
        ) as HTMLButtonElement
      ).disabled,
  ),
  "“Check answer” stays disabled until an option is chosen",
);
await page.screenshot({ path: `${SHOTS}/40-quickcheck-popup.png` });
ok(
  await page.evaluate(() => {
    const c = document.querySelector(".question-popup-card") as HTMLElement;
    return c.scrollHeight <= c.clientHeight + 2;
  }),
  "the fill-in-the-blank quick check fits without scrolling",
);
ok(
  await page.evaluate(() => {
    const card = document.querySelector(".question-popup-card")!.getBoundingClientRect();
    return [...document.querySelectorAll("[data-card=mcq] .option")].every((o) => {
      const r = o.getBoundingClientRect();
      return r.left >= card.left - 1 && r.right <= card.right + 1;
    });
  }),
  "every option sits inside the pop-up card (nothing is cut off)",
);
const wrong = c1.options.findIndex((_, i) => i !== c1.answer);
const p0 = await points();
await page.evaluate(
  (i) => (document.querySelectorAll("[data-card=mcq] .option")[i] as HTMLElement).click(),
  wrong,
);
await sleep(120);
await clickText("[data-card=mcq] button", /Check answer/);
await sleep(400);
const fb = await txt("[data-card=mcq] .answer-feedback");
ok(
  /Not quite/.test(fb) && fb.includes(c1.options[c1.answer]!) && fb.length > 60,
  "a wrong answer is marked, the right one is shown, with the explanation: " +
    fb.replace(/\s+/g, " ").slice(0, 120),
);
ok((await points()) === p0, "no points for a wrong answer");
ok(
  await page.evaluate(
    () =>
      document.querySelectorAll("[data-card=mcq] .option.right").length === 1 &&
      document.querySelectorAll("[data-card=mcq] .option.wrong").length === 1,
  ),
  "the right and wrong options are marked",
);
ok(
  await page.evaluate(() =>
    [...document.querySelectorAll("[data-card=mcq] .option")].every(
      (o) => (o as HTMLButtonElement).disabled,
    ),
  ),
  "the answer is final (options lock)",
);
const store1 = JSON.parse(await page.evaluate(() => localStorage.getItem("kyro_learner_v1")!));
ok(
  store1.learner.doubts.some((d: any) => d.source === "mcq"),
  "the slip is logged in the doubt log as a named misconception (source: quick check): " +
    store1.learner.doubts
      .filter((d: any) => d.source === "mcq")
      .map((d: any) => d.name)
      .join(", "),
);
await page.screenshot({ path: `${SHOTS}/41-quickcheck-feedback.png` });
// resume after reload: the answer persists
const prog = await txt(".timeline small");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("nav button");
await sleep(900);
await page.evaluate(() => (document.querySelectorAll("nav button")[1] as HTMLElement).click());
await page.waitForSelector(".classroom-page");
await sleep(1800);
ok((await txt(".timeline small")) === prog, "after a reload the class resumes at the same turn");
ok(
  await page.evaluate(
    () => document.querySelectorAll("[data-card=mcq] .option.wrong").length === 1,
  ),
  "…and the saved quick-check answer is still shown",
);
await clickText("[data-card=mcq] button", /Continue/);
await sleep(400);

// ---- second quick check, answered with the keyboard only
ok(await goTo(/QUICK CHECK/, 0), "the class reaches the second QUICK CHECK");
await sleep(600);
const c2 = checks[1]!.mcq!;
ok(
  (await q(".question-popup [data-card=mcq]")) &&
    (await txt("[data-card=mcq] .mcq-prompt")).trim() === c2.prompt,
  "the second quick check (" + c2.qkind + ") pops up: “" + c2.prompt.slice(0, 70) + "”",
);
await page.screenshot({ path: `${SHOTS}/42-quickcheck-definition.png` });
ok(
  await page.evaluate(() => {
    const c = document.querySelector(".question-popup-card") as HTMLElement;
    return c.scrollHeight <= c.clientHeight + 2;
  }),
  "the long-answer quick check fits without scrolling at laptop size: every option and “Check answer” are visible",
);
const p1 = await points();
const tabTo = async (fn: string, max = 30) => {
  for (let i = 0; i < max; i++) {
    if (
      await page.evaluate(
        (fn) => new Function("a", `return !!(${fn})(a)`)(document.activeElement),
        fn,
      )
    )
      return true;
    await page.keyboard.press("Tab");
    await sleep(25);
  }
  return false;
};
await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
ok(
  await tabTo("(a)=>a.getAttribute('role')==='radio' && !!a.closest('[data-card=mcq]')"),
  "Tab reaches the options",
);
for (let i = 0; i < c2.answer; i++) await page.keyboard.press("Tab");
await page.keyboard.press("Space");
await sleep(150);
ok(await tabTo("(a)=>/Check answer/.test(a.textContent||'')", 10), "Tab reaches “Check answer”");
await page.keyboard.press("Enter");
await sleep(400);
ok(
  /Correct — \+2 points/.test(await txt("[data-card=mcq] .answer-feedback")),
  "choosing the right option with Space and checking with Enter works",
);
ok(
  (await points()) === p1 + 2,
  `a correct first answer earns +2 points (${p1} → ${await points()})`,
);
ok(
  await tabTo("(a)=>/Continue/.test(a.textContent||'') && !!a.closest('[data-card=mcq]')", 10),
  "Tab reaches “Continue”",
);
await page.keyboard.press("Enter");
await sleep(400);

// ---- the Hint option on an ordinary answer box (the checkpoint)
ok(await goTo(/CHECKPOINT/), "the class reaches the checkpoint");
await sleep(500);
ok(!(await q(".question-popup .feedback-text")), "the nudge is hidden until asked for");
ok(
  await clickText(".question-popup .response-actions button", /Hint/),
  "the Hint button is on the answer box",
);
await sleep(250);
const nudge = await txt(".question-popup .feedback-text");
ok(
  /Use the core idea/.test(nudge),
  "tapping Hint shows a nudge written for this question: “" + nudge.trim() + "”",
);
ok(
  !(await page.evaluate(() => document.querySelector(".question-popup .assessment") !== null)),
  "the nudge is only a nudge — it does not answer or score anything",
);
await clickText(".question-popup .response-actions button", /Hint/);
await sleep(200);
ok(!(await q(".question-popup .feedback-text")), "tapping Hint again hides it");
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
