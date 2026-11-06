// A demo clock. Delayed retention checks are scheduled days ahead; to show that in a live demo the
// presenter can fast-forward this clock. It only shifts how "now" is read by the scheduling code.
const KEY = "kyro_clock_offset_v1";
const DAY = 86_400_000;
let offset = 0;
let loaded = false;
const listeners = new Set<() => void>();
function load() {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try {
    const v = Number(localStorage.getItem(KEY));
    if (Number.isFinite(v) && v >= 0 && v < 400 * DAY) offset = v;
  } catch {
    /* ignore */
  }
}
export const nowMs = () => {
  load();
  return Date.now() + offset;
};
export const clockOffsetDays = () => {
  load();
  return Math.round(offset / DAY);
};
export function skipDays(days: number) {
  load();
  offset = Math.max(0, Math.min(399 * DAY, offset + days * DAY));
  try {
    localStorage.setItem(KEY, String(offset));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export function resetClock() {
  offset = 0;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const onClockChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
