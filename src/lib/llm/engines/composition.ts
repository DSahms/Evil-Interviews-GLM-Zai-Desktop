/**
 * Composition Engine — spec sections 14, 15, 16, 25.
 *
 * Composition is a SEPARATE engine from questioning. Its job is to turn the
 * accumulated interview material into a long-form article/manuscript. It is
 * NOT a transcript formatter. NOT a dry biography generator. NOT a final-stage
 * summarizer.
 *
 * The manuscript BEGINS GROWING DURING THE INTERVIEW. After each meaningful
 * answer:
 *
 *     SUBJECT ANSWER → COMPOSITION → NEW/EXPANDED ARTICLE MATERIAL → PERSIST
 *
 * It must:
 *   - understand what has already been written
 *   - understand what new information was just established
 *   - preserve continuity with existing prose
 *   - not summarize the same info repeatedly
 *   - each pass adds meaningful narrative value
 *   - the manuscript grows into a coherent long-form work
 *
 * Style (spec section 15):
 *   - VERBOSE, SUBSTANTIAL, EMOTIONAL, SPECIFIC, AND LITERARY
 *   - long-form magazine-quality prose
 *   - first-person subject perspective (unless subject definition requires otherwise)
 *   - reveal meaning through experience, not by explaining it
 *   - avoid melodrama, generic inspirational language, repetitive vocabulary, purple prose
 */

import { chatCompletion, ChatMessage } from '../provider'
import { retrieve } from '../../retrieval/search'
import type { Project, Turn, Canon } from '@prisma/client'

export interface CompositionContext {
  project: Pick<Project, 'id' | 'characterName' | 'whatToCall' | 'corpusPath'>
  chapterTitle: string
  chapterOrder: number
  currentTurn: Turn // the Q + A that was just established
  priorTurnsInChapter: Turn[] // earlier turns in same chapter
  existingManuscriptSection: string // what's already been written for this chapter
  canon: Canon[]
  corpusMd: string
}

const SYSTEM_PROMPT = (ctx: CompositionContext): string => `You are the COMPOSITION ENGINE for a long-form literary manuscript about ${ctx.project.characterName} (referred to as "${ctx.project.whatToCall}").

You are NOT a summarizer. You are NOT a transcript formatter. You are a literary writer turning interview material into prose that feels like a deeply reported, emotionally intelligent long-form feature centered on the subject's own perspective.

CHAPTER
You are writing the chapter titled "${ctx.chapterTitle}" (chapter ${ctx.chapterOrder} of 11).

VOICE
- The manuscript is in ${ctx.project.whatToCall}'s voice — first person, from ${ctx.project.whatToCall}'s perspective. The reader hears ${ctx.project.whatToCall} speaking.
- The prose is VERBOSE, SUBSTANTIAL, EMOTIONAL, SPECIFIC, AND LITERARY.
- Reveal meaning through experience — do NOT explain the meaning to the reader.
- Avoid melodrama. Avoid generic inspirational language. Avoid repetitive emotional vocabulary. Avoid purple prose that overwhelms the actual subject.
- Use concrete sensory detail WHEN supported by the established material. Do not manufacture sensory details. Do not add invented scenes. Do not add fictional dialogue the subject did not establish.
- The goal is emotional depth through specificity.

CONTINUITY
- You will receive the existing manuscript section for this chapter. You must CONTINUE it, not restart it.
- Do not repeat what has already been written.
- Do not summarize the same information twice.
- Each composition pass must ADD MEANINGFUL NARRATIVE VALUE — a new scene, a deeper reflection, a connection, a consequence, a specific moment from the answer rendered as prose.
- Preserve established names, relationships, chronology, facts, voice, recurring themes, callbacks, unresolved threads, corrections, and contradictions.

PROVENANCE
- You are writing prose about the subject's experience. The prose is GENERATED NARRATIVE — it is NOT authoritative source knowledge. It must not silently invent facts that the subject did not establish.
- If the subject expressed uncertainty ("I don't know why she left"), the prose must preserve that uncertainty, NOT resolve it ("She left because she was afraid" is FORBIDDEN).
- If there is a contradiction (source says X, subject says Y), the prose may surface the discrepancy but must not silently resolve it.

OUTPUT FORMAT
Output prose continuing the existing manuscript section for this chapter. Output ONLY the new paragraphs to add. Do not repeat what's already written. Do not include chapter headings or meta-commentary. End naturally when the current answer's material has been rendered — leave the chapter open for continuation by later turns.

Aim for 200-500 words per pass. Long, literary paragraphs are appropriate.`

const USER_PROMPT = (ctx: CompositionContext, retrieval: { section: string; content: string }[]): string => {
  const recentQA = ctx.priorTurnsInChapter.slice(-4).map((t, i) => `Earlier Q${i + 1}: ${t.question}\nEarlier A${i + 1}: ${t.answer}`).join('\n\n')
  const canonSummary = ctx.canon.filter((c) => ['trait', 'claim', 'voice', 'rule'].includes(c.key.split(':')[0])).slice(0, 25).map((c) => `- ${c.key}: ${c.value}`).join('\n')
  const retrievalBlock = retrieval.length
    ? retrieval.map((r) => `### ${r.section}\n${r.content}`).join('\n\n---\n\n')
    : '(no specific source material for this composition)'

  return `## WHAT JUST HAPPENED IN THE INTERVIEW
The interviewer asked:
${ctx.currentTurn.question}

${ctx.project.whatToCall} answered:
${ctx.currentTurn.answer}

## EARLIER IN THIS CHAPTER (for continuity)
${recentQA || '(this is the first turn in this chapter)'}

## EXISTING MANUSCRIPT SECTION (what's already been written for "${ctx.chapterTitle}")
${ctx.existingManuscriptSection || '(the section is empty — this is the opening of the chapter)'}

## CHARACTER CANON (stable traits, claims, voice, rules)
${canonSummary || '(no canon yet)'}

## RELEVANT SOURCE KNOWLEDGE (retrieved; for grounding, not for invention)
${retrievalBlock}

---

## YOUR TASK
Write the next paragraph(s) of the manuscript section for "${ctx.chapterTitle}", turning the new Q&A material into literary first-person prose from ${ctx.project.whatToCall}'s perspective. Continue from where the existing manuscript section ends — do not restart. Add meaningful narrative value: a new scene, a deeper reflection, a specific moment rendered as prose. Do not summarize the answer; render it as lived experience.

Output ONLY the new prose to append. No headings, no commentary, no "Chapter continues:". Just the prose.`}

export async function composeSection(ctx: CompositionContext): Promise<string> {
  const query = `${ctx.currentTurn.question} ${ctx.currentTurn.answer} ${ctx.chapterTitle}`.slice(0, 2000)
  const retrieval = retrieve(ctx.corpusMd, query, { topK: 4, maxChars: 3500 })

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT(ctx) },
    { role: 'user', content: USER_PROMPT(ctx, retrieval) },
  ]

  const out = await chatCompletion(messages, { temperature: 0.75, maxTokens: 800 })
  return out.trim()
}

/**
 * Narrative composition — for the "first-person encounter story" export
 * (spec remark from user: 2nd of three outputs).
 *
 * This is a DIFFERENT mode: take ALL established Q&A + canon + character
 * profile, and weave them into a single continuous first-person story where
 * the character says who they are. This is the interview turned into a
 * first-person literary narrative — like "Interview with the Vampire" the
 * novel, not the interview transcript.
 */
export interface NarrativeContext {
  project: Pick<Project, 'id' | 'characterName' | 'whatToCall' | 'corpusPath'>
  allTurns: Turn[]
  canon: Canon[]
  corpusMd: string
}

export async function composeFirstPersonNarrative(ctx: NarrativeContext): Promise<string> {
  const allQA = ctx.allTurns.map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`).join('\n\n')
  const canonSummary = ctx.canon.map((c) => `- ${c.key}: ${c.value}`).join('\n')
  const query = `${ctx.project.characterName} ${ctx.canon.map((c) => c.value).join(' ')}`.slice(0, 2000)
  const retrieval = retrieve(ctx.corpusMd, query, { topK: 8, maxChars: 8000 })

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a literary writer. Your job is to take a long-form interview with ${ctx.project.characterName} (referred to as "${ctx.project.whatToCall}") and rewrite it as a SINGLE CONTINUOUS FIRST-PERSON NARRATIVE — a story where ${ctx.project.whatToCall} tells the reader who they are, in their own voice, in their own order, across their whole remembered life.

This is the "first-person encounter story" — not Q&A format, but a literary narrative. Think "Interview with the Vampire" (the novel), not the interview transcript.

VOICE
- First person, ${ctx.project.whatToCall} speaking.
- Long, literary paragraphs.
- Verbose, substantial, emotional, specific.
- Reveal meaning through experience.
- No melodrama, no purple prose, no generic inspirational language.

STRUCTURE
- Begin with ${ctx.project.whatToCall} announcing themselves — who they are, what they are, how they came to be.
- Move through their life in the order that makes narrative sense — not necessarily the interview order.
- Weave the established canon, the answers, and the source knowledge together.
- End with ${ctx.project.whatToCall} reflecting on what they have become, what they have lost, what they have learned.

PROVENANCE
- Do not invent. If something is uncertain, preserve the uncertainty.
- If there are contradictions, let them stand as the subject experiences them.

OUTPUT
- The full first-person narrative, in markdown.
- Chapter headings optional.
- Aim for 1500-4000 words.`,
    },
    {
      role: 'user',
      content: `## INTERVIEW MATERIAL (Q&A across the whole project)
${allQA}

## CHARACTER CANON
${canonSummary || '(no canon)'}

## RELEVANT SOURCE KNOWLEDGE
${retrieval.map((r) => `### ${r.section}\n${r.content}`).join('\n\n---\n\n') || '(none)'}

---

## YOUR TASK
Write the first-person encounter story of ${ctx.project.whatToCall}. Long, literary, in their voice, from their perspective, across their whole remembered life. Begin by having ${ctx.project.whatToCall} announce who they are.`,
    },
  ]

  return await chatCompletion(messages, {
    temperature: 0.8,
    maxTokens: 6000,
    // Full narrative generation is long-running; allow up to 5 minutes.
    timeoutMs: 300_000,
  })
}
