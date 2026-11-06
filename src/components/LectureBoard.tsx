// The lecture board: the AI's full lesson for the current section, rendered like a chat answer — headings,
// paragraphs, lists, real formulas (KaTeX) and drawn graphs — with what the teacher is saying highlighted.
import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

import { samplePlot, type Block, type PlotSpec } from "@/lib/lesson-md";

const tex = (src: string, display: boolean) => {
  try {
    return katex.renderToString(src, {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  } catch {
    return src;
  }
};

/** **bold**, *italic*, `code` and $inline maths$ inside a paragraph. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("$") && p.endsWith("$") && p.length > 2 ? (
          <span key={i} dangerouslySetInnerHTML={{ __html: tex(p.slice(1, -1), false) }} />
        ) : p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : p.startsWith("`") && p.endsWith("`") ? (
          <code key={i}>{p.slice(1, -1)}</code>
        ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <em key={i}>{p.slice(1, -1)}</em>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const COLORS = ["var(--lb-c1)", "var(--lb-c2)", "var(--lb-c3)", "var(--lb-c4)"];
export function Plot({ spec }: { spec: PlotSpec }) {
  const W = 560,
    H = 300,
    L = 56,
    R = 16,
    T = 30,
    B = 46;
  const series = samplePlot(spec);
  const ys = series.flatMap((s) =>
    s.pts.filter((p): p is [number, number] => !!p).map((p) => p[1]),
  );
  let y0 = spec.y?.min ?? Math.min(...ys, 0);
  let y1 = spec.y?.max ?? Math.max(...ys, 1);
  if (!(y1 > y0)) y1 = y0 + 1;
  const pad = (y1 - y0) * 0.06;
  if (spec.y?.min === undefined) y0 -= pad;
  if (spec.y?.max === undefined) y1 += pad;
  const sx = (x: number) => L + ((x - spec.x.min) / (spec.x.max - spec.x.min)) * (W - L - R);
  const sy = (y: number) => H - B - ((y - y0) / (y1 - y0)) * (H - T - B);
  const fmt = (v: number) =>
    Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)
      ? v.toExponential(1)
      : String(Math.round(v * 100) / 100);
  const ticks = (a: number, b: number) =>
    Array.from({ length: 5 }, (_, i) => a + ((b - a) * i) / 4);
  return (
    <figure className="lb-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title ?? "Graph"}>
        {spec.title && (
          <text x={W / 2} y={18} textAnchor="middle" className="lb-plot-title">
            {spec.title}
          </text>
        )}
        {ticks(y0, y1).map((v, i) => (
          <g key={`y${i}`}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="lb-grid" />
            <text x={L - 6} y={sy(v) + 4} textAnchor="end" className="lb-tick">
              {fmt(v)}
            </text>
          </g>
        ))}
        {ticks(spec.x.min, spec.x.max).map((v, i) => (
          <g key={`x${i}`}>
            <line y1={T} y2={H - B} x1={sx(v)} x2={sx(v)} className="lb-grid" />
            <text y={H - B + 16} x={sx(v)} textAnchor="middle" className="lb-tick">
              {fmt(v)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="lb-axis" />
        <line x1={L} x2={L} y1={T} y2={H - B} className="lb-axis" />
        {spec.x.label && (
          <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" className="lb-label">
            {spec.x.label}
          </text>
        )}
        {spec.y?.label && (
          <text
            transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`}
            textAnchor="middle"
            className="lb-label"
          >
            {spec.y.label}
          </text>
        )}
        {series.map((s, k) => {
          const segs: string[] = [];
          let cur = "";
          for (const p of s.pts) {
            if (!p || p[1] < y0 || p[1] > y1) {
              if (cur) segs.push(cur);
              cur = "";
              continue;
            }
            cur += `${cur ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`;
          }
          if (cur) segs.push(cur);
          return segs.map((d, j) => (
            <path
              key={`${k}-${j}`}
              d={d}
              fill="none"
              stroke={COLORS[k % 4]}
              strokeWidth={3}
              strokeLinejoin="round"
            />
          ));
        })}
      </svg>
      {series.some((s) => s.label) && (
        <figcaption>
          {series.map(
            (s, k) =>
              s.label && (
                <span key={k}>
                  <i style={{ background: COLORS[k % 4] }} />
                  {s.label}
                </span>
              ),
          )}
        </figcaption>
      )}
    </figure>
  );
}

function BlockView({ b }: { b: Block }) {
  if (b.kind === "p")
    return (
      <p>
        <Inline text={b.text} />
      </p>
    );
  if (b.kind === "list") {
    const items = b.items.map((x, i) => (
      <li key={i}>
        <Inline text={x} />
      </li>
    ));
    return b.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
  }
  if (b.kind === "math")
    return <div className="lb-math" dangerouslySetInnerHTML={{ __html: tex(b.tex, true) }} />;
  if (b.kind === "code")
    return (
      <pre>
        <code>{b.text}</code>
      </pre>
    );
  if (b.kind === "plot") return <Plot spec={b.spec} />;
  return <h4>{b.text}</h4>;
}

export function LectureBoard({
  title,
  blocks,
  active,
  part,
  parts,
}: {
  title: string;
  blocks: Block[];
  active: number;
  part: number;
  parts: number;
}) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    refs.current[active]?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [active, title]);
  return (
    <section className="lecture-board" aria-label="Lecture board" aria-live="off">
      <header>
        <small>
          PART {part + 1} OF {parts}
        </small>
        <h3>{title || "The lesson"}</h3>
      </header>
      <div className="lb-body">
        {blocks.map((b, i) => (
          <div
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`lb-block lb-${b.kind} ${i === active ? "is-active" : i < active ? "is-done" : ""}`}
          >
            <BlockView b={b} />
          </div>
        ))}
      </div>
    </section>
  );
}
