import { NextRequest, NextResponse } from 'next/server'
import { endInterview } from '@/lib/interview/orchestrator'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/projects/[id]/end-interview
 *
 * Marks the interview as complete after chapter 11 finishes.
 * Regenerates the final chapter manuscript and triggers final export generation.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string> } }) {
  const { id } = await params

  try {
    const result = await endInterview(id)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'End interview failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}