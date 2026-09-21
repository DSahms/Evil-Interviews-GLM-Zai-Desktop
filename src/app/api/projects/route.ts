import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureChapters } from '@/lib/interview/orchestrator'

export const dynamic = 'force-dynamic'

// GET /api/projects — list all projects
export async function GET() {
  const projects = await db.project.findMany({ orderBy: { updatedAt: 'desc' } })
  // For each project, get chapter + turn counts
  const out = await Promise.all(projects.map(async (p) => {
    await ensureChapters(p.id)
    const chapterCount = await db.chapter.count({ where: { projectId: p.id } })
    const turnCount = await db.turn.count({ where: { projectId: p.id } })
    const completedChapters = await db.chapter.count({ where: { projectId: p.id, status: 'complete' } })
    return {
      id: p.id,
      characterName: p.characterName,
      whatToCall: p.whatToCall,
      currentChapter: p.currentChapter,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      chapterCount,
      turnCount,
      completedChapters,
    }
  }))
  return NextResponse.json({ projects: out })
}

// POST /api/projects — create a new project
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { characterName, whatToCall, interviewerBio, corpusPath } = body as {
    characterName?: string
    whatToCall?: string
    interviewerBio?: string
    corpusPath?: string
  }
  if (!characterName || !whatToCall || !corpusPath) {
    return NextResponse.json({ error: 'characterName, whatToCall, and corpusPath are required' }, { status: 400 })
  }
  const project = await db.project.create({
    data: {
      characterName: String(characterName),
      whatToCall: String(whatToCall),
      interviewerBio: String(interviewerBio || ''),
      corpusPath: String(corpusPath),
      currentChapter: 1,
      status: 'active',
    },
  })
  await ensureChapters(project.id)
  return NextResponse.json({ project })
}
