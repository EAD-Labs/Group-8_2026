// HLD T2.9: the primary actions — reveal a hint, fill a blank, ask as the third student, submit the checkpoint —
// must all be reachable and operable by keyboard alone. This test never uses the mouse after the page loads.
import { launch, sleep, openApp } from "./browser.mjs";
setTimeout(() => {
  console.log("FAIL watchdog");
  process.exit(2);
}, 430000);
const R = [];
const ok = (c, m) => {
  const l = (c ? "PASS " : "FAIL ") + m;
  R.push(l);
  console.log(l.slice(0, 220));
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
const kb = page.keyboard;
const active = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a
      ? {
          tag: a.tagName,
          text: (a.textContent || "").trim().slice(0, 40),
          label: a.getAttribute("aria-label") || "",
          ph: a.getAttribute("placeholder") || "",
          card: !!a.closest("[data-card]"),
          popup: !!a.closest(".question-popup"),
        }
      : null;
  });
// Tab until the focused element satisfies `test` (evaluated in the page); returns whether it was reached.
const tabTo = async (src, max = 90) => {
  for (let i = 0; i < max; i++) {
    const hit = await page.evaluate((src) => {
      const a = document.activeElement;
      return a ? new Function("a", `return !!(${src})(a)`)(a) : false;
    }, src);
    if (hit) return true;
    await kb.press("Tab");
    await sleep(25);
  }
  return false;
};
const q = (s) => page.evaluate((s) => !!document.querySelector(s), s);
const txt = (s) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", s);
const label = () => txt(".speaker-card small");
const nextDisabled = () =>
  page.evaluate(
    () => document.querySelector('.transport button[aria-label="Next turn"]')?.disabled,
  );

// 1. reach the classroom with Tab + Enter
ok(
  await tabTo("(a)=>/Classroom/.test(a.textContent||'') && a.closest('nav')"),
  "Tab reaches the “Classroom” navigation item",
);
await kb.press("Enter");
await page.waitForSelector(".classroom-page");
await sleep(1500);
// 2. the opening check-in is answered with Tab + Enter (one tap each)
ok(
  await tabTo("(a)=>/A little/.test(a.textContent||'') && !!a.closest('[data-card=checkin]')", 60),
  "Tab reaches the check-in's answer chips",
);
await kb.press("Enter");
await sleep(1300);
ok(
  await tabTo(
    "(a)=>/Nothing really/.test(a.textContent||'') && !!a.closest('[data-card=checkin]')",
    60,
  ),
  "the next question's chips are reachable too",
);
await kb.press("Enter");
await sleep(1300);
ok(
  await tabTo("(a)=>/Continue/.test(a.textContent||'') && !!a.closest('[data-card=checkin]')", 30),
  "Tab reaches “Continue”",
);
await kb.press("Enter");
await sleep(500);
let a;
// 3. move through the class with the keyboard-operated Next arrow until the blank
const next = async () => {
  await page.evaluate(() =>
    document.querySelector('.transport button[aria-label="Next turn"]')?.focus(),
  );
  await kb.press("Enter");
  await sleep(300);
};
for (let i = 0; i < 30 && !/FILL THE BLANK/.test(await label()); i++) {
  if (await nextDisabled()) break;
  await next();
}
await sleep(500);
a = await active();
ok(
  /FILL THE BLANK/.test(await label()) && a?.card && a.tag === "INPUT",
  "at the blank, focus moves into the blank's input (keyboard users can answer immediately)",
);
ok(
  await nextDisabled(),
  "…and the Next arrow stays disabled (the dialogue waits) — a disabled control is skipped by Tab, not a trap",
);
await kb.type("decrease");
await kb.press("Enter");
await sleep(400);
ok(
  /Correct/.test(await txt("[data-card=blank] .blank-result")),
  "typing the word and pressing Enter fills the blank",
);
ok(
  await tabTo("(a)=>/Continue/.test(a.textContent||'') && !!a.closest('[data-card]')", 10),
  "Tab reaches “Continue” on the blank card",
);
await kb.press("Enter");
await sleep(500);
// 4. hint: guess first, then reveal — all by keyboard
for (let i = 0; i < 30 && !/HINT/.test(await label()); i++) {
  if (await nextDisabled()) break;
  await next();
}
await sleep(500);
a = await active();
ok(
  /HINT/.test(await label()) && a?.card && a.tag === "TEXTAREA",
  "at a hint, focus moves to the guess box",
);
await kb.type("It increases because energy spreads out.");
ok(await tabTo("(a)=>/Commit guess/.test(a.textContent||'')", 10), "Tab reaches “Commit guess”");
await kb.press("Enter");
await sleep(300);
ok(
  await tabTo("(a)=>a.getAttribute('aria-label')==='Reveal answer'", 10),
  "after committing, Tab reaches “Reveal answer”",
);
await kb.press("Space");
await sleep(400);
ok(
  /Answer:/.test(await txt("[data-card=hint] .answer-feedback")),
  "Space reveals the answer; the verdict is announced (role=status)",
);
ok(
  await tabTo("(a)=>/Continue/.test(a.textContent||'') && !!a.closest('[data-card]')", 10),
  "Tab reaches “Continue”",
);
await kb.press("Enter");
await sleep(500);
// 5. ask as the third student
ok(
  await tabTo(
    "(a)=>a.getAttribute('aria-label')==='ASK A DOUBT' || (a.tagName==='TEXTAREA' && /Raise your hand/.test(a.getAttribute('placeholder')||''))",
    90,
  ),
  "Tab reaches the ASK A DOUBT box",
);
await kb.type("Why does the coffee never reheat itself?");
ok(
  await tabTo("(a)=>a.getAttribute('aria-label')==='Send question'", 6),
  "Tab reaches “Send question” (past the microphone button)",
);
await kb.press("Enter");
await page.waitForFunction(
  () =>
    document.querySelector(".speaker-card .you-asked") &&
    !document.querySelector(".speaker-card .thinking-dots") &&
    (document.querySelector(".speaker-card p")?.textContent ?? "").length > 30,
  { timeout: 45000 },
);
{
  let prev = "";
  for (let i = 0; i < 50; i++) {
    const t = await txt(".speaker-card");
    if (t === prev && t.length > 30) break;
    prev = t;
    await sleep(400);
  }
}
ok(
  /said earlier/.test(await txt(".speaker-card")),
  "Enter sends the question; the in-context answer appears",
);
// 6. checkpoint by keyboard
for (let i = 0; i < 30 && !/CHECKPOINT/.test(await label()); i++) {
  if (await nextDisabled()) {
    if (await q("[data-card=blank]")) {
      await page.evaluate(() => document.querySelector("[data-card=blank] input")?.focus());
      await kb.type("zero");
      await kb.press("Enter");
      await sleep(300);
      await tabTo("(a)=>/Continue/.test(a.textContent||'')", 10);
      await kb.press("Enter");
      await sleep(300);
      continue;
    }
    if (await q("[data-card=hint]")) {
      await page.evaluate(() => document.querySelector("[data-card=hint] textarea")?.focus());
      await kb.type("it increases");
      await tabTo("(a)=>/Commit guess/.test(a.textContent||'')", 10);
      await kb.press("Enter");
      await sleep(250);
      await tabTo("(a)=>a.getAttribute('aria-label')==='Reveal answer'", 10);
      await kb.press("Enter");
      await sleep(300);
      await tabTo("(a)=>/Continue/.test(a.textContent||'')", 10);
      await kb.press("Enter");
      await sleep(300);
      continue;
    }
    break;
  }
  await next();
}
await sleep(500);
ok(
  /CHECKPOINT/.test(await label()) && (await active())?.tag === "TEXTAREA",
  "at the checkpoint focus moves to the answer box",
);
await kb.type("Total entropy never decreases; entropy measures how energy is spread out.");
await tabTo("(a)=>/Commit/.test(a.textContent||'')", 10);
await kb.press("Enter");
await page.waitForSelector(".question-popup .assessment, .transcript-response .assessment", {
  timeout: 15000,
});
ok(true, "the checkpoint was submitted with Enter and scored");
// a visible focus indicator on every control reached by Tab (real keyboard focus, not script focus)
await page.evaluate(() => document.querySelectorAll("nav button")[0].click());
await sleep(900);
await page.evaluate(() => document.activeElement?.blur?.());
let checked = 0;
const bad = [];
for (let i = 0; i < 40; i++) {
  await kb.press("Tab");
  await sleep(20);
  const r = await page.evaluate(() => {
    const a = document.activeElement;
    const cs = getComputedStyle(a);
    return {
      el: `${a.tagName}:${(a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 16)}`,
      fv: a.matches(":focus-visible"),
      ring: (cs.outlineStyle !== "none" && cs.outlineWidth !== "0px") || cs.boxShadow !== "none",
    };
  });
  if (r.fv) {
    checked++;
    if (!r.ring) bad.push(r.el);
  }
}
ok(
  checked >= 20 && bad.length === 0,
  `every one of ${checked} keyboard-focused controls shows a focus indicator` +
    (bad.length ? " — missing on: " + [...new Set(bad)].slice(0, 5).join(", ") : ""),
);
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|401|404/.test(l))
    .slice(0, 2)
    .join(" | ") || "clean",
);
await browser.close();
process.exit(R.some((r) => r.startsWith("FAIL")) ? 1 : 0);
