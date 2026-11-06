import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LANG_CODES, aiErrorResponse, completeText, languageRule } from "@/lib/ai-server";
import { pickProvider } from "@/lib/vision-server";

const Input = z.object({
  question: z.string().min(1).max(2000),
  context: z.string().max(12000),
  source: z.string().max(12000).optional(),
  /** the verified notes for this concept: what the answer should stay inside */
  notes: z.string().max(6000).optional(),
  teacher: z.string().max(60).optional(),
  language: z.enum(LANG_CODES).optional(),
  /** earlier doubts in this class (oldest first) so a follow-up builds on them */
  history: z
    .array(z.object({ q: z.string().max(1200), a: z.string().max(2400) }))
    .max(8)
    .optional(),
  /** "again": they did not follow the last explanation; "example": they want a concrete case */
  intent: z.enum(["again", "example"]).optional(),
  /** bridge: the answer already given and the next teaching point, to write the call-back line */
  answer: z.string().max(2400).optional(),
  next: z.string().max(1200).optional(),
  /** "plain": the comparison baseline, an ordinary AI assistant with no classroom scaffolding */
  mode: z.enum(["classroom", "plain", "bridge"]).optional(),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data = Input.parse(await request.json());
          const env = process.env as Record<string, string | undefined>;
          const provider = pickProvider(env);
          if (!provider)
            return Response.json(
              { message: "AI is not configured for this classroom." },
              { status: 401 },
            );
          const teacher = data.teacher?.replace(/[^\p{L}\p{N} .'-]/gu, "") || "Dr Rao";
          const live = `You are ${teacher}, a warm, rigorous university teacher in the middle of a live class, talking with one learner. This is a conversation, not a fixed script.`;
          const history = (data.history ?? [])
            .map((h, i) => `Q${i + 1}: ${h.q}\nYou answered: ${h.a}`)
            .join("\n\n");
          let system: string;
          let prompt: string;
          let maxTokens = 700;
          if (data.mode === "plain") {
            system =
              "You are a helpful AI assistant. Answer the user's question directly, accurately and completely.";
            prompt = `CLASSROOM CONTEXT:\n${data.context}\n\nLEARNER MATERIAL:\n${data.source || "No learner material attached."}\n\nQUESTION:\n${data.question}`;
            maxTokens = 1024;
          } else if (data.mode === "bridge") {
            system =
              `${live} Write ONE sentence, at most 28 words, that ties the next teaching point back to the learner's earlier doubt. Do not repeat the answer you already gave. Speak directly to the learner.` +
              languageRule(data.language);
            prompt = `THE LEARNER'S EARLIER DOUBT:\n${data.question}\n\nYOUR ANSWER:\n${data.answer ?? ""}\n\nTHE NEXT POINT IN CLASS:\n${data.next ?? ""}`;
            maxTokens = 120;
          } else {
            system =
              `${live} Answer the learner's exact question, using the class so far, the verified notes and any material they attached. ` +
              `Let the question decide the shape of the answer: a definition question gets a crisp definition, a "why" gets the cause, an example request gets one worked example, and "I don't get it" gets a different angle and simpler words than your last explanation — never repeat yourself. ` +
              `If an earlier exchange matters, build on it and say so briefly. If the notes do not cover the question, say what you do know and where you are unsure instead of inventing. ` +
              `Never claim a source says something unless it appears in the supplied text. Plain spoken language, at most 110 words, no headings or bullet points. Ask a question back only if it really helps.` +
              languageRule(data.language);
            const want =
              data.intent === "again"
                ? "\n(The learner did not follow your last explanation: use a different angle and simpler words.)"
                : data.intent === "example"
                  ? "\n(The learner wants one concrete example.)"
                  : "";
            prompt =
              `CLASS SO FAR:\n${data.context}\n\n` +
              `VERIFIED NOTES FOR THIS TOPIC:\n${data.notes || "None supplied."}\n\n` +
              `LEARNER MATERIAL:\n${data.source || "No learner material attached."}\n\n` +
              (history ? `EARLIER IN THIS CLASS THE LEARNER ASKED:\n${history}\n\n` : "") +
              `THE LEARNER NOW SAYS:\n${data.question}${want}`;
          }
          const text = (await completeText(env, { system, prompt, maxTokens })).trim();
          if (!text)
            return Response.json({ message: "The AI returned an empty answer." }, { status: 502 });
          return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
        } catch (error) {
          if (error instanceof z.ZodError)
            return Response.json({ message: "Invalid question." }, { status: 400 });
          return aiErrorResponse(error);
        }
      },
    },
  },
});
