/**
 * Lexical retrieval — spec section 4.
 *
 * The retrieval system MUST NOT dump the entire corpus into every prompt. It
 * returns the chunks most relevant to the current operation (question
 * generation, subject response, composition) using a simple but effective
 * lexical-overlap score with recency boost.
 *
 * Why lexical over semantic embeddings? Because (a) we have no embedding
 * model guaranteed available offline, (b) the corpus is short (Yellow Top
 * is ~70KB), (c) lexical search with proper tokenization is reliable, and
 * (d) the spec says "If a hybrid lexical/semantic approach is appropriate,
 * use it" — but doesn't mandate semantic. Lexical + structured canon is the
 * pragmatic v1.
 */

import { CorpusChunk, chunkMarkdown } from './chunker'

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'as', 'it', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'them', 'his', 'her',
  'its', 'their', 'our', 'your', 'my', 'me', 'him', 'us', 'do', 'does', 'did',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
  'can', 'must', 'shall', 'from', 'into', 'about', 'what', 'when', 'where',
  'who', 'whom', 'why', 'how', 'which', 'whose', 'if', 'then', 'so', 'than',
  'too', 'very', 'just', 'only', 'also', 'no', 'not', 's', 't', 'd', 'll',
  've', 're', 'm', 'up', 'down', 'out', 'over', 'under', 'after', 'before',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
}

function scoreChunk(chunk: CorpusChunk, queryTokens: string[]): number {
  const contentTokens = tokenize(chunk.content)
  const sectionTokens = tokenize(chunk.section)
  const contentSet = new Set(contentTokens)
  const sectionSet = new Set(sectionTokens)
  let score = 0
  for (const t of queryTokens) {
    if (contentSet.has(t)) score += 1
    if (sectionSet.has(t)) score += 2 // section match is a stronger signal
  }
  // Normalize by chunk length to avoid rewarding very long chunks for sheer
  // token count.
  const len = Math.max(1, contentTokens.length)
  return score / Math.sqrt(len)
}

export interface RetrievedContext {
  section: string
  content: string
  score: number
}

export function retrieve(
  corpusMd: string,
  query: string,
  opts: { topK?: number; maxChars?: number } = {}
): RetrievedContext[] {
  const topK = opts.topK ?? 5
  const maxChars = opts.maxChars ?? 6000
  const chunks = chunkMarkdown(corpusMd)
  if (chunks.length === 0) return []
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) {
    // No query signal — return the first chunks (executive summary etc.)
    return chunks.slice(0, topK).map((c) => ({ section: c.section, content: c.content, score: 0 }))
  }
  const scored = chunks
    .map((c) => ({ chunk: c, score: scoreChunk(c, queryTokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
  let total = 0
  const out: RetrievedContext[] = []
  for (const r of scored) {
    if (total + r.chunk.content.length > maxChars) break
    out.push({ section: r.chunk.section, content: r.chunk.content, score: r.score })
    total += r.chunk.content.length
  }
  return out
}

/**
 * Retrieve chunks that mention specific entity names — used by the subject
 * engine when a known entity is part of the current question.
 */
export function retrieveByEntity(corpusMd: string, entities: string[]): RetrievedContext[] {
  if (entities.length === 0) return []
  const chunks = chunkMarkdown(corpusMd)
  const out: RetrievedContext[] = []
  for (const chunk of chunks) {
    const lower = chunk.content.toLowerCase()
    let hits = 0
    for (const e of entities) {
      if (e.length > 2 && lower.includes(e.toLowerCase())) hits += 1
    }
    if (hits > 0) out.push({ section: chunk.section, content: chunk.content, score: hits })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, 5)
}
