import { NextRequest, NextResponse } from 'next/server'
import { regenerateManuscript } from '@/lib/interview/orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

// POST /api/projects/[id]/regen-manuscript
// Body: { chapterId: string }
// Regenerates ONLY the manuscript section for the chapter. All underlying
// Q&A is preserved.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body?.chapterId) return NextResponse.json({ error: 'chapterId is required' }, { status: 400 })
  try {
    const manuscript = await regenerateManuscript(id, body.chapterId)
    return NextResponse.json({ manuscript })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to regenerate manuscript'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
