# Gemini Setup — power every AI feature with Google's Gemini API

Cortex's AI client (`src/lib/ai.ts`) speaks the **OpenAI-compatible chat
completions** shape. Google Gemini exposes exactly that shape at a dedicated
base URL, so wiring Gemini in is a **pure environment-variable change — zero
code changes**.

Everything below (Copilot answers, document Q&A, summaries, flashcard and
mindmap generation, paper analysis, email parsing) runs through this one
client, so one key lights up all of it.

## 1. Get the key

1. Open <https://aistudio.google.com/apikey> and sign in with any Google
   account.
2. **Create API key** → copy it. Keys start with `AIza…`.
3. Free tier is real and generous (flash models included) — you can start
   without adding a billing account. Add billing later only if you outgrow it.

## 2. Set three environment variables

In Vercel → your project → Settings → Environment Variables (and locally in
`.env`):

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | your Gemini key, e.g. `AIzaSy…` (yes, it goes in the "OPENAI" slot — the client is OpenAI-*compatible*, not OpenAI-specific) |
| `OPENAI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_MODEL` | `gemini-2.5-flash` |

Then **redeploy** (Vercel: Deployments → ⋯ → Redeploy) or restart the local
dev server. That's it.

## 3. Verify

- Open the app → the Copilot dock should answer a question.
- Or, from a terminal (any directory):

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"ping"}]}'
```

A JSON reply with `choices[0].message.content` means the key, base URL and
model all work — which is all Cortex needs.

## Model picking

| Model | Good for |
| --- | --- |
| `gemini-2.5-flash` | The default — fast, cheap, smart enough for summaries/Q&A/flashcards |
| `gemini-2.5-flash-lite` | Cheapest — fine for mindmaps and simple summaries |
| `gemini-2.5-pro` | Heaviest reasoning — slower and pricier; only worth it if you want deeper paper analysis |

Model names also appear in AI Studio when you create a key; any
`gemini-*` name that responds on the base URL above works.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| 401 / `API key not valid` | Key copied wrong, or it's a key from a different Google project — create a fresh one |
| 404 on `/chat/completions` | `OPENAI_BASE_URL` must end exactly with `/v1beta/openai` (no trailing slash needed) |
| `model not found` / 400 | Model name typo, or the model isn't available to your key — use `gemini-2.5-flash` |
| 429 `quota exceeded` | Free-tier rate limit — retry shortly, or enable billing in AI Studio |
| Responses suddenly stop | Key removed/rotated in Google AI Studio — regenerate and update `OPENAI_API_KEY` |
| Everything AI says "not configured" | At least one of the three vars is missing in the environment the app actually runs in (check Vercel env for Production) |

## Switching providers later

Any OpenAI-compatible provider (Groq, OpenRouter, OpenAI, LM Studio…) is a
three-variable swap — see the AI section of `.env.example`. Nothing in the
codebase is tied to Google.
