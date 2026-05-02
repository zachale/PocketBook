import React, { useEffect, useState, useCallback } from 'react'
import type { AIProviderConfig, ModelInfo } from '../shared/ai/types'
import {
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_SUGGESTED_EMBEDDING,
  OLLAMA_SUGGESTED_LLM,
  OPENROUTER_DEFAULT_EMBEDDING,
  OPENROUTER_DEFAULT_LLM,
} from '../shared/ai/presets'

interface Props {
  onComplete: () => void
}

type Step = 'choose' | 'configure-ollama' | 'configure-openrouter'

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('choose')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async (config: AIProviderConfig) => {
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.ai.saveConfig(config)
      if (!result.ok) {
        setError(result.error ?? 'Could not save configuration')
        return
      }
      onComplete()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [onComplete])

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Choose your AI provider">
      <div className="onboarding-panel">
        <div className="onboarding-header">
          <div className="onboarding-eyebrow">Setup</div>
          <div className="onboarding-title">Choose your AI provider</div>
          <div className="onboarding-subtitle">
            PocketBook uses AI for search and reflection features. Pick a provider — you can change this later.
          </div>
        </div>

        {step === 'choose' && (
          <ChooseStep onPick={(s) => { setError(null); setStep(s) }} />
        )}

        {step === 'configure-ollama' && (
          <OllamaStep
            saving={saving}
            error={error}
            onBack={() => { setError(null); setStep('choose') }}
            onSave={handleSave}
          />
        )}

        {step === 'configure-openrouter' && (
          <OpenRouterStep
            saving={saving}
            error={error}
            onBack={() => { setError(null); setStep('choose') }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  )
}

// ── Step: choose provider ────────────────────────────────────────
function ChooseStep({ onPick }: { onPick: (step: Step) => void }) {
  return (
    <>
      <div className="onboarding-body">
        <div className="onboarding-tile-row">
          <button
            type="button"
            className="onboarding-tile"
            onClick={() => onPick('configure-ollama')}
          >
            <div className="onboarding-tile-name">Ollama</div>
            <div className="onboarding-tile-desc">
              Run models locally on your machine. Private, free, requires Ollama installed.
            </div>
          </button>
          <button
            type="button"
            className="onboarding-tile"
            onClick={() => onPick('configure-openrouter')}
          >
            <div className="onboarding-tile-name">OpenRouter</div>
            <div className="onboarding-tile-desc">
              Hosted access to many models with one API key. Pay-per-use, no install.
            </div>
          </button>
        </div>
      </div>
    </>
  )
}

// ── Step: Ollama ─────────────────────────────────────────────────
function OllamaStep({
  saving,
  error,
  onBack,
  onSave,
}: {
  saving: boolean
  error: string | null
  onBack: () => void
  onSave: (config: AIProviderConfig) => void
}) {
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [embedding, setEmbedding] = useState('')
  const [llm, setLlm] = useState('')

  const refresh = useCallback(async () => {
    setLoadError(null)
    setModels(null)
    try {
      const list = await window.api.ai.listOllamaModels(OLLAMA_DEFAULT_BASE_URL)
      setModels(list)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setLoadError(`Couldn't reach Ollama at ${OLLAMA_DEFAULT_BASE_URL}. Is it running? (${message})`)
      setModels([])
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Default selections once models arrive
  useEffect(() => {
    if (!models) return
    const embeds = models.filter(m => m.kind === 'embedding')
    const llms = models.filter(m => m.kind === 'llm')
    if (!embedding && embeds[0]) setEmbedding(embeds[0].id)
    if (!llm && llms[0]) setLlm(llms[0].id)
  }, [models, embedding, llm])

  const embeddings = models?.filter(m => m.kind === 'embedding') ?? []
  const llms = models?.filter(m => m.kind === 'llm') ?? []

  const canSave = embedding && llm && !saving

  const submit = () => {
    onSave({
      provider: 'ollama',
      baseUrl: OLLAMA_DEFAULT_BASE_URL,
      embeddingModel: embedding,
      llmModel: llm,
    })
  }

  return (
    <>
      <div className="onboarding-body">
        {loadError && (
          <div className="onboarding-error">{loadError}</div>
        )}

        <div className="onboarding-row">
          <label className="onboarding-label" htmlFor="ollama-embedding">Embedding model</label>
          <select
            id="ollama-embedding"
            className="onboarding-select"
            value={embedding}
            onChange={e => setEmbedding(e.target.value)}
            disabled={embeddings.length === 0}
          >
            {embeddings.length === 0 && <option value="">— none installed —</option>}
            {embeddings.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
          </select>
          {models && embeddings.length === 0 && (
            <div className="onboarding-hint">
              <span>No embedding models found. We suggest:</span>
              <span className="onboarding-code">ollama pull {OLLAMA_SUGGESTED_EMBEDDING}</span>
            </div>
          )}
        </div>

        <div className="onboarding-row">
          <label className="onboarding-label" htmlFor="ollama-llm">LLM</label>
          <select
            id="ollama-llm"
            className="onboarding-select"
            value={llm}
            onChange={e => setLlm(e.target.value)}
            disabled={llms.length === 0}
          >
            {llms.length === 0 && <option value="">— none installed —</option>}
            {llms.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
          </select>
          {models && llms.length === 0 && (
            <div className="onboarding-hint">
              <span>No LLM found. We suggest:</span>
              <span className="onboarding-code">ollama pull {OLLAMA_SUGGESTED_LLM}</span>
            </div>
          )}
        </div>

        {error && <div className="onboarding-error">{error}</div>}
      </div>

      <div className="onboarding-actions">
        <button type="button" className="onboarding-btn onboarding-btn--secondary" onClick={onBack}>
          Back
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="onboarding-btn onboarding-btn--secondary" onClick={refresh} disabled={saving}>
            Recheck
          </button>
          <button type="button" className="onboarding-btn onboarding-btn--primary" onClick={submit} disabled={!canSave}>
            {saving ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Step: OpenRouter ─────────────────────────────────────────────
function OpenRouterStep({
  saving,
  error,
  onBack,
  onSave,
}: {
  saving: boolean
  error: string | null
  onBack: () => void
  onSave: (config: AIProviderConfig) => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [embedding, setEmbedding] = useState(OPENROUTER_DEFAULT_EMBEDDING)
  const [llm, setLlm] = useState(OPENROUTER_DEFAULT_LLM)

  const canSave = apiKey.trim().length > 0 && embedding.trim() && llm.trim() && !saving

  const submit = () => {
    onSave({
      provider: 'openrouter',
      apiKey: apiKey.trim(),
      embeddingModel: embedding.trim(),
      llmModel: llm.trim(),
    })
  }

  return (
    <>
      <div className="onboarding-body">
        <div className="onboarding-row">
          <label className="onboarding-label" htmlFor="or-key">API key</label>
          <input
            id="or-key"
            type="password"
            className="onboarding-input"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-or-v1-…"
            autoFocus
          />
          <div className="onboarding-hint">
            Get a key at <span className="onboarding-code">openrouter.ai/keys</span>
          </div>
        </div>

        <div className="onboarding-row">
          <label className="onboarding-label" htmlFor="or-embedding">Embedding model</label>
          <input
            id="or-embedding"
            className="onboarding-input"
            value={embedding}
            onChange={e => setEmbedding(e.target.value)}
          />
        </div>

        <div className="onboarding-row">
          <label className="onboarding-label" htmlFor="or-llm">LLM</label>
          <input
            id="or-llm"
            className="onboarding-input"
            value={llm}
            onChange={e => setLlm(e.target.value)}
          />
        </div>

        {error && <div className="onboarding-error">{error}</div>}
      </div>

      <div className="onboarding-actions">
        <button type="button" className="onboarding-btn onboarding-btn--secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="onboarding-btn onboarding-btn--primary" onClick={submit} disabled={!canSave}>
          {saving ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </>
  )
}
