import { NextRequest, NextResponse } from 'next/server'
import { answerTurn } from '@/lib/interview/orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST /api/projects/[id]/answer
// Body: { turnId: string }
// Generates the in-character answer for the given turn, extracts canon, and
// composes the manuscript section. Returns the answer + manuscript part.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body?.turnId) return NextResponse.json({ error: 'turnId is required' }, { status: 400 })
  try {
    const result = await answerTurn(id, body.turnId)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate answer'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
