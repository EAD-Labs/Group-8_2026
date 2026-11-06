import { DEFAULT_SETTINGS, sanitizeSettings, resolveQuality } from "../src/lib/settings";
import { EN } from "../src/lib/i18n/en";
import { englishToTranslate, setDynamicBundle, dictFor } from "../src/lib/i18n";
import { HI } from "../src/lib/i18n/hi";
import { MR } from "../src/lib/i18n/mr";
let f = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) f++;
};
ok(
  JSON.stringify(sanitizeSettings(undefined)) === JSON.stringify(DEFAULT_SETTINGS) &&
    JSON.stringify(sanitizeSettings("junk")) === JSON.stringify(DEFAULT_SETTINGS),
  "settings: missing/garbage storage -> defaults",
);
const s = sanitizeSettings({
  theme: "dark",
  room: "studio",
  speed: 2,
  reviewGoal: 20,
  popupQuestions: false,
  graphics: "low",
});
ok(
  s.theme === "dark" &&
    s.room === "studio" &&
    s.speed === 2 &&
    s.reviewGoal === 20 &&
    s.popupQuestions === false &&
    s.graphics === "low" &&
    s.voiceOn === true &&
    s.autoPlay === true &&
    s.lecturesPerDay === 2,
  "settings: valid values are kept, the rest default (read aloud and autoplay are on by default)",
);
// read aloud became on-by-default: a setting saved by an older build (no autoPlay field) had voiceOn:false only
// because that was the old default, so it is switched on once; a learner who then turns it off keeps it off
ok(
  sanitizeSettings({ voiceOn: false }).voiceOn === true,
  "settings saved by an older build: read aloud is switched on once",
);
ok(
  sanitizeSettings({ voiceOn: false, autoPlay: true }).voiceOn === false &&
    sanitizeSettings({ autoPlay: false }).autoPlay === false,
  "…after that, turning read aloud or autoplay off is remembered",
);
ok(
  sanitizeSettings({ lecturesPerDay: 9 }).lecturesPerDay === 2 &&
    sanitizeSettings({ lecturesPerDay: 3 }).lecturesPerDay === 3,
  "settings: lectures per day accepts 1–3 only",
);
const bad = sanitizeSettings({
  theme: "neon",
  room: "<script>",
  speed: 9,
  reviewGoal: 7,
  popupQuestions: "yes",
  graphics: 3,
  effects: null,
});
ok(
  bad.theme === "system" &&
    bad.room === "auto" &&
    bad.speed === 1 &&
    bad.reviewGoal === 10 &&
    bad.popupQuestions === true &&
    bad.graphics === "auto" &&
    bad.effects === true,
  "settings: tampered/invalid values fall back safely",
);
ok(
  sanitizeSettings({ startEnlarged: true }).startEnlarged === true &&
    sanitizeSettings({ startEnlarged: "yes" }).startEnlarged === false &&
    DEFAULT_SETTINGS.startEnlarged === false,
  "settings: startEnlarged is a boolean, off by default, junk ignored",
);
const dev = (o: object) =>
  Object.defineProperty(globalThis, "navigator", { value: o, configurable: true });
ok(
  resolveQuality("high") === "high" && resolveQuality("low") === "low",
  "graphics: an explicit choice always wins",
);
dev({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17)", hardwareConcurrency: 6 });
ok(resolveQuality("auto") === "low", "graphics auto: phones get Low");
dev({ userAgent: "Mozilla/5.0 (X11; Linux)", hardwareConcurrency: 2, deviceMemory: 8 });
ok(resolveQuality("auto") === "low", "graphics auto: 2-core machines get Low");
dev({ userAgent: "Mozilla/5.0 (X11; Linux)", hardwareConcurrency: 4, deviceMemory: 8 });
ok(resolveQuality("auto") === "medium", "graphics auto: ordinary laptops get Medium");
dev({ userAgent: "Mozilla/5.0 (Macintosh)", hardwareConcurrency: 12, deviceMemory: 8 });
ok(resolveQuality("auto") === "high", "graphics auto: powerful machines get High");
const ph = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");
for (const [name, D] of [
  ["Hindi", HI],
  ["Marathi", MR],
] as const) {
  const keys = Object.keys(EN);
  const missing = keys.filter((k) => !(k in D));
  const mism = keys.filter(
    (k) =>
      k in D && ph((D as Record<string, string>)[k]!) !== ph((EN as Record<string, string>)[k]!),
  );
  ok(
    missing.length === 0,
    `${name}: all ${keys.length} strings translated${missing.length ? " — missing " + missing.slice(0, 5) : ""}`,
  );
  ok(
    mism.length === 0,
    `${name}: every {placeholder} preserved${mism.length ? " — " + mism.slice(0, 5) : ""}`,
  );
}

// translated dictionaries top themselves up: only strings the cache lacks are re-translated
const all = Object.keys(EN);
ok(
  Object.keys(englishToTranslate()).length === all.length,
  "fresh language: every string needs translating",
);
ok(
  Object.keys(englishToTranslate("hi")).length === 0 &&
    Object.keys(englishToTranslate("mr")).length === 0,
  "Hindi/Marathi ship complete: nothing to translate",
);
ok(
  Object.keys(englishToTranslate("ta")).length === all.length,
  "an AI-translated language with no cache: everything to translate",
);
setDynamicBundle(
  "ta",
  Object.fromEntries(all.slice(0, 300).map((k) => [k, "ta:" + (EN as Record<string, string>)[k]])),
);
const left = englishToTranslate("ta");
ok(
  Object.keys(left).length > 0 && Object.keys(left).length < all.length - 100,
  `cached dictionary lacking new strings -> only those ${Object.keys(left).length} are requested`,
);
setDynamicBundle("ta", Object.fromEntries(Object.entries(left).map(([k, v]) => [k, "ta:" + v])));
ok(
  Object.keys(englishToTranslate("ta")).length === 0 &&
    Object.keys(dictFor("ta")).length === all.length,
  "the top-up is merged with (not replacing) the cached strings",
);
console.log(f ? `${f} FAILED` : "ALL PASSED");
process.exit(f ? 1 : 0);
