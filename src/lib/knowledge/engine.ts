// Part 1 — Verified Knowledge Engine. Several agents answer independently, an adjudication pass
// finds where they disagree, decides which view is right and why, and one verified record is stored
// with its provenance and the corrections/disagreements that were resolved. In the app it runs with ONE AI (draft, then review); it is pure and provider-agnostic: the
// providers are injected, so it is tested against mocks and run against real APIs on the server.

import { extractJson } from "../ai-json";
import {
  liveKey,
  normTopic,
  topicKey,
  type BlankItem,
  type Claim,
  type ClaimRole,
  type Disagreement,
  type HintItem,
  type Misconception,
  type VerifiedRecord,
} from "./types";

export type Provider = {
  name: string;
  complete: (system: string, prompt: string) => Promise<string>;
};
export class VerifyError extends Error {
  constructor(
    message: string,
    readonly code: "no-providers" | "all-failed" | "bad-output",
  ) {
    super(message);
  }
}

const ROLES: ClaimRole[] = ["define", "mechanism", "pitfall", "example", "boundary", "formula"];
const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const AGENT_SYSTEM = `You are one of several independent expert agents writing a verified account of a university-level topic. Be precise and correct; do not hedge. Reply with JSON only:
{"claims":[{"role":"define|mechanism|pitfall|example|boundary|formula","text":"one self-contained factual claim"}],"misconceptions":["a common learner error about this topic"]}
Give 5 to 7 claims: at least one define, one mechanism, one pitfall (a common wrong belief and the correction), one worked example, one boundary or formula.`;

const ADJUDICATE_SYSTEM = `You are the adjudicator for several expert agents' answers about one topic. Compare the agents claim by claim. Where they disagree on a fact, decide which view is correct, say WHY, and keep only the correct view. Do not simply pick the majority — check the physics/maths/logic. Reply with JSON only:
{"claims":[{"role":"define|mechanism|pitfall|example|boundary|formula","text":"verified claim"}],
 "disagreements":[{"point":"what they disagree about","positions":[{"agent":"agent name","claim":"what that agent said"}],"resolution":"the verified position","reasoning":"why it is correct and the other is not","rejected":["agent names whose position was wrong"]}],
 "confidence":"high|medium|low"}
The final claims must contain no rejected statement. If the agents fully agree, return an empty disagreements list and say so only through confidence.`;

const REVIEW_SYSTEM = `You are a careful reviewer checking ONE AI-written draft account of a university-level topic. Check every claim for factual, logical or mathematical errors. Where the draft is wrong or misleading, correct it, and record that as a disagreement between the "first draft" and your "review". Do not invent problems: if a claim is right, keep it. Reply with JSON only:
{"claims":[{"role":"define|mechanism|pitfall|example|boundary|formula","text":"verified claim"}],
 "disagreements":[{"point":"what was wrong or contested","positions":[{"agent":"first draft","claim":"what the draft said"},{"agent":"review","claim":"the corrected statement"}],"resolution":"the verified position","reasoning":"why the draft was wrong","rejected":["first draft"]}],
 "confidence":"medium|low"}
The final claims must contain no statement you rejected. If you found nothing to correct, return an empty disagreements list.`;

const COMPOSE_SYSTEM = `You turn VERIFIED claims into classroom material for a simulated classroom (teacher, a basic student, an advanced student). Use ONLY the verified claims. Reply with JSON only:
{"title":"short concept title","equation":"key formula or phrase for the board","example":"one worked example","transfer":"a new situation not covered in the claims",
 "misconceptions":[{"name":"short name of the misconception","wrong":"the wrong belief","right":"the correction"}],
 "basic":["3 foundational questions a self-conscious learner would not dare ask"],
 "probes":["2 boundary or edge-case challenges from an advanced student"],
 "blanks":[{"before":"sentence start","answer":"one key word or number","after":"sentence end","accept":["accepted answers"],"claimIndex":0}],
 "hints":[{"question":"a question whose answer is hidden","hint":"a nudge","answer":"the answer","accept":["keywords"],"claimIndex":0}]}
Give exactly 2 blanks and 2 hints. claimIndex is the 0-based index of the supporting verified claim.`;

type RawClaim = { role?: string; text?: string };
const cleanClaims = (raw: unknown): Array<{ role: ClaimRole; text: string }> =>
  arr<RawClaim>(raw).flatMap((c) => {
    const text = str(c?.text, 500);
    const role = (ROLES.includes(c?.role as ClaimRole) ? c?.role : "mechanism") as ClaimRole;
    return text ? [{ role, text }] : [];
  });

export type VerifyResult = { record: VerifiedRecord; cached: boolean };
export type Progress = (
  step: "agents" | "compare" | "resolve" | "compose" | "store",
  detail?: string,
) => void;

const cache = new Map<string, VerifiedRecord>();
export const cacheGet = (topic: string) => cache.get(topicKey(topic));
export const cachePut = (r: VerifiedRecord) => void cache.set(topicKey(r.topic), r);
export const cacheClear = () => cache.clear();

/** Run the engine. `seeded` records short-circuit; the cache makes a repeated topic free (no provider calls). */
export async function verifyTopic(
  topic: string,
  providers: Provider[],
  opts: {
    onProgress?: Progress;
    seeded?: (topic: string) => VerifiedRecord | undefined;
    force?: boolean;
  } = {},
): Promise<VerifyResult> {
  const t = topic.trim();
  if (!t) throw new VerifyError("Enter a topic first.", "bad-output");
  const seeded = opts.seeded?.(t);
  if (seeded) return { record: seeded, cached: true };
  const hit = opts.force ? undefined : cacheGet(t);
  if (hit) return { record: hit, cached: true };
  if (!providers.length) throw new VerifyError("No AI providers are configured.", "no-providers");
  const step = opts.onProgress ?? (() => undefined);

  // 1. independent answers, in parallel
  step("agents", providers.map((p) => p.name).join(", "));
  const settled = await Promise.allSettled(
    providers.map((p) =>
      p.complete(AGENT_SYSTEM, `Topic: ${t}`).then((raw) => ({
        p,
        claims: cleanClaims(extractJson<{ claims?: unknown }>(raw)?.claims),
      })),
    ),
  );
  const ok = settled.flatMap((s) =>
    s.status === "fulfilled" && s.value.claims.length >= 3 ? [s.value] : [],
  );
  const failed = providers.filter((p) => !ok.some((o) => o.p === p)).map((p) => p.name);
  if (!ok.length)
    throw new VerifyError(
      "Every provider failed. Your session is kept — please retry.",
      "all-failed",
    );

  // 2. cross-check, find disagreements, adjudicate and reconcile (any working agent may adjudicate)
  step("compare", `${ok.length} agent answers`);
  const single = providers.length === 1;
  const bundle = ok
    .map((o) => `### ${o.p.name}\n${o.claims.map((c) => `- [${c.role}] ${c.text}`).join("\n")}`)
    .join("\n\n");
  let verdict:
    | {
        claims: Array<{ role: ClaimRole; text: string }>;
        disagreements: Disagreement[];
        confidence: string;
        rejected: Set<string>;
      }
    | undefined;
  for (const o of ok) {
    try {
      step("resolve", o.p.name);
      const raw = extractJson<{ claims?: unknown; disagreements?: unknown; confidence?: unknown }>(
        await o.p.complete(single ? REVIEW_SYSTEM : ADJUDICATE_SYSTEM, `Topic: ${t}\n\n${bundle}`),
      );
      const claims = cleanClaims(raw?.claims);
      if (claims.length < 3) continue;
      const rejected = new Set<string>();
      const disagreements = arr<Record<string, unknown>>(raw?.disagreements).flatMap(
        (d, i): Disagreement[] => {
          const point = str(d["point"], 300);
          const resolution = str(d["resolution"], 500);
          if (!point || !resolution) return [];
          const positions = arr<{ agent?: string; claim?: string }>(d["positions"])
            .map((x) => ({ agent: str(x?.agent, 60), claim: str(x?.claim, 500) }))
            .filter((x) => x.claim);
          for (const a of arr<string>(d["rejected"]))
            for (const x of positions) if (x.agent === a) rejected.add(normTopic(x.claim));
          return [
            { id: `d${i + 1}`, point, positions, resolution, reasoning: str(d["reasoning"], 600) },
          ];
        },
      );
      verdict = { claims, disagreements, confidence: str(raw?.confidence, 10), rejected };
      break;
    } catch {
      /* try the next agent as adjudicator */
    }
  }
  let reviewFailed = false;
  if (!verdict && single) {
    // the draft exists but the self-review could not run: keep the draft, honestly marked low confidence
    reviewFailed = true;
    verdict = {
      claims: ok[0]!.claims,
      disagreements: [],
      confidence: "low",
      rejected: new Set<string>(),
    };
  }
  if (!verdict)
    throw new VerifyError(
      "The agents answered but the adjudication pass failed. Please retry.",
      "all-failed",
    );
  // safety net: a statement an agent was ruled wrong on must not survive into the record
  const kept = verdict.claims.filter((c) => !verdict!.rejected.has(normTopic(c.text)));
  const slug = topicKey(t).split(":").slice(-1)[0] ?? "t";
  const claims: Claim[] = kept.map((c, i) => ({
    id: `${slug}-${i + 1}`,
    role: c.role,
    text: c.text,
  }));

  // 3. compose classroom material from the verified claims only
  step("compose");
  let composed: Record<string, unknown> | undefined;
  for (const o of ok) {
    try {
      composed =
        extractJson<Record<string, unknown>>(
          await o.p.complete(
            COMPOSE_SYSTEM,
            `Topic: ${t}\n\nVerified claims:\n${claims.map((c, i) => `${i}. [${c.role}] ${c.text}`).join("\n")}`,
          ),
        ) ?? undefined;
      if (composed && arr(composed["blanks"]).length) break;
    } catch {
      /* try the next agent */
    }
  }
  if (!composed)
    throw new VerifyError(
      "Could not prepare classroom material from the verified record. Please retry.",
      "all-failed",
    );
  const claimAt = (i: unknown) =>
    claims[Math.max(0, Math.min(claims.length - 1, Number(i) || 0))]?.id ?? claims[0]!.id;
  const mis: Misconception[] = arr<Record<string, unknown>>(composed["misconceptions"])
    .slice(0, 3)
    .flatMap((m, i) =>
      str(m["wrong"]) && str(m["right"])
        ? [
            {
              id: `${slug}-m${i + 1}`,
              name: str(m["name"], 80) || "misconception",
              wrong: str(m["wrong"]),
              right: str(m["right"]),
            },
          ]
        : [],
    );
  const blanks: BlankItem[] = arr<Record<string, unknown>>(composed["blanks"])
    .slice(0, 2)
    .flatMap((b, i) =>
      str(b["answer"])
        ? [
            {
              id: `${slug}-b${i + 1}`,
              before: str(b["before"]),
              answer: str(b["answer"], 80),
              after: str(b["after"]),
              accept: [
                str(b["answer"], 80),
                ...arr<string>(b["accept"]).map((x) => str(x, 80)),
              ].filter(Boolean),
              claimId: claimAt(b["claimIndex"]),
            },
          ]
        : [],
    );
  const hints: HintItem[] = arr<Record<string, unknown>>(composed["hints"])
    .slice(0, 2)
    .flatMap((h, i) =>
      str(h["question"]) && str(h["answer"])
        ? [
            {
              id: `${slug}-h${i + 1}`,
              question: str(h["question"]),
              hint: str(h["hint"]) || "Think about the definition.",
              answer: str(h["answer"]),
              accept: arr<string>(h["accept"])
                .map((x) => str(x, 80))
                .filter(Boolean),
              claimId: claimAt(h["claimIndex"]),
            },
          ]
        : [],
    );
  if (blanks.length < 1 || hints.length < 1)
    throw new VerifyError("The composed material was incomplete. Please retry.", "bad-output");

  // One AI checking itself cannot earn "high": cap at medium (low if its review did not run).
  const confidence: VerifiedRecord["provenance"]["confidence"] = single
    ? reviewFailed || verdict.confidence === "low"
      ? "low"
      : "medium"
    : failed.length || ok.length === 1
      ? "low"
      : ok.length === 2 || verdict.confidence === "medium"
        ? "medium"
        : verdict.confidence === "low"
          ? "low"
          : "high";
  const record: VerifiedRecord = {
    id: `rec-${slug}`,
    key: liveKey(t),
    topic: t,
    title: str(composed["title"], 80) || t,
    bloom: "Understand",
    claims,
    misconceptions: mis,
    basic: arr<string>(composed["basic"])
      .map((x) => str(x, 240))
      .filter(Boolean)
      .slice(0, 3),
    probes: arr<string>(composed["probes"])
      .map((x) => str(x, 240))
      .filter(Boolean)
      .slice(0, 2),
    blanks,
    hints,
    example:
      str(composed["example"], 500) || (claims.find((c) => c.role === "example")?.text ?? ""),
    equation: str(composed["equation"], 120) || t,
    transfer: str(composed["transfer"], 500) || `Apply ${t} to a situation not covered in class.`,
    prereq: [],
    provenance: {
      providers: single
        ? [
            `${ok[0]!.p.name} (draft)`,
            `${ok[0]!.p.name} (review${reviewFailed ? " unavailable" : ""})`,
          ]
        : ok.map((o) => o.p.name),
      mode: single ? "single" : "multi",
      disagreements: verdict.disagreements,
      confidence,
      verifiedAt: new Date().toISOString(),
      origin: "verified",
      ...(single
        ? {
            note: reviewFailed
              ? "Single AI: the review pass was unavailable, so this is an unreviewed draft (low confidence)."
              : "Single AI: drafted, then reviewed by the same model. Confidence is capped at medium.",
          }
        : failed.length
          ? {
              failedProviders: failed,
              note: `Lower confidence: ${failed.join(", ")} did not respond.`,
            }
          : {}),
    },
  };
  step("store");
  cachePut(record);
  return { record, cached: false };
}
