import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  AiError,
  LANG_CODES,
  aiErrorResponse,
  completeText,
  extractJson,
  languageRule,
} from "@/lib/ai-server";

const Input = z.object({
  topic: z.string().max(500),
  material: z.string().max(12000).optional(),
  language: z.enum(LANG_CODES).optional(),
});
const Concept = z.object({
  title: z.string(),
  bloom: z.string(),
  definition: z.string(),
  misconception: z.string(),
  example: z.string(),
  equation: z.string(),
  transfer: z.string(),
});
const Out = z.object({
  title: z.string(),
  description: z.string(),
  concepts: z.array(Concept).min(2).max(8),
});

export const Route = createFileRoute("/api/generate-module")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data = Input.parse(await request.json());
          if (!data.topic.trim() && !data.material?.trim())
            return Response.json({ message: "Add a topic or attach material." }, { status: 400 });
          const text = await completeText(process.env as Record<string, string | undefined>, {
            maxTokens: 8000,
            system:
              `You design complete university learning modules for AI KYRO. Cover the WHOLE topic as an ordered concept sequence (4-7 concepts), from foundations to analysis — not just definitions. If learner material is supplied, base the sequence on it and don't invent facts it contradicts. Reply with ONLY raw JSON: {"title":string,"description":string (1 sentence),"concepts":[{"title":string,"bloom":"Remember"|"Understand"|"Apply"|"Analyse" (always exactly one of these English words),"definition":string (2-3 sentence core explanation),"misconception":string (a common wrong belief, phrased as a lowercase clause),"example":string (concrete worked example),"equation":string (key formula or short principle for the board),"transfer":string (a new-situation problem)}]}` +
              languageRule(data.language, true),
            prompt: `TOPIC: ${data.topic || "(derive from material)"}\n\nLEARNER MATERIAL:\n${data.material || "None"}`,
          });
          const parsed = Out.safeParse(extractJson(text));
          if (!parsed.success)
            throw new AiError(
              "Could not build the module. Try rephrasing the topic.",
              502,
              "format",
            );
          return Response.json(parsed.data);
        } catch (error) {
          if (error instanceof z.ZodError)
            return Response.json({ message: "Invalid request." }, { status: 400 });
          return aiErrorResponse(error);
        }
      },
    },
  },
});
