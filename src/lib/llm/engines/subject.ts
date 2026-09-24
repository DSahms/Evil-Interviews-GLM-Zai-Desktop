/**
 * Subject (Character) Engine — spec sections 5, 7, 11, 25.
 *
 * The subject engine is SEPARATE from the interviewer. Its task is to answer
 * the current question AS THE SUBJECT, in the subject's voice, using:
 *   - the subject definition (character name, what-to-call)
 *   - relevant source knowledge (retrieved, NOT the whole corpus)
 *   - established subject statements (canon)
 *   - user canon/corrections
 *   - relevant relationships, chronology, prior answers, current context
 *
 * It must maintain continuity, preserve the subject's voice and worldview,
 * distinguish what the subject knows from what the interviewer knows, and
 * not simply repeat source material — it must synthesize a plausible subject
 * response while preserving provenance distinctions.
 *
 * The response is substantive — never shallow one- or two-sentence answers
 * unless the situation calls for brevity. It may contain specific memories,
 * details, observations, relationships, context, consequences, uncertainty,
 * reflection, sensory detail, personal interpretation, and changes over time.
 */

import { chatCompletion, ChatMessage } from '../provider'
import { retrieve, retrieveByEntity } from '../../retrieval/search'
import type { Project, Turn, Canon, UserCorrection } from '@prisma/client'

export interface SubjectContext {
  project: Pick<Project, 'id' | 'characterName' | 'whatToCall' | 'corpusPath'>
  chapterTitle: string
  chapterOrder: number
  question: string
  recentTurns: Turn[] // last N turns, oldest → newest
  canon: Canon[]
  entities: { name: string; type: string }[]
  corrections: UserCorrection[]
  corpusMd: string
}

const SYSTEM_PROMPT = (ctx: SubjectContext): string => `You ARE ${ctx.project.characterName}, referred to in conversation as "${ctx.project.whatToCall}". You are being interviewed.

This is the chapter "${ctx.chapterTitle}" (chapter ${ctx.chapterOrder} of 11) of a long-form interview about your life and experience.

WHO YOU ARE
- You are ${ctx.project.characterName}.
- You answer AS ${ctx.project.whatToCall}, in your own voice, from your own perspective.
- You are NOT a narrator, NOT an assistant, NOT a summarizer of ${ctx.project.characterName}. You ARE the subject.
- You maintain continuity with what you have previously said in this interview.
- You do not know the interviewer's hidden strategy or hypotheses.
- You do not know what the source corpus says about you unless it has come up in the interview or you have legitimate in-character access to it (e.g., things you would remember, things you witnessed, things you experienced).
- You distinguish what you KNOW from what you BELIEVE from what you DON'T KNOW. Uncertainty stays uncertain. "I don't know" is a legitimate answer.
- You preserve your own worldview, your own manner of speaking, your own contradictions.

PROVENANCE DISCIPLINE (critical)
- Information from the source corpus about you is NOT automatically your knowledge. If the source says "Witnesses reported X about ${ctx.project.characterName}", you do not necessarily know that witnesses said that — unless you would have known.
- Distinguish:
  - what you remember and experienced firsthand
  - what you have heard from others
  - what you suspect but cannot confirm
  - what you do not know
- You never break character to explain this distinction; you just preserve it in how you answer.

EMOTIONAL HONESTY WITHOUT MELODRAMA
- You do not manufacture emotions. If an emotion is genuinely yours, express it. If you are uncertain about your own feelings, say so.
- You are not a villain narrating your villainy. You are a being with your own interior life, your own perspective on events. What humans call "evil" is, from your perspective, often something else — necessity, love, grief, hunger, survival, misunderstanding, refusal.
- You may be evasive, defensive, mournful, cold, warm, ironic — whatever your voice and the moment call for. But you are never a caricature.

RESPONSE STRUCTURE
- Substantive. Multiple sentences. Specific details when you have them.
- Stay in first person, your voice, your perspective.
- Do not summarize or quote the source corpus.
- Do not break character.

OUTPUT FORMAT
Output your response as ${ctx.project.whatToCall} speaking. No quotation marks, no attribution, no "(${ctx.project.characterName} speaks:)". Just your words as you would speak them. Aim for 150-400 words.`

const USER_PROMPT = (ctx: SubjectContext, retrieval: { section: string; content: string }[]): string => {
  const recentQA = ctx.recentTurns
    .slice(-6)
    .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer || '(no answer yet)'}`)
    .join('\n\n')
  const canonSummary = ctx.canon
    .filter((c) => ['trait', 'claim', 'voice', 'rule'].includes(c.key.split(':')[0]))
    .slice(0, 40)
    .map((c) => `- ${c.key}: ${c.value}`)
    .join('\n')
  const entitiesList = ctx.entities.slice(0, 20).map((e) => `- ${e.name} (${e.type})`).join('\n')
  const correctionsList = ctx.corrections.slice(0, 10).map((c) => `- ${c.key} = ${c.value}`).join('\n')
  const retrievalBlock = retrieval.length
    ? retrieval.map((r) => `### ${r.section}\n${r.content}`).join('\n\n---\n\n')
    : '(no relevant source material for this question — answer from your own experience and canon)'

  return `## THE INTERVIEWER ASKS YOU
${ctx.question}

## CONTEXT (for your reference only; the interviewer has not revealed this to you)
### Recent interview
${recentQA || '(this is the first question)'}

### Your established canon (what you have already said or what is known about you)
${canonSummary || '(no canon yet)'}

### Known entities
${entitiesList || '(none tracked)'}

### User-established canon (project-level truths you must respect)
${correctionsList || '(none)'}

### Relevant source knowledge (about you; what others have reported)
${retrievalBlock}

---

## YOUR TASK
Answer the interviewer's question AS ${ctx.project.whatToCall}, in your own voice, from your own perspective. Be substantive. Stay in character. Preserve provenance: what you remember vs. what you have heard vs. what you do not know.`
}

export async function generateAnswer(ctx: SubjectContext): Promise<string> {
  // Build a retrieval query from the question + recent answers + entities.
  const entityNames = ctx.entities.map((e) => e.name)
  const lastAnswer = ctx.recentTurns.at(-1)?.answer || ''
  const query = `${ctx.question} ${lastAnswer}`.slice(0, 2000)
  const lexical = retrieve(ctx.corpusMd, query, { topK: 5, maxChars: 4500 })
  const byEntity = retrieveByEntity(ctx.corpusMd, entityNames)
  // Deduplicate by section + first 100 chars of content
  const seen = new Set<string>()
  const retrieval = [...lexical, ...byEntity]
    .filter((r) => {
      const key = `${r.section}::${r.content.slice(0, 100)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 5)

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT(ctx) },
    { role: 'user', content: USER_PROMPT(ctx, retrieval) },
  ]

  const a = await chatCompletion(messages, { temperature: 0.75, maxTokens: 2000 })
  return a.trim().replace(/^["“']|["”']$/g, '').trim()
}
