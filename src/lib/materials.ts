// Reading a learner's own material (PDF, PowerPoint, Word, text/markdown) in the browser, and
// turning it into (a) searchable sections used to ground answers and (b) a class module.
//
// Previously uploads were only stored: nothing was read, so "grounded in your material" was not
// true. All parsing here is local — the file never has to leave the device just to be read.

import { STOP, stem, words } from "./assess";
import { getLang, langInfo, tr } from "./i18n";

export type Section = {
  title: string;
  text: string;
  ref: string;
  /** how the text was obtained: its text layer, the AI page reader, or offline OCR */
  via?: "text" | "ai" | "ocr";
};
export type Extracted = {
  sections: Section[];
  text: string;
  pages: number | null;
  format: "pdf" | "pptx" | "docx" | "text";
  /** non-fatal remark, e.g. "only the first 150 pages were read" */
  note?: string;
};
export type SourceDoc = { name: string; sections: Section[] };

/** An error whose message is safe and useful to show the learner. */
export class MaterialError extends Error {}

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_CHARS = 150_000;
const MAX_PDF_PAGES = 150;

// ------------------------------------------------------------------ XML text (docx / pptx)
const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const normalise = (s: string) =>
  s
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s+$/g, "")
    .replace(/^\s+/g, "");

function runText(paragraphXml: string, tag: "a:t" | "w:t"): string {
  const withBreaks = paragraphXml.replace(/<(?:a:br|w:br|w:tab)\b[^>]*\/>/g, `<${tag}> </${tag}>`);
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  let out = "";
  for (let m = re.exec(withBreaks); m; m = re.exec(withBreaks)) out += decodeEntities(m[1] ?? "");
  return normalise(out);
}

export type Para = { text: string; heading: boolean };

export function parseDocxXml(xml: string): Para[] {
  const out: Para[] = [];
  for (const m of xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const text = runText(p, "w:t");
    if (!text) continue;
    out.push({ text, heading: /<w:pStyle\s+w:val="(?:Heading\d|Title|Subtitle)"/i.test(p) });
  }
  return out;
}

export function parsePptxSlideXml(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<a:p[\s>][\s\S]*?<\/a:p>/g)) {
    const text = runText(m[0], "a:t");
    if (text) out.push(text);
  }
  return out;
}

// ------------------------------------------------------------------ sectioning
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const cleanTitle = (s: string) => clip(s.replace(/^[\s\d.)•\-–—·*#]+/, "").trim() || s.trim(), 80);

/** Group paragraphs into chunks of about `target` characters without splitting a paragraph. */
export function chunkParagraphs(paras: string[], target = 1200): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > target) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function sectionsFromParas(paras: Para[], label = "Part"): Section[] {
  const out: Section[] = [];
  if (paras.some((p) => p.heading)) {
    let title = "";
    let body: string[] = [];
    const flush = () => {
      const text = body.join("\n").trim();
      if (text || title)
        out.push({
          title: cleanTitle(title || `${label} ${out.length + 1}`),
          text: text || title,
          ref: `${label} ${out.length + 1}`,
        });
      body = [];
    };
    for (const p of paras) {
      if (p.heading) {
        if (title || body.length) flush();
        title = p.text;
      } else body.push(p.text);
    }
    if (title || body.length) flush();
    return out;
  }
  chunkParagraphs(paras.map((p) => p.text)).forEach((text, i) =>
    out.push({
      title: cleanTitle(text.split("\n")[0] ?? `${label} ${i + 1}`),
      text,
      ref: `${label} ${i + 1}`,
    }),
  );
  return out;
}

export function sectionsFromText(text: string): Section[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const paras: Para[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    const h = /^#{1,3}\s+(.*)$/.exec(l);
    paras.push(h ? { text: h[1] ?? l, heading: true } : { text: l, heading: false });
  }
  return sectionsFromParas(paras);
}

const finish = (
  sections: Section[],
  format: Extracted["format"],
  pages: number | null,
  note?: string,
): Extracted => {
  let total = 0;
  const kept: Section[] = [];
  let truncated = false;
  for (const s of sections) {
    if (!s.text.trim()) continue;
    if (total + s.text.length > MAX_TEXT_CHARS) {
      truncated = true;
      break;
    }
    total += s.text.length;
    kept.push(s);
  }
  if (!kept.length) throw new MaterialError(tr("mat.err.noText"));
  const notes = [note, truncated ? tr("mat.note.longFile") : undefined].filter(Boolean);
  return {
    sections: kept,
    text: kept.map((s) => `${s.ref} — ${s.title}\n${s.text}`).join("\n\n"),
    pages,
    format,
    ...(notes.length ? { note: notes.join(" ") } : {}),
  };
};

// ------------------------------------------------------------------ scans, handwriting & figures
// Real handwriting and diagrams need a vision model, so pages are rendered to images and sent to
// the AI page reader (server route /api/read-page). When it is not available, printed scans fall
// back to offline OCR (tesseract); handwriting and figures are then skipped and the learner is told.

export type VisionInput = { dataUrl: string; ref: string; pageText: string };
export type VisionResult = { text: string; figures: string[]; handwritten?: boolean };
/** Resolve null when the AI reader is not available at all; throw for a one-off page failure. */
export type VisionReader = (input: VisionInput) => Promise<VisionResult | null>;

/** The few canvas 2D calls we use, so tests can plug in a Node canvas. */
type Ctx2D = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  /** browser canvases have these; used to cut a page into halves and to boost contrast */
  translate?: (x: number, y: number) => void;
  filter?: string;
};
type CanvasLike = {
  width: number;
  height: number;
  getContext: (k: "2d") => Ctx2D;
  toDataURL: (mime: string, quality?: number) => string;
};
export type CanvasEnv = {
  createCanvas: (w: number, h: number) => CanvasLike;
  decodeImage: (
    bytes: Uint8Array,
    mime: string,
  ) => Promise<{ width: number; height: number; draw: (ctx: Ctx2D, w: number, h: number) => void }>;
};
export type OcrEngine = {
  recognize: (image: string) => Promise<{ text: string; confidence: number }>;
  terminate: () => Promise<void>;
};
export type ReadOptions = {
  vision?: VisionReader;
  /** defaults to the browser's canvas */
  env?: CanvasEnv;
  /** defaults to tesseract.js; pass `null` to turn offline OCR off */
  ocr?: (() => Promise<OcrEngine>) | null;
  onProgress?: (message: string) => void;
  maxVisionPages?: number;
};

const MAX_VISION_PAGES = 40;
const MAX_OCR_PAGES = 20;
const OCR_MIN_CONFIDENCE = 55;
const MAX_IMAGE_SIDE = 1568; // Claude downsizes anything larger anyway
const MAX_DATA_URL = 4_000_000;

const browserEnv: CanvasEnv = {
  createCanvas: (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c as unknown as CanvasLike;
  },
  decodeImage: async (bytes, mime) => {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    return {
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => (ctx as unknown as CanvasRenderingContext2D).drawImage(bmp, 0, 0, w, h),
    };
  },
};

const defaultOcr = async (): Promise<OcrEngine> => {
  const { createWorker } = await import("tesseract.js");
  const pack = langInfo(getLang()).tess;
  // English plus the lesson language's script (language data is downloaded on first use)
  const worker = await createWorker(pack === "eng" ? "eng" : `eng+${pack}`);
  return {
    recognize: async (img) => {
      const r = await worker.recognize(img);
      return { text: r.data.text, confidence: r.data.confidence };
    },
    terminate: async () => {
      await worker.terminate();
    },
  };
};

const linesOf = (t: string) => t.split("\n").map(normalise).filter(Boolean);

class PageReader {
  stats = { ai: 0, ocr: 0, unreadable: 0, capped: 0, figuresMissed: 0, failed: 0, ocrCapped: 0 };
  private visionOk: boolean | null = null;
  private visionUsed = 0;
  private ocrEngine: OcrEngine | null | undefined;
  constructor(readonly o: ReadOptions) {}

  get env(): CanvasEnv | null {
    return this.o.env ?? (typeof document !== "undefined" ? browserEnv : null);
  }
  progress(m: string) {
    this.o.onProgress?.(m);
  }
  /** `null` = unavailable (no key, offline, out of budget). */
  async askVision(input: VisionInput): Promise<VisionResult | null> {
    if (!this.o.vision || this.visionOk === false) return null;
    if (this.visionUsed >= (this.o.maxVisionPages ?? MAX_VISION_PAGES)) {
      this.stats.capped++;
      return null;
    }
    try {
      const r = await this.o.vision(input);
      if (!r) {
        this.visionOk = false;
        return null;
      }
      this.visionOk = true;
      this.visionUsed++;
      this.stats.ai++;
      return r;
    } catch {
      this.stats.failed++;
      return null;
    }
  }
  get visionAvailable() {
    return Boolean(this.o.vision) && this.visionOk !== false;
  }
  async ocr(dataUrl: string): Promise<{ text: string; confidence: number } | null> {
    if (this.o.ocr === null) return null;
    if (this.stats.ocr >= MAX_OCR_PAGES) {
      this.stats.ocrCapped++;
      return null;
    }
    try {
      this.ocrEngine ??= await (this.o.ocr ?? defaultOcr)();
      return await this.ocrEngine.recognize(dataUrl);
    } catch {
      this.ocrEngine = null;
      return null;
    }
  }
  async close() {
    try {
      await this.ocrEngine?.terminate();
    } catch {
      /* ignore */
    }
  }
  notes(): string[] {
    const s = this.stats;
    const out: string[] = [];
    if (s.ai) out.push(tr("mat.note.ai", { n: s.ai }));
    if (s.ocr) out.push(tr("mat.note.ocr", { n: s.ocr }));
    if (s.unreadable) out.push(tr("mat.note.unreadable", { n: s.unreadable }));
    if (s.figuresMissed) out.push(tr("mat.note.figuresMissed", { n: s.figuresMissed }));
    if (s.capped) out.push(tr("mat.note.capped", { n: this.o.maxVisionPages ?? MAX_VISION_PAGES }));
    if (s.failed) out.push(tr("mat.note.failed", { n: s.failed }));
    if (s.ocrCapped) out.push(tr("mat.note.ocrCapped", { n: MAX_OCR_PAGES }));
    return out;
  }
}

/** Draw into a canvas no larger than MAX_IMAGE_SIDE and encode as JPEG small enough to send. */
function encodeCanvas(canvas: CanvasLike): string {
  let q = 0.72;
  let url = canvas.toDataURL("image/jpeg", q);
  while (url.length > MAX_DATA_URL && q > 0.35) {
    q -= 0.15;
    url = canvas.toDataURL("image/jpeg", q);
  }
  return url;
}
function fit(w: number, h: number, max = MAX_IMAGE_SIDE) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
async function rasteriseBytes(
  env: CanvasEnv,
  bytes: Uint8Array,
  mime: string,
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  const img = await env.decodeImage(bytes, mime);
  const { w, h } = fit(img.width, img.height);
  const canvas = env.createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  boost(ctx);
  img.draw(ctx, w, h);
  return { dataUrl: encodeCanvas(canvas), w: img.width, h: img.height };
}

// ---- handwriting: a tall page is read as two overlapping halves, each at full resolution ----------
// A whole handwritten page squeezed into one ~1568 px image leaves small or dense handwriting too
// small to read. Two halves (top 58 %, bottom 58 %, overlapping) give the reader ~1.7× the detail.
const TILE_SHARE = 0.58;
const tall = (w: number, h: number) => h / w >= 1.15;
/** Contrast boost for photographed notes (pencil, lined paper, shadows). Ignored where unsupported. */
const boost = (ctx: Ctx2D) => {
  if ("filter" in ctx) ctx.filter = "grayscale(1) contrast(1.35)";
};
/** Two overlapping halves of a decoded image, as JPEG data URLs ([] if the image is not tall). */
async function imageTiles(env: CanvasEnv, bytes: Uint8Array, mime: string): Promise<string[]> {
  const img = await env.decodeImage(bytes, mime);
  if (!tall(img.width, img.height)) return [];
  const k = Math.min(MAX_IMAGE_SIDE / img.width, MAX_IMAGE_SIDE / (TILE_SHARE * img.height), 2.5);
  const W = Math.round(img.width * k),
    H = Math.round(img.height * k),
    th = Math.round(H * TILE_SHARE);
  const out: string[] = [];
  for (const y0 of [0, H - th]) {
    const c = env.createCanvas(W, th);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, th);
    if (typeof ctx.translate !== "function") return [];
    ctx.translate(0, -y0);
    boost(ctx);
    img.draw(ctx, W, H);
    out.push(encodeCanvas(c));
  }
  return out;
}
const lineKey = (l: string) =>
  l
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const similar = (a: string, b: string) => {
  const A = new Set(lineKey(a).split(" ").filter(Boolean)),
    B = new Set(lineKey(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return lineKey(a) === lineKey(b);
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / Math.max(A.size, B.size) >= 0.6;
};
/** Join the transcripts of two overlapping halves, dropping the lines both halves saw. */
export function mergeOverlap(top: string[], bottom: string[]): string[] {
  const max = Math.min(12, top.length, bottom.length);
  for (let k = max; k >= 1; k--) {
    const tail = top.slice(top.length - k),
      head = bottom.slice(0, k);
    if (tail.every((l, i) => similar(l, head[i]!))) return [...top, ...bottom.slice(k)];
  }
  // a line cut in two at the seam: keep the longer reading of it
  if (top.length && bottom.length && similar(top[top.length - 1]!, bottom[0]!))
    return [
      ...top.slice(0, -1),
      top[top.length - 1]!.length >= bottom[0]!.length ? top[top.length - 1]! : bottom[0]!,
      ...bottom.slice(1),
    ];
  return [...top, ...bottom];
}
/** Read a tall scanned page as two halves (needs the AI reader); null if that is not possible. */
async function readTiles(
  r: PageReader,
  a: { ref: string; pageText: string; tiles: string[] },
): Promise<{ lines: string[]; via: "ai" } | null> {
  if (a.tiles.length !== 2 || !r.visionAvailable) return null;
  const parts = [];
  for (const [i, dataUrl] of a.tiles.entries()) {
    const v = await r.askVision({
      dataUrl,
      ref: `${a.ref} (${i === 0 ? "top" : "bottom"} part of the page)`,
      pageText: a.pageText,
    });
    if (!v) return null;
    parts.push(v);
  }
  const lines = mergeOverlap(linesOf(parts[0]!.text), linesOf(parts[1]!.text));
  const figs = [...parts[0]!.figures, ...parts[1]!.figures];
  figs.forEach((f, i) =>
    lines.push(`[Figure${figs.length > 1 ? " " + (i + 1) : ""}] ${normalise(f)}`),
  );
  return lines.length ? { lines, via: "ai" } : null;
}

/** Result of reading one rasterised page: extra lines to add and how they were obtained. */
async function readRaster(
  r: PageReader,
  a: { ref: string; pageText: string; scanned: boolean; dataUrl: string },
): Promise<{ lines: string[]; via: "ai" | "ocr" } | null> {
  const v = await r.askVision({ dataUrl: a.dataUrl, ref: a.ref, pageText: a.pageText });
  if (v) {
    const lines: string[] = [];
    if (a.scanned || a.pageText.length < 60) lines.push(...linesOf(v.text));
    v.figures.forEach((f, i) =>
      lines.push(`[Figure${v.figures.length > 1 ? " " + (i + 1) : ""}] ${normalise(f)}`),
    );
    if (lines.length) return { lines, via: "ai" };
  }
  if (a.scanned) {
    const o = await r.ocr(a.dataUrl);
    if (o && o.confidence >= OCR_MIN_CONFIDENCE && o.text.trim().length >= 20) {
      r.stats.ocr++;
      return { lines: linesOf(o.text), via: "ocr" };
    }
    r.stats.unreadable++;
  }
  return null;
}

// ------------------------------------------------------------------ format readers
type ZipLike = {
  files: Record<string, { dir: boolean }>;
  file: (name: string) => {
    async: { (t: "string"): Promise<string>; (t: "uint8array"): Promise<Uint8Array> };
  } | null;
};

const IMG_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function extractPptx(zip: ZipLike, reader?: PageReader): Promise<Extracted> {
  const slideNames = Object.keys(zip.files)
    .map((n) => ({ n, i: /^ppt\/slides\/slide(\d+)\.xml$/.exec(n)?.[1] }))
    .filter((x): x is { n: string; i: string } => Boolean(x.i))
    .sort((a, b) => Number(a.i) - Number(b.i));
  if (!slideNames.length) throw new MaterialError(tr("mat.err.badPptx"));
  // pictures that repeat on most slides are logos/backgrounds, not content
  const picsBySlide = new Map<string, string[]>();
  const seen = new Map<string, number>();
  for (const { i } of slideNames) {
    const rels = (await zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)?.async("string")) ?? "";
    const pics = [...rels.matchAll(/Target="\.\.\/media\/([^"]+\.(?:png|jpe?g|webp))"/gi)].map(
      (m) => m[1] as string,
    );
    picsBySlide.set(i, [...new Set(pics)]);
    for (const n of new Set(pics)) seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  const decorative = (n: string) =>
    slideNames.length >= 3 && (seen.get(n) ?? 0) > slideNames.length / 2;
  const sections: Section[] = [];
  for (const { n, i } of slideNames) {
    reader?.progress(tr("mat.progress.slide", { n: Number(i), total: slideNames.length }));
    const lines = parsePptxSlideXml((await zip.file(n)?.async("string")) ?? "");
    const slideText = lines.join(" ");
    // speaker notes live in a separate part referenced from the slide's relationships
    const rels = (await zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)?.async("string")) ?? "";
    const notesTarget = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(rels)?.[1];
    if (notesTarget) {
      const notes = parsePptxSlideXml(
        (await zip.file(`ppt/notesSlides/${notesTarget}`)?.async("string")) ?? "",
      )
        // drop the slide-number placeholder that notes pages always contain
        .filter((l) => !/^\d+$/.test(l));
      if (notes.length) lines.push(tr("mat.speakerNotes") + notes.join(" "));
    }
    let via: Section["via"];
    const pics = (picsBySlide.get(i) ?? []).filter((p) => !decorative(p)).slice(0, 4);
    for (const pic of pics) {
      if (!reader) break;
      const bytes = await zip.file(`ppt/media/${pic}`)?.async("uint8array");
      if (!bytes || bytes.length < 1500) continue; // tiny bullets (pixel size is checked below)
      const env = reader.env;
      let got: Awaited<ReturnType<typeof readRaster>> = null;
      if (env && reader.visionAvailable) {
        try {
          const ras = await rasteriseBytes(
            env,
            bytes,
            IMG_MIME[pic.split(".").pop()?.toLowerCase() ?? ""] ?? "image/png",
          );
          if (ras && ras.w >= 120 && ras.h >= 120)
            got = await readRaster(reader, {
              ref: `Slide ${Number(i)}`,
              pageText: slideText,
              scanned: false,
              dataUrl: ras.dataUrl,
            });
        } catch {
          reader.stats.failed++;
        }
      } else reader.stats.figuresMissed++;
      if (got) {
        lines.push(...got.lines);
        via = "ai";
      }
    }
    if (!lines.length) continue;
    sections.push({
      title: cleanTitle(lines[0] ?? `Slide ${i}`),
      text: lines.join("\n"),
      ref: `Slide ${Number(i)}`,
      ...(via ? { via } : {}),
    });
  }
  return finish(sections, "pptx", slideNames.length, reader?.notes().join(" ") || undefined);
}

export async function extractDocx(zip: ZipLike): Promise<Extracted> {
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new MaterialError(tr("mat.err.badDocx"));
  return finish(sectionsFromParas(parseDocxXml(xml)), "docx", null);
}

async function pageHasFigures(
  page: { getOperatorList: () => Promise<{ fnArray: number[] }> },
  OPS: Record<string, number>,
): Promise<boolean> {
  try {
    const { fnArray } = await page.getOperatorList();
    const imageOps = new Set(
      [
        OPS["paintImageXObject"],
        OPS["paintInlineImageXObject"],
        OPS["paintImageMaskXObject"],
        OPS["paintJpegXObject"],
      ].filter((x): x is number => typeof x === "number"),
    );
    let images = 0;
    let paths = 0;
    for (const fn of fnArray) {
      if (imageOps.has(fn)) images++;
      else if (fn === OPS["constructPath"]) paths++;
    }
    return images >= 1 || paths >= 12; // pictures, or enough drawn strokes to be a diagram
  } catch {
    return false;
  }
}

async function extractPdf(buf: ArrayBuffer, reader: PageReader): Promise<Extracted> {
  // The "legacy" build polyfills newer JS features (e.g. Promise.try) so PDFs also open on older
  // browsers; the modern build throws there.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch (e) {
    const name = (e as { name?: string }).name;
    throw new MaterialError(
      name === "PasswordException" ? tr("mat.err.pdfPassword") : tr("mat.err.pdfBroken"),
    );
  }
  const sections: Section[] = [];
  const last = Math.min(doc.numPages, MAX_PDF_PAGES);
  let scannedSkipped = 0;
  for (let p = 1; p <= last; p++) {
    reader.progress(tr("mat.progress.page", { n: p, total: last }));
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let text = "";
    for (const it of content.items) {
      if (!("str" in it)) continue;
      text += it.str + (it.hasEOL ? "\n" : " ");
    }
    const lines = text.split("\n").map(normalise).filter(Boolean);
    const pageText = lines.join(" ");
    const scanned = pageText.length < 20; // no text layer: a scan, photo or handwriting
    const figures = scanned
      ? false
      : await pageHasFigures(page, pdfjs.OPS as unknown as Record<string, number>);
    let via: Section["via"] = "text";
    if ((scanned || figures) && reader.env && (reader.visionAvailable || scanned)) {
      try {
        const base = page.getViewport({ scale: 1 });
        const { w, h } = fit(base.width * 3, base.height * 3);
        const vp = page.getViewport({ scale: w / base.width });
        const canvas = reader.env.createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas } as never).promise;
        void h;
        let tiles: string[] = [];
        if (scanned && reader.visionAvailable && tall(base.width, base.height)) {
          const k = Math.min(
            MAX_IMAGE_SIDE / base.width,
            MAX_IMAGE_SIDE / (TILE_SHARE * base.height),
            4,
          );
          const W = Math.round(base.width * k),
            H = Math.round(base.height * k),
            th = Math.round(H * TILE_SHARE);
          for (const y0 of [0, H - th]) {
            const c = reader.env.createCanvas(W, th);
            const cx = c.getContext("2d");
            cx.fillStyle = "#ffffff";
            cx.fillRect(0, 0, W, th);
            const tvp = page.getViewport({ scale: k, offsetY: -y0 } as never);
            await page.render({ canvasContext: cx, viewport: tvp, canvas: c } as never).promise;
            tiles.push(encodeCanvas(c));
          }
        }
        const got =
          (tiles.length
            ? await readTiles(reader, { ref: `Page ${p}`, pageText, tiles }).catch(() => null)
            : null) ??
          (await readRaster(reader, {
            ref: `Page ${p}`,
            pageText,
            scanned,
            dataUrl: encodeCanvas(canvas),
          }));
        tiles = [];
        if (got) {
          lines.push(...got.lines);
          via = got.via;
        } else if (!scanned && figures) reader.stats.figuresMissed++;
      } catch {
        reader.stats.failed++;
        if (!scanned && figures) reader.stats.figuresMissed++;
      }
    } else if (figures) reader.stats.figuresMissed++;
    if (lines.join(" ").length < 20) {
      if (scanned) scannedSkipped++;
      continue;
    }
    sections.push({
      title: cleanTitle(lines[0] ?? `Page ${p}`),
      text: lines.join("\n"),
      ref: `Page ${p}`,
      via,
    });
  }
  const notes = reader.notes();
  if (doc.numPages > last)
    notes.unshift(tr("mat.note.firstPages", { n: last, total: doc.numPages }));
  if (!sections.length && scannedSkipped) throw new MaterialError(tr("mat.err.pdfScan"));
  return finish(sections, "pdf", doc.numPages, notes.join(" ") || undefined);
}

/** Read a File chosen in the browser. Throws MaterialError with a learner-friendly message. */
export async function extractMaterial(file: File, options: ReadOptions = {}): Promise<Extracted> {
  if (file.size > MAX_FILE_BYTES) throw new MaterialError(tr("mat.err.tooBig"));
  const name = file.name.toLowerCase();
  if (/\.(ppt|doc)$/.test(name)) throw new MaterialError(tr("mat.err.oldOffice"));
  const reader = new PageReader(options);
  try {
    if (/\.(png|jpe?g|webp)$/.test(name) || /^image\/(png|jpe?g|webp)$/.test(file.type)) {
      const env = reader.env;
      if (!env) throw new MaterialError(tr("mat.err.needBrowser"));
      reader.progress(tr("mat.progress.image"));
      let ras;
      try {
        ras = await rasteriseBytes(
          env,
          new Uint8Array(await file.arrayBuffer()),
          file.type || IMG_MIME[name.split(".").pop() ?? ""] || "image/png",
        );
      } catch {
        throw new MaterialError(tr("mat.err.badImage"));
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const tiles =
        ras && reader.visionAvailable
          ? await imageTiles(
              env,
              bytes,
              file.type || IMG_MIME[name.split(".").pop() ?? ""] || "image/png",
            ).catch(() => [])
          : [];
      const got =
        (tiles.length ? await readTiles(reader, { ref: "Image", pageText: "", tiles }) : null) ??
        (ras
          ? await readRaster(reader, {
              ref: "Image",
              pageText: "",
              scanned: true,
              dataUrl: ras.dataUrl,
            })
          : null);
      if (!got) throw new MaterialError(tr("mat.err.imageEmpty"));
      const text = got.lines.join("\n");
      return finish(
        [{ title: cleanTitle(got.lines[0] ?? "Image"), text, ref: "Image", via: got.via }],
        "text",
        1,
        reader.notes().join(" ") || undefined,
      );
    }
    if (/\.gif$|^image\//.test(name + file.type)) throw new MaterialError(tr("mat.err.imageType"));
    if (/\.pdf$/.test(name) || file.type === "application/pdf")
      return await extractPdf(await file.arrayBuffer(), reader);
    if (/\.(pptx|docx)$/.test(name)) {
      const { default: JSZip } = await import("jszip");
      let zip;
      try {
        zip = await JSZip.loadAsync(await file.arrayBuffer());
      } catch {
        throw new MaterialError(tr("mat.err.badZip"));
      }
      return /\.pptx$/.test(name)
        ? await extractPptx(zip as unknown as ZipLike, reader)
        : await extractDocx(zip as unknown as ZipLike);
    }
    if (/\.(txt|md|markdown|csv|tsv)$/.test(name) || file.type.startsWith("text/"))
      return finish(sectionsFromText(await file.text()), "text", null);
    throw new MaterialError(tr("mat.err.unsupported"));
  } finally {
    await reader.close();
  }
}

// ------------------------------------------------------------------ grounding
// STOP only covers words of 4+ letters (the assessor ignores shorter ones); add the short ones.
const SHORT_STOP = new Set(
  "the and for are was but not you all can has had her his its our out who why how may did get got any one use via per yet nor too off own say see".split(
    " ",
  ),
);
const tokens = (s: string) => {
  const m = new Map<string, number>();
  for (const w of words(s)) {
    if (w.length < 3 || STOP.has(w) || SHORT_STOP.has(w)) continue;
    const st = stem(w);
    m.set(st, (m.get(st) ?? 0) + 1);
  }
  return m;
};

/**
 * Pick the passages of the learner's material most relevant to `query`. Returns nothing when
 * nothing overlaps — callers must then say the answer is not grounded rather than pretend.
 */
export function pickExcerpts(
  docs: SourceDoc[],
  query: string,
  maxChars = 5000,
  maxSections = 4,
): { text: string; used: Array<{ name: string; ref: string; title: string }> } {
  const q = tokens(query);
  if (!q.size) return { text: "", used: [] };
  const scored: Array<{ score: number; name: string; s: Section }> = [];
  for (const d of docs)
    for (const s of d.sections) {
      const body = tokens(`${s.title} ${s.text}`);
      const title = tokens(s.title);
      let score = 0;
      for (const [k, wq] of q) {
        const hit = body.get(k);
        if (hit) score += Math.min(hit, 3) * (title.has(k) ? 2 : 1) * Math.min(wq, 2);
      }
      if (score > 0)
        scored.push({ score: score / Math.log2(2 + s.text.length / 400), name: d.name, s });
    }
  scored.sort((a, b) => b.score - a.score);
  const per = Math.floor(maxChars / Math.max(1, Math.min(maxSections, scored.length)));
  const top = scored.slice(0, maxSections);
  return {
    text: top.map((t) => `[${t.name} · ${t.s.ref}]\n${clip(t.s.text, per)}`).join("\n\n"),
    used: top.map((t) => ({ name: t.name, ref: t.s.ref, title: t.s.title })),
  };
}

// ------------------------------------------------------------------ build a class without AI
export type DraftConcept = {
  title: string;
  bloom: string;
  definition: string;
  misconception: string;
  example: string;
  equation: string;
  transfer: string;
};
export type DraftModule = { title: string; description: string; concepts: DraftConcept[] };

const sentences = (t: string) =>
  t
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

function partition<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < n; i++)
    out.push(
      items.slice(Math.floor((i * items.length) / n), Math.floor(((i + 1) * items.length) / n)),
    );
  return out.filter((g) => g.length);
}

/**
 * Offline fallback used when the AI service is unavailable: each group of sections becomes one
 * concept whose definition and example are the learner's own sentences. Misconception and
 * transfer prompts are generic, so the UI labels these classes as "built without AI".
 */
export function buildModuleLocally(title: string, sections: Section[]): DraftModule {
  const usable = sections.filter((s) => s.text.trim().length > 0);
  const totalChars = usable.reduce((t, s) => t + s.text.length, 0);
  if (totalChars < 200) throw new MaterialError(tr("mat.err.tooLittle"));
  let groups: Section[][];
  if (usable.length >= 2) groups = partition(usable, Math.min(6, usable.length));
  else {
    const sents = sentences(usable[0]?.text ?? "");
    const parts = partition(sents, Math.min(4, Math.max(2, Math.floor(sents.length / 2))));
    groups = parts.map((p, i) => [
      { title: p[0] ?? `Part ${i + 1}`, text: p.join(" "), ref: `Part ${i + 1}` },
    ]);
  }
  const seen = new Set<string>();
  const concepts = groups.map((g, i): DraftConcept => {
    const text = g.map((s) => s.text).join("\n");
    const sents = sentences(text);
    let t = cleanTitle(g[0]?.title ?? `Part ${i + 1}`);
    if (seen.has(t.toLowerCase())) t = `${t} (${i + 1})`;
    seen.add(t.toLowerCase());
    const definition = clip(sents.slice(0, 2).join(" ") || text, 420);
    const example = clip(sents.slice(2, 4).join(" "), 320) || tr("mat.draft.example", { title: t });
    const eq = sents.find((x) => /[=≈≤≥∝→±]|\b[A-Za-z]\s*=\s*\S/.test(x) && x.length <= 80);
    return {
      title: t,
      bloom: i === 0 ? "Understand" : i === groups.length - 1 ? "Analyse" : "Apply",
      definition,
      misconception: tr("mat.draft.misconception"),
      example,
      equation: eq ?? t,
      transfer: tr("mat.draft.transfer", { title: t }),
    };
  });
  return {
    title: clip(title, 70),
    description: tr("mat.draft.description", { title: clip(title, 50), n: concepts.length }),
    concepts,
  };
}

export const summarise = (text: string, n = 220) => clip(text.replace(/\s+/g, " ").trim(), n);
