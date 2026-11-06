// Browser helper for the end-to-end tests. Set CHROME_PATH to use your own Chrome/Chromium;
// otherwise the bundled Linux build from @sparticuz/chromium is used.
import puppeteer from "puppeteer-core";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
export const BASE = process.env.BASE_URL || "http://127.0.0.1:8080/";
export const SHOTS = process.env.SHOTS || "e2e-shots";
export const TMP = tmpdir();
mkdirSync(SHOTS, { recursive: true }); // every script may write screenshots
async function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const chromium = (await import("@sparticuz/chromium")).default;
  return chromium.executablePath();
}
export async function launch(w = 1440, h = 900) {
  const browser = await puppeteer.launch({
    executablePath: await chromePath(),
    headless: process.env.CHROME_PATH ? true : "shell",
    defaultViewport: { width: w, height: h, deviceScaleFactor: 1 },
    args: [
      ...(process.env.CHROME_PATH ? [] : (await import("@sparticuz/chromium")).default.args),
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
      "--disable-web-security",
      ...(process.env.CHROME_EXTRA ? process.env.CHROME_EXTRA.split(" ") : []),
    ],
  });
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type()))
      logs.push(m.type() + ": " + m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => logs.push("PAGEERROR: " + String(e).slice(0, 300)));
  return { browser, page, logs };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clickText = async (page, sel, re) => {
  const ok = await page.evaluate(
    (sel, src) => {
      const r = new RegExp(src);
      const el = [...document.querySelectorAll(sel)].find((e) =>
        r.test(e.textContent || e.getAttribute("aria-label") || ""),
      );
      if (el) {
        el.click();
        return true;
      }
      return false;
    },
    sel,
    re.source,
  );
  return ok;
};
export async function openApp(page, url = BASE) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("nav button", { timeout: 90000 });
  await sleep(1200);
}
export async function openClassroom(page, waitMs = 9000) {
  await page.evaluate(() => document.querySelectorAll("nav button")[1]?.click());
  await page.waitForSelector(".classroom-page", { timeout: 20000 });
  await sleep(waitMs);
}
export async function waitScene(page, extra = 4000) {
  await page.waitForFunction(
    () =>
      document.querySelector(".scene canvas") && !document.querySelector(".scene .scene-fallback"),
    { timeout: 90000 },
  );
  await sleep(extra);
}
