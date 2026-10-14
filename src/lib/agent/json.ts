// Robust JSON extraction from LLM output — mirrors the one-shot pattern used
// across Cortex's AI routes. Tries fenced blocks first, then progressively
// smaller suffixes so trailing prose ("Here is the JSON…") never breaks parsing.

export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.search(/[[{]/)
  if (start === -1) return null
  for (let end = raw.length; end > start + 1; end--) {
    const slice = raw.slice(start, end)
    try {
      return JSON.parse(slice) as T
    } catch {
      continue
    }
  }
  return null
}
