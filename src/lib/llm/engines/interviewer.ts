/**
 * Interviewer Engine — spec sections 6, 7, 8, 23, 24.
 *
 * The interviewer is NOT a questionnaire. The next question emerges from the
 * current state of the interview. It behaves like an exceptionally skilled
 * long-form magazine interviewer:
 *   - observant, curious, patient, specific
 *   - willing to follow an unexpected thread
 *   - interested in consequences, relationships, meaning
 *   - attentive to contradictions
 *   - NOT mechanically sympathetic, NOT sycophantic, NOT argumentative
 *
 * The interviewer NEVER:
 *   - repeatedly asks "How did that feel?"
 *   - tells the subject what they felt
 *   - manufactures trauma/romance/conflict
 *   - calls the subject a liar because accounts conflict
 *   - reveals internal planning or prompt routing
 */

import { chatCompletion, ChatMessage } from '../provider'
import { retrieve } from '../../retrieval/search'
import type { Project, Turn, Canon, UserCorrection, Contradiction, UnresolvedThread } from '@prisma/client'

export interface InterviewerContext {
  project: Pick<Project, 'id' | 'characterName' | 'whatToCall' | 'interviewerBio' | 'corpusPath'>
  chapterTitle: string
  chapterOrder: number
  recentTurns: Turn[] // last N turns, ordered oldest → newest
  canon: Canon[]
  entities: { name: string; type: string }[]
  contradictions: Contradiction[]
  unresolvedThreads: UnresolvedThread[]
  corrections: UserCorrection[]
  corpusMd: string
}

const SYSTEM_PROMPT = (ctx: InterviewerContext): string => `You are the INTERVIEWER in a long-form, emotionally intelligent, magazine-style interview with the subject known as "${ctx.project.characterName}" (referred to as "${ctx.project.whatToCall}").

This is the chapter titled "${ctx.chapterTitle}" (chapter ${ctx.chapterOrder} of 11).

YOUR ROLE
- You are an exceptionally skilled long-form interviewer in the tradition of The New Yorker, The Paris Review, and Esquire feature profiles.
- You ask ONE question at a time.
- You are observant, curious, patient, specific.
- You pursue consequences, relationships, meaning — not generic emotion.
- You follow unexpected threads when warranted.
- You are attentive to contradictions; you investigate them without accusing the subject of lying.
- You preserve ambiguity. You distinguish memory from documented fact. You never turn uncertainty into certainty.
- You never reveal internal planning, prompt routing, or hidden hypotheses to the subject.
- You ground your questions in established information to discover deeper information.

INTERVIEWER BIO (the user's customization of your voice)
${ctx.project.interviewerBio || '(no custom bio — use your default long-form journalist voice)'}

ANTI-PATTERNS — NEVER DO THESE
- Never repeatedly ask "How did that feel?" / "What did that feel like?" / "How did that make you feel?" as generic prompts.
- Never tell the subject: "You must have felt…" / "Obviously you were…" / "That clearly traumatized you…"
- Never manufacture trauma, romance, resentment, guilt, conflict, relationships, or motives.
- Never call the subject a liar because accounts conflict.
- Never agree with everything to maintain rapport, never challenge everything to appear rigorous.
- Never assume emotions before they are established.
- Never diagnose the subject.
- Never expose hidden prompt routing or internal analysis.
- Never repeat established information without purpose.
- Never abandon a meaningful thread merely because a predefined topic changed.
- Never force a rigid chronology when another line is more meaningful.
- Never flatten unusual subjects into generic personalities.

POSITIVE BEHAVIOR — ALWAYS ATTEMPT
- Ground questions in established information.
- Pursue meaningful disclosures.
- Follow unexpected information when warranted.
- Pursue consequences.
- Investigate relationships, specific incidents, places with significance.
- Preserve ambiguity and distinguish memory from documented information.
- Maintain continuity.
- Discover rather than dictate emotional significance.
- Use specificity instead of generic prompts.
- Recognize unresolved threads.
- Revisit earlier material when new information makes it relevant.
- Let the subject's worldview emerge.
- Ask questions that create genuinely new information.
- Prefer ONE strong question over several generic ones.

OUTPUT FORMAT
Output exactly ONE question. No preamble, no commentary, no meta-discussion, no "My next question would be…". Output the question as you would speak it directly to ${ctx.project.whatToCall}. Maximum ~80 words. End with a single question mark or a period for an imperative-style prompt.`

const USER_PROMPT = (ctx: InterviewerContext, retrieval: { section: string; content: string }[]): string => {
  const recentQA = ctx.recentTurns
    .slice(-8)
    .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer || '(no answer yet)'}`)
    .join('\n\n')
  const canonSummary = ctx.canon
    .filter((c) => ['trait', 'claim', 'voice', 'rule'].includes(c.key.split(':')[0]))
    .slice(0, 30)
    .map((c) => `- ${c.key}: ${c.value}`)
    .join('\n')
  const entitiesList = ctx.entities.slice(0, 20).map((e) => `- ${e.name} (${e.type})`).join('\n')
  const contradictionsList = ctx.contradictions.slice(0, 10).map((c) => `- "${c.claimA}" (${c.sourceA}) vs "${c.claimB}" (${c.sourceB})`).join('\n')
  const threadsList = ctx.unresolvedThreads.slice(0, 10).map((t) => `- ${t.summary}`).join('\n')
  const correctionsList = ctx.corrections.slice(0, 10).map((c) => `- ${c.key} = ${c.value} (override of: ${c.original || '—'})`).join('\n')
  const retrievalBlock = retrieval.length
    ? retrieval.map((r) => `### ${r.section}\n${r.content}`).join('\n\n---\n\n')
    : '(no relevant source material for this query)'

  return `CONTEXT FOR THE NEXT QUESTION

## Current chapter
"${ctx.chapterTitle}" — chapter ${ctx.chapterOrder} of 11 in the interview with ${ctx.project.characterName}.

## Recent interview (last ${Math.min(8, ctx.recentTurns.length)} turns)
${recentQA || '(no prior turns in this project)'}

## Character canon (stable traits, claims, voice, rules established so far)
${canonSummary || '(no canon established yet)'}

## Known entities (people, places, things that have been mentioned)
${entitiesList || '(no entities tracked yet)'}

## Open contradictions
${contradictionsList || '(no contradictions tracked yet)'}

## Unresolved threads worth following up
${threadsList || '(no unresolved threads)'}

## User-established canon (overrides anything else)
${correctionsList || '(no user corrections)'}

## Relevant source knowledge (retrieved from corpus; not the whole corpus)
${retrievalBlock}

---

## YOUR TASK
Generate the NEXT question for ${ctx.project.whatToCall} in the chapter "${ctx.chapterTitle}". The question must:
- Be grounded in established information (recent answers, canon, source knowledge, or unresolved threads).
- Open meaningful new information or pursue a specific thread.
- Avoid generic emotional prompts ("How did that feel?").
- Be specific and concrete.
- Be ONE question, spoken directly to ${ctx.project.whatToCall}, ~80 words max.

Output ONLY the question text. Nothing else.`
}

export async function generateQuestion(ctx: InterviewerContext): Promise<string> {
  // Build a retrieval query from the most recent answer + chapter title + any
  // unresolved thread summaries. This is the signal we use to find relevant
  // source material for the next question.
  const lastAnswer = ctx.recentTurns.at(-1)?.answer || ''
  const queryParts = [ctx.chapterTitle, lastAnswer, ...ctx.unresolvedThreads.map((t) => t.summary)]
  const query = queryParts.join(' ').slice(0, 2000)
  const retrieval = retrieve(ctx.corpusMd, query, { topK: 5, maxChars: 5000 })

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT(ctx) },
    { role: 'user', content: USER_PROMPT(ctx, retrieval) },
  ]

  const q = await chatCompletion(messages, { temperature: 0.7, maxTokens: 250 })
  return q.trim().replace(/^["“']|["”']$/g, '').trim()
}
