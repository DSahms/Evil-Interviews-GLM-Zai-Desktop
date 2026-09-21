import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SUPPORTED_TTS_TYPES } from '@/lib/tts/registry'

export const dynamic = 'force-dynamic'

// GET /api/tts-providers — list all TTS providers + supported types metadata
export async function GET() {
  const providers = await db.ttsProvider.findMany({ orderBy: { createdAt: 'asc' } })
  // Mask the API key in the response — show only the last 4 chars
  const masked = providers.map((p) => ({
    id: p.id,
    name: p.name,
    providerType: p.providerType,
    baseUrl: p.baseUrl,
    voice: p.voice,
    model: p.model,
    responseFormat: p.responseFormat,
    isActive: p.isActive,
    isDefault: p.isDefault,
    apiKeyMasked: p.apiKey.length > 8 ? `••••${p.apiKey.slice(-4)}` : (p.apiKey ? '••••' : ''),
    apiKeyLength: p.apiKey.length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }))
  return NextResponse.json({
    providers: masked,
    supportedTypes: SUPPORTED_TTS_TYPES,
  })
}

// POST /api/tts-providers — create a new TTS provider
// Body: { name, providerType, baseUrl, apiKey?, voice?, model?, responseFormat?, isActive?, isDefault? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { name, providerType, baseUrl, apiKey, voice, model, responseFormat, isActive, isDefault } = body as {
    name?: string; providerType?: string; baseUrl?: string; apiKey?: string;
    voice?: string; model?: string; responseFormat?: string;
    isActive?: boolean; isDefault?: boolean
  }
  if (!name || !providerType || !baseUrl) {
    return NextResponse.json({ error: 'name, providerType, and baseUrl are required' }, { status: 400 })
  }
  // Validate providerType
  const supported = SUPPORTED_TTS_TYPES.find((t) => t.value === providerType)
  if (!supported) {
    return NextResponse.json({ error: `Unsupported providerType: ${providerType}` }, { status: 400 })
  }
  // If marking as active or default, deactivate others first
  if (isActive || isDefault) {
    await db.ttsProvider.updateMany({ where: {}, data: { isActive: false, isDefault: false } })
  }
  const p = await db.ttsProvider.create({
    data: {
      name: String(name),
      providerType: String(providerType),
      baseUrl: String(baseUrl),
      apiKey: String(apiKey || ''),
      voice: String(voice || 'default'),
      model: String(model || ''),
      responseFormat: String(responseFormat || 'mp3'),
      isActive: Boolean(isActive),
      isDefault: Boolean(isDefault),
    },
  })
  return NextResponse.json({
    provider: {
      id: p.id,
      name: p.name,
      providerType: p.providerType,
      baseUrl: p.baseUrl,
      voice: p.voice,
      model: p.model,
      responseFormat: p.responseFormat,
      isActive: p.isActive,
      isDefault: p.isDefault,
    },
  })
}
