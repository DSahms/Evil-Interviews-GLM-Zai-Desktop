'use client'

import { useState, useEffect, useCallback } from 'react'
import { LandingView } from '@/components/interview/LandingView'
import { WorkspaceView } from '@/components/interview/WorkspaceView'
import { ThemeToggle } from '@/components/interview/ThemeToggle'

export default function Home() {
  const [view, setView] = useState<'landing' | 'workspace'>('landing')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [bootChecked, setBootChecked] = useState(false)

  // Boot: ensure the FreeLLMAPI provider is seeded on first launch.
  // Per spec section 20: the app must launch with FreeLLMAPI already configured.
  const boot = useCallback(async () => {
    try {
      await fetch('/api/seed', { method: 'POST' })
    } catch {
      // Non-fatal — the seed script may already have run via the build step.
    } finally {
      setBootChecked(true)
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  const openProject = (id: string) => {
    setProjectId(id)
    setView('workspace')
  }

  const backToLanding = () => {
    setProjectId(null)
    setView('landing')
  }

  if (!bootChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground animate-pulse">Preparing the interview chamber…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <button
            onClick={backToLanding}
            className="flex items-center gap-2 group cursor-pointer"
            aria-label="Back to projects"
          >
            <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
              <span className="text-primary text-sm font-serif">iE</span>
            </div>
            <span className="font-serif text-lg tracking-wide text-foreground group-hover:text-primary transition-colors">
              Interviews with Evil
            </span>
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {view === 'landing' && <LandingView onOpenProject={openProject} />}
        {view === 'workspace' && projectId && (
          <WorkspaceView projectId={projectId} onBack={backToLanding} />
        )}
      </main>
    </div>
  )
}
