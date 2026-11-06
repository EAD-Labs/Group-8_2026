import { useEffect, useMemo } from "react";
import * as THREE from "three";

// Text for the 3D scene, drawn with the browser's own text engine into a texture.
// Why not a font-file based renderer: it must download fonts from a CDN (the whole scene failed when
// that was blocked/offline) and cannot shape Indic scripts. The browser already has correct shaping
// and fonts for every language the app supports, and this needs no network at all.

const STACK =
  '"Noto Sans","Segoe UI","Nirmala UI","Noto Sans Devanagari","Noto Sans Bengali","Noto Sans Tamil","Noto Sans Telugu","Noto Sans Gujarati","Noto Sans Kannada","Noto Sans Malayalam","Noto Sans Gurmukhi","Kohinoor Devanagari","Kohinoor Bangla","Kohinoor Telugu","Tamil Sangam MN","Arial",system-ui,sans-serif';
const PX_PER_UNIT = 420; // texture pixels per world unit (sharp at the board's viewing distance)
const MAX_TEXTURE = 2048;

type Align = "left" | "center" | "right";
export type TextProps = {
  children: string;
  position?: [number, number, number];
  fontSize?: number;
  color?: string;
  maxWidth?: number;
  textAlign?: Align;
  anchorX?: Align;
  anchorY?: "top" | "middle" | "bottom";
  bold?: boolean;
  opacity?: number;
  renderOrder?: number;
};

export type TextLayout = {
  lines: string[];
  width: number;
  height: number;
  px: number;
  lineHeight: number;
};

/** Word-wrap `text` to `maxWidthUnits` using a measuring function (pure, so it can be unit tested). */
export function layoutText(
  text: string,
  fontSize: number,
  maxWidthUnits: number,
  measure: (s: string) => number,
): TextLayout {
  const px = Math.max(8, Math.round(fontSize * PX_PER_UNIT));
  const maxPx = Number.isFinite(maxWidthUnits)
    ? Math.max(px, Math.round(maxWidthUnits * PX_PER_UNIT))
    : Infinity;
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && measure(next) > maxPx) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    lines.push(cur);
  }
  if (!lines.length) lines.push("");
  const widest = Math.max(1, ...lines.map((l) => measure(l)));
  const lineHeight = Math.round(px * 1.28);
  return { lines, width: Math.ceil(widest), height: lineHeight * lines.length, px, lineHeight };
}

function drawTexture(
  text: string,
  o: { fontSize: number; color: string; maxWidth: number; align: Align; bold: boolean },
) {
  const canvas = document.createElement("canvas");
  const probe = canvas.getContext("2d");
  if (!probe) return null;
  const px = Math.max(8, Math.round(o.fontSize * PX_PER_UNIT));
  const font = `${o.bold ? "700" : "400"} ${px}px ${STACK}`;
  probe.font = font;
  const lay = layoutText(text, o.fontSize, o.maxWidth, (s) => probe.measureText(s).width);
  const pad = Math.ceil(px * 0.3);
  const w = Math.min(MAX_TEXTURE, lay.width + pad * 2);
  const h = Math.min(MAX_TEXTURE, lay.height + pad * 2);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  ctx.fillStyle = o.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = o.align;
  const x = o.align === "left" ? pad : o.align === "right" ? w - pad : w / 2;
  lay.lines.forEach((line, i) => ctx.fillText(line, x, pad + lay.lineHeight * (i + 0.5)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { tex, width: w / PX_PER_UNIT, height: h / PX_PER_UNIT };
}

/** Drop-in replacement for drei's <Text> with the props this scene uses. */
export function Text({
  children,
  position = [0, 0, 0],
  fontSize = 0.2,
  color = "#ffffff",
  maxWidth = Infinity,
  textAlign = "center",
  anchorX = "center",
  anchorY = "middle",
  bold = false,
  opacity = 1,
  renderOrder = 10,
}: TextProps) {
  const text = String(children ?? "");
  const made = useMemo(
    () =>
      text.trim() ? drawTexture(text, { fontSize, color, maxWidth, align: textAlign, bold }) : null,
    [text, fontSize, color, maxWidth, textAlign, bold],
  );
  useEffect(() => () => made?.tex.dispose(), [made]);
  if (!made) return null;
  const ox = anchorX === "left" ? made.width / 2 : anchorX === "right" ? -made.width / 2 : 0;
  const oy = anchorY === "top" ? -made.height / 2 : anchorY === "bottom" ? made.height / 2 : 0;
  return (
    <group position={position}>
      <mesh position={[ox, oy, 0]} renderOrder={renderOrder}>
        <planeGeometry args={[made.width, made.height]} />
        <meshBasicMaterial
          map={made.tex}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
