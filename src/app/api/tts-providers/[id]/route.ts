import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// PATCH /api/tts-providers/[id] — update a TTS provider
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const allowed: Array<keyof typeof body> = ['name', 'providerType', 'baseUrl', 'apiKey', 'voice', 'model', 'responseFormat', 'isActive', 'isDefault']
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (body[k] !== undefined) data[k] = body[k]
  }
  // If marking as active or default, deactivate others
  if (data.isActive === true || data.isDefault === true) {
    await db.ttsProvider.updateMany({ where: { id: { not: id } }, data: { isActive: false, isDefault: false } })
  }
  const updated = await db.ttsProvider.update({ where: { id }, data })
  return NextResponse.json({
    provider: {
      id: updated.id,
      name: updated.name,
      providerType: updated.providerType,
      baseUrl: updated.baseUrl,
      voice: updated.voice,
      model: updated.model,
      responseFormat: updated.responseFormat,
      isActive: updated.isActive,
      isDefault: updated.isDefault,
    },
  })
}

// DELETE /api/tts-providers/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.ttsProvider.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'TTS provider not found' }, { status: 404 })
  // Allow deletion even of the default — TTS is optional, no provider is
  // required to exist.
  await db.ttsProvider.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
