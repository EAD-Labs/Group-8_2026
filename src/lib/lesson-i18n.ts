// Translating a lesson module into another language and rebuilding its lessons from the result.
// The AI returns only the *content* (titles, definitions, examples…); the lesson structure,
// stage labels and prompts come from the dictionary, so a translated lesson always has exactly the
// same turns as the original and learner progress (by concept/stage index) stays valid.

import { arc, conceptSource, type Concept, type Module } from "./curriculum";
import type { LangCode } from "./i18n";

export type ConceptTx = {
  title: string;
  phrase: string;
  definition: string;
  misconception: string;
  example: string;
  transfer: string;
};
export type ModuleTx = { title: string; description: string; concepts: ConceptTx[] };

export const txKey = (lang: LangCode, slug: string) => `${lang}:${slug}`;

/** What gets sent to the translator: only the text that needs translating (equations stay as is). */
export function moduleToTxSource(m: Module): ModuleTx {
  return {
    title: m.title,
    description: m.description,
    concepts: m.concepts.map((c) => {
      const s = conceptSource(c);
      return {
        title: c.title,
        phrase: s.title,
        definition: s.definition,
        misconception: s.misconception,
        example: s.example,
        transfer: s.transfer,
      };
    }),
  };
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Validate an untrusted translation: same number of concepts, every field a non-empty string. */
export function validateModuleTx(raw: unknown, expectedConcepts: number): ModuleTx | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = str(o["title"], 200);
  const description = str(o["description"], 600) ?? "";
  if (!title || !Array.isArray(o["concepts"]) || o["concepts"].length !== expectedConcepts)
    return null;
  const concepts: ConceptTx[] = [];
  for (const c of o["concepts"] as Array<Record<string, unknown>>) {
    const t = str(c?.["title"], 200);
    const phrase = str(c?.["phrase"], 200) ?? t;
    const definition = str(c?.["definition"], 1500);
    const misconception = str(c?.["misconception"], 800);
    const example = str(c?.["example"], 1500);
    const transfer = str(c?.["transfer"], 1200);
    if (!t || !phrase || !definition || !misconception || !example || !transfer) return null;
    concepts.push({ title: t, phrase, definition, misconception, example, transfer });
  }
  return { title, description, concepts };
}

/**
 * The module as it should be shown in `lang`. Returns the module unchanged when it is already in
 * that language, or when no translation is available yet (the screen then shows the original).
 */
export function localizeModule(m: Module, lang: LangCode, tx: ModuleTx | null | undefined): Module {
  if ((m.lang ?? "en") === lang || !tx || tx.concepts.length !== m.concepts.length) return m;
  const concepts: Concept[] = m.concepts.map((c, i) => {
    const t = tx.concepts[i] as ConceptTx;
    const base = conceptSource(c);
    const src = {
      title: t.phrase,
      definition: t.definition,
      misconception: t.misconception,
      example: t.example,
      equation: base.equation, // formulas are language-neutral
      transfer: t.transfer,
    };
    return {
      slug: c.slug,
      title: t.title,
      bloom: c.bloom,
      duration: c.duration,
      mastery: c.mastery,
      src,
      stages: arc(
        src.title,
        src.definition,
        src.misconception,
        src.example,
        src.equation,
        src.transfer,
        lang,
      ),
    };
  });
  return { ...m, lang, title: tx.title, description: tx.description || m.description, concepts };
}
