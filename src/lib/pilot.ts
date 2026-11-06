// The two pilot modules (HLD §6.4) and live verified topics, built from verified records.
import type { Concept, Module } from "./curriculum";
import { buildDialogue, DEFAULT_PLAN, sourceFromRecord, type DialoguePlan } from "./dialogue";
import { PILOT_MODULES, SEEDED, seededByKey } from "./knowledge/seed";
import type { VerifiedRecord } from "./knowledge/types";

export type PlanFor = (key: string) => DialoguePlan;
export const conceptSlugOf = (key: string) => key.split(":").slice(1).join(":");

export function conceptFromRecord(
  r: VerifiedRecord,
  plan: DialoguePlan = DEFAULT_PLAN,
  lookup?: (k: string) => VerifiedRecord | undefined,
  pool?: VerifiedRecord[],
): Concept {
  return {
    slug: conceptSlugOf(r.key),
    title: r.title,
    bloom: r.bloom,
    duration: Math.max(8, Math.round(r.claims.length * 2.4)),
    mastery: 0,
    stages: buildDialogue(r, plan, lookup, pool),
    src: sourceFromRecord(r),
  };
}
export function buildPilotModules(
  planFor: PlanFor = () => DEFAULT_PLAN,
  lookup: (k: string) => VerifiedRecord | undefined = (k) => seededByKey.get(k),
  /** live (engine-verified) records, used as extra wrong answers for the quick checks */
  extra: VerifiedRecord[] = [],
): Module[] {
  const pool = [...SEEDED, ...extra];
  return PILOT_MODULES.map((m) => ({
    slug: m.slug,
    code: m.code,
    title: m.title,
    description: m.description,
    concepts: SEEDED.filter((r) => r.key.startsWith(`${m.slug}:`)).map((r) =>
      conceptFromRecord(r, planFor(r.key), lookup, pool),
    ),
  }));
}
export function buildLiveModule(
  records: VerifiedRecord[],
  planFor: PlanFor = () => DEFAULT_PLAN,
  lookup?: (k: string) => VerifiedRecord | undefined,
): Module | null {
  if (!records.length) return null;
  return {
    slug: "verified",
    code: "LIVE",
    title: "Verified topics",
    description: "Topics drafted and reviewed by the app's AI.",
    concepts: records.map((r) =>
      conceptFromRecord(r, planFor(r.key), lookup, [...SEEDED, ...records]),
    ),
  };
}
export const modules: Module[] = buildPilotModules();
