/**
 * TTS Provider Registry — pluggable handler layer.
 *
 * Each TTS provider type (the `providerType` discriminator on TtsProvider
 * records) is mapped to a handler function. To add a new provider type
 * (native Gemini TTS, local Piper, etc.), implement a handler here and
 * register it in `HANDLERS`.
 *
 * Why this design:
 *   - The manuscript/chapter/playback/persistence architecture never needs
 *     to change when a new TTS provider is added. Only this file changes.
 *   - The audio export route (`/api/projects/[id]/export`) calls
 *     `synthesizeWithProvider(provider, text, options)` without knowing
 *     which provider type is in use.
 *   - Each handler receives a fully-typed TtsProvider and the text to
 *     synthesize. It returns a Buffer + format. It is responsible for
 *     provider-specific concerns: HTTP contract, voice selection, chunking
 *     if the provider has a per-request char limit, format conversion.
 */

import type { TtsProvider, TtsProviderType, SynthesizeOptions } from './provider'

export interface TtsHandlerResult {
  /** The synthesized audio bytes. */
  audio: Buffer
  /** Audio format: "mp3" | "wav" | "ogg" | "flac". */
  format: string
}

export type TtsHandler = (
  provider: TtsProvider,
  text: string,
  options: SynthesizeOptions
) => Promise<TtsHandlerResult>

/**
 * OpenAI-compatible TTS handler. Calls POST {baseUrl}/audio/speech with
 * the standard OpenAI TTS request body. Works with:
 *   - OpenAI's own TTS API
 *   - Gemini's OpenAI-compatible shim (when configured)
 *   - Ollama's TTS endpoint (when available)
 *   - Local servers exposing OpenAI-compatible TTS (piper-openai-shim, etc.)
 *   - FreeLLMAPI if it implements /v1/audio/speech
 *
 * Chunks long text on sentence boundaries (~1800 chars) to stay under
 * typical per-request limits. Concatenates MP3 streams directly; for other
 * formats, callers should be aware that simple concatenation may not be
 * format-correct (the route handler returns whatever the handler produces).
 */
const openaiCompatibleHandler: TtsHandler = async (provider, text, options) => {
  if (!provider.baseUrl) {
    throw new Error(`TTS provider "${provider.name}" has no baseUrl configured.`)
  }
  const url = `${provider.baseUrl.replace(/\/$/, '')}/audio/speech`
  const voice = options.voice || provider.voice || 'default'
  const format = options.format || provider.responseFormat || 'mp3'
  const model = provider.model || 'tts-1' // OpenAI default; some compatible servers ignore this

  // Chunk long text on sentence boundaries. ~1800 chars is a safe ceiling
  // for most TTS endpoints.
  const chunks = chunkText(text, 1800)
  const buffers: Buffer[] = []

  for (const chunk of chunks) {
    if (!chunk.trim()) continue
    const body: Record<string, unknown> = {
      model,
      input: chunk,
      voice,
      response_format: format,
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `TTS provider "${provider.name}" is unreachable at ${url}. ` +
        `Audio is not generated. Verify the provider is running and reachable. ` +
        `Underlying error: ${msg}`
      )
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(
        `TTS provider "${provider.name}" returned HTTP ${res.status} from ${url}. ` +
        (errText ? `Response: ${errText.slice(0, 500)}` : 'No response body.')
      )
    }
    const buf = Buffer.from(await res.arrayBuffer())
    buffers.push(buf)
  }

  if (buffers.length === 0) {
    throw new Error(`TTS provider "${provider.name}" produced no audio — input text was empty after chunking.`)
  }
  return {
    audio: Buffer.concat(buffers),
    format,
  }
}

/**
 * Native Gemini TTS handler. NOT YET IMPLEMENTED. The architecture is
 * ready — when Google ships a stable native Gemini TTS API and we want to
 * support it, implement it here:
 *   - call the appropriate Gemini endpoint (text-to-speech:synthesize)
 *   - parse the returned base64-encoded audio content
 *   - return as a Buffer
 *
 * Until then, this throws a clear "not yet implemented" error so the user
 * knows they need to use a different provider type.
 */
const geminiHandler: TtsHandler = async (provider, _text, _options) => {
  throw new Error(
    `TTS provider "${provider.name}" uses providerType "gemini" which is not yet implemented. ` +
    `Use providerType "openai-compatible" instead (works with any OpenAI-compatible TTS endpoint, ` +
    `including Gemini's OpenAI-compat shim if you have configured one).`
  )
}

/**
 * Local Piper TTS handler. NOT YET IMPLEMENTED. When implemented, will
 * call the Piper HTTP server's synthesis endpoint and return raw WAV bytes.
 */
const localPiperHandler: TtsHandler = async (provider, _text, _options) => {
  throw new Error(
    `TTS provider "${provider.name}" uses providerType "local-piper" which is not yet implemented. ` +
    `Use providerType "openai-compatible" instead, or wait for native Piper support.`
  )
}

/**
 * Local Coqui TTS handler. NOT YET IMPLEMENTED.
 */
const localCoquiHandler: TtsHandler = async (provider, _text, _options) => {
  throw new Error(
    `TTS provider "${provider.name}" uses providerType "local-coqui" which is not yet implemented. ` +
    `Use providerType "openai-compatible" instead, or wait for native Coqui support.`
  )
}

/**
 * Custom TTS handler. NOT YET IMPLEMENTED. Will be a user-supplied HTTP
 * contract (configurable URL pattern, request body template, response
 * field name).
 */
const customHandler: TtsHandler = async (provider, _text, _options) => {
  throw new Error(
    `TTS provider "${provider.name}" uses providerType "custom" which is not yet implemented. ` +
    `Use providerType "openai-compatible" instead.`
  )
}

/**
 * The registry itself. To add a new provider type:
 *   1. Implement a TtsHandler.
 *   2. Add it to this map.
 *   3. Add the type string to TtsProviderType in provider.ts.
 * No other file changes are needed — the export route and UI are agnostic.
 */
const HANDLERS: Partial<Record<TtsProviderType, TtsHandler>> = {
  'openai-compatible': openaiCompatibleHandler,
  'gemini': geminiHandler,
  'local-piper': localPiperHandler,
  'local-coqui': localCoquiHandler,
  'custom': customHandler,
}

export async function synthesizeWithProvider(
  provider: TtsProvider,
  text: string,
  options: SynthesizeOptions
): Promise<TtsHandlerResult> {
  const handler = HANDLERS[provider.providerType]
  if (!handler) {
    throw new Error(
      `TTS provider "${provider.name}" has unknown providerType "${provider.providerType}". ` +
      `Supported types: ${Object.keys(HANDLERS).join(', ')}.`
    )
  }
  return await handler(provider, text, options)
}

/**
 * List of supported provider types for UI display.
 */
export const SUPPORTED_TTS_TYPES: { value: TtsProviderType; label: string; implemented: boolean; description: string }[] = [
  {
    value: 'openai-compatible',
    label: 'OpenAI-compatible TTS',
    implemented: true,
    description: 'Calls POST {baseUrl}/audio/speech. Works with OpenAI, Ollama, Gemini\'s OpenAI-compat shim, local OpenAI-compat servers.',
  },
  {
    value: 'gemini',
    label: 'Native Gemini TTS',
    implemented: false,
    description: 'Architecture is ready, handler not yet implemented. Use OpenAI-compatible as a workaround.',
  },
  {
    value: 'local-piper',
    label: 'Local Piper TTS',
    implemented: false,
    description: 'Architecture is ready, handler not yet implemented.',
  },
  {
    value: 'local-coqui',
    label: 'Local Coqui TTS',
    implemented: false,
    description: 'Architecture is ready, handler not yet implemented.',
  },
  {
    value: 'custom',
    label: 'Custom HTTP TTS',
    implemented: false,
    description: 'Architecture is ready, handler not yet implemented.',
  },
]

/**
 * Split text into chunks of maxLen, preserving sentence boundaries.
 * Used by the OpenAI-compatible handler to stay under per-request char limits.
 */
function chunkText(text: string, maxLen: number): string[] {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (!s) continue
    if ((cur + ' ' + s).length > maxLen && cur.length > 0) {
      chunks.push(cur.trim())
      cur = s
    } else {
      cur = cur ? cur + ' ' + s : s
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}
