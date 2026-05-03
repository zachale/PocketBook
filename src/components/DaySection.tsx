import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bubble } from './Bubble'
import type { Entry } from '../shared/types'

interface Props {
  date: string           // 'YYYY-MM-DD'
  today: string
  entries: Entry[]
  isToday: boolean
  loaded: boolean
  placeholderCount?: number
  htmlMap: Record<number, string>
  freshIds: Set<number>
  aiReady: boolean
  onEntriesChange: (date: string, entries: Entry[]) => void
  onAddEntry: (date: string) => void
  onMarkFresh: (id: number) => void
  onNeedsLoad: (date: string) => void
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

// Stable hash → skeleton bubble height. Keeps the placeholder shape consistent
// across re-renders without storing per-section state.
function skeletonHeight(date: string, idx: number): number {
  let h = 5381
  const s = `${date}:${idx}`
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  const min = 64
  const span = 96 // 64 → 160
  return min + (Math.abs(h) % span)
}

export function DaySection({
  date,
  today,
  entries,
  isToday,
  loaded,
  placeholderCount = 0,
  htmlMap,
  freshIds,
  aiReady,
  onEntriesChange,
  onAddEntry,
  onMarkFresh,
  onNeedsLoad,
}: Props) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const requestedRef = useRef(false)

  // Trigger a load request when the section nears the viewport
  useEffect(() => {
    if (loaded || isToday) return
    if (requestedRef.current) return
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([obs]) => {
        if (obs.isIntersecting && !requestedRef.current) {
          requestedRef.current = true
          onNeedsLoad(date)
          observer.disconnect()
        }
      },
      { rootMargin: '600px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [date, isToday, loaded, onNeedsLoad])

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

  // Crossfade: keep skeletons mounted briefly so the swap is a transition,
  // not a pop. They fade out via .skeleton-layer.fading.
  const [skeletonsVisible, setSkeletonsVisible] = useState(!loaded && !isToday)
  const [skeletonsMounted, setSkeletonsMounted] = useState(!loaded && !isToday)

  useEffect(() => {
    if (loaded && skeletonsMounted) {
      // Begin fade-out, then unmount after the transition.
      setSkeletonsVisible(false)
      const t = setTimeout(() => setSkeletonsMounted(false), 280)
      return () => clearTimeout(t)
    }
    if (!loaded && !isToday && !skeletonsMounted) {
      setSkeletonsMounted(true)
      setSkeletonsVisible(true)
    }
  }, [loaded, isToday, skeletonsMounted])

  // Hide entirely if a non-today day is loaded with no content. Before load
  // we still render the section (with skeletons) so the timeline shape is
  // visible — but if there's no count either, drop it.
  if (!isToday && loaded && entries.length === 0) return null
  if (!isToday && !loaded && placeholderCount === 0) return null

  const last = entries[entries.length - 1]
  const lastEmpty = last
    ? (last.id in emptyMap
        ? emptyMap[last.id]
        : !last.content || last.content.trim() === '')
    : true
  const showPill = loaded && entries.length > 0 && !lastEmpty

  const showRealBubbles = loaded || (isToday && entries.length > 0)

  return (
    <div className="day-section" data-date={date} ref={sectionRef}>
      <div className="date-header">{formatDate(date, today)}</div>

      {skeletonsMounted && (
        <div
          className={`skeleton-layer${skeletonsVisible ? '' : ' fading'}`}
          aria-hidden="true"
        >
          {Array.from({ length: Math.max(1, placeholderCount) }).map((_, i) => (
            <div
              key={i}
              className="bubble skeleton"
              style={{ height: skeletonHeight(date, i) }}
            />
          ))}
        </div>
      )}

      {showRealBubbles && (
        <div className={`entries-layer${loaded ? ' visible' : ''}`}>
          {entries.map((entry, idx) => {
            const isLast = idx === entries.length - 1
            return (
              <Bubble
                key={entry.id}
                entry={entry}
                prerenderedHTML={htmlMap[entry.id]}
                fresh={freshIds.has(entry.id)}
                aiReady={aiReady}
                onNewBubble={() => handleNewBubble(idx)}
                onDeleteBubble={() => handleDeleteBubble(idx)}
                onEmptyChange={(empty) => handleEmptyChange(entry.id, empty)}
                autoFocus={freshIds.has(entry.id) || (isToday && isLast)}
              />
            )
          })}
        </div>
      )}


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
