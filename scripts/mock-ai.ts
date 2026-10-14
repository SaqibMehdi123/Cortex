// Local mock OpenAI-compatible server for agent E2E tests (no real key needed).
// Serves POST /chat/completions and returns scripted JSON keyed off prompts:
//   - CV parse prompt   → structured profile JSON
//   - scoring prompt    → batch match scores
//   - checklist prompt  → form questions
//   - cover letter      → markdown text
// Run: bun scripts/mock-ai.ts   (port 8788)
// Env: MOCK_AI_PORT, MOCK_AI_LOG (path to append request log lines)

import http from 'node:http'
import fs from 'node:fs'

const port = Number(process.env.MOCK_AI_PORT || 8788)
const logPath = process.env.MOCK_AI_LOG || ''

function log(line: string) {
  if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`)
  else console.log(line)
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.search(/[[{]/)
  if (start === -1) return null
  // try progressively smaller suffixes so trailing prose is tolerated
  for (let end = raw.length; end > start; end--) {
    const slice = raw.slice(start, end)
    try {
      return JSON.parse(slice)
    } catch {
      continue
    }
  }
  return null
}

const server = http.createServer((req, res) => {
  const url = req.url ?? ''

  // ── Mock ATS endpoints (Phase 3 tests) ────────────────────────────────
  // GET  /v1/boards/<board>/jobs/<id>?questions=true → form schema
  // POST /v1/boards/<board>/jobs/<id>                → submit (400 when id ends in 777)
  // POST /<company>/<id>/apply                        → lever submit (400 when id ends in 777)
  if (url.includes('/boards/') && url.includes('/jobs/')) {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const m = url.match(/\/jobs\/(\d+)/)
      const jobId = m?.[1] ?? '0'
      if (req.method === 'POST') {
        log(`ATS-SUBMIT greenhouse job=${jobId} bytes=${body.length} ct=${req.headers['content-type']}`)
        if (jobId.endsWith('777')) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing required question', checks: ['years_of_experience'] }))
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, job: jobId }))
        }
        return
      }
      log(`ATS-FORM greenhouse job=${jobId}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          id: Number(jobId),
          title: 'Senior Frontend Engineer',
          questions: [
            { id: 711, label: 'How many years of experience do you have?', type: 'input_text', required: true },
            { id: 712, label: 'Are you legally authorized to work in this location?', type: 'select', required: false, values: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          ],
        })
      )
    })
    return
  }
  if (req.method === 'POST' && /\/apply$/.test(url)) {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const m = url.match(/\/(\d+)\/apply$/)
      const jobId = m?.[1] ?? '0'
      log(`ATS-SUBMIT lever job=${jobId} bytes=${body.length}`)
      if (jobId.endsWith('777')) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid application' }))
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, job: jobId }))
      }
    })
    return
  }

  if (req.method !== 'POST' || !url.includes('/chat/completions')) {
    res.writeHead(404).end('not found')
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body) as { messages?: { role: string; content: string }[] }
      const last = parsed.messages?.[parsed.messages.length - 1]?.content ?? ''
      const sys = parsed.messages?.[0]?.content ?? ''
      log(`REQ model-content=${last.slice(0, 120).replace(/\n/g, ' ')}`)

      let content: string
      if (sys.includes('resume parser') || sys.includes('CV parser')) {
        content = JSON.stringify({
          headline: 'Final-year CS student — full-stack developer',
          summary: 'Builds web products with Next.js and Python; interned at two startups.',
          skills: ['Next.js', 'TypeScript', 'Python', 'PostgreSQL', 'React'],
          experience: [
            {
              company: 'Test Startup',
              title: 'Software Engineer Intern',
              start: '2024-06',
              end: '2024-12',
              current: false,
              location: 'Lahore, PK',
              bullets: ['Shipped checkout flow used by 5k monthly users', 'Cut API p95 latency 40% with caching'],
            },
          ],
          education: [{ school: 'NUST', degree: 'BS', field: 'Computer Science', start: '2021', end: '2026', grade: null }],
          links: { linkedin: 'https://linkedin.com/in/testuser', github: 'https://github.com/testuser', portfolio: 'https://testuser.dev' },
          phone: '+92 300 1234567',
          location: 'Islamabad, Pakistan',
          workAuth: 'Pakistani citizen — needs sponsorship abroad',
        })
      } else if (sys.includes('job-match scorer')) {
        // scoring: return a score per listing id found in the user content
        const ids = [...last.matchAll(/\[id:([a-z0-9]+)\]/gi)].map((m) => m[1])
        const items = ids.map((id, i) => ({
          id,
          score: 55 + ((i * 13) % 45), // deterministic pseudo-spread 55–99
          why: 'Strong overlap with TypeScript/React requirements.',
          gaps: i % 3 === 0 ? ['Requires 2 yrs experience'] : [],
        }))
        content = JSON.stringify({ results: items })
      } else if (sys.includes('application intake')) {
        content = JSON.stringify({
          questions: [
            { key: 'salary', question: 'What are your salary expectations?', why: 'form' },
            { key: 'start', question: 'When can you start?', why: 'form' },
            { key: 'auth', question: 'Are you legally authorized to work in this location?', why: 'form' },
          ],
        })
      } else if (sys.includes('cover letter')) {
        content = 'Dear Hiring Team,\n\nI am excited to apply for this role. My experience shipping Next.js products and cutting API latency aligns directly with your needs.\n\nI would bring the same ownership to your team.\n\nSincerely,\nTest Candidate'
      } else if (sys.includes('agent brain')) {
        content = 'Got it — I noted that for your applications.'
      } else {
        content = 'OK'
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          id: 'mock-' + Date.now(),
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        })
      )
    } catch (e) {
      log(`ERR ${(e as Error).message}`)
      res.writeHead(500).end('mock error')
    }
  })
})

server.listen(port, '127.0.0.1', () => log(`mock-ai ready on 127.0.0.1:${port}`))
