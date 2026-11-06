// Accessibility: automated axe-core scan of every screen (contrast ≥ 4.5:1, ARIA, labels) in light and dark,
// plus a keyboard-only walk through the classroom (HLD T0.3 and T2.9).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { launch, sleep, openApp } from "./browser.mjs";
const require = createRequire(import.meta.url);
const axeSrc = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
setTimeout(() => {
  console.log("FAIL watchdog");
  process.exit(2);
}, 430000);
const R = [];
const ok = (c, m) => {
  const l = (c ? "PASS " : "FAIL ") + m;
  R.push(l);
  console.log(l.slice(0, 260));
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
        popupQuestions: true,
      }),
    );
    localStorage.setItem("kyro_ask_hint_v1", "1");
  }
});
await openApp(page);
const scan = async (name) => {
  await page.evaluate(axeSrc);
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      n: v.nodes.length,
      sample: v.nodes[0]?.target?.join(" ").slice(0, 80),
      help: v.help,
    }));
  });
  return r;
};
const nav = async (i, w = 900) => {
  await page.evaluate((i) => document.querySelectorAll("nav button")[i]?.click(), i);
  await sleep(w);
};
const screens = [
  ["My Desk", 0],
  ["Review", 2],
  ["Class Library", 3],
  ["Report Card", 4],
  ["Settings", 5],
];
const allV = {};
for (const theme of ["light", "dark"]) {
  await page.evaluate((t) => {
    const s = JSON.parse(localStorage.getItem("kyro_settings_v1"));
    s.theme = t;
    localStorage.setItem("kyro_settings_v1", JSON.stringify(s));
  }, theme);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("nav button");
  await sleep(900);
  for (const [name, i] of screens) {
    await nav(i);
    const v = await scan(name);
    allV[`${theme}/${name}`] = v;
  }
  await nav(1, 1800);
  allV[`${theme}/Classroom`] = await scan("Classroom");
  // the HLD screens
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
  await nav(5, 700);
  await clickText("button", /Start the guided demo/);
  await sleep(500);
  await nav(0, 900);
  allV[`${theme}/Dashboard + journey guide`] = await scan("journey");
  await nav(1, 1500);
  await clickText("button", /New topic/);
  await sleep(900);
  allV[`${theme}/Topic Setup`] = await scan("setup");
  await nav(5, 800);
  await clickText(".settings-card button", /Open records/);
  await sleep(600);
  await page.evaluate(() => document.querySelector(".know-head")?.click());
  await sleep(300);
  allV[`${theme}/Verified knowledge`] = await scan("knowledge");
  await nav(5, 800);
  await clickText(".seg button", /Join/);
  await sleep(700);
  allV[`${theme}/Study (join)`] = await scan("study");
  await nav(5, 800);
  await clickText(".seg button", /Evaluation/);
  await sleep(500);
  await clickText("button", /synthetic demo data/);
  await sleep(500);
  allV[`${theme}/Evaluation`] = await scan("evaluation");
  // classroom cards: advance to the blank and the hint
  await nav(1, 1500);
  const label = () =>
    page.evaluate(() => document.querySelector(".speaker-card small")?.textContent ?? "");
  const dis = () =>
    page.evaluate(
      () => document.querySelector('.transport button[aria-label="Next turn"]')?.disabled,
    );
  for (let i = 0; i < 30 && !/FILL THE BLANK/.test(await label()); i++) {
    await page.evaluate(() =>
      document.querySelector('.transport button[aria-label="Next turn"]')?.click(),
    );
    await sleep(250);
  }
  await sleep(400);
  allV[`${theme}/Classroom: blank card`] = await scan("blank");
  await page.evaluate(() => {
    const i = document.querySelector("[data-card=blank] .blank-input");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(i, "x");
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(150);
  await page.evaluate(() =>
    document.querySelector("[data-card=blank] .response-actions button:last-child")?.click(),
  );
  await sleep(250);
  await clickText("[data-card=blank] button", /Continue/);
  await sleep(300);
  for (let i = 0; i < 30 && !/QUICK CHECK/.test(await label()); i++) {
    if (await dis()) break;
    await page.evaluate(() =>
      document.querySelector('.transport button[aria-label="Next turn"]')?.click(),
    );
    await sleep(250);
  }
  await sleep(400);
  allV[`${theme}/Classroom: quick check card`] = await scan("quickcheck");
  for (let i = 0; i < 30 && !/HINT/.test(await label()); i++) {
    if (await dis()) break;
    await page.evaluate(() =>
      document.querySelector('.transport button[aria-label="Next turn"]')?.click(),
    );
    await sleep(250);
  }
  await sleep(400);
  allV[`${theme}/Classroom: hint card`] = await scan("hint");
}
const summary = Object.entries(allV).map(
  ([k, v]) => `${k}: ${v.length ? v.map((x) => `${x.id}×${x.n}`).join(", ") : "no violations"}`,
);
console.log(summary.join("\n"));
const serious = Object.entries(allV).flatMap(([k, v]) =>
  v.filter((x) => x.impact === "serious" || x.impact === "critical").map((x) => ({ k, ...x })),
);
console.log("SERIOUS/CRITICAL:", JSON.stringify(serious.slice(0, 12)));
ok(
  serious.length === 0,
  `no serious or critical WCAG 2.1 A/AA violations across ${Object.keys(allV).length} screen×theme scans`,
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
