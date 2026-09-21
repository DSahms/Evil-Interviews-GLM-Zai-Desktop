/**
 * TTS Provider Abstraction
 * ------------------------
 * TTS is a FIRST-CLASS application capability, but no specific TTS provider
 * is required for the initial working build. The application must work
 * normally with TTS UNCONFIGURED — audio controls clearly indicate "audio
 * unavailable until a provider is configured" rather than failing the app
 * or requiring another service.
 *
 * Manuscript/audio boundary is clean:
 *   - The manuscript text is the authoritative artifact, stored in the
 *     database (Chapter.manuscriptSection) and exportable as markdown/PDF/DOCX.
 *   - Audio is a DERIVED output — synthesized from the text on demand. Audio
 *     files may be cached on disk but are always re-derivable from the text.
 *   - No TTS provider is wired up by default. No paid TTS provider is added
 *     merely to satisfy the current build. The user can add one through the
 *     Provider settings UI.
 *
 * Architecture:
 *   - TtsProvider records live in the database (separate from LLM Provider).
 *   - getActiveTtsProvider() returns null if no provider is configured.
 *   - synthesize() routes to the provider-type handler in registry.ts.
 *   - Handlers are pluggable: openai-compatible is implemented (POST /audio/speech);
 *     gemini / local-piper / local-coqui / custom are extension points for
 *     future implementation.
 */

import { db } from '@/lib/db'
import { synthesizeWithProvider, TtsHandlerResult } from './registry'

export type TtsProviderType =
  | 'openai-compatible'
  | 'gemini'
  | 'local-piper'
  | 'local-coqui'
  | 'custom'

export interface TtsProvider {
  id: string
  name: string
  providerType: TtsProviderType
  baseUrl: string
  apiKey: string
  voice: string
  model: string
  responseFormat: string
  isActive: boolean
  isDefault: boolean
}

/**
 * Returns the active TTS provider, or null if none is configured.
 *
 * The caller MUST handle the null case — the application works normally
 * without TTS configured; audio is simply unavailable until the user adds a
 * provider.
 */
export async function getActiveTtsProvider(): Promise<TtsProvider | null> {
  let provider = await db.ttsProvider.findFirst({ where: { isActive: true } })
  if (!provider) {
    provider = await db.ttsProvider.findFirst({ where: { isDefault: true } })
    if (provider) {
      await db.ttsProvider.update({ where: { id: provider.id }, data: { isActive: true } })
    }
  }
  if (!provider) return null
  return {
    id: provider.id,
    name: provider.name,
    providerType: provider.providerType as TtsProviderType,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    voice: provider.voice,
    model: provider.model,
    responseFormat: provider.responseFormat,
    isActive: provider.isActive,
    isDefault: provider.isDefault,
  }
}

export interface SynthesizeOptions {
  /** Override the provider's default voice. */
  voice?: string
  /** Override the provider's default response format. */
  format?: 'mp3' | 'wav' | 'ogg' | 'flac'
  /** Abort signal for cancellation. */
  signal?: AbortSignal
}

export type SynthesizeResult = TtsHandlerResult

/**
 * Synthesize text to audio using the active TTS provider.
 *
 * Throws TtsNotConfiguredError if no provider is configured. The caller
 * should catch this and surface a clear "Audio is unavailable until a TTS
 * provider is configured" message in the UI — NEVER pretend the audio was
 * generated.
 */
export async function synthesize(text: string, options: SynthesizeOptions = {}): Promise<SynthesizeResult> {
  const provider = await getActiveTtsProvider()
  if (!provider) {
    throw new TtsNotConfiguredError(
      'Audio is unavailable until a TTS provider is configured. Open Provider settings to add one.'
    )
  }
  return await synthesizeWithProvider(provider, text, options)
}

/**
 * Connectivity test for a TTS provider. Used by the /api/tts-providers/[id]/test
 * route. Synthesizes a short piece of text ("OK.") and returns ok=true with
 * metadata, or ok=false with an error message.
 *
 * Per spec: a successful connectivity test is NOT sufficient — but it is a
 * useful diagnostic for the user when configuring a new provider.
 */
export async function testTtsProvider(providerId: string): Promise<{ ok: boolean; message: string; size?: number }> {
  const p = await db.ttsProvider.findUnique({ where: { id: providerId } })
  if (!p) return { ok: false, message: 'TTS provider not found.' }
  const provider: TtsProvider = {
    id: p.id, name: p.name, providerType: p.providerType as TtsProviderType,
    baseUrl: p.baseUrl, apiKey: p.apiKey, voice: p.voice, model: p.model,
    responseFormat: p.responseFormat, isActive: p.isActive, isDefault: p.isDefault,
  }
  try {
    const result = await synthesizeWithProvider(provider, 'Audio test.', {})
    return {
      ok: true,
      message: `Synthesis successful. Format: ${result.format}, ${result.audio.length} bytes.`,
      size: result.audio.length,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `Synthesis failed: ${msg}` }
  }
}

/**
 * Custom error class so callers can distinguish "TTS not configured" from
 * other failures (network error, malformed response, etc.).
 */
export class TtsNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TtsNotConfiguredError'
  }
}

export function isTtsNotConfiguredError(e: unknown): e is TtsNotConfiguredError {
  return e instanceof TtsNotConfiguredError
}
