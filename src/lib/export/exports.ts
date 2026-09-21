/**
 * Export utilities.
 *
 * The user wants 3 outputs (their custom requirement):
 *   1. Markdown magazine-style Q&A — "ask a question, get an answer, continue"
 *   2. First-person encounter story from the character's POV — the character
 *      says who it is (a continuous narrative, like "Interview with the
 *      Vampire" the novel, not the transcript)
 *   3. Q&A with audio output — TTS for listening
 *
 * Plus the original "manuscript" output that grew during the interview,
 * exported as PDF + Markdown + DOCX.
 *
 * Layout of generated files: /home/z/my-project/data/projects/<id>/exports/
 */

import path from 'node:path'
import { db } from '@/lib/db'
import { ensureProjectDirs, readCorpus } from '@/lib/storage/paths'
import { CHAPTERS } from '@/lib/interview/chapters'
import { composeFirstPersonNarrative } from '@/lib/llm/engines/composition'
import { writeExport } from '@/lib/storage/paths'

/**
 * Magazine-style Q&A in Markdown — flows like a magazine interview:
 *
 *   # Interviews with Evil: <Character>
 *
 *   ## Chapter 1 — Origins
 *
 *   **Q:** ...
 *
 *   **A:** ...
 *
 *   **Q:** ...
 *
 *   **A:** ...
 *
 *   ## Chapter 2 — Childhood
 *   ...
 */
export async function exportMagazineQA(projectId: string): Promise<{ content: string; path: string }> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')
  const chapters = await db.chapter.findMany({ where: { projectId }, orderBy: { order: 'asc' } })
  const turns = await db.turn.findMany({ where: { projectId }, orderBy: [{ chapterId: 'asc' }, { order: 'asc' }] })

  const lines: string[] = []
  lines.push(`# Interviews with Evil: ${project.characterName}`)
  lines.push('')
  lines.push(`*A long-form magazine-style interview with ${project.whatToCall}.*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const chapter of chapters) {
    const chapterTurns = turns.filter((t) => t.chapterId === chapter.id)
    if (chapterTurns.length === 0) continue
    lines.push(`## Chapter ${chapter.order} — ${chapter.title}`)
    lines.push('')
    for (const turn of chapterTurns) {
      lines.push(`**Q:** ${turn.question}`)
      lines.push('')
      lines.push(`**A:** ${turn.answer || '(no answer recorded)'}`)
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  }

  const content = lines.join('\n')
  const filepath = await writeExport(projectId, 'magazine-qa.md', content)
  return { content, path: filepath }
}

/**
 * First-person encounter story from the character's POV. This calls the
 * narrative composition engine, which takes all Q&A + canon and weaves a
 * single continuous first-person story.
 *
 * Output is markdown. Also re-renders as PDF in the export pipeline.
 */
export async function exportFirstPersonNarrative(projectId: string): Promise<{ content: string; path: string }> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')
  const turns = await db.turn.findMany({ where: { projectId }, orderBy: [{ chapterId: 'asc' }, { order: 'asc' }] })
  const canon = await db.canon.findMany({ where: { projectId } })
  const corpusMd = await readCorpus(project.corpusPath)

  const content = await composeFirstPersonNarrative({
    project: {
      id: project.id,
      characterName: project.characterName,
      whatToCall: project.whatToCall,
      corpusPath: project.corpusPath,
    },
    allTurns: turns,
    canon,
    corpusMd,
  })

  const filepath = await writeExport(projectId, 'first-person-narrative.md', content)
  return { content, path: filepath }
}

/**
 * Manuscript (the long-form prose written during the interview) — exported
 * as markdown. Each chapter's manuscript section is concatenated.
 */
export async function exportManuscriptMarkdown(projectId: string): Promise<{ content: string; path: string }> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')
  const chapters = await db.chapter.findMany({ where: { projectId }, orderBy: { order: 'asc' } })

  const lines: string[] = []
  lines.push(`# ${project.characterName}`)
  lines.push('')
  lines.push(`*A long-form manuscript, written chapter by chapter as the interview progressed.*`)
  lines.push('')
  lines.push('---')
  lines.push('')
  for (const chapter of chapters) {
    if (!chapter.manuscriptSection) continue
    lines.push(`## Chapter ${chapter.order} — ${chapter.title}`)
    lines.push('')
    lines.push(chapter.manuscriptSection)
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  const content = lines.join('\n')
  const filepath = await writeExport(projectId, 'manuscript.md', content)
  return { content, path: filepath }
}

/**
 * Manuscript PDF — generated from the manuscript markdown using the pdf
 * skill approach (ReportLab). For v1 we generate a literary-styled PDF.
 */
export async function exportManuscriptPDF(projectId: string): Promise<{ path: string; buffer: Buffer }> {
  // We delegate to the pdf skill approach — for now, generate via the same
  // script-based ReportLab pipeline that the pdf skill would use.
  // Implemented in /api/projects/[id]/export route via a subprocess call.
  // This stub is here for type completeness; actual generation happens in
  // the API route.
  await ensureProjectDirs(projectId)
  throw new Error('PDF export implemented in API route via pdf skill subprocess')
}

/**
 * Manuscript DOCX — generated using the docx skill approach (python-docx).
 * Same approach as PDF — delegated to the API route.
 */
export async function exportManuscriptDOCX(_projectId: string): Promise<{ path: string; buffer: Buffer }> {
  throw new Error('DOCX export implemented in API route via docx skill subprocess')
}
