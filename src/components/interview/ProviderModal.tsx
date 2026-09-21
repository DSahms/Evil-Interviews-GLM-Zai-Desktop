'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Loader2, Plus, Trash2, Zap, Save } from 'lucide-react'
import { toast } from 'sonner'

interface Provider {
  id: string
  name: string
  baseUrl: string
  model: string
  isActive: boolean
  isDefault: boolean
  apiKeyMasked: string
  apiKeyLength: number
}

interface ProviderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProviderModal({ open, onOpenChange }: ProviderModalProps) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  // Editable form
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [isNew, setIsNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/providers')
      const data = await res.json()
      setProviders(data.providers || [])
      const active = (data.providers || []).find((p: Provider) => p.isActive)
      if (active) {
        setSelectedId(active.id)
        populate(active)
        setIsNew(false)
      }
    } catch (e) {
      toast.error('Failed to load providers', { description: e instanceof Error ? e.message : '' })
    } finally {
      setLoading(false)
    }
  }, [])

  const populate = (p: Provider) => {
    setName(p.name)
    setBaseUrl(p.baseUrl)
    setModel(p.model)
    setApiKey('')
    setIsNew(false)
  }

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const handleSelect = (id: string) => {
    const p = providers.find((x) => x.id === id)
    if (!p) return
    setSelectedId(id)
    populate(p)
    setIsNew(false)
  }

  const handleNew = () => {
    setSelectedId(null)
    setIsNew(true)
    setName('')
    setBaseUrl('http://127.0.0.1:11434/v1')
    setModel('auto')
    setApiKey('')
  }

  const handleSave = async () => {
    if (!name.trim() || !baseUrl.trim()) {
      toast.error('Name and Base URL are required.')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        // Require API key for new providers
        if (!apiKey.trim()) {
          toast.error('API key is required for a new provider.')
          setSaving(false)
          return
        }
        const res = await fetch('/api/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            model: model.trim() || 'auto',
            isActive: true,
            isDefault: false,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create provider')
        }
        toast.success(`Provider "${name}" created and activated.`)
      } else if (selectedId) {
        const body: Record<string, unknown> = {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          model: model.trim() || 'auto',
          isActive: true,
        }
        if (apiKey.trim()) body.apiKey = apiKey.trim()
        const res = await fetch(`/api/providers/${selectedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to save provider')
        }
        toast.success(`Provider "${name}" saved and activated.`)
      }
      await load()
    } catch (e) {
      toast.error('Save failed', { description: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!selectedId || isNew) {
      toast.error('Save the provider first, then test it.')
      return
    }
    setTesting(true)
    try {
      const res = await fetch(`/api/providers/${selectedId}/test`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success('Connection OK', { description: data.message })
      } else {
        toast.error('Connection failed', { description: data.message })
      }
    } catch (e) {
      toast.error('Test failed', { description: e instanceof Error ? e.message : '' })
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedId || isNew) return
    const p = providers.find((x) => x.id === selectedId)
    if (!p) return
    if (p.isDefault) {
      toast.error('Cannot delete the default provider.')
      return
    }
    if (!confirm(`Delete provider "${p.name}"?`)) return
    try {
      const res = await fetch(`/api/providers/${selectedId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      toast.success('Provider deleted.')
      await load()
      // Reset form
      handleNew()
    } catch (e) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : '' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">AI Provider</DialogTitle>
          <DialogDescription>
            FreeLLMAPI is the shipped default. Add or switch to another OpenAI-compatible provider as needed.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Active provider</Label>
              <Select value={selectedId || ''} onValueChange={handleSelect}>
                <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.isDefault && '(default)'} — {p.model} — {p.apiKeyMasked}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="p-name" className="text-xs text-muted-foreground">Name</Label>
                  <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="FreeLLMAPI" disabled={!isNew && providers.find(p => p.id === selectedId)?.isDefault} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-model" className="text-xs text-muted-foreground">Model</Label>
                  <Input id="p-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="auto" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-base" className="text-xs text-muted-foreground">Base URL (OpenAI-compatible)</Label>
                <Input id="p-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:31415/v1" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-key" className="text-xs text-muted-foreground">
                  API key {isNew ? '' : '(leave blank to keep current)'}
                </Label>
                <Input
                  id="p-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={isNew ? 'sk-...' : '•••• ••••'}
                />
                {!isNew && selectedId && (
                  <p className="text-xs text-muted-foreground">
                    Current key: {providers.find((p) => p.id === selectedId)?.apiKeyMasked} ({providers.find((p) => p.id === selectedId)?.apiKeyLength} chars)
                  </p>
                )}
              </div>
              {selectedId && !isNew && (
                <div className="flex items-center gap-2">
                  {providers.find((p) => p.id === selectedId)?.isDefault && (
                    <Badge variant="default" className="text-xs">default</Badge>
                  )}
                  {providers.find((p) => p.id === selectedId)?.isActive && (
                    <Badge variant="secondary" className="text-xs">active</Badge>
                  )}
                </div>
              )}
            </Card>

            <div className="flex flex-wrap gap-2 justify-between">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleNew}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> New provider
                </Button>
                {!isNew && selectedId && !providers.find((p) => p.id === selectedId)?.isDefault && (
                  <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {!isNew && selectedId && (
                  <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                    {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                    Test connection
                  </Button>
                )}
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save &amp; activate
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <p className="text-xs text-muted-foreground">
            Per spec section 30: the API key is stored in the local database only, never committed to Git, never printed in logs, never exposed in normal UI text.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


