import { launch, sleep, openApp, SHOTS } from "./browser.mjs";
const WHICH = (process.argv[2] || "desk,hd,phone,setting").split(",");
const R = [];
const ok = (c, m) => R.push((c ? "PASS " : "FAIL ") + m);
const run = async (w, h, name, settings, fn) => {
  if (!WHICH.includes(name)) return;
  const { browser, page, logs } = await launch(w, h);
  await page.evaluateOnNewDocument((s) => {
    if (!sessionStorage.getItem("i")) {
      sessionStorage.setItem("i", "1");
      localStorage.setItem("kyro_settings_v1", JSON.stringify(s));
      localStorage.setItem("kyro_ask_hint_v1", "1");
    }
  }, settings);
  await openApp(page);
  await page.evaluate(() => document.querySelectorAll("nav button")[1]?.click());
  await page.waitForSelector(".classroom-page");
  await sleep(1500);
  await fn(page, name, w, h);
  const bad = logs.filter((l) => !/ERR_NAME|401|404/.test(l));
  if (bad.length) R.push("  console: " + bad.slice(0, 2).join(" | "));
  await browser.close();
};
const q = (p, s) => p.evaluate((s) => !!document.querySelector(s), s);
const enlarge = (p) => p.evaluate(() => document.querySelector(".enlarge-btn").click());
const geo = (p) =>
  p.evaluate(() => {
    const pg = document.querySelector(".classroom-page").getBoundingClientRect();
    const st = document.querySelector(".classroom-stage").getBoundingClientRect();
    const bar = document.querySelector("[data-ask-bar]").getBoundingClientRect();
    const cv = document.querySelector(".scene canvas")?.getBoundingClientRect();
    const hit = document.elementFromPoint(40, Math.round(innerHeight / 2));
    return {
      pg: [pg.left, pg.top, pg.width, pg.height],
      stage: [st.width, st.height],
      bar: [bar.top, bar.bottom],
      canvas: cv ? [cv.width, cv.height] : null,
      vw: innerWidth,
      vh: innerHeight,
      sidebarCovered: !!hit?.closest(".classroom-page"),
      strip:
        !!document.querySelector(".concept-strip") &&
        getComputedStyle(document.querySelector(".concept-strip")).display !== "none",
    };
  });

await run(1440, 900, "desk", { popupQuestions: true }, async (p, n, w, h) => {
  const before = await geo(p);
  await enlarge(p);
  await sleep(2500);
  const g = await geo(p);
  ok(
    g.pg[0] === 0 && g.pg[1] === 0 && g.pg[2] === w && g.pg[3] === h,
    `${n}: enlarged class covers the whole window (${g.pg.join("×")})`,
  );
  ok(g.sidebarCovered, `${n}: sidebar is covered (the class really fills the screen)`);
  ok(
    g.stage[1] > before.stage[1] + 40 && g.stage[0] > before.stage[0] + 300,
    `${n}: stage grew ${Math.round(before.stage[0])}×${Math.round(before.stage[1])} → ${Math.round(g.stage[0])}×${Math.round(g.stage[1])}`,
  );
  ok(
    g.canvas && Math.abs(g.canvas[0] - g.stage[0]) < 4 && g.canvas[1] > 400,
    `${n}: the 3D canvas resized with it (${Math.round(g.canvas?.[0])}×${Math.round(g.canvas?.[1])})`,
  );
  ok(
    g.bar[1] <= h + 1 && g.bar[0] > h * 0.7,
    `${n}: doubt bar docked at the bottom, fully visible (${Math.round(g.bar[0])}–${Math.round(g.bar[1])} of ${h})`,
  );
  ok(!g.strip, `${n}: concept strip hidden to give the class the room`);
  ok(
    await q(p, ".question-popup"),
    `${n}: the question pop-up still appears over the enlarged class`,
  );
  const pop = await p.evaluate(() => {
    const r = document.querySelector(".question-popup-card").getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
  });
  ok(pop, `${n}: …and fits on screen`);
  await p.screenshot({ path: `${SHOTS}/en-desk-popup.png` });
  await p.evaluate(() => document.querySelectorAll(".question-popup footer button")[0].click());
  await sleep(400);
  ok(
    await q(p, ".focus-answer-pill"),
    `${n}: after 'Answer later' a pulsing 'Your turn' pill remains (side panel is hidden while enlarged)`,
  );
  await p.evaluate(() => document.querySelector(".focus-answer-pill").click());
  await sleep(500);
  ok(
    (await q(p, ".focus-panel")) &&
      (await p.evaluate(() => {
        const a = document.querySelector(".class-transcript .transcript-response");
        return !!a && a.getBoundingClientRect().bottom <= innerHeight;
      })),
    `${n}: the pill opens the side panel with the answer box`,
  );
  await p.screenshot({ path: `${SHOTS}/en-desk-panel.png` });
  await p.evaluate(() =>
    [...document.querySelectorAll(".scene-top button")]
      .find((b) => /Transcript/.test(b.textContent))
      .click(),
  );
  await sleep(300);
  ok(!(await q(p, ".focus-panel")), `${n}: Transcript button hides the panel again`);
  // doubt bar works while enlarged
  await p.evaluate(() => document.querySelector(".ask-chips button:nth-child(1)").click());
  await sleep(200);
  ok(
    (await p.evaluate(() => document.querySelector(".ask-field textarea").value)).length > 5,
    `${n}: doubt chips and typing work inside the enlarged view`,
  );
  await p.screenshot({ path: `${SHOTS}/en-desk.png` });
  // keyboard: F toggles (not while typing), Esc exits
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press("f");
  await sleep(400);
  ok(!(await q(p, ".is-focus")), `${n}: F leaves the enlarged view`);
  await p.keyboard.press("f");
  await sleep(400);
  ok(await q(p, ".is-focus"), `${n}: F enters it again`);
  await p.click(".ask-field textarea");
  await p.keyboard.press("f");
  await sleep(200);
  ok(
    (await q(p, ".is-focus")) &&
      (await p.evaluate(() => document.querySelector(".ask-field textarea").value)).endsWith("f"),
    `${n}: typing the letter f in the doubt box does NOT toggle the view`,
  );
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press("Escape");
  await sleep(400);
  ok(!(await q(p, ".is-focus")), `${n}: Esc leaves the enlarged view`);
  // fullscreen button (browser fullscreen may be unavailable in headless: must not break anything)
  await enlarge(p);
  await sleep(500);
  await p.evaluate(() =>
    [...document.querySelectorAll(".scene-top button")]
      .find((b) => /Full screen/.test(b.textContent))
      .click(),
  );
  await sleep(600);
  ok(
    await q(p, ".is-focus"),
    `${n}: 'Full screen' button is safe (browser fullscreen ${await p.evaluate(() => (document.fullscreenElement ? "entered" : "unavailable here"))})`,
  );
  // leaving the classroom resets
  await p.evaluate(() => document.querySelectorAll("nav button")[0]?.click());
  await sleep(500);
  await p.evaluate(() => document.querySelectorAll("nav button")[1]?.click());
  await sleep(900);
  ok(!(await q(p, ".is-focus")), `${n}: going away and coming back starts normal`);
});
await run(1920, 1080, "hd", { popupQuestions: false }, async (p, n, w, h) => {
  await enlarge(p);
  await sleep(3500);
  const g = await geo(p);
  ok(
    g.stage[0] > 1500 && g.bar[1] <= h + 1,
    `${n}: 1920×1080 stage ${Math.round(g.stage[0])}×${Math.round(g.stage[1])}, bar ${Math.round(g.bar[0])}–${Math.round(g.bar[1])}`,
  );
  await p.screenshot({ path: `${SHOTS}/en-hd.png` });
});
await run(390, 844, "phone", { popupQuestions: true }, async (p, n, w, h) => {
  await enlarge(p);
  await sleep(2500);
  const g = await geo(p);
  ok(
    g.pg[2] === w && g.pg[3] === h && g.bar[1] <= h + 1 && g.stage[1] > 250,
    `${n}: phone: fills the screen, doubt bar visible (${Math.round(g.bar[0])}–${Math.round(g.bar[1])} of ${h}), stage ${Math.round(g.stage[0])}×${Math.round(g.stage[1])}`,
  );
  ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    `${n}: no sideways scroll`,
  );
  await p.screenshot({ path: `${SHOTS}/en-phone.png` });
});
await run(1440, 900, "setting", { startEnlarged: true, popupQuestions: false }, async (p, n) => {
  ok(await q(p, ".is-focus"), `${n}: 'Open classes enlarged' setting starts the class enlarged`);
});
console.log(R.join("\n"));
