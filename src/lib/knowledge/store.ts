// Client-side store of verified records: seeded pilot records plus topics verified live.
import { useSyncExternalStore } from "react";
import { SEEDED, seededByKey } from "./seed";
import type { VerifiedRecord } from "./types";
import { liveKey, normTopic } from "./types";

const KEY = "kyro_vrecords_v1";
let live: Record<string, VerifiedRecord> | null = null;
const listeners = new Set<() => void>();
let ver = 0;

function load(): Record<string, VerifiedRecord> {
  if (live) return live;
  live = {};
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) {
      const p = JSON.parse(raw) as Record<string, VerifiedRecord>;
      for (const [k, v] of Object.entries(p))
        if (v && Array.isArray(v.claims) && v.claims.length && v.provenance) live[k] = v;
    }
  } catch {
    /* unreadable cache */
  }
  return live;
}
export const liveRecords = () => Object.values(load());
export const recordFor = (key: string): VerifiedRecord | undefined =>
  seededByKey.get(key) ?? load()[key];
export function saveLive(r: VerifiedRecord) {
  load()[r.key] = r;
  try {
    localStorage.setItem(KEY, JSON.stringify(live));
  } catch {
    /* ignore */
  }
  ver++;
  listeners.forEach((l) => l());
}
export function removeLive(key: string) {
  delete load()[key];
  try {
    localStorage.setItem(KEY, JSON.stringify(live));
  } catch {
    /* ignore */
  }
  ver++;
  listeners.forEach((l) => l());
}
export const onRecordsChange = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));
/** Live (engine-verified) records, re-rendering on change. */
export function useLiveRecords(): VerifiedRecord[] {
  useSyncExternalStore(
    onRecordsChange,
    () => ver,
    () => ver,
  );
  return liveRecords();
}
export const allRecords = () => [...SEEDED, ...liveRecords()];
/** Find a cached verified record for a typed topic (seeded title/topic, or a previously verified one). */
export function findByTopic(topic: string): VerifiedRecord | undefined {
  const n = normTopic(topic);
  return (
    allRecords().find((r) => normTopic(r.topic) === n || normTopic(r.title) === n) ??
    load()[liveKey(topic)]
  );
}
