import { NextRequest, NextResponse } from 'next/server'
import { nextQuestion, answerTurn, advanceChapter, regenerateManuscript, loadProjectState } from '@/lib/interview/orchestrator'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

/**
 * POST /api/projects/[id]/auto-interview
 * Body: { maxTurns?: number, maxChapters?: number, regenerateManuscriptPerChapter?: boolean }
 *
 * Runs the interview automatically: ask question → answer → (optionally regenerate
 * full chapter manuscript) → advance chapter when complete, up to the specified limits.
 * Returns progress as it goes.
 *
 * This is a long-running endpoint; the client should poll for status.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const maxTurns: number = typeof body?.maxTurns === 'number' ? Math.max(1, Math.min(body.maxTurns, 200)) : 100
  // Default to ALL 11 chapters if not specified
  const maxChapters: number = typeof body?.maxChapters === 'number' ? Math.max(1, Math.min(body.maxChapters, 11)) : 11
  const regenerateManuscriptPerChapter: boolean = body?.regenerateManuscriptPerChapter ?? true

  const results: Array<{ turn: number; chapter: number; question: string; answer: string }> = []

  try {
    // Get initial state to know how many chapters we're targeting
    const state = await loadProjectState(id)
    const targetChapters = Math.min(maxChapters, 11)
    
    // We'll do 3 turns per chapter (adjustable via maxTurns / maxChapters)
    // Track turns per chapter to know when to advance
    let turnsInCurrentChapter = 0
    let currentChapterOrder = state.project.currentChapter

    for (let t = 0; t < maxTurns && currentChapterOrder <= targetChapters; t++) {
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

      turnsInCurrentChapter++

      // After 3 turns in this chapter (or maxTurns limit), finalize and advance
      // 3 turns per chapter gives a good balance for 11 chapters
      if (turnsInCurrentChapter >= 3 || t === maxTurns - 1) {
        // Regenerate full chapter manuscript before advancing (if enabled)
        if (regenerateManuscriptPerChapter) {
          try {
            const chapter = state.chapters.find((c) => c.order === currentChapterOrder)
            if (chapter) {
              await regenerateManuscript(id, chapter.id)
            }
          } catch (e) {
            console.error('[auto-interview] manuscript regeneration failed:', e instanceof Error ? e.message : e)
            // Non-fatal - continue
          }
        }

        // Advance to next chapter
        if (currentChapterOrder < 11 && currentChapterOrder < targetChapters) {
          try {
            currentChapterOrder = await advanceChapter(id)
            turnsInCurrentChapter = 0
            // Reload state to get new chapter info
            const newState = await loadProjectState(id)
            state.chapters = newState.chapters
            state.turns = newState.turns
          } catch {
            // Can't advance further (already at final chapter or error)
            break
          }
        } else {
          // We're at the target chapter limit or final chapter
          break
        }
      }
    }

    return NextResponse.json({ ok: true, results, count: results.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Auto-interview failed'
    return NextResponse.json({ ok: false, error: msg, results, count: results.length }, { status: 500 })
  }
}