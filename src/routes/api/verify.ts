import { createFileRoute } from "@tanstack/react-router";
import { verifyTopic, VerifyError } from "@/lib/knowledge/engine";
import { aiConfigured, completeText } from "@/lib/ai-server";
import type { Provider } from "@/lib/knowledge/engine";
import { SEEDED } from "@/lib/knowledge/seed";
import { normTopic } from "@/lib/knowledge/types";

// POST { topic, force? } -> NDJSON stream: {"step":...} progress lines, then {"done":{record,cached}}
// or {"error":{code,message,retry}}. Seeded pilot topics and previously verified topics are returned
// without any provider call. Errors are recoverable (HLD T1.6): the client keeps its session.
/** The app's one AI (the same one chat and assessment use) — no other vendor is involved. */
const aiProviders = (): Provider[] => {
  const env = process.env as Record<string, string | undefined>;
  return aiConfigured(env)
    ? [
        {
          name: "ai",
          complete: (system, prompt) => completeText(env, { system, prompt, maxTokens: 2500 }),
        },
      ]
    : [];
};
const seeded = (topic: string) =>
  SEEDED.find(
    (r) => normTopic(r.topic) === normTopic(topic) || normTopic(r.title) === normTopic(topic),
  );

export const Route = createFileRoute("/api/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          topic?: unknown;
          force?: unknown;
        };
        const topic = typeof body.topic === "string" ? body.topic.slice(0, 200) : "";
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(c) {
            const send = (o: unknown) => c.enqueue(enc.encode(JSON.stringify(o) + "\n"));
            try {
              const r = await verifyTopic(topic, aiProviders(), {
                seeded,
                force: body.force === true,
                onProgress: (step, detail) => send({ step, detail }),
              });
              send({ done: r });
            } catch (e) {
              if (e instanceof VerifyError)
                send({
                  error: { code: e.code, message: e.message, retry: e.code !== "no-providers" },
                });
              else
                send({
                  error: {
                    code: "error",
                    message: "Verification failed. Please retry.",
                    retry: true,
                  },
                });
            } finally {
              c.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
