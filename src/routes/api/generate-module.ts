import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";

const Input = z.object({ topic: z.string().max(500), material: z.string().max(12000).optional() });
const Concept = z.object({ title: z.string(), bloom: z.string(), definition: z.string(), misconception: z.string(), example: z.string(), equation: z.string(), transfer: z.string() });
const Out = z.object({ title: z.string(), description: z.string(), concepts: z.array(Concept).min(2).max(8) });

export const Route = createFileRoute("/api/generate-module")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const data = Input.parse(await request.json());
      if (!data.topic.trim() && !data.material?.trim()) return Response.json({ message: "Add a topic or attach material." }, { status: 400 });
      const key = process.env["LOVABLE_API_KEY"];
      if (!key) return Response.json({ message: "AI is not configured." }, { status: 401 });
      const lovable = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey: key, headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } });
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system: `You design complete university learning modules for AI KYRO. Cover the WHOLE topic as an ordered concept sequence (4-7 concepts), from foundations to analysis — not just definitions. If learner material is supplied, base the sequence on it and don't invent facts it contradicts. Reply with ONLY raw JSON: {"title":string,"description":string (1 sentence),"concepts":[{"title":string,"bloom":"Remember"|"Understand"|"Apply"|"Analyse","definition":string (2-3 sentence core explanation),"misconception":string (a common wrong belief, phrased as a lowercase clause),"example":string (concrete worked example),"equation":string (key formula or short principle for the board),"transfer":string (a new-situation problem)}]}`,
        prompt: `TOPIC: ${data.topic || "(derive from material)"}\n\nLEARNER MATERIAL:\n${data.material || "None"}`,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const text = await result.text;
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      return Response.json(Out.parse(JSON.parse(json)));
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode;
      const message = status === 402 ? "AI credits are used up for this workspace." : status === 429 ? "Too many requests — try again in a moment." : "Could not build the module. Try rephrasing the topic.";
      return Response.json({ message }, { status: status && status >= 400 ? status : 500 });
    }
  } } },
});
