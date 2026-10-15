// Shared URL safety for anything rendered as a link or opened by the client.
//
// URLs reach the DOM from three kinds of sources, and all three can be
// attacker-influenced: user input (opportunity links, mindmap node links),
// third-party feeds (Greenhouse/Lever/RemoteOK/… posting URLs, NSTP logos),
// and LLM output parsed out of user CVs. React escapes text, but it does NOT
// sanitize href attributes — `<a href="javascript:…">` executes on click in
// app origin (session cookies included). Every anchor/window.open fed from
// those sources goes through safeExternalUrl(), which allows only plain
// http(s) URLs and returns null otherwise so callers can skip rendering.

export function isSafeExternalUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  const url = raw.trim()
  if (!url) return false
  // new URL() accepts things like "javascript:alert(1)" as scheme-relative
  // opaques — so check the protocol allow-list explicitly. Also reject
  // protocol-relative ("//evil.com") and any embedded newlines, which browsers
  // strip before parsing and can smuggle schemes past naive checks.
  if (/[\r\n\t]/.test(url)) return false
  if (url.startsWith('//')) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/** A display-safe version of the URL, or null when it must not be rendered. */
export function safeExternalUrl(raw: unknown): string | null {
  if (!isSafeExternalUrl(raw)) return null
  const url = (raw as string).trim()
  try {
    return new URL(url).toString()
  } catch {
    return null
  }
}
