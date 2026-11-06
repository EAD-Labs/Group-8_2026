import * as THREE from "three";

// Procedural textures drawn with the 2D canvas, so the rooms have wood grain, carpet, plaster and
// concrete without shipping any image files. Cached by key; client-only.

const cache = new Map<string, THREE.CanvasTexture>();

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return `#${c.getHexString()}`;
}

function make(
  key: string,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void,
  repeat: [number, number] = [1, 1],
  srgb = true,
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  draw(g, w, h, rng(key.length * 7919 + w));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

/** Wooden floorboards with grain, knots and dark seams. */
export const woodTexture = (base = "#9a6a3f", repeat: [number, number] = [5, 5]) =>
  make(
    `wood:${base}`,
    1024,
    1024,
    (g, w, h, r) => {
      const planks = 10;
      const pw = w / planks;
      for (let i = 0; i < planks; i++) {
        const off = r() * h;
        g.fillStyle = shade(base, (r() - 0.5) * 0.09);
        g.fillRect(i * pw, 0, pw, h);
        for (let k = 0; k < 46; k++) {
          const x = i * pw + r() * pw;
          g.strokeStyle = shade(base, (r() - 0.5) * 0.12);
          g.globalAlpha = 0.35;
          g.lineWidth = 0.6 + r() * 1.4;
          g.beginPath();
          g.moveTo(x, 0);
          for (let y = 0; y <= h; y += 64) g.lineTo(x + Math.sin((y + off) * 0.013) * 2.2, y);
          g.stroke();
        }
        g.globalAlpha = 1;
        // butt joints between boards
        for (let y = off % 340; y < h; y += 340) {
          g.fillStyle = "rgba(30,15,5,.55)";
          g.fillRect(i * pw, y, pw, 2);
        }
        g.fillStyle = "rgba(30,15,5,.6)";
        g.fillRect(i * pw, 0, 2.2, h);
      }
    },
    repeat,
  );

export const carpetTexture = (base = "#46556a", repeat: [number, number] = [6, 6]) =>
  make(
    `carpet:${base}`,
    256,
    256,
    (g, w, h, r) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = shade(base, (r() - 0.5) * 0.12);
        g.globalAlpha = 0.5;
        g.fillRect(r() * w, r() * h, 1.6, 1.6);
      }
      g.globalAlpha = 1;
    },
    repeat,
  );

export const plasterTexture = (base = "#d8d1bf", repeat: [number, number] = [3, 2]) =>
  make(
    `plaster:${base}`,
    512,
    512,
    (g, w, h, r) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5500; i++) {
        g.fillStyle = shade(base, (r() - 0.5) * 0.05);
        g.globalAlpha = 0.45;
        g.beginPath();
        g.arc(r() * w, r() * h, 1 + r() * 3.2, 0, 7);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    repeat,
  );

export const concreteTexture = (base = "#6a6f74", repeat: [number, number] = [6, 6]) =>
  make(
    `concrete:${base}`,
    512,
    512,
    (g, w, h, r) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = shade(base, (r() - 0.5) * 0.1);
        g.globalAlpha = 0.4;
        g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 4);
      }
      g.globalAlpha = 0.5;
      g.strokeStyle = shade(base, -0.12);
      g.lineWidth = 2;
      g.strokeRect(0, 0, w, h); // expansion joints between slabs
      g.globalAlpha = 1;
    },
    repeat,
  );

/** Vertical gradient used for light shafts and glows (alpha fades at the edges). */
export const beamTexture = () =>
  make(
    "beam",
    128,
    256,
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(255,246,214,.9)");
      grad.addColorStop(1, "rgba(255,246,214,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const edge = g.createLinearGradient(0, 0, w, 0);
      edge.addColorStop(0, "rgba(0,0,0,1)");
      edge.addColorStop(0.28, "rgba(0,0,0,0)");
      edge.addColorStop(0.72, "rgba(0,0,0,0)");
      edge.addColorStop(1, "rgba(0,0,0,1)");
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = edge;
      g.fillRect(0, 0, w, h);
    },
    [1, 1],
    true,
  );

export const glowTexture = () =>
  make("glow", 128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });

/** Scenery seen through a window: a sky with sun/moon, soft clouds, trees or city lights. */
export const skyTexture = (night: boolean, scene: "trees" | "city") =>
  make(`sky:${night}:${scene}`, 512, 512, (g, w, h, r) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    if (night) {
      sky.addColorStop(0, "#0b1230");
      sky.addColorStop(0.7, "#27386b");
      sky.addColorStop(1, "#4b4f86");
    } else {
      sky.addColorStop(0, "#7fc1ea");
      sky.addColorStop(0.65, "#cfe9f6");
      sky.addColorStop(1, "#f4f1de");
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    if (night) {
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
        g.fillRect(r() * w, r() * h * 0.6, 1.4, 1.4);
      }
      g.fillStyle = "#f6f2d8";
      g.beginPath();
      g.arc(w * 0.74, h * 0.2, 26, 0, 7);
      g.fill();
    } else {
      const sun = g.createRadialGradient(w * 0.75, h * 0.18, 0, w * 0.75, h * 0.18, 90);
      sun.addColorStop(0, "rgba(255,250,220,1)");
      sun.addColorStop(0.25, "rgba(255,240,190,.7)");
      sun.addColorStop(1, "rgba(255,240,190,0)");
      g.fillStyle = sun;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = "rgba(255,255,255,.55)";
        const x = r() * w;
        const y = h * (0.1 + r() * 0.35);
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.ellipse(x + k * 26, y + (r() - 0.5) * 8, 34 + r() * 18, 12 + r() * 6, 0, 0, 7);
          g.fill();
        }
      }
    }
    if (scene === "trees") {
      for (let i = 0; i < 18; i++) {
        const x = (i / 18) * w + r() * 20;
        const y = h * (0.66 + r() * 0.12);
        g.fillStyle = night ? "#10261d" : i % 2 ? "#4f8a4b" : "#3f7a41";
        g.beginPath();
        g.arc(x, y, 44 + r() * 30, 0, 7);
        g.fill();
      }
      g.fillStyle = night ? "#0c1d16" : "#5a8f4a";
      g.fillRect(0, h * 0.84, w, h * 0.16);
    } else {
      for (let i = 0; i < 26; i++) {
        const bw = 26 + r() * 40;
        const bh = h * (0.18 + r() * 0.34);
        const x = r() * w;
        g.fillStyle = night ? "#0c1022" : "#8f9bb5";
        g.fillRect(x, h - bh, bw, bh);
        if (night)
          for (let k = 0; k < 14; k++) {
            g.fillStyle = r() > 0.4 ? "#ffd27a" : "#9ad7ff";
            g.fillRect(x + 4 + r() * (bw - 8), h - bh + 6 + r() * (bh - 12), 3, 4);
          }
      }
    }
  });
