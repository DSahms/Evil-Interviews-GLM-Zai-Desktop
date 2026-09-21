import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/projects/[id]/canon — return all canon, corrections, entities, events, contradictions, threads
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [canon, entities, events, contradictions, unresolvedThreads, corrections] = await Promise.all([
    db.canon.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
    db.entity.findMany({ where: { projectId: id }, orderBy: { mentions: 'desc' } }),
    db.event.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
    db.contradiction.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
    db.unresolvedThread.findMany({ where: { projectId: id }, orderBy: { updatedAt: 'desc' } }),
    db.userCorrection.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
  ])
  return NextResponse.json({ canon, entities, events, contradictions, unresolvedThreads, corrections })
}

// POST /api/projects/[id]/canon — create or update a user correction
// Body: { key: string, value: string, original?: string, reason?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body?.key || !body?.value) return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
  const correction = await db.userCorrection.upsert({
    where: { projectId_key: { projectId: id, key: String(body.key) } },
    create: {
      projectId: id,
      key: String(body.key),
      value: String(body.value),
      original: String(body.original || ''),
      reason: String(body.reason || ''),
    },
    update: {
      value: String(body.value),
      original: String(body.original || ''),
      reason: String(body.reason || ''),
    },
  })
  return NextResponse.json({ correction })
}

// DELETE /api/projects/[id]/canon — remove a user correction
// Body: { key: string }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body?.key) return NextResponse.json({ error: 'key is required' }, { status: 400 })
  await db.userCorrection.deleteMany({ where: { projectId: id, key: String(body.key) } })
  return NextResponse.json({ ok: true })
}
