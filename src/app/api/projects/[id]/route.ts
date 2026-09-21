import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureChapters, loadProjectState } from '@/lib/interview/orchestrator'

export const dynamic = 'force-dynamic'

// GET /api/projects/[id] — full project state for the workspace
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await ensureChapters(id)
    const state = await loadProjectState(id)
    return NextResponse.json({
      project: state.project,
      chapters: state.chapters,
      turns: state.turns,
      canon: state.canon,
      entities: state.entities,
      contradictions: state.contradictions,
      unresolvedThreads: state.unresolvedThreads,
      corrections: state.corrections,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load project' }, { status: 404 })
  }
}

// DELETE /api/projects/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.project.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// PATCH /api/projects/[id] — update project fields (e.g., advance chapter, edit bio)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const allowed: Array<keyof typeof body> = ['characterName', 'whatToCall', 'interviewerBio', 'currentChapter', 'status']
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (body[k] !== undefined) data[k] = body[k]
  }
  const updated = await db.project.update({ where: { id }, data })
  return NextResponse.json({ project: updated })
}
