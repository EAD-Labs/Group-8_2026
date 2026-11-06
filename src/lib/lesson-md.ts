// The lecture board's content: a chat-style markdown lesson split into blocks (paragraphs, lists, display
// maths, code, graphs), plus a small, safe formula evaluator so the AI's graphs can be drawn.
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[]; ordered: boolean }
  | { kind: "math"; tex: string }
  | { kind: "code"; text: string }
  | { kind: "plot"; spec: PlotSpec };

export type PlotSeries = { label?: string; expr?: string; points?: Array<[number, number]> };
export type PlotSpec = {
  title?: string;
  x: { label?: string; min: number; max: number };
  y?: { label?: string; min?: number; max?: number };
  series: PlotSeries[];
};

/** A graph block from the AI: ```plot {json}```. Invalid specs are dropped, never drawn wrong. */
export function parsePlot(src: string): PlotSpec | null {
  try {
    const o = JSON.parse(src) as Partial<PlotSpec>;
    const x = o.x;
    if (!x || typeof x.min !== "number" || typeof x.max !== "number" || !(x.max > x.min))
      return null;
    const series = (Array.isArray(o.series) ? o.series : [])
      .filter((s) => s && (typeof s.expr === "string" || Array.isArray(s.points)))
      .slice(0, 4)
      .map((s) => {
        const out: PlotSeries = {};
        if (typeof s.label === "string") out.label = s.label.slice(0, 40);
        if (typeof s.expr === "string" && compile(s.expr)) out.expr = s.expr;
        if (Array.isArray(s.points))
          out.points = s.points
            .filter(
              (p): p is [number, number] =>
                Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
            )
            .slice(0, 200);
        return out;
      })
      .filter((s) => s.expr || (s.points && s.points.length));
    if (!series.length) return null;
    const spec: PlotSpec = {
      x: { min: x.min, max: x.max, ...(typeof x.label === "string" ? { label: x.label } : {}) },
      series,
    };
    if (typeof o.title === "string") spec.title = o.title.slice(0, 80);
    if (o.y && typeof o.y === "object") {
      spec.y = {};
      if (typeof o.y.label === "string") spec.y.label = o.y.label;
      if (typeof o.y.min === "number") spec.y.min = o.y.min;
      if (typeof o.y.max === "number") spec.y.max = o.y.max;
    }
    return spec;
  } catch {
    return null;
  }
}

/** Split markdown into board blocks. */
export function toBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  let i = 0;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ").trim() });
    para = [];
  };
  while (i < lines.length) {
    const l = lines[i]!;
    const fence = l.match(/^```\s*(\w*)/);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      const text = body.join("\n");
      if (fence[1] === "plot") {
        const spec = parsePlot(text);
        if (spec) out.push({ kind: "plot", spec });
      } else if (/^(latex|math|tex)$/.test(fence[1] ?? ""))
        out.push({ kind: "math", tex: text.trim() });
      else out.push({ kind: "code", text });
      continue;
    }
    if (/^\s*\$\$/.test(l) || /^\s*\\\[/.test(l)) {
      flush();
      const body: string[] = [l.replace(/^\s*(\$\$|\\\[)/, "")];
      let closed = /(\$\$|\\\])\s*$/.test(body[0]!) && body[0]!.trim().length > 0;
      if (closed) body[0] = body[0]!.replace(/(\$\$|\\\])\s*$/, "");
      i++;
      while (!closed && i < lines.length) {
        const m = lines[i]!;
        if (/(\$\$|\\\])\s*$/.test(m)) {
          body.push(m.replace(/(\$\$|\\\])\s*$/, ""));
          closed = true;
        } else body.push(m);
        i++;
      }
      const tex = body.join("\n").trim();
      if (tex) out.push({ kind: "math", tex });
      continue;
    }
    const h = l.match(/^#{1,6}\s+(.+)/);
    if (h) {
      flush();
      out.push({ kind: "heading", text: h[1]!.trim() });
      i++;
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      flush();
      const ordered = /^\s*\d+[.)]/.test(l);
      const items: string[] = [];
      while (
        i < lines.length &&
        (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!) || (/^\s{2,}\S/.test(lines[i]!) && items.length))
      ) {
        const t = lines[i]!;
        if (/^\s*([-*+]|\d+[.)])\s+/.test(t))
          items.push(t.replace(/^\s*([-*+]|\d+[.)])\s+/, "").trim());
        else items[items.length - 1] += " " + t.trim();
        i++;
      }
      out.push({ kind: "list", items, ordered });
      continue;
    }
    if (!l.trim()) {
      flush();
      i++;
      continue;
    }
    para.push(l.trim());
    i++;
  }
  flush();
  return out;
}

// ---- a safe formula evaluator (no eval): numbers, x, + - * / ^, ( ), functions, pi, e ----------------
type Node = (x: number) => number;
const FN: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  log: Math.log10,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
};
export function compile(src: string): Node | null {
  const toks = src.replace(/\*\*/g, "^").match(/\d+\.?\d*(e[+-]?\d+)?|\.\d+|[a-zA-Z_]+|[-+*/^()]/g);
  if (!toks || toks.join("").length !== src.replace(/\*\*/g, "^").replace(/\s+/g, "").length)
    return null;
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expr = (): Node | null => {
    let a = term();
    while (a && (peek() === "+" || peek() === "-")) {
      const op = next();
      const b = term();
      if (!b) return null;
      const l = a;
      a = op === "+" ? (x) => l(x) + b(x) : (x) => l(x) - b(x);
    }
    return a;
  };
  const term = (): Node | null => {
    let a = factor();
    while (
      a &&
      (peek() === "*" || peek() === "/" || (peek() !== undefined && /^[a-zA-Z(\d.]/.test(peek()!)))
    ) {
      const op = peek() === "*" || peek() === "/" ? next() : "*"; // implicit multiplication: 2x, 3(x+1)
      const b = factor();
      if (!b) return null;
      const l = a;
      a = op === "/" ? (x) => l(x) / b(x) : (x) => l(x) * b(x);
    }
    return a;
  };
  const factor = (): Node | null => {
    const base = unary();
    if (base && peek() === "^") {
      next();
      const e = factor();
      if (!e) return null;
      return (x) => Math.pow(base(x), e(x));
    }
    return base;
  };
  const unary = (): Node | null => {
    if (peek() === "-") {
      next();
      const v = unary();
      return v ? (x) => -v(x) : null;
    }
    if (peek() === "+") {
      next();
      return unary();
    }
    return atom();
  };
  const atom = (): Node | null => {
    const t = next();
    if (t === undefined) return null;
    if (/^[\d.]/.test(t)) {
      const v = Number(t);
      return Number.isFinite(v) ? () => v : null;
    }
    if (t === "(") {
      const v = expr();
      if (next() !== ")") return null;
      return v;
    }
    const k = t.toLowerCase();
    if (k === "x") return (x) => x;
    if (k === "pi") return () => Math.PI;
    if (k === "e") return () => Math.E;
    if (FN[k] && peek() === "(") {
      next();
      const v = expr();
      if (next() !== ")" || !v) return null;
      return (x) => FN[k]!(v(x));
    }
    return null;
  };
  const f = expr();
  return f && p === toks.length ? f : null;
}

/** Sample a plot into drawable series (non-finite points break the line). */
export function samplePlot(
  spec: PlotSpec,
  n = 160,
): Array<{ label?: string; pts: Array<[number, number] | null> }> {
  return spec.series.map((s) => {
    if (s.points?.length) return { ...(s.label ? { label: s.label } : {}), pts: s.points };
    const f = s.expr ? compile(s.expr) : null;
    const pts: Array<[number, number] | null> = [];
    for (let i = 0; i <= n; i++) {
      const x = spec.x.min + ((spec.x.max - spec.x.min) * i) / n;
      const y = f ? f(x) : NaN;
      pts.push(Number.isFinite(y) && Math.abs(y) < 1e9 ? [x, y] : null);
    }
    return { ...(s.label ? { label: s.label } : {}), pts };
  });
}
