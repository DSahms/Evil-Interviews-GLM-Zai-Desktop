'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, ChevronRight, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

interface ProjectSummary {
  id: string
  characterName: string
  whatToCall: string
  currentChapter: number
  status: string
  createdAt: string
  updatedAt: string
  chapterCount: number
  turnCount: number
  completedChapters: number
}

interface LandingViewProps {
  onOpenProject: (id: string) => void
}

const DEFAULT_INTERVIEWER_BIO = `You are a careful, patient long-form interviewer in the tradition of The New Yorker and The Paris Review. You ask one question at a time. You are curious about the inner life of the subject — what hurts them, what they love, what they remember, what they have lost. You do not manufacture emotion. You do not call the subject a liar when accounts conflict; you investigate the discrepancy. You follow unexpected threads. You let the subject's worldview emerge rather than dictating it.`

export function LandingView({ onOpenProject }: LandingViewProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)

  // New project form state
  const [characterName, setCharacterName] = useState('')
  const [whatToCall, setWhatToCall] = useState('')
  const [interviewerBio, setInterviewerBio] = useState(DEFAULT_INTERVIEWER_BIO)
  const [corpusFile, setCorpusFile] = useState<File | null>(null)
  const [corpusPath, setCorpusPath] = useState<string | null>(null)
  const [uploadingCorpus, setUploadingCorpus] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true)
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(data.projects || [])
    } catch (e) {
      toast.error('Failed to load projects', { description: e instanceof Error ? e.message : '' })
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const handleCorpusUpload = async (file: File) => {
    setCorpusFile(file)
    setUploadingCorpus(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const slug = file.name.replace(/\.md$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()
      fd.append('slug', slug)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setCorpusPath(data.corpusPath)
      toast.success(`Corpus uploaded`, { description: `${file.name} — ${data.size.toLocaleString()} chars` })
    } catch (e) {
      toast.error('Corpus upload failed', { description: e instanceof Error ? e.message : '' })
      setCorpusFile(null)
      setCorpusPath(null)
    } finally {
      setUploadingCorpus(false)
    }
  }

  const handleCreateProject = async () => {
    if (!characterName.trim() || !whatToCall.trim() || !corpusPath) {
      toast.error('Character name, what-to-call, and corpus file are all required.')
      return
    }
    setCreatingProject(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterName: characterName.trim(),
          whatToCall: whatToCall.trim(),
          interviewerBio: interviewerBio.trim(),
          corpusPath,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create project')
      toast.success(`Project created for ${data.project.characterName}`)
      onOpenProject(data.project.id)
    } catch (e) {
      toast.error('Failed to create project', { description: e instanceof Error ? e.message : '' })
    } finally {
      setCreatingProject(false)
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 w-full">
      <section className="mb-10">
        <h1 className="font-serif text-3xl text-foreground mb-1">Interviews with Evil</h1>
        <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
          A long-form interview engine that pulls tacit knowledge out of a fictional character&apos;s corpus.
          The interviewer asks, the character answers in-character, and a manuscript grows chapter by chapter
          as the interview progresses. Inspired by <em>Interview with the Vampire</em> and <em>Frankenstein</em> —
          the goal is to discover the inner life of a being humans might otherwise call evil.
        </p>
      </section>

      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-xl text-foreground">Existing projects</h2>
          {projects.length > 0 && (
            <span className="text-xs text-muted-foreground">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        {loadingProjects ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : projects.length === 0 ? (
          <Card className="p-6 border-dashed">
            <p className="text-sm text-muted-foreground">No projects yet. Create one below.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenProject(p.id)}
                className="text-left"
              >
                <Card className="p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer h-full">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-serif text-lg text-foreground leading-tight">{p.characterName}</h3>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 italic">&ldquo;{p.whatToCall}&rdquo;</p>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <Badge variant="outline" className="font-normal">
                      Chapter {p.currentChapter}/11
                    </Badge>
                    <Badge variant="secondary" className="font-normal">
                      {p.turnCount} Q&amp;A
                    </Badge>
                    {p.completedChapters > 0 && (
                      <Badge variant="outline" className="font-normal">
                        {p.completedChapters} done
                      </Badge>
                    )}
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-xl text-foreground">New interview</h2>
        </div>
        <Card className="p-6 max-w-2xl">
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="characterName" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Character name
                </Label>
                <Input
                  id="characterName"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="e.g. Old Yellow Top"
                  className="font-serif"
                />
                <p className="text-xs text-muted-foreground">The full canonical name of the subject.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatToCall" className="text-xs uppercase tracking-wider text-muted-foreground">
                  What to call them
                </Label>
                <Input
                  id="whatToCall"
                  value={whatToCall}
                  onChange={(e) => setWhatToCall(e.target.value)}
                  placeholder="e.g. Yellow Top"
                  className="font-serif"
                />
                <p className="text-xs text-muted-foreground">How the interviewer addresses them.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="interviewerBio" className="text-xs uppercase tracking-wider text-muted-foreground">
                Interviewer bio &amp; voice (custom)
              </Label>
              <Textarea
                id="interviewerBio"
                value={interviewerBio}
                onChange={(e) => setInterviewerBio(e.target.value)}
                rows={5}
                placeholder="Describe the interviewer's voice, perspective, and what they are trying to understand about this subject."
              />
              <p className="text-xs text-muted-foreground">
                This bio shapes the interviewer&apos;s questions. Customize per project.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Knowledge corpus (Markdown)
              </Label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 hover:border-primary/40 hover:bg-accent/30 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept=".md,.markdown,.txt"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handleCorpusUpload(f)
                  }}
                />
                {corpusFile ? (
                  <div className="flex flex-col items-center gap-1">
                    <FileText className="w-6 h-6 text-primary" />
                    <span className="text-sm font-medium text-foreground">{corpusFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {corpusPath ? 'Stored locally' : 'Uploading…'}
                    </span>
                  </div>
                ) : uploadingCorpus ? (
                  <div className="flex flex-col items-center gap-1">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    <span className="text-sm text-muted-foreground">Uploading…</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload a markdown corpus</span>
                    <span className="text-xs text-muted-foreground">.md / .markdown / .txt</span>
                  </div>
                )}
              </label>
              <p className="text-xs text-muted-foreground">
                The corpus is stored locally on your machine and retrieved by section — never dumped wholesale into a prompt.
              </p>
            </div>

            <div className="pt-2">
              <Button
                onClick={handleCreateProject}
                disabled={creatingProject || !characterName.trim() || !whatToCall.trim() || !corpusPath}
                className="w-full sm:w-auto"
              >
                {creatingProject ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
                ) : (
                  <><Plus className="w-4 h-4 mr-2" /> Begin interview</>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </section>

      <footer className="mt-16 pt-6 border-t border-border text-xs text-muted-foreground">
        <p className="leading-relaxed max-w-3xl">
          The interviewer and the character are separate LLM operations.
          The character stays in voice across 11 chapters (Origins, Childhood, Adolescence, Family &amp; Kin,
          Education, Love &amp; Relationships, Parenthood/Creation, Loss, Turning Points, Lessons Learned, Legacy).
          The manuscript grows as you ask. Regenerate any question or any manuscript section without losing state.
          FreeLLMAPI ships as the default working provider — change it in Settings.
        </p>
      </footer>
    </div>
  )
}
