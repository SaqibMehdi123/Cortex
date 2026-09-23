// Thin OpenAI-compatible chat client — the deployment-friendly replacement
// for z-ai-web-dev-sdk, whose credentials live in a config file that
// serverless platforms (Vercel, Netlify) cannot provide.
//
// Works with any provider that speaks the /chat/completions shape:
//   Google Gemini → OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
//                    OPENAI_API_KEY=<AI Studio key, AIza…>
//                    AI_MODEL=gemini-2.5-flash
//   Groq (free)   → OPENAI_BASE_URL=https://api.groq.com/openai/v1
//   OpenRouter    → OPENAI_BASE_URL=https://openrouter.ai/api/v1
//   OpenAI        → just set OPENAI_API_KEY
//
// createAI() intentionally mirrors the z-ai-web-dev-sdk call shape
// (client.chat.completions.create) so every call site needed only a
// one-line client swap. `thinking` is accepted and ignored for the
// same reason.
//
// Resilience: transient upstream failures (Gemini's 503 "high demand",
// 429 rate limits, 5xx blips) are retried with a short backoff inside a
// time budget that fits the routes' maxDuration=60. If optional failover
// providers are configured they take over when the primary keeps failing:
//   GROQ_API_KEY                    → Groq failover (model GROQ_MODEL or llama-3.3-70b-versatile)
//   AI_FALLBACK_BASE_URL/_API_KEY   → any OpenAI-compatible failover (model AI_FALLBACK_MODEL)

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiCompletionParams {
  messages: AiMessage[]
  temperature?: number
  max_tokens?: number
  /** z-ai-web-dev-sdk compatibility; ignored */
  thinking?: unknown
}

interface AiCompletionResult {
  // Mirrors the z-ai-web-dev-sdk result shape (choices is always present on a
  // successful OpenAI-compatible response; message/content defensively optional).
  choices: { message?: { content?: string } }[]
}

/** Coarse provider label for diagnostics (never exposes keys). */
export function aiProvider(): string {
  return providerLabelFor(process.env.OPENAI_BASE_URL || '')
}

function providerLabelFor(baseUrl: string): string {
  const base = baseUrl || ''
  if (base.includes('generativelanguage.googleapis.com')) return 'gemini'
  if (base.includes('api.groq.com')) return 'groq'
  if (base.includes('openrouter.ai')) return 'openrouter'
  return base ? 'custom' : 'openai'
}

// Per-provider fallback so a missing AI_MODEL can't 404 the very first call:
// each known base URL gets a model that actually exists there.
const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
}

export function aiDefaultModel(): string {
  return PROVIDER_DEFAULT_MODELS[aiProvider()] ?? 'gpt-4o-mini'
}

export const AI_MODEL = process.env.AI_MODEL || aiDefaultModel()

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

/** Thrown by aiChatCompletion when the provider itself answered with an error.
 *  Its message is the provider's own status + body excerpt — safe to show to
 *  the authenticated user whose key produced it, and invaluable for debugging
 *  "why is the copilot failing" without server log access. */
export class AiUpstreamError extends Error {
  readonly status: number
  constructor(status: number, detail: string) {
    super(`AI provider error (${status}): ${detail}`)
    this.name = 'AiUpstreamError'
    this.status = status
  }
}

export function isAiUpstreamError(e: unknown): e is AiUpstreamError {
  return e instanceof AiUpstreamError
}

// ─── Retry + failover ───────────────────────────────────────────────
// Gemini answers "high demand" spikes with a fast 503 — one quick retry a
// second later usually lands. If it doesn't, and the deployment has a
// failover key, the request hops to that provider instead of failing.

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504])
/** Total wall-clock budget for retries across ALL providers. Primary AI routes
 *  run with maxDuration=60 — this keeps the retry ladder well inside it. */
const RETRY_WINDOW_MS = 20_000
/** Non-final providers get a tighter per-attempt timeout so a hung primary
 *  can't eat the whole budget; the last provider keeps the full 120 s for
 *  long document generations. */
const FAILOVER_ATTEMPT_TIMEOUT_MS = 45_000

interface ProviderTarget {
  label: string
  baseUrl: string
  apiKey: string
  model: string
}

function failoverTargets(): ProviderTarget[] {
  const list: ProviderTarget[] = []
  if (process.env.GROQ_API_KEY) {
    list.push({
      label: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || PROVIDER_DEFAULT_MODELS.groq,
    })
  }
  if (process.env.AI_FALLBACK_API_KEY && process.env.AI_FALLBACK_BASE_URL) {
    const baseUrl = process.env.AI_FALLBACK_BASE_URL.replace(/\/+$/, '')
    list.push({
      label: providerLabelFor(baseUrl),
      baseUrl,
      apiKey: process.env.AI_FALLBACK_API_KEY,
      model: process.env.AI_FALLBACK_MODEL || PROVIDER_DEFAULT_MODELS[providerLabelFor(baseUrl)] || 'gpt-4o-mini',
    })
  }
  return list
}

async function callProvider(target: ProviderTarget, params: AiCompletionParams, timeoutMs: number): Promise<AiCompletionResult> {
  const res = await fetch(`${target.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${target.apiKey}`,
    },
    body: JSON.stringify({
      model: target.model,
      messages: params.messages,
      ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
      ...(typeof params.max_tokens === 'number' ? { max_tokens: params.max_tokens } : {}),
    }),
    // Generation can legitimately take a while on long document context
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new AiUpstreamError(res.status, detail.slice(0, 300))
  }
  return (await res.json()) as AiCompletionResult
}

function isTransientFailure(e: unknown): boolean {
  if (e instanceof AiUpstreamError) return RETRYABLE_STATUS.has(e.status)
  // Network hiccups + AbortSignal timeouts surface as TypeError/DOMException
  const name = (e as { name?: string })?.name ?? ''
  return name === 'TimeoutError' || name === 'AbortError' || e instanceof TypeError
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function aiChatCompletion(params: AiCompletionParams): Promise<AiCompletionResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new AiUpstreamError(
      503,
      'AI is not configured on this deployment — set OPENAI_API_KEY (and OPENAI_BASE_URL for non-OpenAI providers), then redeploy'
    )
  }
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const targets: ProviderTarget[] = [
    { label: aiProvider(), baseUrl, apiKey, model: AI_MODEL },
    ...failoverTargets(),
  ]

  const startedAt = Date.now()
  const failures: string[] = []
  let lastStatus = 503

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]
    const isLast = i === targets.length - 1
    const timeoutMs = isLast ? 120_000 : FAILOVER_ATTEMPT_TIMEOUT_MS
    // each provider gets an initial attempt + one retry while the budget holds
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callProvider(target, params, timeoutMs)
        if (i > 0) console.warn(`[ai] failover succeeded via ${target.label} after: ${failures.join(' | ')}`)
        return result
      } catch (e) {
        lastStatus = e instanceof AiUpstreamError ? e.status : 502
        failures.push(`${target.label}${e instanceof AiUpstreamError ? ` ${e.status}` : ''}: ${e instanceof Error ? e.message.replace(/^AI provider error \(\d+\): /, '') : String(e)}`.slice(0, 320))
        // Hard errors (bad key, unknown model, malformed request) will not
        // get better on this provider — stop retrying it and move on.
        if (!isTransientFailure(e)) break
        if (attempt === 0 && Date.now() - startedAt < RETRY_WINDOW_MS) {
          await sleep(isLast ? 900 : 600)
          continue
        }
        break
      }
    }
    if (Date.now() - startedAt >= RETRY_WINDOW_MS) break
  }

  const summary = failures.join(' | ').slice(0, 600)
  throw new AiUpstreamError(lastStatus, summary || 'request failed')
}

// Drop-in replacement for `await ZAI.create()` from z-ai-web-dev-sdk.
export async function createAI() {
  return {
    chat: {
      completions: {
        create: aiChatCompletion,
      },
    },
  }
}
