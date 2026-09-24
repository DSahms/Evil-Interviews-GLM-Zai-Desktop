import { NextRequest, NextResponse } from 'next/server'
import { nextQuestion, answerTurn, advanceChapter } from '@/lib/interview/orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/projects/[id]/auto-interview
 * Body: { maxTurns?: number, maxChapters?: number }
 *
 * Runs the interview automatically: ask question → answer → advance chapter
 * when complete, up to the specified limits. Returns progress as it goes.
 *
 * This is a long-running endpoint; the client should poll for status.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const maxTurns: number = typeof body?.maxTurns === 'number' ? Math.max(1, Math.min(body.maxTurns, 50)) : 10
  const maxChapters: number = typeof body?.maxChapters === 'number' ? Math.max(1, Math.min(body.maxChapters, 11)) : 1

  const results: Array<{ turn: number; chapter: number; question: string; answer: string }> = []

  try {
    for (let t = 0; t < maxTurns; t++) {
      // Ask the next question
      const qRes = await nextQuestion(id)
      const turn = qRes.turn

      // Answer it
      const aRes = await answerTurn(id, turn.id)

      results.push({
        turn: turn.order,
        chapter: turn.chapterOrder,
        question: turn.question,
        answer: aRes.answer,
      })

      // Advance chapter if this chapter has enough turns and we haven't hit chapter limit
      const canAdvance = turn.chapterOrder < maxChapters + 1 // we're at chapter N, can advance if N < maxChapters
      // We advance every 3 turns by default, or when explicitly requested
      if (t > 0 && (t + 1) % 3 === 0 && turn.chapterOrder < 11 && turn.chapterOrder < maxChapters) {
        try {
          await advanceChapter(id)
        } catch {
          // Non-fatal — stay in current chapter
        }
      }
    }

    return NextResponse.json({ ok: true, results, count: results.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Auto-interview failed'
    return NextResponse.json({ ok: false, error: msg, results, count: results.length }, { status: 500 })
  }
}