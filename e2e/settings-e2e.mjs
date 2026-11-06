import { launch, sleep, openApp, waitScene, SHOTS } from "./browser.mjs";
const { browser, page, logs } = await launch(1440, 1000);
await page.evaluateOnNewDocument(() => {
  if (!sessionStorage.getItem("seed")) {
    sessionStorage.setItem("seed", "1");
    localStorage.setItem(
      "kyro_progress_v1",
      JSON.stringify({
        mastery: { "thermodynamics:second-law": 62 },
        attempts: [
          { key: "thermodynamics:second-law", kind: "checkpoint", score: 62, at: Date.now() },
        ],
        srs: {},
        points: 12,
      }),
    );
  }
});
await openApp(page);
const R = [];
const ok = (c, m) => R.push((c ? "PASS " : "FAIL ") + m);
const nav = async (i, w = 700) => {
  await page.evaluate((i) => document.querySelectorAll("nav button")[i]?.click(), i);
  await sleep(w);
};
const S = () => page.evaluate(() => JSON.parse(localStorage.getItem("kyro_settings_v1") || "{}"));
const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
const clickRadio = (label, text) =>
  page.evaluate(
    (label, text) => {
      const g = document.querySelector(`[role=radiogroup][aria-label="${label}"]`);
      [...g.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(text))?.click();
    },
    label,
    text,
  );
const toggle = (label) =>
  page.evaluate(
    (l) => document.querySelector(`button[role=switch][aria-label="${l}"]`)?.click(),
    label,
  );
await nav(5, 1200);
// thumbnails + status
const imgs = await page.evaluate(() =>
  [...document.querySelectorAll(".room-thumb img")].map((i) => i.naturalWidth),
);
ok(
  imgs.length === 3 && imgs.every((w) => w > 100),
  "all 3 classroom thumbnails load (" + imgs.join(",") + " px wide)",
);
await sleep(600);
ok(
  /Not set up|Connected/.test(
    await page.evaluate(() => document.querySelector(".ai-chip")?.textContent),
  ),
  "AI status chip: " + (await page.evaluate(() => document.querySelector(".ai-chip")?.textContent)),
);
// theme
await clickRadio("Theme", "Dark");
await sleep(200);
ok((await isDark()) && (await S()).theme === "dark", "Dark theme applies instantly and is saved");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("nav button");
await sleep(600);
ok(await isDark(), "…and survives a reload");
await nav(5);
await clickRadio("Theme", "Light");
await sleep(200);
ok(!(await isDark()), "Light theme removes dark mode");
await clickRadio("Theme", "System");
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await sleep(400);
ok(await isDark(), "System follows the OS (OS=dark -> dark)");
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await sleep(400);
ok(!(await isDark()), "…and flips back live when the OS changes to light");
// classroom choice
const teacher = async () => {
  await nav(1, 500);
  await page.waitForSelector(".classroom-page");
  await sleep(1500);
  return page.evaluate(
    () =>
      document.querySelector(
        ".transcript-item strong, .transcript-list strong, .speaker-card h3, .speaker-card strong",
      )?.textContent ??
      document
        .querySelector(".classroom-page")
        .textContent.match(/Dr Rao|Prof\. Meera|Prof\. Kabir/)?.[0],
  );
};
ok((await teacher()) === "Dr Rao", "Automatic: Thermodynamics -> Green Smart Board Hall (Dr Rao)");
await nav(5);
await page.evaluate(() =>
  [...document.querySelectorAll(".room-choice")]
    .find((b) => /Seminar Studio/.test(b.textContent))
    .click(),
);
await sleep(300);
ok(
  (await S()).room === "studio" && (await teacher()) === "Prof. Kabir",
  "choosing 'Seminar Studio' in Settings changes the classroom (Prof. Kabir)",
);
await page.waitForFunction(
  () =>
    document.querySelector(".scene canvas") && !document.querySelector(".scene .scene-fallback"),
  { timeout: 90000 },
);
await sleep(2500);
ok(
  !(await page.evaluate(() =>
    /Dr Rao.*Prof\. Meera.*Prof\. Kabir/s.test(
      document.querySelector(".classroom-toolbar, .classroom-page")?.querySelector(".room-picker")
        ?.textContent ?? "",
    ),
  )) && !(await page.evaluate(() => !!document.querySelector(".room-picker"))),
  "the classroom picker is gone from the front of the classroom",
);
// toolbar quick controls
await page.evaluate(() =>
  document.querySelector('button[aria-label="Narrate lessons aloud"]')?.click(),
);
await sleep(200);
ok((await S()).voiceOn === true, "toolbar speaker button toggles narration (saved in settings)");
await page.evaluate(() =>
  document.querySelector('button[aria-label="Narrate lessons aloud"]')?.click(),
);
await sleep(200);
const sp = await page.evaluate(
  () =>
    [...document.querySelectorAll(".transport button")].find((b) => /×$/.test(b.textContent))
      ?.textContent,
);
await page.evaluate(() =>
  [...document.querySelectorAll(".transport button")]
    .find((b) => /×$/.test(b.textContent))
    ?.click(),
);
await sleep(200);
ok((await S()).speed === 1.5 && sp === "1×", "speed button cycles 1× -> 1.5× and is saved");
// transcript toggle
ok(
  await page.evaluate(() => !!document.querySelector(".transcript-list")),
  "transcript visible by default",
);
await nav(5);
await toggle("Show class transcript");
await nav(1, 800);
ok(
  !(await page.evaluate(() => !!document.querySelector(".transcript-list"))),
  "turning transcript off hides it (answer box stays available)",
);
ok(
  await page.evaluate(() => !!document.querySelector(".question-popup, .transcript-response")),
  "…the learner's question is still reachable",
);
await nav(5);
await toggle("Show class transcript");
// graphics Low + reduced motion: scene still renders, no errors
await clickRadio("Graphics", "Low");
await clickRadio("Animations", "Reduce");
await nav(1, 500);
await page.waitForFunction(
  () =>
    document.querySelector(".scene canvas") && !document.querySelector(".scene .scene-fallback"),
  { timeout: 90000 },
);
await sleep(2500);
ok(
  (await S()).graphics === "low" &&
    (await S()).motion === "on" &&
    (await page.evaluate(() => !!document.querySelector(".scene canvas"))),
  "Low graphics + reduced motion: the 3D scene still renders",
);
await page.screenshot({
  path: `${SHOTS}/e-low-reduced.png`,
  clip: { x: 264, y: 138, width: 744, height: 552 },
});
// language: Hindi UI
await nav(5);
await page.select(".setting-select", "hi");
await sleep(1200);
const labels = await page.evaluate(() =>
  [...document.querySelectorAll("nav button")].map((b) => b.textContent.trim()).join("|"),
);
ok(/सेटिंग्स/.test(labels) && /समीक्षा/.test(labels), "Hindi UI: " + labels);
ok(
  /सेटिंग्स/.test(
    await page.evaluate(() => document.querySelector(".settings-page h1")?.textContent),
  ) && /थीम/.test(await page.evaluate(() => document.querySelector(".settings-card")?.textContent)),
  "Settings page itself is in Hindi",
);
await nav(2, 900);
ok(
  /समीक्षा और स्मरण/.test(
    await page.evaluate(() => document.querySelector(".review-page h1")?.textContent),
  ),
  "Review page in Hindi: " +
    (await page.evaluate(() => document.querySelector(".review-page h1")?.textContent)),
);
await nav(4, 900);
ok(
  /रिपोर्ट कार्ड|कुल निपुणता/.test(
    await page.evaluate(() => document.querySelector(".report-page")?.textContent),
  ),
  "Report card in Hindi",
);
await nav(5);
await page.select(".setting-select", "en");
await sleep(600);
// export
await page.evaluate(() => {
  window.__blobs = [];
  const o = URL.createObjectURL;
  URL.createObjectURL = (b) => {
    window.__blobs.push(b);
    return o(b);
  };
});
await page.evaluate(() =>
  [...document.querySelectorAll(".setting-btn")]
    .find((b) => /Download my progress/.test(b.textContent))
    .click(),
);
await sleep(300);
const exported = await page.evaluate(async () =>
  window.__blobs[0] ? await window.__blobs[0].text() : "",
);
const ex = exported ? JSON.parse(exported) : {};
ok(
  ex.points === 12 &&
    ex.mastery?.["thermodynamics:second-law"] === 62 &&
    ex.reviewSchedule &&
    ex.settings,
  "export file contains points, mastery, review schedule and settings",
);
// reset progress (confirm flow)
await page.evaluate(() =>
  [...document.querySelectorAll(".setting-btn")]
    .find((b) => /Reset progress/.test(b.textContent))
    .click(),
);
await sleep(200);
ok(
  await page.evaluate(() => !!document.querySelector("[role=alertdialog]")),
  "destructive actions ask for confirmation first",
);
ok(
  JSON.parse(await page.evaluate(() => localStorage.getItem("kyro_progress_v1"))).points === 12,
  "…nothing is deleted before you confirm",
);
await page.evaluate(() =>
  [...document.querySelectorAll("[role=alertdialog] button")]
    .find((b) => /Yes/.test(b.textContent))
    .click(),
);
await sleep(500);
const after = JSON.parse(await page.evaluate(() => localStorage.getItem("kyro_progress_v1")));
ok(after.points === 0 && Object.keys(after.mastery).length === 0, "confirming resets progress");
// reset settings
await page.evaluate(() =>
  [...document.querySelectorAll(".setting-btn")]
    .find((b) => /Reset settings/.test(b.textContent))
    .click(),
);
await sleep(150);
await page.evaluate(() =>
  [...document.querySelectorAll("[role=alertdialog] button")]
    .find((b) => /Yes/.test(b.textContent))
    .click(),
);
await sleep(400);
const st = await S();
ok(
  st.theme === "system" && st.room === "auto" && st.graphics === "auto" && st.motion === "system",
  "reset settings restores defaults",
);
console.log(R.join("\n"));
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|401/.test(l))
    .slice(0, 4)
    .join(" | ") || "clean",
);
await browser.close();
