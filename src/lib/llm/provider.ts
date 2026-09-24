/**
 * LLM Provider Abstraction
 * -------------------------
 * FreeLLMAPI is the shipped default. The user can add/switch providers via the
 * /api/providers routes. The key is stored in the database, never in source
 * control, and never logged.
 *
 * Architecture per spec section 12: the interviewer, subject, and composition
 * engines are SEPARATE prompt operations. They never collapse into one giant
 * prompt. Each operation receives only the context it actually needs.
 */

import { db } from '@/lib/db'

export type ChatRole = 'system' | 'user' | 'assistant'
export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface LLMProvider {
  id: string
  name: string
  baseUrl: string
  model: string
}

/**
 * Fetch the active provider from the database. If none is marked active, fall
 * back to the default. If none exists, the seed script should have created
 * FreeLLMAPI; if it has not, we throw a useful error rather than silently
 * fall back to a mock.
 */
export async function getActiveProvider(): Promise<LLMProvider & { apiKey: string }> {
  let provider = await db.provider.findFirst({ where: { isActive: true } })
  if (!provider) {
    provider = await db.provider.findFirst({ where: { isDefault: true } })
    if (provider) {
      await db.provider.update({ where: { id: provider.id }, data: { isActive: true } })
    }
  }
  if (!provider) {
    throw new Error(
      'No AI provider is configured. The application should have shipped with FreeLLMAPI preconfigured. ' +
      'Run the seed script (bun run scripts/seed.ts) or configure a provider in Settings.'
    )
  }
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: provider.apiKey,
  }
}

/**
 * Make an OpenAI-compatible Chat Completions request. Works against FreeLLMAPI
 * (http://127.0.0.1:31415/v1, model=auto) and any other OpenAI-compatible
 * endpoint the user configures.
 *
 * The spec is explicit: a successful "connection test" is NOT sufficient. The
 * configured provider must actually power the real workflow. This function is
 * the one call site used by every engine (interviewer, subject, composition,
 * canon extraction). If it fails, the engine fails — there is no silent mock
 * fallback.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const provider = await getActiveProvider()
  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`

  // Never log the API key. Never log the full request body if it contains
  // user content. Log only the operation type and token count for diagnostics.
  const body: Record<string, unknown> = {
    model: provider.model || 'auto',
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: options.temperature ?? 0.7,
  }
  if (options.maxTokens) body.max_tokens = options.maxTokens

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `Provider "${provider.name}" is unreachable at ${url}. ` +
      `The application does NOT silently fall back to a mock. ` +
      `Verify the provider is running (e.g. for FreeLLMAPI, check 127.0.0.1:31415). ` +
      `Underlying error: ${msg}`
    )
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(
      `Provider "${provider.name}" returned HTTP ${res.status} from ${url}. ` +
      (errText ? `Response: ${errText.slice(0, 500)}` : 'No response body.')
    )
  }

  const data = await res.json()
  const message = data?.choices?.[0]?.message
  if (!message) {
    throw new Error(
      `Provider "${provider.name}" returned a response with no message. ` +
      `Inspect the dev log for details.`
    )
  }
  let content: string | undefined = message.content

  // Some reasoning models (e.g. dots-3-note-preview via FreeLLMAPI "auto")
  // emit internal planning in a separate `reasoning` field. With sufficient
  // maxTokens they also populate `content` with the actual answer. If
  // content is empty but reasoning exists, the model was truncated before
  // producing the answer — we do NOT fall back to reasoning, because that
  // reasoning is planning chatter, not a usable response.
  if (!content || content.trim() === '') {
    const reasoning: string | undefined = message.reasoning
    if (reasoning && reasoning.trim() !== '') {
      console.warn(
        `[provider] "${provider.name}" returned empty content but non-empty reasoning ` +
        `(${reasoning.trim().length} chars). The model was likely truncated ` +
        `before producing the answer. Increase maxTokens on the calling ` +
        `engine rather than falling back to reasoning chatter.`
      )
    }
    throw new Error(
      `Provider "${provider.name}" returned an empty content field. ` +
      `If using a reasoning model, ensure maxTokens is large enough for ` +
      `both the reasoning and the answer. Inspect the dev log for details.`
    )
  }
  return content
}

/**
 * Connectivity test. Used by the /api/providers/[id]/test route. This is for
 * diagnostic purposes only — it is NOT sufficient to consider the provider
 * "working". The real verification is the end-to-end workflow in the
 * interviewer/subject/composition engines.
 */
export async function testProvider(providerId: string): Promise<{ ok: boolean; message: string }> {
  const p = await db.provider.findUnique({ where: { id: providerId } })
  if (!p) return { ok: false, message: 'Provider not found.' }
  const url = `${p.baseUrl.replace(/\/$/, '')}/chat/completions`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify({
        model: p.model || 'auto',
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
        max_tokens: 10,
        temperature: 0,
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, message: `HTTP ${res.status}: ${t.slice(0, 200)}` }
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content ?? ''
    return { ok: true, message: `Connection successful. Model responded: "${String(content).slice(0, 100)}"` }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `Connection failed: ${msg}` }
  }
}
