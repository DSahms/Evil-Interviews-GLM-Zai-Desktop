import { NextRequest, NextResponse } from 'next/server'
import { exportMagazineQA, exportFirstPersonNarrative, exportManuscriptMarkdown } from '@/lib/export/exports'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/projects/[id]/export
// Body: { format: 'magazine-qa' | 'first-person-narrative' | 'manuscript-md' | 'manuscript-pdf' | 'manuscript-docx' | 'audio-qa' }
// Returns: { path: string, content?: string } or streams the file directly.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body?.format) return NextResponse.json({ error: 'format is required' }, { status: 400 })
  const format = String(body.format) as string

  try {
    switch (format) {
      case 'magazine-qa': {
        const { content, path } = await exportMagazineQA(id)
        return NextResponse.json({ path, content, format })
      }
      case 'first-person-narrative': {
        const { content, path } = await exportFirstPersonNarrative(id)
        return NextResponse.json({ path, content, format })
      }
      case 'manuscript-md': {
        const { content, path } = await exportManuscriptMarkdown(id)
        return NextResponse.json({ path, content, format })
      }
      case 'manuscript-pdf': {
        // Generate the manuscript markdown first, then convert to PDF via a
        // Python script (pdf skill approach: ReportLab)
        const { content } = await exportManuscriptMarkdown(id)
        const pdfBuffer = await generatePdfViaScript(content, id)
        return new NextResponse(pdfBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="manuscript-${id}.pdf"`,
          },
        })
      }
      case 'manuscript-docx': {
        const { content } = await exportManuscriptMarkdown(id)
        const docxBuffer = await generateDocxViaScript(content, id)
        return new NextResponse(docxBuffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="manuscript-${id}.docx"`,
          },
        })
      }
      case 'audio-qa': {
        // Synthesize audio via the TTS provider abstraction.
        // If no TTS provider is configured, return HTTP 503 with a clear
        // indicator — never silently fail, never fall back to a stub.
        const { content } = await exportMagazineQA(id)
        if (!content.trim()) {
          return NextResponse.json({
            error: 'No Q&A content to synthesize. Ask at least one question and get an answer first.',
          }, { status: 400 })
        }
        const { synthesize, isTtsNotConfiguredError } = await import('@/lib/tts/provider')
        try {
          const result = await synthesize(content, { format: 'mp3' })
          return new NextResponse(result.audio, {
            headers: {
              'Content-Type': `audio/${result.format}`,
              'Content-Disposition': `attachment; filename="qa-${id}.${result.format}"`,
            },
          })
        } catch (e) {
          if (isTtsNotConfiguredError(e)) {
            return NextResponse.json({
              error: e.message,
              ttsUnconfigured: true,
            }, { status: 503 })
          }
          throw e
        }
      }
      default:
        return NextResponse.json({ error: `Unknown format: ${format}` }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Export failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * Generate a literary-styled PDF from the manuscript markdown via a Python
 * script using ReportLab. Per spec: serif body, chapter pages.
 */
async function generatePdfViaScript(markdown: string, projectId: string): Promise<Buffer> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const tmpDir = '/tmp/iv-exports'
  await fs.mkdir(tmpDir, { recursive: true })
  const mdPath = path.join(tmpDir, `${projectId}-manuscript.md`)
  const pdfPath = path.join(tmpDir, `${projectId}-manuscript.pdf`)
  await fs.writeFile(mdPath, markdown, 'utf8')
  // Use the persisted script (see /home/z/my-project/scripts/md_to_pdf.py)
  await execFileAsync('python3', ['/home/z/my-project/scripts/md_to_pdf.py', mdPath, pdfPath], { timeout: 60000 })
  return await fs.readFile(pdfPath)
}

/**
 * Generate a DOCX from the manuscript markdown via a Python script using
 * python-docx.
 */
async function generateDocxViaScript(markdown: string, projectId: string): Promise<Buffer> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const tmpDir = '/tmp/iv-exports'
  await fs.mkdir(tmpDir, { recursive: true })
  const mdPath = path.join(tmpDir, `${projectId}-manuscript.md`)
  const docxPath = path.join(tmpDir, `${projectId}-manuscript.docx`)
  await fs.writeFile(mdPath, markdown, 'utf8')
  await execFileAsync('python3', ['/home/z/my-project/scripts/md_to_docx.py', mdPath, docxPath], { timeout: 60000 })
  return await fs.readFile(docxPath)
}

/**
 * TTS audio is now generated via the provider abstraction in
 * src/lib/tts/provider.ts (see the audio-qa case above). The old
 * z-ai-web-dev-sdk call site has been removed; the new abstraction allows
 * any OpenAI-compatible TTS endpoint, native Gemini TTS (future), local
 * Piper / Coqui (future), or a custom HTTP TTS contract (future).
 *
 * The manuscript text remains the authoritative artifact — stored in the
 * database (Chapter.manuscriptSection) and exportable as markdown/PDF/DOCX
 * independently of whether any TTS provider is configured.
 */
