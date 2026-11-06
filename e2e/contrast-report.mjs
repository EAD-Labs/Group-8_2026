// Prints the distinct failing text/background colour pairs (axe color-contrast) so they can be fixed at the source.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { launch, sleep, openApp } from "./browser.mjs";
const require = createRequire(import.meta.url);
const axeSrc = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const theme = process.argv[2] || "light";
setTimeout(() => process.exit(2), 200000);
const { browser, page } = await launch(1440, 900);
await page.evaluateOnNewDocument((t) => {
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
        theme: t,
      }),
    );
    localStorage.setItem("kyro_ask_hint_v1", "1");
  }
}, theme);
await openApp(page);
const seen = new Map();
for (const [name, i] of [
  ["desk", 0],
  ["review", 2],
  ["library", 3],
  ["report", 4],
  ["settings", 5],
  ["classroom", 1],
]) {
  await page.evaluate((i) => document.querySelectorAll("nav button")[i]?.click(), i);
  await sleep(name === "classroom" ? 2200 : 900);
  await page.evaluate(axeSrc);
  const rows = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: ["color-contrast"],
      resultTypes: ["violations"],
    });
    return r.violations.flatMap((v) =>
      v.nodes.map((n) => {
        const d = n.any[0]?.data ?? {};
        return {
          fg: d.fgColor,
          bg: d.bgColor,
          ratio: d.contrastRatio,
          size: d.fontSize,
          text: (n.html.match(/>([^<]{3,40})</) ?? [])[1] ?? "",
          cls: (n.html.match(/class="([^"]+)"/) ?? [])[1] ?? n.target.join(" ").slice(0, 50),
        };
      }),
    );
  });
  for (const r of rows) {
    const k = `${r.fg} on ${r.bg} (${r.ratio}, ${r.size})`;
    if (!seen.has(k)) seen.set(k, { n: 0, ex: [] });
    const e = seen.get(k);
    e.n++;
    if (e.ex.length < 3) e.ex.push(`${name}:${r.cls.slice(0, 30)}|${r.text}`);
  }
}
for (const [k, v] of [...seen].sort((a, b) => b[1].n - a[1].n))
  console.log(String(v.n).padStart(3), k, "→", v.ex.join(" ; "));
await browser.close();
