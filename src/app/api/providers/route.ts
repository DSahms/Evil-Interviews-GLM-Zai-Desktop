import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/providers — list all providers
export async function GET() {
  const providers = await db.provider.findMany({ orderBy: { createdAt: 'asc' } })
  // Mask the API key in the response — show only the last 4 chars
  const masked = providers.map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    model: p.model,
    isActive: p.isActive,
    isDefault: p.isDefault,
    apiKeyMasked: p.apiKey.length > 8 ? `••••${p.apiKey.slice(-4)}` : '••••',
    apiKeyLength: p.apiKey.length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }))
  return NextResponse.json({ providers: masked })
}

// POST /api/providers — create a new provider
// Body: { name, baseUrl, apiKey, model, isActive?, isDefault? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { name, baseUrl, apiKey, model, isActive, isDefault } = body as {
    name?: string; baseUrl?: string; apiKey?: string; model?: string; isActive?: boolean; isDefault?: boolean
  }
  if (!name || !baseUrl || !apiKey) {
    return NextResponse.json({ error: 'name, baseUrl, and apiKey are required' }, { status: 400 })
  }
  // If marking as active or default, deactivate others first
  if (isActive || isDefault) {
    await db.provider.updateMany({ where: {}, data: { isActive: false, isDefault: false } })
  }
  const p = await db.provider.create({
    data: {
      name: String(name),
      baseUrl: String(baseUrl),
      apiKey: String(apiKey),
      model: String(model || 'auto'),
      isActive: Boolean(isActive),
      isDefault: Boolean(isDefault),
    },
  })
  return NextResponse.json({
    provider: {
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      isActive: p.isActive,
      isDefault: p.isDefault,
    },
  })
}
