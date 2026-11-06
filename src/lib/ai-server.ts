// One place for server-side text AI: a direct Claude key (ANTHROPIC_API_KEY) or the Lovable AI
// gateway (LOVABLE_API_KEY). Used by chat, assess, generate-module and the translation routes.

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { LANGS, isLangCode, type LangCode } from "./i18n/registry";
import { DEFAULT_CLAUDE_MODEL, pickProvider, upstreamError } from "./vision-server";

export type Env = Record<string, string | undefined>;

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export const LANG_CODES = LANGS.map((l) => l.code) as [LangCode, ...LangCode[]];

export function languageName(code: string | undefined): string {
  return LANGS.find((l) => l.code === code)?.name ?? "English";
}

/** Appended to a system prompt so the AI writes learner-facing text in the chosen language. */
export function languageRule(lang: string | undefined, jsonOutput = false): string {
  if (!lang || lang === "en" || !isLangCode(lang)) return "";
  const l = LANGS.find((x) => x.code === lang);
  return (
    `\n\nLANGUAGE: Write every learner-facing sentence in ${l?.name} (${l?.native}), using its native script. ` +
    `Keep equations, mathematical symbols, units and code in standard notation. ` +
    `Use the standard ${l?.name} term for technical vocabulary where one exists; otherwise keep the common English term.` +
    (jsonOutput
      ? " Keep all JSON keys exactly as specified (in English); only the string values are in " +
        l?.name +
        "."
      : "")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type CompleteOptions = { system: string; prompt: string; maxTokens?: number };

export const aiConfigured = (env: Env) => pickProvider(env) !== null;

/** Run one text completion with whichever provider is configured. Throws AiError. */
export async function completeText(env: Env, o: CompleteOptions): Promise<string> {
  const provider = pickProvider(env);
  if (!provider) throw new AiError("AI is not configured.", 401, "not_configured");

  if (provider === "anthropic") {
    const base = (env["ANTHROPIC_BASE_URL"] || "https://api.anthropic.com").replace(/\/+$/, "");
    const init = {
      method: "POST",
      headers: {
        "x-api-key": env["ANTHROPIC_API_KEY"] ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env["ANTHROPIC_MODEL"] || DEFAULT_CLAUDE_MODEL,
        max_tokens: o.maxTokens ?? 2048,
        system: o.system,
        messages: [{ role: "user", content: o.prompt }],
      }),
    };
    let res = await fetch(`${base}/v1/messages`, init);
    if ([429, 503, 529].includes(res.status)) {
      await sleep(1500);
      res = await fetch(`${base}/v1/messages`, init);
    }
    if (!res.ok) {
      const e = upstreamError(res.status, await res.text());
      throw new AiError(e.message, e.status, "upstream");
    }
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    return (json.content ?? []).map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("");
  }

  const key = env["LOVABLE_API_KEY"] ?? "";
  const lovable = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  try {
    const result = streamText({
      model: lovable.responses(env["TEXT_MODEL"] || "openai/gpt-6-astra"),
      maxRetries: 1,
      system: o.system,
      prompt: o.prompt,
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
    return await result.text;
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 402)
      throw new AiError("AI credits are used up for this workspace.", 402, "upstream");
    if (status === 429)
      throw new AiError("Too many requests — try again in a moment.", 429, "upstream");
    throw new AiError(
      "The AI service could not complete that request.",
      status && status >= 400 ? status : 502,
      "upstream",
    );
  }
}

/** Pull the first {...} object out of a model reply (tolerates fences and surrounding prose). */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a)
    throw new AiError("The AI reply was not in the expected format.", 502, "format");
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    throw new AiError("The AI reply was not in the expected format.", 502, "format");
  }
}

export function aiErrorResponse(error: unknown): Response {
  if (error instanceof AiError)
    return Response.json({ message: error.message, code: error.code }, { status: error.status });
  return Response.json({ message: "Something went wrong." }, { status: 500 });
}
