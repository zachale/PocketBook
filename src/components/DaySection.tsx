import React, { useCallback, useState } from 'react'
import { Bubble } from './Bubble'
import type { Entry } from '../shared/types'

interface Props {
  date: string           // 'YYYY-MM-DD'
  today: string
  entries: Entry[]
  isToday: boolean
  freshIds: Set<number>
  aiReady: boolean
  onEntriesChange: (date: string, entries: Entry[]) => void
  onAddEntry: (date: string) => void
  onMarkFresh: (id: number) => void
}

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function formatDate(dateStr: string, today: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const m = MONTHS[d.getMonth()]
  const day = d.getDate()
  if (dateStr === today) return `TODAY · ${m} ${day}`
  const t = new Date(today + 'T12:00:00')
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000)
  if (diff === 1) return `YESTERDAY · ${m} ${day}`
  return `${WEEKDAYS[d.getDay()]} · ${m} ${day}`
}

export function DaySection({
  date,
  today,
  entries,
  isToday,
  freshIds,
  aiReady,
  onEntriesChange,
  onAddEntry,
  onMarkFresh,
}: Props) {
  const handleNewBubble = useCallback(
    async (afterPosition: number) => {
      const newEntry = await window.api.upsertEntry({
        date,
        position: afterPosition + 1,
        content: '',
      })
      onMarkFresh(newEntry.id)
      const updated = [...entries]
      updated.splice(afterPosition + 1, 0, newEntry)
      onEntriesChange(date, updated)
    },
    [date, entries, onEntriesChange, onMarkFresh]
  )

  const handleDeleteBubble = useCallback(
    async (idx: number) => {
      // Refuse to delete the only writable bubble on today
      if (isToday && entries.length <= 1) return
      const entry = entries[idx]
      if (!entry) return
      const focusTarget = entries[idx - 1]?.id ?? entries[idx + 1]?.id ?? null
      await window.api.deleteEntry(entry.id)
      const updated = entries.filter((_, i) => i !== idx)
      onEntriesChange(date, updated)
      if (focusTarget != null) {
        setTimeout(() => {
          const el = document.querySelector(
            `[data-entry-id="${focusTarget}"] .ProseMirror`
          ) as HTMLElement | null
          el?.focus()
        }, 0)
      }
    },
    [date, entries, isToday, onEntriesChange]
  )

  // Track each bubble's live emptiness so we can derive lastEmpty even after
  // delete/reorder operations where App state's entry.content lags behind
  // the debounced save.
  const [emptyMap, setEmptyMap] = useState<Record<number, boolean>>({})

  const handleEmptyChange = useCallback((id: number, empty: boolean) => {
    setEmptyMap(prev => (prev[id] === empty ? prev : { ...prev, [id]: empty }))
  }, [])

  if (!isToday && entries.length === 0) return null

  const last = entries[entries.length - 1]
  const lastEmpty = last
    ? (last.id in emptyMap
        ? emptyMap[last.id]
        : !last.content || last.content.trim() === '')
    : true
  const showPill = entries.length > 0 && !lastEmpty

  return (
    <div className="day-section" data-date={date}>
      <div className="date-header">{formatDate(date, today)}</div>
      {entries.map((entry, idx) => {
        const isLast = idx === entries.length - 1
        return (
          <Bubble
            key={entry.id}
            entry={entry}
            fresh={freshIds.has(entry.id)}
            aiReady={aiReady}
            onNewBubble={() => handleNewBubble(idx)}
            onDeleteBubble={() => handleDeleteBubble(idx)}
            onEmptyChange={(empty) => handleEmptyChange(entry.id, empty)}
            autoFocus={freshIds.has(entry.id) || (isToday && isLast)}
          />
        )
      })}
      {showPill && (
        <div className="add-pill-row">
          <button
            type="button"
            className="add-pill"
            onClick={() => onAddEntry(date)}
            aria-label="Add new entry"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>New entry</span>
          </button>
          <span className="add-pill-hint" aria-hidden="true">⌘ + Enter</span>
        </div>
      )}
    </div>
  )
}
