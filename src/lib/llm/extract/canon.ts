/**
 * Canon & Provenance Extraction — spec sections 13, 17, 19.
 *
 * After each meaningful subject response, identify information that should
 * become part of persistent interview state:
 *
 *   - people, places, organizations, objects, entities
 *   - events, dates, chronology
 *   - relationships, claims, memories, beliefs, decisions
 *   - consequences, unresolved questions, contradictions
 *   - corrections, newly established details
 *   - changes in worldview
 *
 * Preserve provenance: source / subject / user / generated are NOT
 * interchangeable. Generated prose must NEVER automatically become
 * authoritative source knowledge.
 *
 * The extraction is a structured JSON response from the LLM. We then upsert
 * the extracted records into the database.
 */

import { chatCompletion, ChatMessage } from '../provider'
import { db } from '@/lib/db'
import type { Project, Turn } from '@prisma/client'

export interface ExtractionResult {
  canon: { key: string; value: string; provenance: string }[]
  entities: { name: string; type: string; notes?: string }[]
  events: { name: string; date?: string; location?: string; description?: string }[]
  contradictions: { claimA: string; sourceA: string; claimB: string; sourceB: string }[]
  unresolvedThreads: { summary: string }[]
}

export async function extractFromAnswer(
  project: Pick<Project, 'id' | 'characterName' | 'whatToCall'>,
  turn: Turn
): Promise<ExtractionResult> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are an information extraction system for a long-form interview application. Your job is to read the latest Q&A pair and extract STRUCTURED information to persist as durable interview state.

EXTRACTION RULES
- Extract only information that was ACTUALLY ESTABLISHED in the answer. Do not invent. Do not speculate. Do not promote uncertainty to fact.
- Preserve provenance: most extracted items have provenance "subject" (the subject said it). Use "source" only if the subject is clearly reporting from documented knowledge they cited. Use "user" only if the user (interviewer) established it. Use "generated" never.
- For canon keys, use stable categories: trait:slug, claim:slug, voice:slug, rule:slug. The slug should be a short kebab-case label (e.g., "trait:emotional-detachment", "claim:born-in-1906", "voice:formal-archaic", "rule:never-kills-children").
- For entities: name (canonical), type (person/place/object/organization/creature), notes (optional).
- For events: name, date (if mentioned), location (if mentioned), description (1-2 sentences).
- For contradictions: only extract if the answer CONTRADICTS something already established (you won't see prior canon, so only extract contradictions that are explicit in this answer — e.g., "I told you X but actually Y" or "people say X but I remember Y").
- For unresolved threads: extract any open question, dangling reference, mystery, or topic the subject raised but did not resolve.

OUTPUT FORMAT — STRICT JSON
{
  "canon": [{"key": "trait:slug", "value": "...", "provenance": "subject"}],
  "entities": [{"name": "...", "type": "...", "notes": "..."}],
  "events": [{"name": "...", "date": "...", "location": "...", "description": "..."}],
  "contradictions": [{"claimA": "...", "sourceA": "...", "claimB": "...", "sourceB": "..."}],
  "unresolvedThreads": [{"summary": "..."}]
}

Output ONLY the JSON. No commentary, no markdown fences.`,
    },
    {
      role: 'user',
      content: `## PROJECT
Character: ${project.characterName} (referred to as "${project.whatToCall}")

## LATEST Q&A
Q: ${turn.question}
A: ${turn.answer}

Extract the structured information now.`,
    },
  ]

  const raw = await chatCompletion(messages, { temperature: 0.1, maxTokens: 2000 })
  // Extract JSON from the response (it may have stray markdown or prose)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { canon: [], entities: [], events: [], contradictions: [], unresolvedThreads: [] }
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as ExtractionResult
    return {
      canon: Array.isArray(parsed.canon) ? parsed.canon : [],
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
      unresolvedThreads: Array.isArray(parsed.unresolvedThreads) ? parsed.unresolvedThreads : [],
    }
  } catch {
    return { canon: [], entities: [], events: [], contradictions: [], unresolvedThreads: [] }
  }
}

/**
 * Persist an extraction result to the database. Upserts so re-extraction
 * (from regeneration) does not create duplicates.
 */
export async function persistExtraction(
  projectId: string,
  turnId: string,
  result: ExtractionResult
): Promise<void> {
  // Canon — upsert by (projectId, key). New value overrides old.
  for (const c of result.canon) {
    if (!c.key || !c.value) continue
    await db.canon.upsert({
      where: { projectId_key: { projectId, key: c.key } },
      create: { projectId, key: c.key, value: c.value, provenance: c.provenance || 'subject', turnId },
      update: { value: c.value, provenance: c.provenance || 'subject', turnId },
    })
  }
  // Entities — upsert by (projectId, name). Increment mentions.
  for (const e of result.entities) {
    if (!e.name) continue
    const existing = await db.entity.findUnique({ where: { projectId_name: { projectId, name: e.name } } })
    if (existing) {
      await db.entity.update({
        where: { id: existing.id },
        data: {
          mentions: existing.mentions + 1,
          type: e.type || existing.type,
          notes: e.notes ? `${existing.notes ? existing.notes + ' | ' : ''}${e.notes}` : existing.notes,
        },
      })
    } else {
      await db.entity.create({
        data: { projectId, name: e.name, type: e.type || 'person', notes: e.notes || '' },
      })
    }
  }
  // Events — append (do not deduplicate; the same event may be referenced
  // multiple times across turns).
  for (const ev of result.events) {
    if (!ev.name) continue
    await db.event.create({
      data: {
        projectId,
        name: ev.name,
        date: ev.date || '',
        location: ev.location || '',
        description: ev.description || '',
        source: 'subject',
        turnId,
      },
    })
  }
  // Contradictions — append.
  for (const c of result.contradictions) {
    if (!c.claimA || !c.claimB) continue
    await db.contradiction.create({
      data: { projectId, claimA: c.claimA, sourceA: c.sourceA, claimB: c.claimB, sourceB: c.sourceB, turnId },
    })
  }
  // Unresolved threads — upsert by summary (first 200 chars) to avoid dupes.
  for (const t of result.unresolvedThreads) {
    if (!t.summary) continue
    const key = t.summary.slice(0, 200)
    const existing = await db.unresolvedThread.findFirst({ where: { projectId, summary: key } })
    if (existing) {
      await db.unresolvedThread.update({
        where: { id: existing.id },
        data: { lastTurnId: turnId, status: 'open', updatedAt: new Date() },
      })
    } else {
      await db.unresolvedThread.create({
        data: { projectId, summary: key, lastTurnId: turnId, status: 'open' },
      })
    }
  }
}
