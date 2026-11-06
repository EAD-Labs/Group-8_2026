/** Pull the first JSON object out of a model reply (tolerates code fences and surrounding prose). */
export function extractJson<T = unknown>(text: string): T | null {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const start = t.indexOf("{");
  if (start < 0) return null;
  for (let end = t.lastIndexOf("}"); end > start; end = t.lastIndexOf("}", end - 1)) {
    try {
      return JSON.parse(t.slice(start, end + 1)) as T;
    } catch {
      /* shrink and retry */
    }
  }
  return null;
}
