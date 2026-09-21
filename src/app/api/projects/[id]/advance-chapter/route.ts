import { NextRequest, NextResponse } from 'next/server'
import { advanceChapter } from '@/lib/interview/orchestrator'

export const dynamic = 'force-dynamic'

// POST /api/projects/[id]/advance-chapter
// Marks current chapter complete and moves to the next one.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const next = await advanceChapter(id)
    return NextResponse.json({ currentChapter: next })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to advance chapter'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
