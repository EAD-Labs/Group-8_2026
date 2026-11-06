import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";
import {
  READER_SYSTEM,
  anthropicText,
  buildAnthropicRequest,
  parseReaderReply,
  pickProvider,
  upstreamError,
} from "@/lib/vision-server";

// Reads ONE page image: transcribes printed or handwritten text and describes diagrams/figures.
// Uses a direct Claude key (ANTHROPIC_API_KEY) when present, else the Lovable AI gateway.
const Input = z.object({
  // data:image/jpeg;base64,... produced in the browser (downscaled, <= ~3 MB)
  image: z
    .string()
    .max(4_500_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  ref: z.string().max(60),
  // text already extracted from the page's text layer (may be empty for scans)
  pageText: z.string().max(6000).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const Route = createFileRoute("/api/read-page")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data = Input.parse(await request.json());
          const env = process.env as Record<string, string | undefined>;
          const provider = pickProvider(env);
          if (!provider)
            return Response.json(
              { message: "AI is not configured.", code: "not_configured" },
              { status: 401 },
            );
          const base64 = data.image.slice(data.image.indexOf(",") + 1);
          const mediaType = data.image.slice(5, data.image.indexOf(";"));

          if (provider === "anthropic") {
            const req = buildAnthropicRequest(env, {
              ref: data.ref,
              pageText: data.pageText ?? "",
              base64,
              mediaType,
            });
            let res = await fetch(req.url, req.init);
            if ([429, 503, 529].includes(res.status)) {
              await sleep(1500); // one polite retry for rate limits / overload
              res = await fetch(req.url, req.init);
            }
            if (!res.ok) {
              const e = upstreamError(res.status, await res.text());
              return Response.json({ message: e.message, code: "upstream" }, { status: e.status });
            }
            return Response.json(parseReaderReply(anthropicText(await res.json())));
          }

          const key = env["LOVABLE_API_KEY"] ?? "";
          const lovable = createOpenAI({
            baseURL: "https://ai.gateway.lovable.dev/v1",
            apiKey: key,
            headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          });
          const result = streamText({
            model: lovable.responses(env["VISION_MODEL"] || "openai/gpt-6-astra"),
            maxRetries: 1,
            system: READER_SYSTEM,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Page: ${data.ref}\nText layer (may be empty or partial):\n${data.pageText || "(none)"}`,
                  },
                  { type: "image", image: base64, mediaType },
                ],
              },
            ],
            providerOptions: {
              openai: {
                forceReasoning: true,
                reasoningEffort: "low",
                reasoningSummary: "auto",
                store: false,
                include: ["reasoning.encrypted_content"],
              },
            },
          });
          return Response.json(parseReaderReply(await result.text));
        } catch (error) {
          if (error instanceof z.ZodError)
            return Response.json({ message: "Invalid page image." }, { status: 400 });
          const status = (error as { statusCode?: number })?.statusCode;
          const message =
            status === 402
              ? "AI credits are used up for this workspace."
              : status === 429
                ? "Too many requests — try again in a moment."
                : "Could not read that page.";
          return Response.json({ message }, { status: status && status >= 400 ? status : 500 });
        }
      },
    },
  },
});
