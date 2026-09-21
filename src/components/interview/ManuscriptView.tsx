'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { Chapter } from './WorkspaceView'

interface ManuscriptViewProps {
  chapters: Chapter[]
  currentChapterOrder: number
}

export function ManuscriptView({ chapters, currentChapterOrder }: ManuscriptViewProps) {
  const chaptersWithManuscript = chapters.filter((c) => c.manuscriptSection.trim())
  if (chaptersWithManuscript.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="p-8 border-dashed text-center max-w-md">
          <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-serif text-lg text-foreground mb-2">The manuscript is empty.</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ask the first question, get an answer, and the composition engine will begin writing the manuscript for
            chapter {currentChapterOrder}. The manuscript grows with every answer — never waits for the end of the interview.
          </p>
        </Card>
      </div>
    )
  }
  return (
    <div className="h-full overflow-y-auto bg-background">
      <article className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {chaptersWithManuscript.map((c) => {
          const isCurrent = c.order === currentChapterOrder
          return (
            <section key={c.id} className={isCurrent ? 'ring-2 ring-accent/40 rounded-md p-4 -mx-4' : ''}>
              <header className="border-b border-border pb-2 mb-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Chapter {c.order} of 11
                  {isCurrent && <span className="ml-2 text-primary">· writing now</span>}
                </div>
                <h2 className="font-serif text-2xl text-foreground mt-0.5">{c.title}</h2>
                <Badge variant={c.status === 'complete' ? 'default' : 'secondary'} className="mt-1 text-[10px] font-normal capitalize">
                  {c.status.replace('_', ' ')}
                </Badge>
              </header>
              <MarkdownRenderer content={c.manuscriptSection} />
            </section>
          )
        })}
      </article>
    </div>
  )
}
