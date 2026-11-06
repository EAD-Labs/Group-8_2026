// Browser side of Part 1: ask the server to verify a topic and follow its progress.
import { findByTopic, saveLive } from "./store";
import type { VerifiedRecord } from "./types";

export type VerifyStep = "agents" | "compare" | "resolve" | "compose" | "store";
export type VerifyOutcome =
  | { ok: true; record: VerifiedRecord; cached: boolean }
  | { ok: false; code: string; message: string; retry: boolean };

export async function verifyOnServer(
  topic: string,
  onStep: (s: VerifyStep, detail?: string) => void,
  force = false,
): Promise<VerifyOutcome> {
  const hit = force ? undefined : findByTopic(topic);
  if (hit) return { ok: true, record: hit, cached: true };
  try {
    const r = await fetch("/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, force }),
    });
    if (!r.body)
      return { ok: false, code: "error", message: "No response from the server.", retry: true };
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let out: VerifyOutcome | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const m = JSON.parse(line) as {
          step?: VerifyStep;
          detail?: string;
          done?: { record: VerifiedRecord; cached: boolean };
          error?: { code: string; message: string; retry: boolean };
        };
        if (m.step) onStep(m.step, m.detail);
        if (m.done) {
          if (!m.done.record.key.startsWith("verified:") === false) saveLive(m.done.record);
          out = { ok: true, record: m.done.record, cached: m.done.cached };
        }
        if (m.error) out = { ok: false, ...m.error };
      }
    }
    return (
      out ?? {
        ok: false,
        code: "error",
        message: "The verification stream ended early. Please retry.",
        retry: true,
      }
    );
  } catch {
    return {
      ok: false,
      code: "offline",
      message:
        "Could not reach the server. Check your connection and retry — your progress is kept.",
      retry: true,
    };
  }
}
