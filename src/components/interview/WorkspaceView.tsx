'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Settings, FileDown, Plus, RefreshCw, BookOpen, MessageSquare, Brain, ArrowRight, Play, Pause, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { ChapterNav } from './ChapterNav'
import { QALog } from './QALog'
import { ManuscriptView } from './ManuscriptView'
import { CanonPanel } from './CanonPanel'
import { ProviderModal } from './ProviderModal'
import { ExportMenu } from './ExportMenu'

interface WorkspaceViewProps {
  projectId: string
  onBack: () => void
}

interface Chapter { id: string; order: number; title: string; manuscriptSection: string; status: string }
interface Turn { id: string; question: string; answer: string; manuscriptPart: string; status: string; chapterId: string; order: number; canonExtracted: boolean }
interface Canon { id: string; key: string; value: string; provenance: string }
interface Entity { id: string; name: string; type: string; mentions: number; notes: string }
interface Event { id: string; name: string; date: string; location: string; description: string }
interface Contradiction { id: string; claimA: string; sourceA: string; claimB: string; sourceB: string; status: string }
interface UnresolvedThread { id: string; summary: string; status: string }
interface UserCorrection { id: string; key: string; value: string; original: string; reason: string }
interface Project { id: string; characterName: string; whatToCall: string; interviewerBio: string; currentChapter: number; status: string }

interface ProjectState {
  project: Project
  chapters: Chapter[]
  turns: Turn[]
  canon: Canon[]
  entities: Entity[]
  events: Event[]
  contradictions: Contradiction[]
  unresolvedThreads: UnresolvedThread[]
  corrections: UserCorrection[]
}

export function WorkspaceView({ projectId, onBack }: WorkspaceViewProps) {
  const [state, setState] = useState<ProjectState | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'qa' | 'manuscript' | 'canon'>('qa')
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [providerModalTab, setProviderModalTab] = useState<'llm' | 'tts'>('llm')
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [askingQuestion, setAskingQuestion] = useState(false)
  const [answeringTurnId, setAnsweringTurnId] = useState<string | null>(null)
  const [regeneratingQuestionFor, setRegeneratingQuestionFor] = useState<string | null>(null)
  const [regeneratingManuscriptFor, setRegeneratingManuscriptFor] = useState<string | null>(null)
  const [advancingChapter, setAdvancingChapter] = useState(false)
  const [autoInterview, setAutoInterview] = useState(false)
  const [autoProgress, setAutoProgress] = useState<{ done: number; total: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load project')
      setState(data)
    } catch (e) {
      toast.error('Failed to load project', { description: e instanceof Error ? e.message : '' })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  // Refresh state every 5s while any operation is in progress (so the UI
  // reflects canon extraction, manuscript updates, etc.)
  useEffect(() => {
    if (!askingQuestion && !answeringTurnId && !regeneratingQuestionFor && !regeneratingManuscriptFor && !advancingChapter && !autoInterview) return
    const t = setInterval(() => void load(), 5000)
    return () => clearInterval(t)
  }, [askingQuestion, answeringTurnId, regeneratingQuestionFor, regeneratingManuscriptFor, advancingChapter, autoInterview, load])

  const handleAskNext = async () => {
    setAskingQuestion(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate question')
      toast.success('Question generated', { description: `Chapter ${data.turn.chapterOrder} — ${data.turn.chapterTitle}, turn ${data.turn.order}` })
      await load()
      setActiveTab('qa')
    } catch (e) {
      toast.error('Question generation failed', { description: e instanceof Error ? e.message : '' })
    } finally {
      setAskingQuestion(false)
    }
  }

  const handleAnswer = async (turnId: string) => {
    setAnsweringTurnId(turnId)
    try {
      const res = await fetch(`/api/projects/${projectId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate answer')
      toast.success('Answer composed', {
        description: data.canonExtracted ? 'Canon updated + manuscript section appended.' : 'Manuscript section appended.',
      })
      await load()
      setActiveTab('qa')
    } catch (e) {
      toast.error('Answer generation failed', { description: e instanceof Error ? e.message : '' })
    } finally {
      setAnsweringTurnId(null)
    }
  }

  const handleRegenQuestion = async (turnId: string) => {
    setRegeneratingQuestionFor(turnId)
    try {
      const res = await fetch(`/api/projects/${projectId}/regen-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate question')
      toast.success('Question regenerated', { description: 'The answer (if any) was preserved.' })
      await load()
    } catch (e) {
      toast.error('Regeneration failed', { description: e instanceof Error ? e.message : '' })
    } finally {
      setRegeneratingQuestionFor(null)
    }
  }

  const handleRegenManuscript = async (chapterId: string) => {
    setRegeneratingManuscriptFor(chapterId)
    try {
      const res = await fetch(`/api/projects/${projectId}/regen-manuscript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate manuscript')
      toast.success('Manuscript section regenerated', { description: 'All Q&A preserved.' })
      await load()
      setActiveTab('manuscript')
    } catch (e) {
      toast.error('Manuscript regeneration failed', { description: e instanceof Error ? e.message : '' })
    } finally {
      setRegeneratingManuscriptFor(null)
    }
  }

  const handleAdvanceChapter = async () => {
    setAdvancingChapter(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/advance-chapter`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to advance')
      toast.success(`Moved to chapter ${data.currentChapter}`)
      await load()
    } catch (e) {
      toast.error('Failed to advance chapter', { description: e instanceof Error ? e.message : '' })
    } finally {
      setAdvancingChapter(false)
    }
  }

  const handleAutoInterview = async (maxTurns: number, maxChapters: number) => {
    setAutoInterview(true)
    setAutoProgress({ done: 0, total: maxTurns })
    try {
      const res = await fetch(`/api/projects/${projectId}/auto-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxTurns, maxChapters, regenerateManuscriptPerChapter: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Auto-interview failed')
      setAutoProgress(null)
      if (data.results?.length > 0) {
        toast.success(`Auto-interview complete`, { description: `${data.count} turn(s) across ${maxChapters} chapter(s). Interview ended and exports generated.` })
      } else {
        toast.success(`Auto-interview ran`, { description: `${data.count} turn(s) processed.` })
      }
      await load()
    } catch (e) {
      toast.error('Auto-interview failed', { description: e instanceof Error ? e.message : '' })
      setAutoProgress(null)
    } finally {
      setAutoInterview(false)
    }
  }

  const handleEndInterview = async () => {
    setEndingInterview(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/end-interview`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to end interview')
      toast.success('Interview ended', { description: 'All 11 chapters complete. Final exports generated.' })
      await load()
    } catch (e) {
      toast.error('Failed to end interview', { description: e instanceof Error ? e.message : '' })
    } finally {
      setEndingInterview(false)
    }
  }

  if (loading || !state) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading project…
        </div>
      </div>
    )
  }

  const { project, chapters, turns } = state
  const currentChapter = chapters.find((c) => c.order === project.currentChapter)
  const turnsInCurrent = turns.filter((t) => t.chapterId === currentChapter?.id).sort((a, b) => a.order - b.order)
  const lastTurn = turnsInCurrent.at(-1)
  const canAdvance = !!lastTurn?.answer && project.currentChapter < 11

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top action bar */}
      <div className="border-b border-border bg-card/50 px-6 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Projects
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex flex-col">
            <span className="font-serif text-base leading-tight">{project.characterName}</span>
            <span className="text-xs text-muted-foreground italic">&ldquo;{project.whatToCall}&rdquo;</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoInterview ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => {
              if (autoInterview) return
              void handleAutoInterview(100, 11)
            }}
            disabled={autoInterview}
          >
            {autoInterview ? (
              <><Pause className="w-4 h-4 mr-1.5 animate-pulse" /> Running…</>
            ) : (
              <><Zap className="w-4 h-4 mr-1.5" /> Auto-interview</>
            )}
          </Button>
          <Button
            variant={endingInterview ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => {
              if (endingInterview) return
              void handleEndInterview()
            }}
            disabled={endingInterview || project.currentChapter < 11 || project.status === 'complete'}
          >
            {endingInterview ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Ending…</>
            ) : (
              <><Check className="w-4 h-4 mr-1.5" /> End Interview</>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setProviderModalTab('llm'); setProviderModalOpen(true) }}>
            <Settings className="w-4 h-4 mr-1.5" /> Provider
          </Button>
          <ExportMenu
            projectId={projectId}
            open={exportMenuOpen}
            onOpenChange={setExportMenuOpen}
            onConfigureTts={() => { setProviderModalTab('tts'); setProviderModalOpen(true) }}
          />
        </div>
      </div>

      {/* Three-column workspace */}
      <div className="flex-1 grid grid-cols-12 min-h-0">
        {/* Left column: chapter nav */}
        <aside className="col-span-3 lg:col-span-2 border-r border-border bg-card/30 overflow-hidden">
          <ScrollArea className="h-full">
            <ChapterNav
              chapters={chapters}
              currentChapter={project.currentChapter}
              turns={turns}
              onAdvanceChapter={handleAdvanceChapter}
              advancingChapter={advancingChapter}
              canAdvance={canAdvance}
            />
          </ScrollArea>
        </aside>

        {/* Center column: Q&A + Manuscript + Canon */}
        <section className="col-span-9 lg:col-span-7 flex flex-col min-h-0 border-r border-border">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'qa' | 'manuscript' | 'canon')} className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-border bg-card/30 px-6 py-2 flex items-center justify-between">
              <TabsList className="bg-transparent p-0 h-auto gap-4">
                <TabsTrigger value="qa" className="px-2 py-1 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary">
                  <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Q&amp;A
                </TabsTrigger>
                <TabsTrigger value="manuscript" className="px-2 py-1 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary">
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Manuscript
                </TabsTrigger>
                <TabsTrigger value="canon" className="px-2 py-1 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary">
                  <Brain className="w-3.5 h-3.5 mr-1.5" /> Canon
                </TabsTrigger>
              </TabsList>
              {activeTab === 'manuscript' && currentChapter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRegenManuscript(currentChapter.id)}
                  disabled={regeneratingManuscriptFor === currentChapter.id || turnsInCurrent.length === 0}
                >
                  {regeneratingManuscriptFor === currentChapter.id ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  )}
                  Regenerate manuscript
                </Button>
              )}
            </div>

            <TabsContent value="qa" className="flex-1 mt-0 min-h-0 data-[state=inactive]:hidden">
              <QALog
                project={project}
                chapter={currentChapter}
                turns={turnsInCurrent}
                onAnswer={handleAnswer}
                onRegenQuestion={handleRegenQuestion}
                answeringTurnId={answeringTurnId}
                regeneratingQuestionFor={regeneratingQuestionFor}
                onAskNext={handleAskNext}
                askingQuestion={askingQuestion}
              />
            </TabsContent>
            <TabsContent value="manuscript" className="flex-1 mt-0 min-h-0 data-[state=inactive]:hidden">
              <ManuscriptView chapters={chapters} currentChapterOrder={project.currentChapter} />
            </TabsContent>
            <TabsContent value="canon" className="flex-1 mt-0 min-h-0 data-[state=inactive]:hidden">
              <CanonPanel
                projectId={projectId}
                canon={state.canon}
                entities={state.entities}
                events={state.events}
                contradictions={state.contradictions}
                unresolvedThreads={state.unresolvedThreads}
                corrections={state.corrections}
                onUpdated={load}
              />
            </TabsContent>
          </Tabs>
        </section>

        {/* Right column: status + quick actions */}
        <aside className="hidden lg:flex lg:col-span-3 flex-col bg-card/30 overflow-hidden">
          <ScrollArea className="h-full">
            <RightPanel
              project={project}
              currentChapter={currentChapter}
              turnCount={turns.length}
              canonCount={state.canon.length}
              entityCount={state.entities.length}
              contradictionCount={state.contradictions.length}
              threadCount={state.unresolvedThreads.length}
              onAskNext={handleAskNext}
              askingQuestion={askingQuestion}
              autoInterview={autoInterview}
              autoProgress={autoProgress}
              onAutoInterview={() => {
                if (autoInterview) return
                void handleAutoInterview(100, 11)
              }}
            />
          </ScrollArea>
        </aside>
      </div>

      {providerModalOpen && (
        <ProviderModal open={providerModalOpen} onOpenChange={setProviderModalOpen} initialTab={providerModalTab} />
      )}
    </div>
  )
}

function RightPanel({
  project, currentChapter, turnCount, canonCount, entityCount, contradictionCount, threadCount, onAskNext, askingQuestion,
  autoInterview, autoProgress, onAutoInterview,
}: {
  project: Project
  currentChapter?: Chapter
  turnCount: number
  canonCount: number
  entityCount: number
  contradictionCount: number
  threadCount: number
  onAskNext: () => void
  askingQuestion: boolean
  autoInterview: boolean
  autoProgress: { done: number; total: number } | null
  onAutoInterview: () => void
}) {
  return (
    <div className="p-4 space-y-4">
      <Card className="p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Current chapter</h3>
        {currentChapter ? (
          <>
            <div className="font-serif text-lg text-foreground leading-tight mb-1">
              Chapter {currentChapter.order} — {currentChapter.title}
            </div>
            <Badge variant={currentChapter.status === 'complete' ? 'default' : 'secondary'} className="text-xs font-normal capitalize">
              {currentChapter.status.replace('_', ' ')}
            </Badge>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No chapter</div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Quick action</h3>
        <Button onClick={onAskNext} disabled={askingQuestion} className="w-full mb-2">
          {askingQuestion ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Asking…</>
          ) : (
            <><Plus className="w-4 h-4 mr-2" /> Ask next question</>
          )}
        </Button>
        <Button
          variant={autoInterview ? 'secondary' : 'outline'}
          size="sm"
          className="w-full"
          onClick={onAutoInterview}
          disabled={autoInterview}
        >
          {autoInterview ? (
            <><Pause className="w-4 h-4 mr-2 animate-pulse" /> Running…</>
          ) : (
            <><Zap className="w-4 h-4 mr-2" /> Auto-interview</>
          )}
        </Button>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Runs multiple Q&amp;A turns automatically across chapters. Great for bulk manuscript generation.
        </p>
        {autoProgress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span>{autoProgress.done}/{autoProgress.total}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, (autoProgress.done / autoProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Project state</h3>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Total Q&amp;A</dt><dd>{turnCount}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Canon entries</dt><dd>{canonCount}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Entities tracked</dt><dd>{entityCount}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Contradictions</dt><dd>{contradictionCount}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Unresolved threads</dt><dd>{threadCount}</dd></div>
        </dl>
      </Card>

      <Card className="p-4 bg-accent/10 border-accent/30">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">About this project</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {project.characterName} is interviewed by an AI interviewer (custom bio per project). The character answers in voice,
          grounded in the corpus you uploaded. A manuscript grows chapter by chapter — you can regenerate any question or
          any manuscript section without losing state.
        </p>
      </Card>
    </div>
  )
}
