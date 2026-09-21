'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, Send, Sparkles } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { Project, Chapter, Turn } from './WorkspaceView'

interface QALogProps {
  project: Project
  chapter?: Chapter
  turns: Turn[]
  onAnswer: (turnId: string) => void
  onRegenQuestion: (turnId: string) => void
  answeringTurnId: string | null
  regeneratingQuestionFor: string | null
  onAskNext: () => void
  askingQuestion: boolean
}

export function QALog({ project, chapter, turns, onAnswer, onRegenQuestion, answeringTurnId, regeneratingQuestionFor, onAskNext, askingQuestion }: QALogProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {chapter && (
          <header className="border-b border-border pb-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Chapter {chapter.order} of 11
            </div>
            <h2 className="font-serif text-2xl text-foreground">{chapter.title}</h2>
          </header>
        )}

        {turns.length === 0 ? (
          <Card className="p-6 border-dashed text-center">
            <p className="text-sm text-muted-foreground mb-4">No questions yet for this chapter.</p>
            <Button onClick={onAskNext} disabled={askingQuestion}>
              {askingQuestion ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating question…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Ask the first question</>
              )}
            </Button>
          </Card>
        ) : (
          <>
            {turns.map((t, i) => (
              <QACard
                key={t.id}
                turn={t}
                index={i + 1}
                whatToCall={project.whatToCall}
                onAnswer={() => onAnswer(t.id)}
                onRegenQuestion={() => onRegenQuestion(t.id)}
                isAnswering={answeringTurnId === t.id}
                isRegeneratingQuestion={regeneratingQuestionFor === t.id}
                canAnswer={!t.answer}
              />
            ))}
            <div className="pt-2 flex justify-end">
              <Button onClick={onAskNext} disabled={askingQuestion} variant="default">
                {askingQuestion ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Asking…</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Ask next question</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function QACard({
  turn, index, whatToCall, onAnswer, onRegenQuestion, isAnswering, isRegeneratingQuestion, canAnswer,
}: {
  turn: Turn
  index: number
  whatToCall: string
  onAnswer: () => void
  onRegenQuestion: () => void
  isAnswering: boolean
  isRegeneratingQuestion: boolean
  canAnswer: boolean
}) {
  return (
    <div className="space-y-3">
      {/* Question card */}
      <Card className="p-4 border-l-2 border-l-primary/60">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-primary font-medium">
            Interviewer · Q{index}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenQuestion}
            disabled={isRegeneratingQuestion}
            className="h-6 px-2 text-xs"
            title="Regenerate this question (keeps the answer if it exists)"
          >
            {isRegeneratingQuestion ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Regenerate
          </Button>
        </div>
        <p className="font-serif text-base text-foreground leading-relaxed">{turn.question}</p>
        {turn.status === 'regenerated' && (
          <Badge variant="outline" className="mt-2 text-[10px] font-normal">regenerated</Badge>
        )}
      </Card>

      {/* Answer card */}
      {turn.answer ? (
        <Card className="p-4 ml-6 border-l-2 border-l-accent/70 bg-accent/5">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              {whatToCall} · A{index}
            </div>
            <div className="flex items-center gap-2">
              {turn.canonExtracted && (
                <Badge variant="secondary" className="text-[10px] font-normal">canon extracted</Badge>
              )}
              {turn.manuscriptPart && (
                <Badge variant="secondary" className="text-[10px] font-normal">manuscript updated</Badge>
              )}
            </div>
          </div>
          <div className="prose prose-sm max-w-none">
            <MarkdownRenderer content={turn.answer} />
          </div>
        </Card>
      ) : (
        <Card className="p-4 ml-6 border-dashed bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {whatToCall} has not answered yet.
            </p>
            <Button onClick={onAnswer} disabled={isAnswering || !canAnswer} size="sm">
              {isAnswering ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Answering…</>
              ) : (
                <><Send className="w-3.5 h-3.5 mr-1.5" /> Get answer</>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
