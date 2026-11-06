import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  LANG_CODES,
  aiErrorResponse,
  aiConfigured,
  completeText,
  languageRule,
} from "@/lib/ai-server";

// A full lesson, written exactly as the app's AI would teach the topic in a chat. The classroom then
// speaks it turn by turn and weaves the interactive turns (quick checks, blanks, checkpoint) around it.
const Input = z.object({
  topic: z.string().min(1).max(200),
  module: z.string().max(200).optional(),
  /** verified facts for this topic: the lesson must not contradict them */
  notes: z.string().max(8000).optional(),
  /** the learner's own material (notes, slides) this class was built from */
  material: z.string().max(12000).optional(),
  language: z.enum(LANG_CODES).optional(),
});

export const Route = createFileRoute("/api/teach")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const d = Input.parse(await request.json());
          const env = process.env as Record<string, string | undefined>;
          if (!aiConfigured(env))
            return Response.json({ message: "AI is not configured." }, { status: 401 });
          const system =
            "You are a brilliant, patient teacher. Teach exactly as you would if a university student asked you in a chat to really help them understand a topic: build intuition first, then the precise ideas, derive the key results step by step, work through concrete examples with numbers, point out the common mistakes, and connect it to what they already know. " +
            "Use clear headings (##) for the parts of the lesson, short paragraphs, and lists where they help. Write in a natural spoken style, because the lesson will be read aloud in a classroom and shown on the board. Do not add a quiz at the end — the classroom asks the questions. " +
            "Write every formula in LaTeX: short ones inline as $...$, and each important formula on its own line as $$...$$. " +
            'Whenever a graph helps (how one quantity changes with another), include it as a fenced code block whose language is plot, containing only JSON like {"title":"…","x":{"label":"…","min":0,"max":10},"y":{"label":"…"},"series":[{"label":"…","expr":"…"}]} where expr is a formula in x using + - * / ^ ( ), sin cos tan exp ln log sqrt abs and pi — or use "points":[[x,y],…] for data. Include one or two graphs when the topic has a relationship worth seeing. ' +
            languageRule(d.language);
          const prompt =
            `Teach me ${d.topic}${d.module ? ` (from my course: ${d.module})` : ""} thoroughly.` +
            (d.notes
              ? `\n\nStay consistent with these verified facts for this topic (do not contradict them):\n${d.notes}`
              : "") +
            (d.material
              ? `\n\nThis class is based on my own notes/slides — teach what they cover, explaining it properly:\n${d.material}`
              : "");
          const text = (await completeText(env, { system, prompt, maxTokens: 5000 })).trim();
          if (text.length < 200)
            return Response.json({ message: "The AI returned too little." }, { status: 502 });
          return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
        } catch (error) {
          if (error instanceof z.ZodError)
            return Response.json({ message: "Invalid request." }, { status: 400 });
          return aiErrorResponse(error);
        }
      },
    },
  },
});
