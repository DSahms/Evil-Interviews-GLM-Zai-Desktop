/**
 * Filesystem layout for project data.
 *
 * /home/z/my-project/data/
 *   corpus/                  — uploaded corpus markdown files (shared across projects)
 *     <slug>.md
 *   projects/
 *     <projectId>/
 *       meta.json            — project metadata mirror (for offline inspection)
 *       exports/
 *         manuscript.pdf
 *         manuscript.md
 *         manuscript.docx
 *         magazine-qa.md
 *         first-person-narrative.md
 *         audio-qa.mp3
 *
 * The database is the authoritative store. The filesystem is for the corpus
 * and for generated export files.
 */

import path from 'node:path'
import fs from 'node:fs/promises'

const DATA_DIR = '/home/z/my-project/data'
export const CORPUS_DIR = path.join(DATA_DIR, 'corpus')
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects')

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(CORPUS_DIR, { recursive: true })
  await fs.mkdir(PROJECTS_DIR, { recursive: true })
}

export function projectDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId)
}

export function projectExportsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'exports')
}

export async function ensureProjectDirs(projectId: string): Promise<void> {
  await fs.mkdir(projectExportsDir(projectId), { recursive: true })
}

export async function saveCorpusFile(slug: string, content: string): Promise<string> {
  await ensureDirs()
  // Sanitize slug — only allow letters, numbers, dashes, underscores
  const safe = slug.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()
  const filename = `${safe}.md`
  const filepath = path.join(CORPUS_DIR, filename)
  await fs.writeFile(filepath, content, 'utf8')
  return filepath
}

export async function readCorpus(filepath: string): Promise<string> {
  try {
    return await fs.readFile(filepath, 'utf8')
  } catch {
    return ''
  }
}

export async function writeExport(projectId: string, filename: string, content: string | Buffer): Promise<string> {
  await ensureProjectDirs(projectId)
  const filepath = path.join(projectExportsDir(projectId), filename)
  await fs.writeFile(filepath, content)
  return filepath
}

export async function listExports(projectId: string): Promise<{ filename: string; size: number; createdAt: Date }[]> {
  const dir = projectExportsDir(projectId)
  try {
    const entries = await fs.readdir(dir)
    const stats = await Promise.all(entries.map(async (name) => {
      const st = await fs.stat(path.join(dir, name))
      return { filename: name, size: st.size, createdAt: st.mtime }
    }))
    return stats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  } catch {
    return []
  }
}
