import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { TagPublic, TagSuggestion } from '../shared/ai/tag-types'
import { TagPill } from './TagPill'

interface Props {
  entryId: number
  suggestions: TagSuggestion[]
}

export function TagBar({ entryId, suggestions }: Props) {
  const [tags, setTags] = useState<TagPublic[]>([])
  const [composing, setComposing] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const list = await window.api.tags.forEntry(entryId)
    setTags(list)
  }, [entryId])

  useEffect(() => { refresh() }, [refresh])

  // Filter out suggestions that already became tags on this entry.
  const attachedIds = new Set(tags.map(t => t.id))
  const visibleSuggestions = suggestions.filter(
    s => s.tagId == null || !attachedIds.has(s.tagId),
  )

  const handleRemove = useCallback(
    async (tagId: number) => {
      await window.api.tags.remove(entryId, tagId)
      refresh()
    },
    [entryId, refresh],
  )

  const handleAcceptSuggestion = useCallback(
    async (s: TagSuggestion) => {
      let id = s.tagId
      if (id == null) {
        const created = await window.api.tags.create({ name: s.name, description: s.description })
        id = created.id
      }
      await window.api.tags.add(entryId, id)
      refresh()
    },
    [entryId, refresh],
  )

  const submitCompose = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name required')
      return
    }
    try {
      const tag = await window.api.tags.create({ name: trimmed, description: description.trim() })
      await window.api.tags.add(entryId, tag.id)
      setComposing(false)
      setName('')
      setDescription('')
      setError(null)
      refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    }
  }, [entryId, name, description, refresh])

  const cancelCompose = useCallback(() => {
    setComposing(false)
    setName('')
    setDescription('')
    setError(null)
  }, [])

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitCompose()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelCompose()
    }
  }

  // Cancel on click outside the composer.
  useEffect(() => {
    if (!composing) return
    const onDocClick = (e: MouseEvent) => {
      if (composerRef.current && !composerRef.current.contains(e.target as Node)) {
        cancelCompose()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [composing, cancelCompose])

  return (
    <div className="tag-bar" onClick={e => e.stopPropagation()}>
      {tags.map(t => (
        <TagPill
          key={t.id}
          variant="added"
          name={t.name}
          title={t.description || undefined}
          onRemove={() => handleRemove(t.id)}
        />
      ))}

      {composing ? (
        <div ref={composerRef} className="tag-compose">
          <input
            className="tag-compose-name"
            placeholder="Tag name"
            value={name}
            onChange={e => { setName(e.target.value); setError(null) }}
            onKeyDown={handleKey}
            autoFocus
          />
          <div className="tag-compose-divider" />
          <input
            className="tag-compose-desc"
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleKey}
          />
          {error && <div className="tag-compose-error">{error}</div>}
        </div>
      ) : (
        <button
          type="button"
          className="tag-pill new"
          onClick={() => setComposing(true)}
          aria-label="New tag"
        >
          <span className="tag-pill-glyph" aria-hidden="true">＋</span>
          <span className="tag-pill-name">New tag</span>
        </button>
      )}

      {visibleSuggestions.map(s => (
        <TagPill
          key={`${s.tagId ?? 'new'}:${s.name}`}
          variant="suggested"
          name={s.name}
          aiGenerated={s.aiGenerated}
          title={s.description || undefined}
          onClick={() => handleAcceptSuggestion(s)}
        />
      ))}
    </div>
  )
}
