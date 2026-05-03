import React, { useState, useEffect, useRef, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { DaySection } from './DaySection'
import { Scrubber } from './Scrubber'
import { Search } from './Search'
import { Titlebar } from './Titlebar'
import { Onboarding } from './Onboarding'
import type { Entry, TimelineEntry } from '../shared/types'

type DayMap = Record<string, Entry[]>
type LoadStatus = 'idle' | 'loading' | 'loaded'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function renderMarkdown(content: string): string {
  if (!content) return ''
  const raw = marked.parse(content) as string
  return DOMPurify.sanitize(raw)
}

export function App() {
  const [dayMap, setDayMap] = useState<DayMap>({})
  const [htmlMap, setHtmlMap] = useState<Record<number, string>>({})
  const [loadedDates, setLoadedDates] = useState<string[]>([])
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({})
  const [loadStatus, setLoadStatus] = useState<Record<string, LoadStatus>>({})
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [freshIds, setFreshIds] = useState<Set<number>>(() => new Set())
  const [aiConfigStatus, setAiConfigStatus] = useState<'loading' | 'needed' | 'ready'>('loading')

  const scrollRef = useRef<HTMLDivElement>(null)
  const loadStatusRef = useRef<Record<string, LoadStatus>>({})
  loadStatusRef.current = loadStatus

  const today = React.useMemo(() => todayStr(), [])

  const markFresh = useCallback((id: number) => {
    setFreshIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setTimeout(() => {
      setFreshIds(prev => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 500)
  }, [])

  // Load a single day's entries: prerender markdown, clean up empties on past
  // days, and commit results into dayMap/htmlMap.
  const loadDay = useCallback(async (date: string) => {
    if (loadStatusRef.current[date] && loadStatusRef.current[date] !== 'idle') return
    setLoadStatus(prev => ({ ...prev, [date]: 'loading' }))
    try {
      const entries = await window.api.getEntriesForDates([date])
      entries.sort((a, b) => a.created_at - b.created_at)

      let kept = entries
      let timelineDirty = false

      // Cleanup empty entries on past days only
      if (date !== today) {
        const empties = entries.filter(e => !e.content || e.content.trim() === '')
        if (empties.length > 0) {
          for (const e of empties) await window.api.deleteEntry(e.id)
          kept = entries.filter(e => e.content && e.content.trim() !== '')
          timelineDirty = true
        }
      }

      // Pre-render markdown to sanitized HTML before swapping
      const newHtml: Record<number, string> = {}
      for (const e of kept) newHtml[e.id] = renderMarkdown(e.content)

      setDayMap(prev => ({ ...prev, [date]: kept }))
      setHtmlMap(prev => ({ ...prev, ...newHtml }))
      setLoadStatus(prev => ({ ...prev, [date]: 'loaded' }))

      // Drop the section if a past day became empty after cleanup
      if (date !== today && kept.length === 0) {
        setLoadedDates(prev => prev.filter(d => d !== date))
      }

      if (timelineDirty) {
        const tl = await window.api.getTimelineIndex()
        setTimeline(tl)
      }
    } catch (err) {
      console.error('[App] loadDay failed', date, err)
      setLoadStatus(prev => ({ ...prev, [date]: 'idle' }))
    }
  }, [today])

  // Initial load — timeline only, plus eager-load today
  useEffect(() => {
    const init = async () => {
      const tl = await window.api.getTimelineIndex()
      const dates = [today, ...tl.map(t => t.date).filter(d => d !== today)]
      const counts: Record<string, number> = {}
      for (const t of tl) counts[t.date] = t.count
      if (!(today in counts)) counts[today] = 0

      setTimeline(tl)
      setDayCounts(counts)
      setLoadedDates(dates)

      // Eagerly load today's entries
      const todayEntries = await window.api.getEntriesForDates([today])
      todayEntries.sort((a, b) => a.created_at - b.created_at)

      let seedTimelineRefresh = false
      let finalToday = todayEntries
      if (todayEntries.length === 0) {
        const empty = await window.api.upsertEntry({ date: today, position: 0, content: '' })
        finalToday = [empty]
        seedTimelineRefresh = true
      }

      const todayHtml: Record<number, string> = {}
      for (const e of finalToday) todayHtml[e.id] = renderMarkdown(e.content)

      setDayMap(prev => ({ ...prev, [today]: finalToday }))
      setHtmlMap(prev => ({ ...prev, ...todayHtml }))
      setLoadStatus(prev => ({ ...prev, [today]: 'loaded' }))

      if (seedTimelineRefresh) {
        const tl2 = await window.api.getTimelineIndex()
        setTimeline(tl2)
      }
    }
    init()
  }, [today])

  // Detect whether AI provider is configured; show onboarding if not.
  useEffect(() => {
    window.api.ai.getConfig()
      .then(cfg => setAiConfigStatus(cfg ? 'ready' : 'needed'))
      .catch(err => {
        console.error('[App] ai.getConfig failed', err)
        setAiConfigStatus('ready') // fail open — don't block the journal
      })
  }, [])

  // Cmd+F to open search, Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleEntriesChange = useCallback((date: string, entries: Entry[]) => {
    setDayMap(prev => ({ ...prev, [date]: entries }))
  }, [])

  const handleAddEntry = useCallback(async (date: string) => {
    const existing = dayMap[date] ?? []
    const newEntry = await window.api.upsertEntry({
      date,
      position: existing.length,
      content: '',
    })
    markFresh(newEntry.id)
    setDayMap(prev => ({ ...prev, [date]: [...(prev[date] ?? []), newEntry] }))
  }, [dayMap, markFresh])

  const handleJumpToDate = useCallback((date: string) => {
    const el = document.querySelector(`[data-date="${date}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleNeedsLoad = useCallback((date: string) => {
    void loadDay(date)
  }, [loadDay])

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <Titlebar onSearch={() => setSearchOpen(true)} />

      <div className="scroll-root" ref={scrollRef}>
        {loadedDates.map(date => (
          <DaySection
            key={date}
            date={date}
            today={today}
            entries={dayMap[date] ?? []}
            isToday={date === today}
            loaded={loadStatus[date] === 'loaded'}
            placeholderCount={dayCounts[date] ?? 0}
            htmlMap={htmlMap}
            freshIds={freshIds}
            onEntriesChange={handleEntriesChange}
            onAddEntry={handleAddEntry}
            onMarkFresh={markFresh}
            onNeedsLoad={handleNeedsLoad}
          />
        ))}
      </div>

      <Scrubber
        timeline={timeline}
        loadedDates={loadedDates}
        scrollRef={scrollRef}
        onJumpToDate={handleJumpToDate}
      />

      {searchOpen && (
        <Search
          onClose={() => setSearchOpen(false)}
          onSelectResult={(date, _entryId) => {
            setSearchOpen(false)
            handleJumpToDate(date)
          }}
        />
      )}

      {aiConfigStatus === 'needed' && (
        <Onboarding onComplete={() => setAiConfigStatus('ready')} />
      )}
    </div>
  )
}
