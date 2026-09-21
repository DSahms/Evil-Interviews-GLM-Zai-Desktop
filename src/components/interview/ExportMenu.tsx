'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FileDown, FileText, BookOpen, Mic, Loader2, MicOff } from 'lucide-react'
import { toast } from 'sonner'

interface ExportMenuProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when user clicks the Audio Q&A item and TTS is not configured.
   * The parent opens the Provider/TTS settings modal so the user can configure one. */
  onConfigureTts?: () => void
}

type Format = 'magazine-qa' | 'first-person-narrative' | 'manuscript-md' | 'manuscript-pdf' | 'manuscript-docx' | 'audio-qa'

export function ExportMenu({ projectId, open: _open, onOpenChange: _onOpenChange, onConfigureTts }: ExportMenuProps) {
  const [busy, setBusy] = useState<Format | null>(null)
  const [ttsConfigured, setTtsConfigured] = useState<boolean | null>(null)

  // Check if a TTS provider is configured. Per spec: the application must
  // work normally with TTS unconfigured — audio controls clearly indicate
  // "audio unavailable until a provider is configured."
  useEffect(() => {
    fetch('/api/tts-providers')
      .then((r) => r.json())
      .then((data) => {
        const has = (data.providers || []).some((p: { isActive: boolean }) => p.isActive)
        setTtsConfigured(has)
      })
      .catch(() => setTtsConfigured(false))
  }, [busy])

  const handleExport = async (format: Format) => {
    if (format === 'audio-qa' && ttsConfigured === false) {
      toast.error('Audio is unavailable', {
        description: 'No TTS provider is configured. Open Provider settings to add one.',
      })
      onConfigureTts?.()
      return
    }
    setBusy(format)
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      })
      // 503 with ttsUnconfigured: true means no TTS provider is configured.
      // Surface a clear message and open the TTS settings.
      if (res.status === 503) {
        const data = await res.json().catch(() => null)
        if (data?.ttsUnconfigured) {
          toast.error('Audio is unavailable', {
            description: data.error || 'No TTS provider is configured. Configure one in Provider settings.',
          })
          onConfigureTts?.()
        } else {
          toast.error('Audio export failed', { description: data?.error || 'Service unavailable.' })
        }
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Export failed')
      }
      if (format === 'magazine-qa' || format === 'first-person-narrative' || format === 'manuscript-md') {
        const data = await res.json()
        const blob = new Blob([data.content || ''], { type: 'text/markdown' })
        triggerDownload(blob, filenameFor(format, projectId))
        toast.success('Export ready', { description: `${filenameFor(format, projectId)} — ${(data.content || '').length} chars` })
      } else {
        const blob = await res.blob()
        triggerDownload(blob, filenameFor(format, projectId))
        toast.success('Export ready', { description: filenameFor(format, projectId) })
      }
    } catch (e) {
      toast.error('Export failed', { description: e instanceof Error ? e.message : '' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileDown className="w-4 h-4 mr-1.5" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Three outputs
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleExport('magazine-qa')} disabled={busy !== null}>
          <FileText className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span>Magazine-style Q&amp;A</span>
            <span className="text-xs text-muted-foreground">Markdown — interviewer asks, character answers</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('first-person-narrative')} disabled={busy !== null}>
          <BookOpen className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span>First-person narrative</span>
            <span className="text-xs text-muted-foreground">Markdown — character tells their own story</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('audio-qa')}
          disabled={busy !== null}
          className={ttsConfigured === false ? 'opacity-60' : ''}
        >
          {ttsConfigured === false ? (
            <MicOff className="w-4 h-4 mr-2 text-muted-foreground" />
          ) : (
            <Mic className="w-4 h-4 mr-2" />
          )}
          <div className="flex flex-col">
            <span>Audio Q&amp;A {ttsConfigured === false && <span className="text-xs text-muted-foreground">(configure TTS)</span>}</span>
            <span className="text-xs text-muted-foreground">
              {ttsConfigured === false
                ? 'No TTS provider configured — click to open settings'
                : 'MP3 — listen to the interview'}
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Manuscript
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleExport('manuscript-md')} disabled={busy !== null}>
          <FileText className="w-4 h-4 mr-2" />
          <span>Manuscript — Markdown</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('manuscript-pdf')} disabled={busy !== null}>
          <FileDown className="w-4 h-4 mr-2" />
          <span>Manuscript — PDF (literary)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('manuscript-docx')} disabled={busy !== null}>
          <FileDown className="w-4 h-4 mr-2" />
          <span>Manuscript — DOCX</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function filenameFor(format: Format, projectId: string): string {
  switch (format) {
    case 'magazine-qa': return `magazine-qa-${projectId}.md`
    case 'first-person-narrative': return `first-person-narrative-${projectId}.md`
    case 'manuscript-md': return `manuscript-${projectId}.md`
    case 'manuscript-pdf': return `manuscript-${projectId}.pdf`
    case 'manuscript-docx': return `manuscript-${projectId}.docx`
    case 'audio-qa': return `qa-${projectId}.mp3`
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
