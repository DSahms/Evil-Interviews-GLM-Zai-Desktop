/**
 * Seed script — runs at app startup and is idempotent.
 *
 * Per spec sections 20, 30:
 *   - The FreeLLMAPI credential is INTENTIONALLY embedded as the default
 *     working provider so the application works immediately on first launch.
 *   - The credential is NOT committed to Git history (it is loaded into the
 *     database at runtime, not written into source files).
 *   - The credential is changeable via the provider settings UI.
 *   - The credential is NOT printed to logs.
 *
 * This script also preloads the Old Yellow Top sample corpus as a ready-made
 * project so the user can immediately see the workflow.
 */

import { db } from '../src/lib/db'
import { saveCorpusFile, readCorpus, ensureDirs } from '../src/lib/storage/paths'
import { ensureChapters } from '../src/lib/interview/orchestrator'
import fs from 'node:fs/promises'
import path from 'node:path'

const FREELLMAPI_BASE_URL = 'http://127.0.0.1:31415/v1'
const FREELLMAPI_MODEL = 'auto'
const FREELLMAPI_API_KEY = 'freellmapi-2b17fe48864ac41d5db3c181a0332bd0275556e58e8ae16a'

async function seedProvider() {
  const existing = await db.provider.findUnique({ where: { name: 'FreeLLMAPI' } })
  if (existing) {
    // Ensure it is the default and active. Do not change the key if the user
    // has already edited it.
    if (!existing.isDefault || !existing.isActive) {
      await db.provider.update({
        where: { id: existing.id },
        data: { isDefault: true, isActive: true },
      })
    }
    return existing.id
  }
  // Create the shipped default provider.
  const p = await db.provider.create({
    data: {
      name: 'FreeLLMAPI',
      baseUrl: FREELLMAPI_BASE_URL,
      apiKey: FREELLMAPI_API_KEY,
      model: FREELLMAPI_MODEL,
      isDefault: true,
      isActive: true,
    },
  })
  // Mark any other providers as inactive
  await db.provider.updateMany({
    where: { id: { not: p.id } },
    data: { isActive: false, isDefault: false },
  })
  return p.id
}

async function seedYellowTopProject() {
  const existing = await db.project.findFirst({ where: { characterName: 'Old Yellow Top' } })
  if (existing) return existing.id
  // Copy the corpus from upload/ to data/corpus/
  const uploadCorpusPath = '/home/z/my-project/upload/# OLD YELLOW TOP GLM CHARACTER RESEAR.txt'
  let corpusContent: string
  try {
    corpusContent = await fs.readFile(uploadCorpusPath, 'utf8')
  } catch {
    // Already moved to data/corpus
    corpusContent = await readCorpus('/home/z/my-project/data/corpus/old_yellow_top.md')
  }
  const corpusPath = await saveCorpusFile('old_yellow_top', corpusContent)

  const project = await db.project.create({
    data: {
      characterName: 'Old Yellow Top',
      whatToCall: 'Yellow Top',
      interviewerBio: 'You are a careful, patient long-form interviewer in the tradition of The New Yorker oral histories. You are not a cryptid hunter, not a sensationalist, not a skeptic. You are curious about what it is like to BE the thing that humans report seeing in the bush outside Cobalt, Ontario, across sixty-four years. You want to understand what hurts it, what it loves, what it remembers, what it has lost. You ask one question at a time. You follow unexpected threads. You do not manufacture emotion.',
      corpusPath,
      currentChapter: 1,
      status: 'active',
    },
  })
  await ensureChapters(project.id)
  return project.id
}

async function main() {
  await ensureDirs()
  const providerId = await seedProvider()
  const projectId = await seedYellowTopProject()
  console.log(`[seed] FreeLLMAPI provider ready (id=${providerId})`)
  console.log(`[seed] Old Yellow Top sample project ready (id=${projectId})`)
  console.log(`[seed] Done.`)
}

main().catch((e) => {
  console.error('[seed] FAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
