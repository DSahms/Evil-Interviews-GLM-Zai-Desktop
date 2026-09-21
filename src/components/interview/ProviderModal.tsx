'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Loader2, Plus, Trash2, Zap, Save, MicOff, Mic, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface LlmProvider {
  id: string
  name: string
  baseUrl: string
  model: string
  isActive: boolean
  isDefault: boolean
  apiKeyMasked: string
  apiKeyLength: number
}

interface TtsProvider {
  id: string
  name: string
  providerType: string
  baseUrl: string
  voice: string
  model: string
  responseFormat: string
  isActive: boolean
  isDefault: boolean
  apiKeyMasked: string
  apiKeyLength: number
}

interface SupportedTtsType {
  value: string
  label: string
  implemented: boolean
  description: string
}

interface ProviderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: 'llm' | 'tts'
}

export function ProviderModal({ open, onOpenChange, initialTab = 'llm' }: ProviderModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">AI providers</DialogTitle>
          <DialogDescription>
            LLM provider powers the interviewer, subject, and composition engines. TTS provider synthesizes audio for the Audio Q&amp;A export. FreeLLMAPI ships as the default LLM provider; TTS is optional and unconfigured by default.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="llm">LLM provider</TabsTrigger>
            <TabsTrigger value="tts">TTS provider</TabsTrigger>
          </TabsList>
          <TabsContent value="llm" className="mt-4">
            <LlmProviderSection />
          </TabsContent>
          <TabsContent value="tts" className="mt-4">
            <TtsProviderSection />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <p className="text-xs text-muted-foreground">
            Per spec section 30: API keys are stored in the local database only, never committed to Git, never printed in logs, never exposed in normal UI text.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// LLM Provider section — unchanged behavior, factored into its own component
// ============================================================================

function LlmProviderSection() {
  const [providers, setProviders] = useState<LlmProvider[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
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
      const active = (data.providers || []).find((p: LlmProvider) => p.isActive)
      if (active) {
        setSelectedId(active.id)
        populate(active)
        setIsNew(false)
      }
    } catch (e) {
      toast.error('Failed to load LLM providers', { description: e instanceof Error ? e.message : '' })
    } finally {
      setLoading(false)
    }
  }, [])

  const populate = (p: LlmProvider) => {
    setName(p.name)
    setBaseUrl(p.baseUrl)
    setModel(p.model)
    setApiKey('')
    setIsNew(false)
  }

  useEffect(() => { void load() }, [load])

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
        if (!apiKey.trim()) {
          toast.error('API key is required for a new provider.')
          setSaving(false)
          return
        }
        const res = await fetch('/api/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim(),
            model: model.trim() || 'auto', isActive: true, isDefault: false,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create provider')
        }
        toast.success(`LLM provider "${name}" created and activated.`)
      } else if (selectedId) {
        const body: Record<string, unknown> = {
          name: name.trim(), baseUrl: baseUrl.trim(),
          model: model.trim() || 'auto', isActive: true,
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
        toast.success(`LLM provider "${name}" saved and activated.`)
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
      if (data.ok) toast.success('Connection OK', { description: data.message })
      else toast.error('Connection failed', { description: data.message })
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
      toast.error('Cannot delete the default LLM provider.')
      return
    }
    if (!confirm(`Delete LLM provider "${p.name}"?`)) return
    try {
      const res = await fetch(`/api/providers/${selectedId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      toast.success('LLM provider deleted.')
      await load()
      handleNew()
    } catch (e) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : '' })
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Active LLM provider</Label>
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
            <Label htmlFor="llm-name" className="text-xs text-muted-foreground">Name</Label>
            <Input id="llm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="FreeLLMAPI" disabled={!isNew && providers.find(p => p.id === selectedId)?.isDefault} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="llm-model" className="text-xs text-muted-foreground">Model</Label>
            <Input id="llm-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="auto" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="llm-base" className="text-xs text-muted-foreground">Base URL (OpenAI-compatible)</Label>
          <Input id="llm-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:31415/v1" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="llm-key" className="text-xs text-muted-foreground">
            API key {isNew ? '' : '(leave blank to keep current)'}
          </Label>
          <Input id="llm-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={isNew ? 'sk-...' : '•••• ••••'} />
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
          <Button variant="outline" size="sm" onClick={handleNew}><Plus className="w-3.5 h-3.5 mr-1.5" /> New LLM provider</Button>
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
  )
}

// ============================================================================
// TTS Provider section — new. TTS is optional; no provider is configured
// by default. The application works normally without one.
// ============================================================================

function TtsProviderSection() {
  const [providers, setProviders] = useState<TtsProvider[]>([])
  const [supportedTypes, setSupportedTypes] = useState<SupportedTtsType[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [providerType, setProviderType] = useState('openai-compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [voice, setVoice] = useState('default')
  const [model, setModel] = useState('')
  const [responseFormat, setResponseFormat] = useState('mp3')
  const [isNew, setIsNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tts-providers')
      const data = await res.json()
      setProviders(data.providers || [])
      setSupportedTypes(data.supportedTypes || [])
      const active = (data.providers || []).find((p: TtsProvider) => p.isActive)
      if (active) {
        setSelectedId(active.id)
        populate(active)
        setIsNew(false)
      } else if ((data.providers || []).length === 0) {
        // No TTS provider configured — this is the expected initial state.
        // Leave the form blank for the user to add one when ready.
        setIsNew(true)
      }
    } catch (e) {
      toast.error('Failed to load TTS providers', { description: e instanceof Error ? e.message : '' })
    } finally {
      setLoading(false)
    }
  }, [])

  const populate = (p: TtsProvider) => {
    setName(p.name)
    setProviderType(p.providerType)
    setBaseUrl(p.baseUrl)
    setVoice(p.voice)
    setModel(p.model)
    setResponseFormat(p.responseFormat)
    setApiKey('')
    setIsNew(false)
  }

  useEffect(() => { void load() }, [load])

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
    setProviderType('openai-compatible')
    setBaseUrl('http://127.0.0.1:31415/v1')
    setVoice('default')
    setModel('')
    setResponseFormat('mp3')
    setApiKey('')
  }

  const handleSave = async () => {
    if (!name.trim() || !baseUrl.trim()) {
      toast.error('Name and Base URL are required.')
      return
    }
    const supported = supportedTypes.find((t) => t.value === providerType)
    if (supported && !supported.implemented) {
      toast.error(`Provider type "${supported.label}" is not yet implemented.`, {
        description: supported.description,
      })
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const res = await fetch('/api/tts-providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(), providerType, baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(), voice: voice.trim() || 'default',
            model: model.trim(), responseFormat,
            isActive: true, isDefault: false,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create TTS provider')
        }
        toast.success(`TTS provider "${name}" created and activated.`)
      } else if (selectedId) {
        const body: Record<string, unknown> = {
          name: name.trim(), providerType, baseUrl: baseUrl.trim(),
          voice: voice.trim() || 'default', model: model.trim(),
          responseFormat, isActive: true,
        }
        if (apiKey.trim()) body.apiKey = apiKey.trim()
        const res = await fetch(`/api/tts-providers/${selectedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to save TTS provider')
        }
        toast.success(`TTS provider "${name}" saved and activated.`)
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
      toast.error('Save the TTS provider first, then test it.')
      return
    }
    setTesting(true)
    try {
      const res = await fetch(`/api/tts-providers/${selectedId}/test`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) toast.success('TTS synthesis OK', { description: data.message })
      else toast.error('TTS synthesis failed', { description: data.message })
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
    if (!confirm(`Delete TTS provider "${p.name}"? Audio will become unavailable until another is configured.`)) return
    try {
      const res = await fetch(`/api/tts-providers/${selectedId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      toast.success('TTS provider deleted. Audio is now unavailable.')
      await load()
      handleNew()
    } catch (e) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : '' })
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  }

  const hasActiveProvider = providers.some((p) => p.isActive)

  return (
    <div className="space-y-4">
      {/* Status banner — per spec: "audio controls should clearly indicate
          that audio is unavailable until a provider is configured" */}
      {!hasActiveProvider && (
        <Card className="p-3 border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10 flex items-start gap-2">
          <MicOff className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-foreground">Audio is unavailable</p>
            <p className="text-muted-foreground mt-0.5">
              No TTS provider is configured. The application works normally without one. Add a provider below to enable Audio Q&amp;A export.
            </p>
          </div>
        </Card>
      )}
      {hasActiveProvider && (
        <Card className="p-3 border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/10 flex items-start gap-2">
          <Mic className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-foreground">Audio is available</p>
            <p className="text-muted-foreground mt-0.5">A TTS provider is active. Audio Q&amp;A export will synthesize the interview text on demand.</p>
          </div>
        </Card>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Configured TTS providers</Label>
        {providers.length === 0 ? (
          <p className="text-xs text-muted-foreground italic mt-1">None configured yet.</p>
        ) : (
          <Select value={selectedId || ''} onValueChange={handleSelect}>
            <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {p.providerType} — {p.voice} — {p.apiKeyMasked || 'no key'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tts-name" className="text-xs text-muted-foreground">Name</Label>
            <Input id="tts-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Local TTS" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tts-type" className="text-xs text-muted-foreground">Provider type</Label>
            <Select value={providerType} onValueChange={setProviderType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {supportedTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}{!t.implemented && ' (not yet implemented)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tts-base" className="text-xs text-muted-foreground">
            Base URL (for OpenAI-compatible: serves <code>/audio/speech</code>)
          </Label>
          <Input id="tts-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:31415/v1" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tts-voice" className="text-xs text-muted-foreground">Voice</Label>
            <Input id="tts-voice" value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="default" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tts-model" className="text-xs text-muted-foreground">Model (optional)</Label>
            <Input id="tts-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="tts-1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tts-format" className="text-xs text-muted-foreground">Format</Label>
            <Select value={responseFormat} onValueChange={setResponseFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mp3">mp3</SelectItem>
                <SelectItem value="wav">wav</SelectItem>
                <SelectItem value="ogg">ogg</SelectItem>
                <SelectItem value="flac">flac</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tts-key" className="text-xs text-muted-foreground">
            API key {isNew ? '(optional — leave blank if your TTS endpoint is unauthenticated)' : '(leave blank to keep current)'}
          </Label>
          <Input id="tts-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={isNew ? '(optional)' : '•••• ••••'} />
          {!isNew && selectedId && (
            <p className="text-xs text-muted-foreground">
              Current key: {providers.find((p) => p.id === selectedId)?.apiKeyMasked || '(none)'} ({providers.find((p) => p.id === selectedId)?.apiKeyLength} chars)
            </p>
          )}
        </div>
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            The manuscript text is the authoritative artifact — it lives in the database and exports as Markdown/PDF/DOCX independently of TTS. Audio is a derived output: synthesized on demand from the manuscript text, never stored as authoritative.
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleNew}><Plus className="w-3.5 h-3.5 mr-1.5" /> New TTS provider</Button>
          {!isNew && selectedId && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {!isNew && selectedId && (
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
              Test synthesis
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save &amp; activate
          </Button>
        </div>
      </div>
    </div>
  )
}
