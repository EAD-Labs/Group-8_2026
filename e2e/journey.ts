import { mkdirSync } from "node:fs";
import { launch, sleep, openApp, SHOTS, TMP } from "./browser.mjs";
mkdirSync(SHOTS, { recursive: true });
import { seededByKey } from "../src/lib/knowledge/seed";
import { firstSentence } from "../src/lib/quiz";
const KEY = "thermodynamics:second-law";
const rec = seededByKey.get(KEY)!;
const R: string[] = [];
let fails = 0;
const ok = (c: boolean, m: string) => {
  const l = (c ? "PASS " : "FAIL ") + m;
  R.push(l);
  console.log(l.slice(0, 240));
  if (!c) fails++;
};
const { browser, page, logs } = await launch(1440, 900);
await page.evaluateOnNewDocument(() => {
  if (!sessionStorage.getItem("seeded")) {
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(
      "kyro_settings_v1",
      JSON.stringify({ handsFree: false, lessonDepth: "brief", autoPlay: false, voiceOn: false, popupQuestions: true, graphics: "low" }),
    );
    localStorage.setItem("kyro_ask_hint_v1", "1");
  }
});
await openApp(page);
const shot = (n: string) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const q = (s: string) => page.evaluate((s) => !!document.querySelector(s), s);
const txt = (s: string) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", s);
const click = (s: string) =>
  page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), s);
const clickText = (sel: string, re: RegExp) =>
  page.evaluate(
    (sel, src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll(sel)].find((e) => r.test(e.textContent ?? "")) as
        HTMLElement | undefined;
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
const label = () => txt(".speaker-card small");
const progress = () => txt(".timeline small");
const nextDisabled = () =>
  page.evaluate(
    () =>
      (document.querySelector('.transport button[aria-label="Next turn"]') as HTMLButtonElement)
        ?.disabled,
  );
const next = async () => {
  await click('.transport button[aria-label="Next turn"]');
  await sleep(350);
};
const handleCard = async () => {
  if (await q("[data-card=blank]")) {
    const sentence = await txt("[data-card=blank] .blank-sentence");
    const b = rec.blanks.find((x) => sentence.includes(x.before.slice(0, 25)));
    if (!(await q("[data-card=blank] mark"))) {
      await fill("[data-card=blank] .blank-input", b?.answer ?? "zero");
      await click("[data-card=blank] .response-actions button:last-child");
      await sleep(300);
    }
    await clickText("[data-card=blank] button", /Continue/);
    await sleep(400);
    return true;
  }
  if (await q("[data-card=hint]")) {
    if (!(await q("[data-card=hint] .answer-feedback"))) {
      if (await q("[data-card=hint] textarea:not([disabled])")) {
        await fill(
          "[data-card=hint] textarea",
          "it increases, energy spreads, improbable to gather back",
        );
        await clickText("[data-card=hint] button", /Commit guess/);
        await sleep(250);
      }
      await click("[data-card=hint] button[aria-label='Reveal answer']");
      await sleep(300);
    }
    await clickText("[data-card=hint] button", /Continue/);
    await sleep(400);
    return true;
  }
  return false;
};
const advanceTo = async (re: RegExp) => {
  for (let i = 0; i < 40; i++) {
    if (re.test(await label())) return true;
    if (await nextDisabled()) {
      if (!(await handleCard())) return false;
      continue;
    }
    await next();
  }
  return false;
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
const points = async () => Number((await txt(".points")).replace(/\D+.*/, "") || 0);

// ---- Step 1: select a topic (dashboard -> guided demo -> Topic Setup)
await nav(5, 800);
await clickText("button", /Start the guided demo/);
await sleep(700);
await nav(0, 900);
ok(
  await q(".journey"),
  "Step 1: the guided-journey checklist opens (Settings → Start the guided demo)",
);
await shot("01-dashboard-journey");
await nav(1, 1500);
await clickText("button", /New topic/);
await sleep(900);
ok(
  (await q(".setup-page")) &&
    (await page.evaluate(() => document.querySelectorAll(".setup-topic").length)) === 10,
  "Step 1: Topic Setup shows the 10 pilot concepts (2 modules × 5)",
);
ok(
  /Understand/.test(
    await page.evaluate(
      () =>
        [...document.querySelectorAll(".setup-topic")].find((e) =>
          /Second law/.test(e.textContent!),
        )?.textContent ?? "",
    ),
  ),
  "…each with its target Bloom level",
);
await clickText(".setup-topic", /Second law/);
await shot("02-topic-setup");
ok(
  /Pre-verified record/.test(await txt(".start-card")),
  "Step 2: the topic opens instantly from a pre-verified record: " +
    (await txt(".start-card")).replace(/\s+/g, " ").slice(0, 110),
);
await clickText("button", /Full class/);
await click(".start-btn");
await page.waitForSelector(".classroom-page", { timeout: 45000 });
await sleep(1800);
ok(
  /Dr Rao/.test(await txt(".speaker-card")) && /BEFORE WE START/.test(await label()),
  "Step 3: the classroom opens with a one-tap check-in (no 'first thought' question)",
);
const total = Number(/of (\d+)/.exec(await progress())![1]);
ok(total >= 15, `the full dialogue has ${total} turns`);

// first turn: the one-tap check-in (what do you already know?) — a short conversation, not a form
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
ok(
  (await q(".question-popup [data-card=checkin]")) && !(await q(".question-popup textarea")),
  "the class opens with a one-tap check-in, not a text box to fill",
);
await tapChip(/A little/);
await tapChip(/Nothing really/);
await page.waitForFunction(
  () =>
    [...document.querySelectorAll("[data-card=checkin] button")].some((b) =>
      /Continue/.test(b.textContent ?? ""),
    ),
  { timeout: 20000 },
);
await clickText("[data-card=checkin] button", /Continue/);
await sleep(500);

// ---- Step 4a: blank blocks
ok(await advanceTo(/FILL THE BLANK/), "Step 4: the dialogue reaches a fill-in-the-blank turn");
ok(
  await nextDisabled(),
  "T2.5 the Next arrow is disabled — the dialogue will not continue past the blank",
);
const blankAt = await progress();
await page.waitForSelector("[data-card=blank] .blank-input");
await shot("03-blank");
await fill("[data-card=blank] .blank-input", "rise");
await click("[data-card=blank] .response-actions button:last-child");
await sleep(400);
ok(
  /Not quite/.test(await txt("[data-card=blank] .blank-result")) &&
    /decrease/.test(await txt("[data-card=blank] mark")),
  "a wrong blank is marked and the right word is shown: " +
    (await txt("[data-card=blank] .blank-result")).slice(0, 60),
);
ok(!(await nextDisabled()), "…and the dialogue is unblocked once it has been attempted");
await shot("04-blank-wrong");
await clickText("[data-card=blank] button", /Continue/);
await sleep(500);
ok((await progress()) !== blankAt, "the dialogue resumes after the blank");

// ---- Step 4b: hint gated on a guess
ok(await advanceTo(/HINT/), "the dialogue reaches a hint turn");
await page.waitForSelector("[data-card=hint]");
const revealDisabled = await page.evaluate(
  () =>
    (
      document.querySelector(
        "[data-card=hint] button[aria-label='Reveal answer']",
      ) as HTMLButtonElement
    )?.disabled ?? "missing",
);
ok(
  revealDisabled === "missing" || revealDisabled === true,
  "T2.4 before guessing, 'Reveal answer' is not available (" +
    (revealDisabled === "missing" ? "hidden behind “Commit guess”" : "disabled") +
    ")",
);
ok(
  /unlocks after you commit a guess/.test(await txt("[data-card=hint]")),
  "…and the card says why",
);
await shot("05-hint-locked");
await fill(
  "[data-card=hint] textarea",
  "It increases, because the energy spreads out into the room.",
);
await clickText("[data-card=hint] button", /Commit guess/);
await sleep(300);
const p0 = await points();
await click("[data-card=hint] button[aria-label='Reveal answer']");
await sleep(500);
ok(
  /matched/.test(await txt("[data-card=hint] .answer-feedback")) &&
    /Answer:/.test(await txt("[data-card=hint] .answer-feedback")),
  "after committing a guess the answer is revealed and the guess is judged",
);
ok(
  (await points()) === p0 + 3,
  `T2.8 a correct guess before the reveal earns +3 points (${p0} → ${await points()})`,
);
await shot("06-hint-revealed");

// ---- T2.10: reload mid-dialogue and resume
const beforeReload = await progress();
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("nav button");
await sleep(900);
await nav(1, 1500);
await page.waitForSelector(".classroom-page");
ok(
  (await progress()) === beforeReload && (await points()) === p0 + 3,
  `T2.10 after a reload the dialogue resumes where it was (${beforeReload}) and the points are kept`,
);

// ---- Step 5: third student, in context
await clickText("[data-card=hint] button", /Continue/);
await sleep(400);
await fill(".ask-field textarea", "Why does the coffee never reheat itself?");
const lastSaid = await txt(".speaker-card p, .speaker-card div:last-child");
await click('button[aria-label="Send question"]');
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
await sleep(500);
const ans = await txt(".speaker-card");
ok(
  /said earlier/.test(ans) && /“[^”]{8,}”/.test(ans),
  "T2.6 the third-student answer refers back to the dialogue so far: " +
    ans.replace(/\s+/g, " ").slice(0, 150) +
    "…",
);
ok(
  !/I don't know|not configured/i.test(ans) && ans.length > 120,
  "…and is a substantive answer, not a generic or error message",
);
await shot("07-ask-in-context");

// ---- Step 6: checkpoint is mandatory
ok(await advanceTo(/CHECKPOINT/), "Step 6: the dialogue reaches the checkpoint");
ok(await nextDisabled(), "the checkpoint is blocking — the Next arrow is disabled");
const cp = await txt(".question-popup p, .transcript-response p");
ok(
  /Arjun asked/.test(cp),
  "T3.1 the checkpoint question quotes the dialogue: " + cp.slice(0, 90) + "…",
);
await shot("08-checkpoint");
await fill(
  ".question-popup textarea",
  "Total entropy of the coffee and the room never decreases. Entropy is not just disorder: it measures how energy is spread among accessible states, so hot coffee cools because spreading out is far more probable than energy gathering back, even though energy is conserved. A refrigerator lowers one part's entropy only by raising the surroundings'.",
);
await clickText(".question-popup .response-actions button", /Commit/);
await page.waitForSelector(".question-popup .assessment", { timeout: 45000 });
const cpRes = await txt(".question-popup .assessment-head");
ok(/\d+%/.test(cpRes), "checkpoint scored: " + cpRes);
await clickText(".question-popup .assessment-actions button", /Continue/);
await sleep(500);
ok(!(await nextDisabled()), "the checkpoint is unblocked once attempted");
// finish the dialogue
for (let i = 0; i < 6; i++) {
  if (/TRANSFER/.test(await label())) break;
  await next();
}
await sleep(300);

// ---- Progress: ladder, doubts, points, badges
await nav(4, 1300);
const ladder = await txt(".ladder-card");
const row = await page.evaluate(
  () =>
    [...document.querySelectorAll(".ladder-row")].find((r) => /Second law/.test(r.textContent!))
      ?.textContent ?? "",
);
ok(
  /Understood/.test(
    (await page.evaluate(
      () =>
        document.querySelector(".ladder-row .current")?.parentElement?.getAttribute("aria-label") ??
        "",
    )) + row,
  ) || /next delayed check in 3 days/.test(row),
  "the concept is now Understood with the delayed check set: " +
    row.replace(/\s+/g, " ").slice(0, 130),
);
ok(
  /Understood/.test(
    await page.evaluate(
      () =>
        [...document.querySelectorAll(".ladder-row")]
          .find((r) => /Second law/.test(r.textContent!))
          ?.querySelector(".ladder-steps")
          ?.getAttribute("aria-label") ?? "",
    ),
  ),
  "ladder state label: Understood",
);
ok(/in 3 days/.test(row), "T3.2 the delayed retention check is scheduled 3 days out");
ok(
  /entropy as mere disorder|local decrease/.test(await txt(".doubt-list")),
  "the doubt log names the misconception from the wrong blank: " +
    (await txt(".doubt-list header strong")),
);
ok(
  /First guess/.test(
    await page.evaluate(() => document.querySelector(".badge-list li.earned")?.textContent ?? ""),
  ),
  "a participation badge was earned (First guess)",
);
await shot("09-progress-understood");
ok(
  /Due for review[\s\S]*Nothing due/.test(await txt(".report-page")),
  "the Report Card shows nothing due yet",
);

// ---- retention: fast-forward 3 days, the delayed quiz returns
await nav(2, 800);
ok(
  /^0$/.test((await txt(".review-due strong")).trim()),
  "before the delay the retention quiz is not due",
);
await nav(5, 900);
await clickText(".seg button", /\+3 days/);
await sleep(500);
ok(
  /\+3 days/.test(await txt(".settings-card:nth-of-type(6) h2, .settings-page")),
  "the demo clock moved +3 days",
);
await nav(2, 900);
ok(
  /^1$/.test((await txt(".review-due strong")).trim()),
  "T3.2 3 days later the delayed retention quiz is due: " + (await txt(".review-due span")),
);
await shot("10-review-due");
await click(".review-hero-actions button");
await page.waitForSelector(".question-card");
// answer correctly using the seeded record
const def = firstSentence(
  rec.claims
    .filter((c) => c.role === "define")
    .map((c) => c.text)
    .join(" "),
);
const fullDef = rec.claims
  .filter((c) => c.role === "define")
  .map((c) => c.text)
  .join(" ");
for (let i = 0; i < 12 && (await q(".question-card")); i++) {
  const info = await page.evaluate(() => ({
    prompt: document.querySelector(".question-card h2")?.textContent ?? "",
    ctx: document.querySelector(".question-card blockquote")?.textContent ?? "",
    opts: [...document.querySelectorAll(".option span")].map((e) => e.textContent ?? ""),
    recall: !!document.querySelector(".question-card textarea"),
  }));
  let pick = 0;
  if (info.recall) {
    await fill(
      ".question-card textarea",
      "Total entropy of an isolated system never decreases; it measures how energy is spread among accessible states, so spontaneous change has a direction.",
    );
    await clickText(".question-actions button", /Check/);
    await page.waitForSelector(".answer-feedback", { timeout: 45000 });
  } else {
    if (/best describes/.test(info.prompt))
      pick = info.opts.findIndex((o) => o.startsWith(def.slice(0, 40)));
    else if (/Which concept/.test(info.prompt)) pick = info.opts.indexOf(rec.title);
    else if (/True or false/.test(info.prompt))
      pick = fullDef.includes(info.ctx.replace(/^.*means:\s*/, "").slice(0, 40)) ? 0 : 1;
    else if (/Fill in the blank/.test(info.prompt))
      pick = info.opts.findIndex((o) => fullDef.includes(info.ctx.replace("_____", o)));
    if (pick < 0) pick = 0;
    await click(`.options .option:nth-child(${pick + 1})`);
    await sleep(120);
    await clickText(".question-actions button", /Check/);
    await page.waitForSelector(".answer-feedback");
  }
  await clickText(".question-actions button", /Next question|See results/);
  await sleep(300);
  if (await q(".review-result-grid")) break;
}
ok(await q(".review-result-grid"), "the retention quiz was completed");
const score = Number(/(\d+)%/.exec(await txt(".page-title h1"))![1]);
ok(score >= 60, `the delayed check was passed (${score}%)`);
await shot("11-review-result");
await nav(4, 1300);
const row2 = await page.evaluate(
  () =>
    [...document.querySelectorAll(".ladder-row")]
      .find((r) => /Second law/.test(r.textContent!))
      ?.querySelector(".ladder-steps")
      ?.getAttribute("aria-label") ?? "",
);
ok(/Retained/.test(row2), "after the delayed check the concept is Retained (" + row2 + ")");
await shot("12-progress-retained");
ok(
  !(await page.evaluate(() =>
    /local decrease/.test(document.querySelector(".ladder-card")?.textContent ?? ""),
  )),
  "the doubt was closed by the later correct answer (no longer listed as open)",
);
ok(
  /Journey complete/.test(await txt(".journey")) ||
    (await page.evaluate(
      () =>
        [...document.querySelectorAll(".journey li")].filter((l) => l.classList.contains("done"))
          .length,
    )) >= 5,
  "the guided journey marks the steps complete",
);
await shot("13-journey-complete");
console.log(R.join("\n"));
console.log(`\n${fails ? fails + " FAILED" : "ALL " + R.length + " CHECKS PASSED"}`);
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|401|404/.test(l))
    .slice(0, 4)
    .join(" | ") || "clean",
);
await browser.close();
process.exit(fails ? 1 : 0);
