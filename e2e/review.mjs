import { launch, sleep, openApp, SHOTS } from "./browser.mjs";
const theme = process.argv[2] || "light";
const { browser, page, logs } = await launch(1440, 1000);
await page.evaluateOnNewDocument((th) => {
  if (!sessionStorage.getItem("seeded")) {
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(
      "kyro_settings_v1",
      JSON.stringify({ handsFree: false, lessonDepth: "brief", autoPlay: false, voiceOn: false, theme: th, popupQuestions: true }),
    );
  }
}, theme);
await openApp(page);
const R = [];
const ok = (c, m) => R.push((c ? "PASS " : "FAIL ") + m);
const q = (s) => page.evaluate((s) => !!document.querySelector(s), s);
const txt = (s) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", s);
const nav = async (i, w = 900) => {
  await page.evaluate((i) => document.querySelectorAll("nav button")[i]?.click(), i);
  await sleep(w);
};
const navLabels = await page.evaluate(() =>
  [...document.querySelectorAll("nav button")].map((b) => b.textContent.trim()),
);
ok(
  navLabels.join("|") === "My Desk|Classroom|Review|Class Library|Report Card|Settings",
  "sidebar: " + navLabels.join(" · "),
);
// 1) empty report card
await nav(4);
await page.screenshot({ path: `${SHOTS}/rv-${theme}-report-empty.png`, fullPage: true });
ok(
  /—/.test(await txt(".report-stat.main strong")) &&
    /Nothing due/.test(await txt(".report-page")) &&
    /No activity yet/.test(await txt(".report-page")),
  "empty report card shows no invented numbers",
);
// 2) review home with nothing scheduled
await nav(2);
ok(
  /0/.test(await txt(".review-due strong")) && /Nothing is due|Nothing to review yet/.test(await txt(".review-due")),
  "review home: nothing due yet",
);
await page.screenshot({ path: `${SHOTS}/rv-${theme}-home.png` });
// 3) dashboard shortcut -> concept check
await nav(2);
await page.evaluate(() => {
  const art = [...document.querySelectorAll(".review-mode")].find((a) =>
    /Concept check/.test(a.textContent ?? ""),
  );
  art?.querySelector("button")?.click();
});
await sleep(600);
await page.waitForSelector(".question-card", { timeout: 8000 }); await page.evaluate(() => document.querySelector(".predict-card .chip")?.click()); await sleep(250);
ok(
  /Question 1 of [3-6]/.test(await txt(".review-meta")),
  "Review → Concept check starts a quiz on a concept: " + (await txt(".review-meta")).slice(0, 70),
);
await page.screenshot({ path: `${SHOTS}/rv-${theme}-question.png` });
// 4) answer everything (pick option 1 via keyboard, Enter to check, Enter to continue)
let kinds = [];
for (let i = 0; i < 12 && (await q(".question-card")); i++) {
  const isRecall = await q(".question-card textarea");
  kinds.push(isRecall ? "recall" : (await q(".options.two")) ? "tf" : "mcq");
  if (isRecall) {
    await page.type(
      ".question-card textarea",
      "Entropy measures how many ways energy can be spread among states, and total entropy of an isolated system never decreases.",
    );
    await page.evaluate(() =>
      [...document.querySelectorAll(".question-actions button")].pop().click(),
    );
    await page.waitForSelector(".answer-feedback", { timeout: 15000 });
  } else {
    await page.keyboard.press("1");
    await sleep(120);
    await page.keyboard.press("Enter");
    await page.waitForSelector(".answer-feedback", { timeout: 5000 });
  }
  if (i === 0) await page.screenshot({ path: `${SHOTS}/rv-${theme}-feedback.png` });
  await page.keyboard.press("Enter");
  await sleep(250);
  if (await q(".review-result-grid")) break;
}
ok(
  await q(".review-result-grid"),
  "finished the quiz and reached the results (types seen: " + kinds.join(",") + ")",
);
ok(
  /\d+% · \d of \d correct/.test(await txt(".page-title h1")),
  "result headline: " + (await txt(".page-title h1")),
);
await page.screenshot({ path: `${SHOTS}/rv-${theme}-result.png` });
const store = JSON.parse(await page.evaluate(() => localStorage.getItem("kyro_progress_v1")));
const k = Object.keys(store.srs)[0];
ok(
  k &&
    store.srs[k].due > Date.now() &&
    store.attempts.at(-1).kind === "retention" &&
    store.mastery[k] !== undefined,
  `progress saved: schedule for ${k}, mastery ${store.mastery[k]}, next review ${Math.round((store.srs[k].due - Date.now()) / 3600000)}h away`,
);
// 5) report card now has real data
await nav(4, 1200);
await page.screenshot({ path: `${SHOTS}/rv-${theme}-report.png`, fullPage: true });
const stats = await page.evaluate(() =>
  [...document.querySelectorAll(".report-stat strong")].map((e) => e.textContent),
);
ok(
  stats[0] !== "—" && stats[1] === "1" && stats[2] !== "—",
  "report card now shows real numbers: mastery " +
    stats[0] +
    ", streak " +
    stats[1] +
    ", retention " +
    stats[2] +
    ", points " +
    stats[3],
);
ok(
  (await q(".chart")) && (await q(".heat.l4")),
  "forecast chart and today's activity square are drawn",
);
// 6) time passes: make the schedule overdue -> review home shows it due
await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem("kyro_progress_v1"));
  for (const k in p.srs) p.srs[k].due = Date.now() - 2 * 86400000;
  localStorage.setItem("kyro_progress_v1", JSON.stringify(p));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("nav button");
await sleep(900);
await nav(2);
ok(
  /^1$/.test((await txt(".review-due strong")).trim()) &&
    /overdue/.test(await txt(".review-upcoming")),
  "two days later the concept is due: " +
    (await txt(".review-due span")) +
    " / " +
    (await txt(".review-upcoming li")).slice(0, 60),
);
await page.screenshot({ path: `${SHOTS}/rv-${theme}-due.png` });
await page.evaluate(() => document.querySelector(".review-hero-actions button")?.click());
await page.waitForSelector(".question-card"); await page.evaluate(() => document.querySelector(".predict-card .chip")?.click()); await sleep(250);
ok(/Question 1 of \d+/.test(await txt(".review-meta")), "'Start review' begins a due session");
console.log(R.join("\n"));
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|404|401/.test(l))
    .slice(0, 4)
    .join(" | ") || "clean",
);
await browser.close();
