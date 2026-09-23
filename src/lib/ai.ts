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
  const base = process.env.OPENAI_BASE_URL || ''
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

export async function aiChatCompletion(params: AiCompletionParams): Promise<AiCompletionResult> {
  const apiKey = process.env.OPENAI_API_KEY
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  if (!apiKey) {
    throw new AiUpstreamError(
      503,
      'AI is not configured on this deployment — set OPENAI_API_KEY (and OPENAI_BASE_URL for non-OpenAI providers), then redeploy'
    )
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: params.messages,
      ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
      ...(typeof params.max_tokens === 'number' ? { max_tokens: params.max_tokens } : {}),
    }),
    // Generation can legitimately take a while on long document context
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new AiUpstreamError(res.status, detail.slice(0, 300))
  }
  return (await res.json()) as AiCompletionResult
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
