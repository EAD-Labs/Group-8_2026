// The front page is a to-do list (no other ways into the class), the class opens without a "first thought"
// question, plays on by itself, and is controlled from the keyboard like a video player; read aloud stays on.
import { launch, sleep, openApp, SHOTS } from "./browser.mjs";
setTimeout(() => {
  console.log("FAIL watchdog");
  process.exit(2);
}, 420000);
let fails = 0;
let loops = 0;
const ok = (c: boolean, m: string) => {
  const n = logsRef.length ? logsRef[0]!.filter((l: string) => /Maximum update/.test(l)).length : 0;
  if (n > loops) {
    console.log(`   (render-loop error appeared before: ${m.slice(0, 60)})`);
    loops = n;
  }
  console.log((c ? "PASS " : "FAIL ") + m.slice(0, 230));
  if (!c) fails++;
};
const logsRef: string[][] = [];
const { browser, page, logs } = await launch(1440, 900);
logsRef.push(logs);
await page.evaluateOnNewDocument(() => {
  if (!sessionStorage.getItem("s")) {
    sessionStorage.setItem("s", "1");
    localStorage.setItem(
      "kyro_settings_v1",
      JSON.stringify({ handsFree: false, lessonDepth: "brief",
        popupQuestions: true,
        graphics: "low",
        motion: "on",
        effects: false,
        autoPlay: true,
        voiceOn: false,
      }),
    );
    localStorage.setItem("kyro_ask_hint_v1", "1");
  }
  // record what is read aloud (the headless browser has no voices)
  (window as any).__spoken = [];
  const P = (window as any).SpeechSynthesis?.prototype;
  if (P) {
    P.speak = function (u: SpeechSynthesisUtterance) {
      (window as any).__spoken.push(u.text);
      setTimeout(() => {
        u.onstart?.(new Event("start") as any);
        setTimeout(() => u.onend?.(new Event("end") as any), 150);
      }, 10);
    };
    P.cancel = function () {};
    P.getVoices = function () {
      return [];
    };
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
const idx = async () => Number(/(\d+) of/.exec(await txt(".timeline small"))?.[1] ?? 0);
const label = () => txt(".speaker-card small");
const key = async (k: string, shift = false) => {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  if (shift) await page.keyboard.down("Shift");
  await page.keyboard.press(k as any);
  if (shift) await page.keyboard.up("Shift");
  await sleep(350);
};
const toast = () => txt(".kbd-toast");
const spoken = () => page.evaluate(() => (window as any).__spoken.length as number);

// ---- 1–2. the class opens from the left bar, without a "first thought" question
await page.evaluate(() => (document.querySelectorAll("nav button")[1] as HTMLElement).click()); await page.waitForSelector(".classroom-page", { timeout: 20000 }); await sleep(1800);
ok(/BEFORE WE START/.test(await label()) && !(await page.evaluate(() => /PRIOR KNOWLEDGE|what do you already believe/i.test(document.body.textContent ?? ""))), "the class opens with the one-tap check-in — no 'first thought' question");
// ---- 3. it plays on by itself after the learner answers
const tapChip = async (re: RegExp) => {
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
await tapChip(/A little/);
await tapChip(/Nothing really/);
await page.waitForFunction(
  () =>
    [...document.querySelectorAll("[data-card=checkin] button")].some((b) =>
      /Continue/.test(b.textContent ?? ""),
    ),
  { timeout: 20000 },
);
ok(
  (
    await page.evaluate(() =>
      [...document.querySelectorAll("[data-card=checkin] .bubble")]
        .map((b) => b.textContent)
        .join(" | "),
    )
  ).includes("Anything you expect to be tricky?"),
  "the check-in is a short conversation: one question, a tap, then the next question",
);
await clickText("[data-card=checkin] button", /Continue/);
await sleep(400);
const i0 = await idx();
const t0 = Date.now();
let i1 = i0;
for (let k = 0; k < 40 && i1 < i0 + 2; k++) {
  await sleep(500);
  i1 = await idx();
}
ok(
  i1 >= i0 + 2,
  `after answering, the class carries on by itself at reading pace (${i0} → ${i1} in ${Math.round((Date.now() - t0) / 1000)} s with no key pressed)`,
);
ok(
  await page.evaluate(
    () => document.querySelector('.transport button[aria-label="Pause"]') !== null,
  ),
  "…and it is playing",
);
// ---- 4. keyboard control
await key("k");
const i2 = await idx();
ok(/Paused/.test(await toast()), "K pauses (a small 'Paused' sign appears, like a video player)");
await sleep(4500);
ok((await idx()) === i2, "…and the class stays where it is");
await key("ArrowRight");
ok((await idx()) === i2 + 1, "→ goes to the next line");
await key("ArrowLeft");
ok((await idx()) === i2, "← goes back a line");
await key("l");
await key("j");
ok((await idx()) === i2, "L and J do the same");
await key(" ");
ok(/Playing/.test(await toast()), "Space plays again");
await key(" ");
await key("?");
ok(
  (await q(".shortcuts-sheet")) &&
    (await page.evaluate(() => document.querySelectorAll(".shortcuts-sheet dl > div").length)) ===
      11,
  "? shows the list of shortcuts",
);
await page.screenshot({ path: `${SHOTS}/61-shortcuts.png` });
await page.keyboard.press("Escape");
await sleep(250);
ok(!(await q(".shortcuts-sheet")), "Esc closes it");
// ---- 5. read aloud: one switch, kept on for the whole lecture
const s0 = await spoken();
await key("m");
ok(
  /Read aloud on/.test(await toast()) &&
    /Read aloud: On/.test(
      await page.evaluate(() =>
        [...document.querySelectorAll(".toolbar-right button")].map((b) => b.textContent).join("|"),
      ),
    ),
  "M turns read aloud on (the toolbar shows 'Read aloud: On')",
);
ok(
  JSON.parse((await page.evaluate(() => localStorage.getItem("kyro_settings_v1")))!).voiceOn ===
    true,
  "…and it is remembered",
);
await key("ArrowLeft");
await sleep(500);
await key("ArrowLeft");
await sleep(500); // ← is always allowed (→ may be held at a blank)
const s1 = await spoken();
ok(
  s1 >= s0 + 3,
  `with it on, every line is read as you move — no button press per line (${s1 - s0} lines read)`,
);
await key("m");
const s2 = await spoken();
await key("ArrowRight");
await sleep(600);
ok((await spoken()) === s2, "M turns it off again; lines are no longer read");
// ---- 6. typing in the doubt box is never taken as a shortcut
await page.keyboard.press("/");
await sleep(200);
ok(
  await page.evaluate(
    () => document.activeElement === document.querySelector(".ask-field textarea"),
  ),
  "/ jumps to the doubt box",
);
const before = await idx();
await page.keyboard.type("k j l m");
await sleep(300);
ok(
  (await page.evaluate(
    () => (document.querySelector(".ask-field textarea") as HTMLTextAreaElement).value,
  )) === "k j l m" && (await idx()) === before,
  "typing there types; it does not pause or move the class",
);
// ---- 7. jump between doubts
await page.evaluate(() => {
  const t = document.querySelector(".ask-field textarea") as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
    t,
    "Why does entropy never decrease?",
  );
  t.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.evaluate(() =>
  (document.querySelector('.ask-field button[aria-label="Send question"]') as HTMLElement).click(),
);
await page.waitForFunction(
  () =>
    /YOUR DOUBT/.test(document.querySelector(".speaker-card small")?.textContent ?? "") &&
    !document.querySelector(".speaker-card .thinking-dots"),
  { timeout: 30000 },
);
await sleep(2500);
const dIdx = await idx();
await clickText(".doubt-card .chip", /Got it/);
await sleep(300);
await key("k");
await sleep(200);
const after = await idx();
if (after === dIdx) await key("ArrowRight");
await key("ArrowRight", true);
ok(/No later doubt/.test(await toast()), "Shift+→ with no later doubt says so");
await key("ArrowLeft", true);
ok(/YOUR DOUBT/.test(await label()) && (await idx()) === dIdx, "Shift+← jumps back to your doubt");
// ---- 8. the gate still holds: a blank cannot be skipped with the keys
for (let i = 0; i < 25 && !/FILL THE BLANK/.test(await label()); i++) await key("ArrowRight");
ok(/FILL THE BLANK/.test(await label()), "→ walks the class to the blank");
const atBlank = await idx();
await key("ArrowRight");
ok(
  (await idx()) === atBlank && /Fill the blank first/.test(await toast()),
  "→ cannot skip the blank (“Fill the blank first”)",
);
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|401|404|Failed to load resource/.test(l))
    .slice(0, 3)
    .join(" | ") || "clean",
);
console.log(fails ? fails + " FAILED" : "ALL PASSED");
await browser.close();
process.exit(fails ? 1 : 0);
