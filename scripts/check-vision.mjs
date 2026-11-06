// Checks that the AI page reader works with YOUR key before you upload real notes.
//   1) start the app:   npm run dev      (with ANTHROPIC_API_KEY or LOVABLE_API_KEY set)
//   2) in another terminal:   npm run check:vision
// Optional: BASE_URL=http://localhost:5173 npm run check:vision -- path/to/your-page.jpg
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.env.BASE_URL || "http://localhost:5173";
const file = process.argv[2] || fileURLToPath(new URL("./sample-page.jpg", import.meta.url));
const bytes = readFileSync(file);
const mime = /\.png$/i.test(file)
  ? "image/png"
  : /\.webp$/i.test(file)
    ? "image/webp"
    : "image/jpeg";
const image = `data:${mime};base64,${bytes.toString("base64")}`;

let res;
try {
  res = await fetch(`${base}/api/read-page`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image, ref: "Check page", pageText: "" }),
  });
} catch {
  console.error(`✗ Could not reach ${base}. Start the app first with:  npm run dev`);
  process.exit(1);
}
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`✗ HTTP ${res.status}: ${data.message ?? "unknown error"}`);
  if (res.status === 401)
    console.error(
      "  No AI key is set. Start the app with ANTHROPIC_API_KEY=... (or LOVABLE_API_KEY=...) in the environment.",
    );
  if (res.status === 402) console.error("  The key was rejected or is out of credits.");
  if (res.status === 422)
    console.error(
      "  The model refused the image. If you use the Lovable gateway, set VISION_MODEL to a vision-capable model.",
    );
  process.exit(1);
}
console.log("— transcription —\n" + (data.text || "(empty)"));
console.log(
  "\n— figures —\n" +
    (data.figures?.length ? data.figures.map((f, i) => `${i + 1}. ${f}`).join("\n") : "(none)"),
);
console.log(`\nhandwritten: ${data.handwritten}`);
if (file.endsWith("sample-page.jpg")) {
  const all = `${data.text} ${(data.figures ?? []).join(" ")}`.toLowerCase();
  const textOk = /hot/.test(all) && /cold/.test(all);
  const figOk = (data.figures ?? []).some((f) => /hot/i.test(f) && /cold/i.test(f));
  console.log(`\n${textOk ? "✓" : "✗"} read the printed text (HOT / COLD)`);
  console.log(`${figOk ? "✓" : "✗"} described the diagram (two boxes joined by an arrow)`);
  process.exit(textOk && figOk ? 0 : 1);
}
