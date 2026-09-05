import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyzePaper } from '@/lib/paper-analysis'

// POST /api/papers/[id]/analyze — on-demand AI breakdown of one paper
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const updated = await analyzePaper(id)
    return NextResponse.json({ paper: updated })
  } catch (e) {
    console.error('POST /api/papers/[id]/analyze error', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Analysis failed' }, { status: 500 })
  }
}
