/**
 * The 11-chapter spine of the manuscript.
 *
 * Per spec section 16, the precise chapter architecture is left to the
 * implementation. We use a fixed 11-chapter spine so the user always knows
 * where they are in the arc, but the interviewer is free to move organically
 * within and across chapters — the spine is a navigational frame, not a
 * rigid sequence.
 */

export interface ChapterDef {
  order: number
  title: string
  prompt: string // guidance for the interviewer in this chapter
}

export const CHAPTERS: ChapterDef[] = [
  {
    order: 1,
    title: 'Origins',
    prompt: 'Where the subject comes from — birth, awakening, manifestation, or first appearance. For non-human subjects, this may be a moment of becoming rather than a birth.',
  },
  {
    order: 2,
    title: 'Childhood',
    prompt: 'The earliest remembered experiences. The first world the subject knew. What was around them, what they understood, what they did not yet understand.',
  },
  {
    order: 3,
    title: 'Adolescence',
    prompt: 'The period when the subject began to separate from their first world — first encounters with the outside, with strangers, with conflict, with desire.',
  },
  {
    order: 4,
    title: 'Family & Kin',
    prompt: 'Who the subject considers kin — blood, choice, species, mentor, pack, the lonely absence of any of these.',
  },
  {
    order: 5,
    title: 'Education / What Was Learned',
    prompt: 'How the subject learned what they know — formal teaching, observation, imitation, suffering, exposure, or the absence of learning.',
  },
  {
    order: 6,
    title: 'Love & Relationships',
    prompt: 'The people who mattered. Attachment, devotion, desire, rejection, separation, the changes in love over time.',
  },
  {
    order: 7,
    title: 'Parenthood / Creation',
    prompt: 'What the subject made, raised, begot, built, or unleashed. For non-human subjects: what they brought into being — biological, artistic, destructive, or legendary.',
  },
  {
    order: 8,
    title: 'Loss',
    prompt: 'What was lost. The absences that shape the subject — deaths, departures, betrayals, the disappearance of an era or a place or a self.',
  },
  {
    order: 9,
    title: 'Turning Points',
    prompt: 'The moments after which nothing was the same. Decisions, encounters, accidents, revelations — when the subject\'s understanding changed.',
  },
  {
    order: 10,
    title: 'Lessons Learned',
    prompt: 'What the subject now understands that they did not understand before. What they would tell a younger version of themselves, or what they would not.',
  },
  {
    order: 11,
    title: 'Legacy',
    prompt: 'What the subject leaves behind, intends to leave, or refuses to leave. How they want to be remembered, or whether they care to be remembered at all.',
  },
]

export function chapterByOrder(order: number): ChapterDef | undefined {
  return CHAPTERS.find((c) => c.order === order)
}
