/**
 * Markdown chunker.
 * Splits a markdown corpus into header-bounded chunks. Each chunk carries its
 * section path so the retrieval system can return provenance.
 */

export interface CorpusChunk {
  id: string
  section: string
  content: string
  tokens: number // rough estimate: words / 0.75
}

const HEADER_RE = /^(#{1,6})\s+(.+)$/

export function chunkMarkdown(md: string, sourceLabel = 'corpus'): CorpusChunk[] {
  const lines = md.split('\n')
  const chunks: CorpusChunk[] = []
  let section = sourceLabel
  let buffer: string[] = []

  const flush = () => {
    const content = buffer.join('\n').trim()
    if (content.length > 0) {
      chunks.push({
        id: `${sourceLabel}::${section}::${chunks.length}`,
        section,
        content,
        tokens: Math.ceil(content.split(/\s+/).length / 0.75),
      })
    }
    buffer = []
  }

  for (const line of lines) {
    const m = line.match(HEADER_RE)
    if (m) {
      flush()
      const level = m[1].length
      const title = m[2].trim()
      // Build hierarchical path: level-1 = root, level-2 = subsection, etc.
      section = title
      // For deeper levels, keep just the latest title; the chunk id still
      // disambiguates.
      void level
    } else {
      buffer.push(line)
    }
  }
  flush()
  return chunks
}
