import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// PATCH /api/providers/[id] — update a provider
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const allowed: Array<keyof typeof body> = ['name', 'baseUrl', 'apiKey', 'model', 'isActive', 'isDefault']
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (body[k] !== undefined) data[k] = body[k]
  }
  // If marking as active or default, deactivate others
  if (data.isActive === true || data.isDefault === true) {
    await db.provider.updateMany({ where: { id: { not: id } }, data: { isActive: false, isDefault: false } })
  }
  const updated = await db.provider.update({ where: { id }, data })
  return NextResponse.json({
    provider: {
      id: updated.id,
      name: updated.name,
      baseUrl: updated.baseUrl,
      model: updated.model,
      isActive: updated.isActive,
      isDefault: updated.isDefault,
    },
  })
}

// DELETE /api/providers/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.provider.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  if (existing.isDefault) return NextResponse.json({ error: 'Cannot delete the default provider' }, { status: 400 })
  await db.provider.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
