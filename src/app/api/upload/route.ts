import { NextRequest, NextResponse } from 'next/server'
import { saveCorpusFile } from '@/lib/storage/paths'

export const dynamic = 'force-dynamic'

// POST /api/upload
// Body: multipart form-data with field "file" (the markdown corpus) and
// optional field "slug" (a filename hint).
// Returns: { corpusPath: string, size: number, chunks: number }
export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 })
  const file = formData.get('file')
  const slug = (formData.get('slug') as string | null) ?? 'corpus'
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded (field name must be "file")' }, { status: 400 })
  }
  const text = await file.text()
  if (!text.trim()) {
    return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 })
  }
  const finalSlug = slug || file.name.replace(/\.md$/i, '') || 'corpus'
  const corpusPath = await saveCorpusFile(finalSlug, text)
  return NextResponse.json({
    corpusPath,
    size: text.length,
    fileName: file.name,
  })
}
