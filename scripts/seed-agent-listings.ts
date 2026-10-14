// Seed job listings for agent E2E shortlist tests (pg-embed DB).
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const EMAIL = 'agent-test@local.test'

async function main() {
  const user = await db.user.findUnique({ where: { email: EMAIL } })
  if (!user) throw new Error('test user missing — run seed-agent-test-user.ts first')

  const now = Date.now()
  const day = 86_400_000
  const listings = [
    { company: 'Verdant Systems', role: 'Senior Frontend Engineer', roleFamily: 'engineering', type: 'job', location: 'Remote', source: 'Verdant (Greenhouse)', url: 'https://boards.greenhouse.io/verdant/jobs/1001', externalId: '1001', publishedAt: new Date(now - 2 * day) },
    { company: 'Careem', role: 'Full-Stack Engineer (Next.js)', roleFamily: 'engineering', type: 'job', location: 'Lahore, Pakistan', source: 'Careem (Lever)', url: 'https://jobs.lever.co/careem/2002', externalId: '2002', publishedAt: new Date(now - 3 * day) },
    { company: 'Netsol', role: 'Database Administrator', roleFamily: 'data', type: 'job', location: 'Lahore, Pakistan', source: 'NETSOL', url: 'https://netsoltech.com/careers/dba-3003', externalId: null, publishedAt: new Date(now - 5 * day) },
    { company: 'Stale Co', role: 'Frontend Engineer', roleFamily: 'engineering', type: 'job', location: 'Karachi', source: 'Stale (Greenhouse)', url: 'https://boards.greenhouse.io/stale/jobs/4004', externalId: '4004', publishedAt: new Date(now - 90 * day) }, // stale — hard filter drops
    { company: 'Design Studio', role: 'UX Researcher', roleFamily: 'design', type: 'internship', location: 'Remote', source: 'DS (Lever)', url: 'https://jobs.lever.co/ds/5005', externalId: '5005', publishedAt: new Date(now - 1 * day) }, // family+type mismatch with defaults? prefs empty so passes
    { company: 'Fresh Ltd', role: 'Python Backend Engineer', roleFamily: 'engineering', type: 'job', location: 'Islamabad, Pakistan', source: 'Fresh (Greenhouse)', url: 'https://boards.greenhouse.io/fresh/jobs/6006', externalId: '6006', publishedAt: new Date(now - 1 * day) },
  ]

  await db.jobListing.deleteMany({ where: { userId: user.id } })
  for (const l of listings) {
    await db.jobListing.create({ data: { userId: user.id, ...l, type: l.type as string } })
  }
  console.log(`seeded ${listings.length} listings for ${user.id}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
