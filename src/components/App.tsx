import React, { useState, useEffect, useRef, useCallback } from 'react'
import { DaySection } from './DaySection'
import { Scrubber } from './Scrubber'
import { Search } from './Search'
import { Titlebar } from './Titlebar'
import { Onboarding } from './Onboarding'
import type { Entry, TimelineEntry } from '../shared/types'

type DayMap = Record<string, Entry[]>

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function App() {
  const [dayMap, setDayMap] = useState<DayMap>({})
  const [loadedDates, setLoadedDates] = useState<string[]>([])
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [freshIds, setFreshIds] = useState<Set<number>>(() => new Set())
  const [aiConfigStatus, setAiConfigStatus] = useState<'loading' | 'needed' | 'ready'>('loading')

  const scrollRef = useRef<HTMLDivElement>(null)

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

  // Initial load — day list = today + dates with entries (descending)
  useEffect(() => {
    const init = async () => {
      const tl = await window.api.getTimelineIndex()
      const dates = [today, ...tl.map(t => t.date).filter(d => d !== today)]

      const entries = await window.api.getEntriesForDates(dates)

      const map: DayMap = {}
      for (const d of dates) map[d] = []
      for (const e of entries) {
        if (!map[e.date]) map[e.date] = []
        map[e.date].push(e)
      }
      for (const d of dates) map[d].sort((a, b) => a.created_at - b.created_at)

      // Cleanup empty entries from past days
      let timelineDirty = false
      for (const [date, dayEntries] of Object.entries(map)) {
        if (date === today) continue
        const empties = dayEntries.filter(e => !e.content || e.content.trim() === '')
        if (empties.length === 0) continue
        for (const e of empties) await window.api.deleteEntry(e.id)
        map[date] = dayEntries.filter(e => e.content && e.content.trim() !== '')
        timelineDirty = true
      }

      // Drop dates that ended up empty after cleanup (always keep today)
      const kept = dates.filter(d => d === today || map[d].length > 0)

      // Seed today's empty bubble if none
      if (map[today].length === 0) {
        const empty = await window.api.upsertEntry({ date: today, position: 0, content: '' })
        map[today] = [empty]
        timelineDirty = true
      }

      setDayMap(map)
      setLoadedDates(kept)
      setTimeline(timelineDirty ? await window.api.getTimelineIndex() : tl)
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
            freshIds={freshIds}
            aiReady={aiConfigStatus === 'ready'}
            onEntriesChange={handleEntriesChange}
            onAddEntry={handleAddEntry}
            onMarkFresh={markFresh}
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
