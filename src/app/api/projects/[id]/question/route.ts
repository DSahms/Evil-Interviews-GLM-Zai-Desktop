import { NextRequest, NextResponse } from 'next/server'
import { nextQuestion } from '@/lib/interview/orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/projects/[id]/question
// Body: { chapterOrder?: number }
// Generates the next question for the current (or specified) chapter.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const chapterOrder = typeof body?.chapterOrder === 'number' ? body.chapterOrder : undefined
  try {
    const result = await nextQuestion(id, chapterOrder)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate question'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
