/**
 * Interview orchestration — the loop from spec section 1.
 *
 *   QUESTION (from interviewer engine)
 *     → ANSWER (from subject engine)
 *       → CANON EXTRACTION (persist to DB)
 *         → COMPOSITION (append to manuscript)
 *           → PERSIST
 *             → NEXT QUESTION (informed by updated state)
 *
 * Each operation is a separate prompt call. Regeneration does not corrupt
 * underlying state — only the regenerated artifact is replaced.
 */

import { db } from '@/lib/db'
import { readCorpus } from '@/lib/storage/paths'
import { CHAPTERS } from '@/lib/interview/chapters'
import { generateQuestion, InterviewerContext } from '@/lib/llm/engines/interviewer'
import { generateAnswer, SubjectContext } from '@/lib/llm/engines/subject'
import { composeSection, CompositionContext } from '@/lib/llm/engines/composition'
import { extractFromAnswer, persistExtraction } from '@/lib/llm/extract/canon'

/**
 * Ensure the project has all 11 chapter rows. Called on project creation
 * and on first interaction with a chapter.
 */
export async function ensureChapters(projectId: string): Promise<void> {
  const existing = await db.chapter.findMany({ where: { projectId }, orderBy: { order: 'asc' } })
  if (existing.length >= CHAPTERS.length) return
  for (const c of CHAPTERS) {
    const exists = existing.find((e) => e.order === c.order)
    if (!exists) {
      await db.chapter.create({
        data: { projectId, order: c.order, title: c.title, manuscriptSection: '', status: 'pending' },
      })
    }
  }
}

export async function loadProjectState(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')
  await ensureChapters(projectId)
  const chapters = await db.chapter.findMany({ where: { projectId }, orderBy: { order: 'asc' } })
  const turns = await db.turn.findMany({ where: { projectId }, orderBy: [{ chapterId: 'asc' }, { order: 'asc' }] })
  const canon = await db.canon.findMany({ where: { projectId } })
  const entities = await db.entity.findMany({ where: { projectId }, orderBy: { mentions: 'desc' } })
  const contradictions = await db.contradiction.findMany({ where: { projectId } })
  const unresolvedThreads = await db.unresolvedThread.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } })
  const corrections = await db.userCorrection.findMany({ where: { projectId } })
  const corpusMd = await readCorpus(project.corpusPath)
  return { project, chapters, turns, canon, entities, contradictions, unresolvedThreads, corrections, corpusMd }
}

/**
 * Generate the next question for the current chapter of the project.
 * Used for both "first question in chapter" and "next question after answer".
 */
export async function nextQuestion(projectId: string, chapterOrder?: number): Promise<{ turn: { id: string; question: string; chapterOrder: number; chapterTitle: string; order: number } }> {
  const state = await loadProjectState(projectId)
  const order = chapterOrder ?? state.project.currentChapter
  const chapter = state.chapters.find((c) => c.order === order)
  if (!chapter) throw new Error(`Chapter ${order} not found`)

  // Find the next turn order in this chapter
  const turnsInChapter = state.turns.filter((t) => t.chapterId === chapter.id)
  const nextOrder = (turnsInChapter.at(-1)?.order ?? 0) + 1

  const ctx: InterviewerContext = {
    project: {
      id: state.project.id,
      characterName: state.project.characterName,
      whatToCall: state.project.whatToCall,
      interviewerBio: state.project.interviewerBio,
      corpusPath: state.project.corpusPath,
    },
    chapterTitle: chapter.title,
    chapterOrder: chapter.order,
    recentTurns: state.turns.slice(-8),
    canon: state.canon,
    entities: state.entities.map((e) => ({ name: e.name, type: e.type })),
    contradictions: state.contradictions,
    unresolvedThreads: state.unresolvedThreads,
    corrections: state.corrections,
    corpusMd: state.corpusMd,
  }

  const question = await generateQuestion(ctx)

  // Mark chapter as in-progress
  if (chapter.status === 'pending') {
    await db.chapter.update({ where: { id: chapter.id }, data: { status: 'in_progress' } })
  }

  const turn = await db.turn.create({
    data: {
      projectId,
      chapterId: chapter.id,
      order: nextOrder,
      question,
      answer: '',
      manuscriptPart: '',
      status: 'questioned',
    },
  })

  return {
    turn: {
      id: turn.id,
      question: turn.question,
      chapterOrder: chapter.order,
      chapterTitle: chapter.title,
      order: turn.order,
    },
  }
}

/**
 * Generate the answer for the given turn, then extract canon, then compose
 * the manuscript section. This is the inner loop of the application.
 */
export async function answerTurn(projectId: string, turnId: string): Promise<{
  answer: string
  canonExtracted: boolean
  manuscriptPart: string
}> {
  const state = await loadProjectState(projectId)
  const turn = await db.turn.findUnique({ where: { id: turnId } })
  if (!turn) throw new Error('Turn not found')
  const chapter = state.chapters.find((c) => c.id === turn.chapterId)
  if (!chapter) throw new Error('Chapter not found')

  // Build subject context
  const priorTurnsInChapter = state.turns.filter((t) => t.chapterId === chapter.id && t.order < turn.order)
  const subjectCtx: SubjectContext = {
    project: {
      id: state.project.id,
      characterName: state.project.characterName,
      whatToCall: state.project.whatToCall,
      corpusPath: state.project.corpusPath,
    },
    chapterTitle: chapter.title,
    chapterOrder: chapter.order,
    question: turn.question,
    recentTurns: state.turns.slice(-8),
    canon: state.canon,
    entities: state.entities.map((e) => ({ name: e.name, type: e.type })),
    corrections: state.corrections,
    corpusMd: state.corpusMd,
  }

  const answer = await generateAnswer(subjectCtx)
  await db.turn.update({ where: { id: turn.id }, data: { answer, status: 'answered' } })

  // Canon extraction — non-fatal if it fails
  let canonExtracted = false
  try {
    const extraction = await extractFromAnswer(
      { id: state.project.id, characterName: state.project.characterName, whatToCall: state.project.whatToCall },
      { ...turn, answer }
    )
    await persistExtraction(projectId, turn.id, extraction)
    canonExtracted = true
  } catch (e) {
    console.error('[interview] canon extraction failed (non-fatal):', e instanceof Error ? e.message : e)
  }

  // Composition — append to chapter's manuscript section
  const compositionCtx: CompositionContext = {
    project: {
      id: state.project.id,
      characterName: state.project.characterName,
      whatToCall: state.project.whatToCall,
      corpusPath: state.project.corpusPath,
    },
    chapterTitle: chapter.title,
    chapterOrder: chapter.order,
    currentTurn: { ...turn, answer },
    priorTurnsInChapter,
    existingManuscriptSection: chapter.manuscriptSection,
    canon: state.canon,
    corpusMd: state.corpusMd,
  }
  let manuscriptPart = ''
  try {
    manuscriptPart = await composeSection(compositionCtx)
    const updated = (chapter.manuscriptSection ? chapter.manuscriptSection + '\n\n' : '') + manuscriptPart
    await db.chapter.update({ where: { id: chapter.id }, data: { manuscriptSection: updated } })
    await db.turn.update({ where: { id: turn.id }, data: { manuscriptPart, status: 'composed', canonExtracted } })
  } catch (e) {
    console.error('[interview] composition failed (non-fatal):', e instanceof Error ? e.message : e)
    // Mark turn as answered but without manuscript; composition can be retried
    await db.turn.update({ where: { id: turn.id }, data: { status: 'answered', canonExtracted } })
  }

  return { answer, canonExtracted, manuscriptPart }
}

/**
 * Regenerate just the question of a turn — keeps the answer (if any)
 * intact per spec section 18. The old question is preserved in
 * regeneratedFromId for audit.
 */
export async function regenerateQuestion(projectId: string, turnId: string): Promise<string> {
  const state = await loadProjectState(projectId)
  const turn = await db.turn.findUnique({ where: { id: turnId } })
  if (!turn) throw new Error('Turn not found')
  const chapter = state.chapters.find((c) => c.id === turn.chapterId)
  if (!chapter) throw new Error('Chapter not found')

  const ctx: InterviewerContext = {
    project: {
      id: state.project.id,
      characterName: state.project.characterName,
      whatToCall: state.project.whatToCall,
      interviewerBio: state.project.interviewerBio,
      corpusPath: state.project.corpusPath,
    },
    chapterTitle: chapter.title,
    chapterOrder: chapter.order,
    // Use turns BEFORE this one for context (we want a new question for this turn)
    recentTurns: state.turns.filter((t) => t.order < turn.order || t.chapterId !== chapter.id).slice(-8),
    canon: state.canon,
    entities: state.entities.map((e) => ({ name: e.name, type: e.type })),
    contradictions: state.contradictions,
    unresolvedThreads: state.unresolvedThreads,
    corrections: state.corrections,
    corpusMd: state.corpusMd,
  }

  const newQuestion = await generateQuestion(ctx)
  await db.turn.update({
    where: { id: turn.id },
    data: { question: newQuestion, regeneratedFromId: turn.id, status: 'regenerated' },
  })
  return newQuestion
}

/**
 * Regenerate just the manuscript section of a chapter — keeps the underlying
 * Q&A intact per spec section 18. Recomposes the whole chapter manuscript
 * from all turns in the chapter.
 */
export async function regenerateManuscript(projectId: string, chapterId: string): Promise<string> {
  const state = await loadProjectState(projectId)
  const chapter = await db.chapter.findUnique({ where: { id: chapterId } })
  if (!chapter) throw new Error('Chapter not found')
  const turnsInChapter = state.turns.filter((t) => t.chapterId === chapter.id).sort((a, b) => a.order - b.order)
  if (turnsInChapter.length === 0) throw new Error('No turns in this chapter to compose from')

  // Recompose from scratch — accumulate paragraph by paragraph
  let manuscript = ''
  for (const turn of turnsInChapter) {
    if (!turn.answer) continue
    const ctx: CompositionContext = {
      project: {
        id: state.project.id,
        characterName: state.project.characterName,
        whatToCall: state.project.whatToCall,
        corpusPath: state.project.corpusPath,
      },
      chapterTitle: chapter.title,
      chapterOrder: chapter.order,
      currentTurn: turn,
      priorTurnsInChapter: turnsInChapter.filter((t) => t.order < turn.order),
      existingManuscriptSection: manuscript,
      canon: state.canon,
      corpusMd: state.corpusMd,
    }
    const part = await composeSection(ctx)
    manuscript = (manuscript ? manuscript + '\n\n' : '') + part
  }
  await db.chapter.update({ where: { id: chapter.id }, data: { manuscriptSection: manuscript } })
  return manuscript
}

/**
 * Advance to the next chapter.
 */
export async function advanceChapter(projectId: string): Promise<number> {
  const state = await loadProjectState(projectId)
  const current = state.project.currentChapter
  if (current >= 11) throw new Error('Already at the final chapter')
  const next = current + 1
  await db.project.update({ where: { id: projectId }, data: { currentChapter: next } })
  // Mark current chapter complete
  const cur = state.chapters.find((c) => c.order === current)
  if (cur) await db.chapter.update({ where: { id: cur.id }, data: { status: 'complete' } })
  return next
}
