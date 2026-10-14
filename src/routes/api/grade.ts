import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import { fallbackGrade, type AssessmentType } from "@/lib/evaluation";

const Input = z.object({
  response: z.string().min(1).max(6000),
  assessmentType: z.enum(["prediction", "checkpoint", "teach_back", "transfer", "retention"]),
  conceptTitle: z.string().min(1).max(300),
  prompt: z.string().max(2000),
  reference: z.string().max(6000),
});

export const Route = createFileRoute("/api/grade")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const data = Input.parse(await request.json());
      const fallback = fallbackGrade(data.response, data.reference, data.assessmentType as AssessmentType);
      const key = process.env["LOVABLE_API_KEY"];

      if (!key) return Response.json({ ...fallback, gradedBy: "fallback" });

      try {
        const lovable = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: key,
          headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        });

        const result = await generateText({
          model: lovable.responses("openai/gpt-6-astra"),
          maxRetries: 0,
          system: `You grade university learning responses, not writing quality.

Return ONLY valid JSON with this exact shape:
{"score": number, "feedback": string, "strengths": string[], "next_step": string}

Score 0-100. Reward correct concepts, causal/mechanistic reasoning, and application to the situation. Do not reward keyword stuffing. A short but correct answer can score highly. For prediction, grade the quality of reasoning, not whether the prediction happened to match the later answer. Keep feedback concise and actionable.`,
          prompt: [
            `CONCEPT: ${data.conceptTitle}`,
            `ASSESSMENT TYPE: ${data.assessmentType}`,
            `PROMPT: ${data.prompt}`,
            `REFERENCE / RUBRIC SIGNALS: ${data.reference}`,
            `LEARNER RESPONSE: ${data.response}`,
          ].join("\n\n"),
          providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
        });

        const raw = result.text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(raw) as Partial<ReturnType<typeof fallbackGrade>>;
        if (typeof parsed.score === "number" && typeof parsed.feedback === "string" && Array.isArray(parsed.strengths) && typeof parsed.next_step === "string") {
          return Response.json({
            score: Math.max(0, Math.min(100, Math.round(parsed.score))),
            feedback: parsed.feedback,
            strengths: parsed.strengths.slice(0, 3).map(String),
            next_step: parsed.next_step,
            gradedBy: "ai",
          });
        }
      } catch {
        // The fallback grader keeps evaluation usable when AI grading is unavailable.
      }

      return Response.json({ ...fallback, gradedBy: "fallback" });
    } catch (error) {
      return Response.json({ message: error instanceof Error ? error.message : "Could not grade the response." }, { status: 400 });
    }
  } } },
});
