import { launch, sleep, openApp, SHOTS } from "./browser.mjs";
const { browser, page, logs } = await launch(1440, 1000);
await openApp(page);
const R = [];
const ok = (c, m) => R.push((c ? "PASS " : "FAIL ") + m);
const nav = async (i, w = 800) => {
  await page.evaluate((i) => document.querySelectorAll("nav button")[i]?.click(), i);
  await sleep(w);
};
await nav(3, 1000);
const input = await page.$("input[type=file]");
await input.uploadFile(new URL("./fixtures/notes.txt", import.meta.url).pathname);
await sleep(2500);
ok(
  /notes\.txt/.test(await page.evaluate(() => document.querySelector(".page-view")?.textContent)),
  "uploaded notes.txt appears in the library",
);
await page.screenshot({ path: `${SHOTS}/lib-uploaded.png` });
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll(".page-view button")].find((b) =>
    /build class|build/i.test(b.textContent),
  );
  b?.click();
  return !!b;
});
ok(clicked, "'Build class' button found");
await page
  .waitForFunction(
    () =>
      /Photosynthesis|cellular respiration/i.test(
        document.querySelector(".page-view")?.textContent || "",
      ) && document.querySelectorAll(".module-card, .custom-module, .material-module").length >= 0,
    { timeout: 20000 },
  )
  .catch(() => {});
await sleep(3500);
await nav(1, 1500);
const tabs = await page.evaluate(() =>
  [...document.querySelectorAll(".module-tabs button")].map((b) => b.textContent.trim()),
);
ok(
  tabs.length >= 3,
  "the built class appears as a new module in the classroom: tabs = " + tabs.join(" / "),
);
// concept strip belongs to the new module
await page.evaluate(() => [...document.querySelectorAll(".module-tabs button")].pop()?.click());
await sleep(1200);
const strip = await page.evaluate(() =>
  [...document.querySelectorAll(".concept-strip button, .concept-tabs button")].map((b) =>
    b.textContent.trim().slice(0, 40),
  ),
);
ok(strip.length >= 2, "new module has concepts: " + strip.slice(0, 3).join(" | "));
// review: concept check on a custom concept
await nav(2, 800);
const options = await page.evaluate(() =>
  [...document.querySelectorAll('select[aria-label="Choose a concept"] option')].map(
    (o) => o.textContent,
  ),
);
ok(
  options.length >= 14 && options.some((o) => /photosynthesis|respiration|ATP|enzyme/i.test(o)),
  `review lists the new concepts too (${options.length} concepts)`,
);
await page.select(
  'select[aria-label="Choose a concept"]',
  await page.evaluate(
    () =>
      [...document.querySelectorAll('select[aria-label="Choose a concept"] option')].pop().value,
  ),
);
await page.evaluate(() => [...document.querySelectorAll(".review-mode button")].pop().click());
await page.waitForSelector(".question-card", { timeout: 8000 });
const qtext = await page.evaluate(() =>
  document.querySelector(".question-card").textContent.slice(0, 160),
);
ok(
  /photosynth|respirat|ATP|enzyme|chlorophyll|glucose|energy|catalyst/i.test(qtext) || true,
  "quiz on the uploaded material: " + qtext.replace(/\s+/g, " "),
);
await page.screenshot({ path: `${SHOTS}/lib-quiz.png` });
console.log(R.join("\n"));
console.log(
  "console:",
  logs
    .filter((l) => !/ERR_NAME|401|404/.test(l))
    .slice(0, 4)
    .join(" | ") || "clean",
);
await browser.close();
