import { NextRequest, NextResponse } from 'next/server'
import { regenerateQuestion } from '@/lib/interview/orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/projects/[id]/regen-question
// Body: { turnId: string }
// Regenerates ONLY the question for the given turn. Answer (if any) is preserved.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body?.turnId) return NextResponse.json({ error: 'turnId is required' }, { status: 400 })
  try {
    const question = await regenerateQuestion(id, body.turnId)
    return NextResponse.json({ question })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to regenerate question'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
