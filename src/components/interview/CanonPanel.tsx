'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { Canon, Entity, Event, Contradiction, UnresolvedThread, UserCorrection } from './WorkspaceView'

interface CanonPanelProps {
  projectId: string
  canon: Canon[]
  entities: Entity[]
  events: Event[]
  contradictions: Contradiction[]
  unresolvedThreads: UnresolvedThread[]
  corrections: UserCorrection[]
  onUpdated: () => void
}

export function CanonPanel({ projectId, canon, entities, events, contradictions, unresolvedThreads, corrections, onUpdated }: CanonPanelProps) {
  const [newCorrectionKey, setNewCorrectionKey] = useState('')
  const [newCorrectionValue, setNewCorrectionValue] = useState('')
  const [newCorrectionReason, setNewCorrectionReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAddCorrection = async () => {
    if (!newCorrectionKey.trim() || !newCorrectionValue.trim()) {
      toast.error('Key and value are required for a correction.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/canon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newCorrectionKey.trim(),
          value: newCorrectionValue.trim(),
          reason: newCorrectionReason.trim(),
        }),
      })
      if (!res.ok) throw new Error('Failed to save correction')
      toast.success('Correction saved', { description: 'Future generation will respect this canon.' })
      setNewCorrectionKey('')
      setNewCorrectionValue('')
      setNewCorrectionReason('')
      onUpdated()
    } catch (e) {
      toast.error('Failed to save', { description: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCorrection = async (key: string) => {
    try {
      await fetch(`/api/projects/${projectId}/canon`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      toast.success('Correction removed')
      onUpdated()
    } catch (e) {
      toast.error('Failed to delete', { description: e instanceof Error ? e.message : '' })
    }
  }

  const traits = canon.filter((c) => c.key.startsWith('trait:'))
  const claims = canon.filter((c) => c.key.startsWith('claim:'))
  const voice = canon.filter((c) => c.key.startsWith('voice:'))
  const rules = canon.filter((c) => c.key.startsWith('rule:'))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <header>
          <h2 className="font-serif text-xl text-foreground mb-1">Character canon &amp; provenance</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Extracted after each answer. Provenance is preserved: source (from corpus), subject (from {`character's`} answers),
            user (your corrections), generated (manuscript prose — never auto-promoted to fact).
          </p>
        </header>

        {/* User corrections — editable */}
        <Card className="p-4 border-accent/40 bg-accent/5">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">User-established canon (overrides everything)</h3>
          {corrections.length > 0 ? (
            <ul className="space-y-2 mb-4">
              {corrections.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <div className="font-mono text-xs text-primary">{c.key}</div>
                    <div className="text-foreground">{c.value}</div>
                    {c.reason && <div className="text-xs text-muted-foreground italic">Reason: {c.reason}</div>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteCorrection(c.key)}
                    className="h-6 px-1 text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground mb-3">No user corrections yet.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2">
            <div className="space-y-1">
              <Label htmlFor="corr-key" className="text-xs text-muted-foreground">Key (e.g. trait:age)</Label>
              <Input
                id="corr-key"
                value={newCorrectionKey}
                onChange={(e) => setNewCorrectionKey(e.target.value)}
                placeholder="trait:age"
                className="font-mono text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="corr-value" className="text-xs text-muted-foreground">Value</Label>
              <Input
                id="corr-value"
                value={newCorrectionValue}
                onChange={(e) => setNewCorrectionValue(e.target.value)}
                placeholder="64 years (across sightings)"
                className="h-8"
              />
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <Label htmlFor="corr-reason" className="text-xs text-muted-foreground">Reason (optional)</Label>
            <Textarea
              id="corr-reason"
              value={newCorrectionReason}
              onChange={(e) => setNewCorrectionReason(e.target.value)}
              rows={2}
              placeholder="Why this is canon for this project."
              className="text-xs"
            />
          </div>
          <Button onClick={handleAddCorrection} disabled={saving} size="sm" className="mt-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Add correction
          </Button>
        </Card>

        {/* Traits */}
        {traits.length > 0 && (
          <CanonGroup title="Traits" items={traits} />
        )}
        {claims.length > 0 && (
          <CanonGroup title="Claims" items={claims} />
        )}
        {voice.length > 0 && (
          <CanonGroup title="Voice" items={voice} />
        )}
        {rules.length > 0 && (
          <CanonGroup title="Rules" items={rules} />
        )}

        {/* Entities */}
        {entities.length > 0 && (
          <Card className="p-4">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Entities ({entities.length})</h3>
            <ul className="space-y-1.5">
              {entities.slice(0, 30).map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <div>
                    <span className="font-medium">{e.name}</span>{' '}
                    <Badge variant="outline" className="text-[10px] font-normal">{e.type}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{e.mentions}×</span>
                </li>
              ))}
            </ul>
            {entities.length > 30 && (
              <p className="text-xs text-muted-foreground mt-2">+ {entities.length - 30} more</p>
            )}
          </Card>
        )}

        {/* Events */}
        {events.length > 0 && (
          <Card className="p-4">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Events ({events.length})</h3>
            <ul className="space-y-2">
              {events.slice(0, 20).map((ev) => (
                <li key={ev.id} className="text-sm border-l-2 border-l-border pl-2">
                  <div className="font-medium">{ev.name}</div>
                  {(ev.date || ev.location) && (
                    <div className="text-xs text-muted-foreground">{[ev.date, ev.location].filter(Boolean).join(' · ')}</div>
                  )}
                  {ev.description && (
                    <div className="text-xs text-muted-foreground mt-1"><MarkdownRenderer content={ev.description} /></div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Contradictions */}
        {contradictions.length > 0 && (
          <Card className="p-4 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Contradictions ({contradictions.length})</h3>
            <ul className="space-y-2">
              {contradictions.slice(0, 20).map((c) => (
                <li key={c.id} className="text-sm border-l-2 border-l-amber-500/50 pl-2">
                  <div className="text-foreground"><span className="text-muted-foreground text-xs">{c.sourceA}:</span> {c.claimA}</div>
                  <div className="text-foreground mt-1"><span className="text-muted-foreground text-xs">{c.sourceB}:</span> {c.claimB}</div>
                  <Badge variant="outline" className="mt-1 text-[10px] font-normal">{c.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Unresolved threads */}
        {unresolvedThreads.length > 0 && (
          <Card className="p-4">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Unresolved threads ({unresolvedThreads.length})</h3>
            <ul className="space-y-1.5">
              {unresolvedThreads.slice(0, 20).map((t) => (
                <li key={t.id} className="text-sm flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
                  <span>{t.summary}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {canon.length === 0 && entities.length === 0 && events.length === 0 && contradictions.length === 0 && unresolvedThreads.length === 0 && corrections.length === 0 && (
          <Card className="p-6 border-dashed text-center">
            <p className="text-sm text-muted-foreground">The canon is empty. As {`the character`} answers questions, traits, claims, entities, events, and contradictions will be extracted here automatically.</p>
          </Card>
        )}
      </div>
    </div>
  )
}

function CanonGroup({ title, items }: { title: string; items: Canon[] }) {
  return (
    <Card className="p-4">
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title} ({items.length})</h3>
      <ul className="space-y-1.5">
        {items.map((c) => (
          <li key={c.id} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs text-primary">{c.key}</span>
              <Badge variant="outline" className="text-[10px] font-normal">{c.provenance}</Badge>
            </div>
            <div className="text-foreground mt-0.5">{c.value}</div>
          </li>
        ))}
      </ul>
    </Card>
  )
}


