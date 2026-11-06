// Pop-up questions over the classroom: appear on the learner's turn, can be dismissed, hidden, and turned back on.
import { launch, sleep, openApp, SHOTS } from "./browser.mjs";
import { mkdirSync } from "node:fs";
mkdirSync(SHOTS, { recursive: true });
setTimeout(() => {
  console.log("FAIL watchdog: test took too long");
  process.exit(2);
}, 170000);
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
await page.evaluate(() => document.querySelectorAll("nav button")[1]?.click());
await page.waitForSelector(".classroom-page");
await sleep(1500);
const R = [];
const ok = (c, m) => {
  const l = (c ? "PASS " : "FAIL ") + m;
  R.push(l);
  console.log(l);
};
const q = (s) => page.evaluate((s) => !!document.querySelector(s), s);
const txt = (s) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", s);
const click = (s) => page.evaluate((s) => document.querySelector(s)?.click(), s);
const clickText = (sel, re) =>
  page.evaluate(
    (sel, src) => {
      const el = [...document.querySelectorAll(sel)].find((e) =>
        new RegExp(src).test(e.textContent ?? ""),
      );
      el?.click();
      return !!el;
    },
    sel,
    re.source,
  );
const fill = (sel, text) =>
  page.evaluate(
    (sel, text) => {
      const el = document.querySelector(sel);
      const proto =
        el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    sel,
    text,
  );
const next = async () => {
  await click('.transport button[aria-label="Next turn"]');
  await sleep(300);
};
const nextDisabled = () =>
  page.evaluate(
    () => document.querySelector('.transport button[aria-label="Next turn"]')?.disabled,
  );
const label = () => txt(".speaker-card small");
// attempt whatever interactive card is showing so the dialogue can move on
const settle = async () => {
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
const goTo = async (re) => {
  for (let i = 0; i < 40; i++) {
    if (re.test(await label())) return true;
    if (await nextDisabled()) {
      if (!(await settle())) return false;
      continue;
    }
    await next();
  }
  return false;
};

// 1. the opening check-in pops up over the class
ok(
  await q(".question-popup [data-card=checkin]"),
  "a pop-up appears over the classroom on the learner's turn (the one-tap check-in)",
);
ok(
  !(await q(".class-transcript .transcript-response")),
  "…and the side-panel copy is hidden (no duplicate)",
);
ok(
  await page.evaluate(() => !!document.querySelector('.transport button[aria-label="Play"]')),
  "the class is paused behind the pop-up (the transport shows Play)",
);
// 2. answer it inside the pop-up, one tap at a time
const tapChip = async (re) => {
  await page.waitForFunction(
    (src) =>
      [...document.querySelectorAll("[data-card=checkin] .chip")].some((c) =>
        new RegExp(src).test(c.textContent ?? ""),
      ),
    { timeout: 20000 },
    re.source,
  );
  await clickText("[data-card=checkin] .chip", re);
};
await tapChip(/Fairly well/);
await tapChip(/The maths/);
await page.waitForFunction(
  () =>
    [...document.querySelectorAll("[data-card=checkin] button")].some((b) =>
      /Continue/.test(b.textContent ?? ""),
    ),
  { timeout: 20000 },
);
ok(
  (await txt(".question-popup [data-card=checkin]")).includes("Anything you expect to be tricky?"),
  "the answers are given inside the pop-up, one question at a time",
);
await clickText("[data-card=checkin] button", /Continue/);
await sleep(500);
ok(
  !(await q(".question-popup")),
  "Continue moves on and the pop-up closes (the next turn needs no answer)",
);
// 3. a blocking blank pops up too; 'Answer later' moves it to the side panel but it still blocks
ok(await goTo(/FILL THE BLANK/), "the dialogue reaches the fill-in-the-blank turn");
await sleep(400);
ok(await q(".question-popup [data-card=blank]"), "the blank pops up over the class");
await clickText(".question-popup footer button", /Answer later/);
await sleep(400);
ok(
  !(await q(".question-popup")) && (await q(".class-transcript [data-card=blank]")),
  "'Answer later' hides the pop-up; the blank waits in the side panel",
);
ok(await nextDisabled(), "…and it still blocks the dialogue until answered");
await settle();
// 4. Escape closes a pop-up
ok(await goTo(/HINT/), "the dialogue reaches a hint turn");
await sleep(400);
ok(await q(".question-popup [data-card=hint]"), "the hint card pops up");
await page.keyboard.press("Escape");
await sleep(400);
ok(
  !(await q(".question-popup")) && (await q(".class-transcript [data-card=hint]")),
  "Escape closes the pop-up and the hint stays in the side panel",
);
await settle();
// 5. 'Don't pop up questions' turns it off and remembers
ok(await goTo(/FILL THE BLANK|HINT|CHECKPOINT/), "the next learner turn is reached");
await sleep(400);
await clickText(".question-popup footer button", /Don.t pop up/);
await sleep(400);
const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("kyro_settings_v1")));
ok(
  !(await q(".question-popup")) && saved.popupQuestions === false,
  "'Don't pop up questions' turns the setting off and remembers it",
);
ok(
  await q(".class-transcript .transcript-response, .class-transcript [data-card]"),
  "with pop-ups off, the question lives in the side panel",
);
// 6. Settings turns it back on
await page.evaluate(() => document.querySelectorAll("nav button")[5]?.click());
await sleep(700);
await page.evaluate(() =>
  document.querySelector('button[role="switch"][aria-label="Pop-up questions"]')?.click(),
);
await sleep(300);
ok(
  JSON.parse(await page.evaluate(() => localStorage.getItem("kyro_settings_v1"))).popupQuestions ===
    true,
  "the Settings switch turns pop-ups back on",
);
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|401|404/.test(l))
    .slice(0, 3)
    .join(" | ") || "clean",
);
await browser.close();
process.exit(R.some((r) => r.startsWith("FAIL")) ? 1 : 0);
