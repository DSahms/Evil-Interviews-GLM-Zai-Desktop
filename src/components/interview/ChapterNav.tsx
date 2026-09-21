'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Loader2, ArrowRight } from 'lucide-react'
import type { Chapter, Turn } from './WorkspaceView'

interface ChapterNavProps {
  chapters: Chapter[]
  currentChapter: number
  turns: Turn[]
  onAdvanceChapter: () => void
  advancingChapter: boolean
  canAdvance: boolean
}

export function ChapterNav({ chapters, currentChapter, turns, onAdvanceChapter, advancingChapter, canAdvance }: ChapterNavProps) {
  return (
    <div className="p-4">
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Chapters</h3>
      <ol className="space-y-1">
        {chapters.map((c) => {
          const isCurrent = c.order === currentChapter
          const isComplete = c.status === 'complete'
          const isInProgress = c.status === 'in_progress'
          const turnCount = turns.filter((t) => t.chapterId === c.id).length
          return (
            <li
              key={c.id}
              className={`flex items-start gap-2 px-2 py-2 rounded-md text-sm ${
                isCurrent ? 'bg-accent/40 border border-accent/50' : ''
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {isComplete ? (
                  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                ) : isCurrent ? (
                  <span className="w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded-full border border-border" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-serif leading-tight ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {c.order}. {c.title}
                </div>
                {turnCount > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {turnCount} Q&amp;A
                    {isInProgress && ' · writing…'}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-4 pt-4 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={onAdvanceChapter}
          disabled={advancingChapter || !canAdvance}
          className="w-full"
        >
          {advancingChapter ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
          )}
          Next chapter
        </Button>
        {!canAdvance && currentChapter < 11 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Answer the latest question to advance.
          </p>
        )}
        {currentChapter >= 11 && (
          <p className="text-xs text-muted-foreground mt-2 text-center italic">
            Legacy — the final chapter.
          </p>
        )}
      </div>
    </div>
  )
}
