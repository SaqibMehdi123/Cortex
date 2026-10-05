import { NextRequest, NextResponse } from 'next/server'
import { authorizeMorningCron, buildAllBriefings, markDigestSent } from '@/lib/morning-briefing'
import { sendEmail } from '@/lib/mailer'

// GET /api/cron/morning — the daily 8 AM (Asia/Karachi) notification run.
//
// Called once a day by the Vercel cron defined in vercel.json ("0 3 * * *" =
// 08:00 Asia/Karachi). Every verified account with something on its agenda
// gets the email; accounts with nothing due are skipped silently. The
// Setting.lastDigestSentAt marker holds back any repeat hit on the same
// calendar day so the daily email can never double up. Safe to curl by hand
// for testing:
//
//   curl "https://cortex.scrutinies.dev/api/cron/morning?key=$CRON_SECRET&dryRun=1"
//   curl "…&user=you@example.com"              ← restrict to one account
//   curl "…&user=you@example.com&force=1"      ← send now even if today's digest already went out
//
// force=1 only applies together with user= (a forced blast to every account
// would spam the whole user base). Auth: CRON_SECRET (Vercel injects
// "Authorization: Bearer $CRON_SECRET" when the env var is set). Without the
// env var, the scheduler's x-vercel-cron header is accepted as a fallback —
// set CRON_SECRET to harden.
//
// dryRun=1 builds every due briefing but sends nothing — shows exactly who
// would get what. Accounts with nothing due are skipped silently (no empty
// emails).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = (process.env.CRON_SECRET || '').trim()
  const auth = authorizeMorningCron({
    authHeader: req.headers.get('authorization'),
    vercelCronHeader: req.headers.get('x-vercel-cron'),
    keyParam: searchParams.get('key'),
    secret: secret || null,
    isProd: process.env.NODE_ENV === 'production',
  })
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized', reason: auth.reason }, { status: auth.status })
  }
  if (auth.reason === 'vercel_header_fallback') {
    console.warn('cron/morning: CRON_SECRET is not set — falling back to the spoofable x-vercel-cron header. Set CRON_SECRET in Vercel → Settings → Environment Variables.')
  }

  const dryRun = searchParams.get('dryRun') === '1'
  const emailFilter = searchParams.get('user')?.trim() || undefined
  // force bypasses the per-user delivery-time gate — only meaningful for a
  // single account test, never for the whole base
  const force = searchParams.get('force') === '1' && !!emailFilter
  const now = new Date()

  try {
    const { briefings, skipped, notDue, errors } = await buildAllBriefings(now, { email: emailFilter, force })

    if (dryRun) {
      return NextResponse.json({
        mode: 'dryRun',
        ranAt: now.toISOString(),
        accounts: briefings.length,
        notDueYet: notDue,
        skippedNothingDue: skipped,
        errors,
        briefings: briefings.map((b) => ({
          to: b.to,
          subject: b.subject,
          counts: b.counts,
          dueToday: b.dueToday.map((t) => `${t.title}${t.when ? ` @ ${t.when}` : ''}${t.plan ? ` [${t.plan}]` : ''}`),
          overdue: b.overdue.map((t) => `${t.title} (was due ${t.wasDue})`),
          reminders: b.reminders.map((r) => `${r.title} (${r.cadence})`),
          horizon: b.horizon.map((h) => `${h.title} — ${h.when}`),
        })),
      })
    }

    const results: { to: string; delivered: boolean; reason?: string; counts: unknown }[] = []
    for (const b of briefings) {
      const res = await sendEmail(b.to, b.subject, b.html)
      results.push({ to: b.to, delivered: res.delivered, reason: res.reason, counts: b.counts })
      if (res.delivered) {
        // mark today's digest as sent — the time gate reads this on the next
        // hit so the account gets exactly one email per day
        try {
          await markDigestSent(b.userId, now)
        } catch (e) {
          console.error(`cron/morning: failed to mark digest sent for ${b.to}`, e)
        }
      } else {
        console.error(`cron/morning: send failed for ${b.to} (${res.reason ?? 'unknown'})`)
      }
    }

    console.log(`cron/morning: ${results.filter((r) => r.delivered).length} sent, ${notDue} not due yet, ${skipped} skipped (nothing due), ${errors.length} errors`)
    return NextResponse.json({
      mode: 'send',
      ranAt: now.toISOString(),
      sent: results.filter((r) => r.delivered).length,
      notDueYet: notDue,
      skippedNothingDue: skipped,
      failed: results.filter((r) => !r.delivered).length,
      errors,
      results,
    })
  } catch (e) {
    console.error('GET /api/cron/morning error', e)
    return NextResponse.json({ error: 'Morning run failed' }, { status: 500 })
  }
}
