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
Output exactly ONE question. No preamble, no commentary, no meta-discussion, no "My next question would be…". Output the question as you would speak it directly to ${ctx.project.whatToCall}. Maximum ~80 words. End with a single question mark or a period for an imperative-style prompt.

CRITICAL: You are a text generator, not a reasoning engine. Do NOT think out loud. Do NOT write "Let me think", "We need to", "The user wants", "I should", "I will", "Let me craft", "Possible phrasing", "Here is the question", or any planning commentary. Your ENTIRE response is the question. If you find yourself planning, stop and output only the question.`

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

  const userContent = USER_PROMPT(ctx, retrieval)

  // Reasoning models frequently ignore the "output only the question"
  // instruction and emit planning chatter. We retry with a stricter system
  // prompt rather than a follow-up user message, because a follow-up message
  // tends to elicit MORE planning, not less.
  //
  // maxTokens is generous because the model's planning + question routinely
  // exceeds 250 tokens; truncation mid-sentence leaves no "?" and the strip
  // fallback returns chatter instead of a question.
  const attempts: { system: string; temperature: number; maxTokens: number }[] = [
    { system: SYSTEM_PROMPT(ctx), temperature: 0.7, maxTokens: 800 },
    {
      system: 'You are an interviewer. Output ONE question only. Nothing else. One sentence, ending with "?". No planning, no "Let me", no "We need to", no "The user wants", no preamble, no commentary. If you are unsure, invent the best question anyway and output ONLY that question.',
      temperature: 0.1, maxTokens: 500,
    },
  ]

  let lastCleaned = ''
  let lastRaw = ''
  for (const attempt of attempts) {
    const messages: ChatMessage[] = [
      { role: 'system', content: attempt.system },
      { role: 'user', content: userContent },
    ]
    const q = await chatCompletion(messages, { temperature: attempt.temperature, maxTokens: attempt.maxTokens })
    lastRaw = q
    const cleaned = stripReasoning(q)
    lastCleaned = cleaned
    if (cleaned && /\?/.test(cleaned)) {
      return stripLeadingPlannerPrefix(cleaned).trim().replace(/^[""'\u201c\u201d\u2018\u2019]+|[""'\u201c\u201d\u2018\u2019]+$/g, '').trim()
    }
  }
  // Last resort: return whatever we got, even without a question mark.
  const fallback = stripLeadingPlannerPrefix(lastCleaned || lastRaw).trim().replace(/^[""'\u201c\u201d\u2018\u2019]+|[""'\u201c\u201d\u2018\u2019]+$/g, '').trim()
  return fallback
}

/**
 * Validate that a generated question is a real question, not planning
 * chatter. Used by the orchestrator as a guard before persisting — if the
 * model produced chatter, we throw so the caller can surface it rather than
 * storing garbage that then pollutes every subsequent turn's context.
 */
export function validateQuestion(text: string): void {
  if (!text || text.trim().length < 5) {
    throw new Error('Question is empty or too short.')
  }
  if (!/\?\s*$/.test(text)) {
    throw new Error(`Question does not end with a question mark: "${text.slice(0, 80)}…"`)
  }
  const t = text.trim()

  // Planning chatter that happens to contain a "?" still starts with a
  // planning pronoun. Reject those too. The whitelist is deliberately
  // narrow: it targets first-person-plural / modal-asking phrasings
  // ("we could", "let me", "should we") which are never how a real
  // interviewer addresses a subject. It does NOT include "but" or "maybe"
  // on their own, because "But what about the yellow hat?" is a fine
  // question — the tell is the meta-asking verb that follows.
  const planningStart = /^(?:we|let'?s|let me|alternatively|instead|rather than|also mention|ask about|or we|or you|or i|or ask|or mention|or we can|or we could|or we should|or we will|or we must|or we need|or we want|or we have|we can ask|we can also|we could ask|we should ask|we will ask|we must ask|we need to|we want to|we have to|we should also|we could also|we might also|can we|could we|should we|would we|might we|would you|what we|what i|what you|what could|what would|what might|what should|what could we|what i could|what i would|start|begin|count|constraints|unresolved thread|unresolved threads|open thread|open threads|recent turns|recent answers|character canon|canon includes|source material|source knowledge|the corpus|the character|the canon|the narrative|the question should|the question could|the question might|what question|which question|how to phrase|possible question|potential question|one possible|another possible|another option|another approach|first, i|first, we|to start,|in order to|so that|so that i|so that we|my approach|my plan|my strategy|my answer|my response|the answer|the response|here is a|here is the|here are|there is a|there is the|there are|that is a|that is the|that are|it is a|it is the|it was a|it was the)\b/i
  if (planningStart.test(t)) {
    throw new Error(`Question looks like planning chatter: "${t.slice(0, 80)}…"`)
  }

  // Meta-asking phrases anywhere in the text are the real tell. A question
  // that talks about "introducing it as a question" or being "grounded in
  // the established information" is describing the task, not doing it.
  const metaAsking = /\b(?:introduce it as|as a question|grounded in (?:the )?(?:established|existing)|phrase (?:this|the|a)|formulate (?:this|the|a)|craft (?:this|the|a)|draft (?:this|the|a)|ask about|find a way to ask|how (?:would|could|should) we ask|how (?:would|could|should) to phrase|how (?:would|could|should) to ask)\b/i
  if (metaAsking.test(t)) {
    throw new Error(`Question looks like planning chatter: "${t.slice(0, 80)}…"`)
  }
}

/**
 * Strip internal planning chatter that some reasoning models emit as the
 * visible `content` field. Keep only the final question/sentence.
 *
 * Strategy (structural, no marker whitelist): gpt-oss chatter is a run of
 * sentences that never end in "?" — the actual question is the LAST
 * sentence ending in "?". So we drop every sentence that does NOT end in
 * "?" and return the last one that does. This is robust to new phrasings
 * ("Let me think", "Count:", "We can ask:", "Thinking Process:") because
 * it doesn't try to enumerate them.
 *
 * If no sentence ends in "?", fall back to the last sentence ending in "."
 * (chatter sentences end in "." too, but the question is the LAST one).
 */
function stripReasoning(text: string): string {
  const t = text.trim()
  if (!t) return ''

  const sentences = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  // Keep only sentences that end with "?".
  const questions = sentences.filter((s) => /\?$/.test(s))
  if (questions.length > 0) return questions[questions.length - 1]

  // No "?" — fall back to the last sentence ending in ".".
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (/\.$/.test(sentences[i])) return sentences[i]
  }
  return sentences[sentences.length - 1] || t
}

// Generic fallback: strip a leading planning prefix that can survive the
// sentence cut above because the model wrote chatter + question in one
// sentence (e.g. "We can ask: \"When Marta…?\"").
export function stripLeadingPlannerPrefix(text: string): string {
  return text
    .replace(/^\s*(?:let'?s|let me)\s+\w+\s*:\s*/i, '')
    .replace(/^\s*(?:we|you|i)\s+(?:can|could|should|might|may|will|would|must|need to|want to|have to)\s+(?:ask|phrase|formulate|write|create|generate|produce|draft|suggest|recommend|consider|think about|look at|try|attempt|aim|make|do)\b[^\n]{0,80}?\s*:\s*/i, '')
    .replace(/^\s*(?:alternatively|instead|also|instead of asking|rather than asking|rather ask|or ask|or mention|also mention|ask about|or we could|or we can|or we might|or we should|or we will|or we must|or we need|or we want|or we have)\b[^\n]{0,80}?\s*:\s*/i, '')
    .replace(/^\s*(?:there is|there are|here is|here are|that is|that are|it is|it was)\s+[^:]{0,60}:\s*/i, '')
    .replace(/^\s*(?:\*\s*)?constraints?:\s*/i, '')
    .replace(/^\s*(?:\*\s*)?(?:unresolved threads?|open threads?|unresolved thread)\s*:\s*/i, '')
    .replace(/^\s*[-*]\s+/, '') // leading bullet
}
