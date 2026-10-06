import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";

const Input = z.object({ question: z.string().min(1).max(2000), context: z.string().max(12000), source: z.string().max(12000).optional() });

export const Route = createFileRoute("/api/chat")({
 server: { handlers: { POST: async ({ request }) => {
  try {
   const data = Input.parse(await request.json());
   const key = process.env["LOVABLE_API_KEY"];
   if (!key) return Response.json({ message: "AI is not configured for this classroom." }, { status: 401 });
   const lovable = createOpenAI({ baseURL:"https://ai.gateway.lovable.dev/v1", apiKey:key, headers:{"Lovable-API-Key":key,"X-Lovable-AIG-SDK":"vercel-ai-sdk"} });
   const result = streamText({
    model: lovable.responses("openai/gpt-6-astra"),
    system: "You are Dr Rao, a rigorous and warm university teacher in AI KYRO. Answer the learner's exact question using the classroom context. Surface one hidden assumption, use a concrete example, and end with one short check-for-understanding question. Never claim a source says something unless it appears in supplied source text. Keep the answer under 180 words.",
    prompt: `CLASSROOM CONTEXT:\n${data.context}\n\nLEARNER MATERIAL:\n${data.source || "No learner material attached."}\n\nQUESTION:\n${data.question}`,
    providerOptions:{ openai:{ forceReasoning:true, reasoningEffort:"low", reasoningSummary:"auto", store:false, include:["reasoning.encrypted_content"] } },
   });
   return result.toTextStreamResponse();
  } catch (error) {
   const message = error instanceof Error ? error.message : "The classroom could not answer right now.";
   return Response.json({ message }, { status: 400 });
  }
 } } }
});
