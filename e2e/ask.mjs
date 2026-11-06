import { launch, sleep, openApp, SHOTS } from "./browser.mjs";
const sizes = [
  [1440, 900, "desk"],
  [1366, 768, "laptop"],
  [1280, 650, "short"],
  [390, 844, "phone"],
];
const R = [];
const ok = (c, m) => R.push((c ? "PASS " : "FAIL ") + m);
for (const [w, h, name] of sizes) {
  const { browser, page, logs } = await launch(w, h);
  await page.evaluateOnNewDocument(() =>
    localStorage.setItem(
      "kyro_settings_v1",
      JSON.stringify({ handsFree: false, lessonDepth: "brief", autoPlay: false, voiceOn: false, popupQuestions: false }),
    ),
  );
  await openApp(page);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("nav button")];
    b[1]?.click();
  });
  await page.waitForSelector(".classroom-page");
  await sleep(1800);
  const box = await page.evaluate(() => {
    const st = document.querySelector(".classroom-stage, .class-transcript");
    const stageBottom = Math.max(
      ...[...document.querySelectorAll(".classroom-stage,.class-transcript")].map(
        (e) => e.getBoundingClientRect().bottom,
      ),
    );
    const r = document.querySelector("[data-ask-bar]").getBoundingClientRect();
    const c = document.querySelector(".ask-coach")?.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      h: r.height,
      coachTop: c?.top,
      coachBottom: c?.bottom,
      stageBottom,
      vh: innerHeight,
      scrolled: scrollY + (document.querySelector(".app-content")?.scrollTop ?? 0),
    };
  });
  ok(
    box.bottom <= box.vh + 1 && box.top >= 0,
    `${name} ${w}x${h}: ask bar fully on screen without scrolling (bar ${Math.round(box.top)}–${Math.round(box.bottom)} of ${box.vh})`,
  );
  const inline = name === "short" || name === "phone";
  ok(box.coachTop === undefined, `${name}: the doubt bar is clean — no tip bubble covering the class`);
  await page.screenshot({ path: `${SHOTS}/ask-${name}.png` });
  if (name === "desk") {
    ok(
      !(await page.evaluate(() => !!document.querySelector("[data-ask-bar].attn, [data-ask-bar].attn-first"))),
      "the doubt bar does not pulse for attention (a calm, uncluttered classroom)",
    );
    // chips
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll(".ask-chips button")].map((b) => b.textContent),
    );
    ok(chips.length === 3, "3 quick-question chips: " + chips.join(" | "));
    await page.evaluate(() => document.querySelector(".ask-chips button:nth-child(2)").click());
    await sleep(200);
    // The chips stay on screen while there is text. Unmounting them shrank the doubt bar and
    // resized the classroom canvas mid-keystroke; reserving an empty row left a gap in the bar.
    ok(
      (await page.evaluate(() => document.querySelector(".ask-field textarea").value)) === chips[1],
      "tapping a chip fills the question box",
    );
    ok(
      await page.evaluate(() => {
        const bar = () => document.querySelector("[data-ask-bar]").getBoundingClientRect().height;
        const ta = document.querySelector(".ask-field textarea");
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        const withText = bar();
        set.call(ta, "");
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        const empty = bar();
        set.call(ta, "x");
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        return Math.abs(withText - empty) < 1;
      }),
      "the doubt bar keeps its height whether or not there is text (the classroom does not jump while typing)",
    );
    ok(
      await page.evaluate(
        () => !document.querySelector(".ask-field button[aria-label='Send question']")?.disabled,
      ),
      "send button is enabled once there is text",
    );
    await page.screenshot({ path: `${SHOTS}/ask-filled.png` });
    // sticky: scroll the page, bar stays reachable
    await page.evaluate(() => {
      document.querySelector(".app-content")?.scrollTo(0, 400);
      window.scrollTo(0, 400);
    });
    await sleep(300);
    const b2 = await page.evaluate(() => {
      const r = document.querySelector("[data-ask-bar]").getBoundingClientRect();
      return r.bottom <= innerHeight + 1 && r.top >= 0;
    });
    ok(b2, "bar stays on screen even after scrolling");
  }
  if (name === "phone")
    ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
      "phone: no sideways scrolling",
    );
  console.log(
    logs
      .filter((l) => !/ERR_NAME|401|404/.test(l))
      .slice(0, 2)
      .join(" | "),
  );
  await browser.close();
}
console.log(R.join("\n"));
