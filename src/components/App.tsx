import React, { useState, useEffect, useRef, useCallback } from 'react'
import { DaySection } from './DaySection'
import { Search } from './Search'
import { Titlebar } from './Titlebar'
import { Onboarding } from './Onboarding'
import type { Entry } from '../shared/types'

type DayMap = Record<string, Entry[]>

const PAGE_SIZE = 25

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function App() {
  const [dayMap, setDayMap] = useState<DayMap>({})
  const [allDates, setAllDates] = useState<string[]>([])
  const [loadedCount, setLoadedCount] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [freshIds, setFreshIds] = useState<Set<number>>(() => new Set())
  const [aiConfigStatus, setAiConfigStatus] = useState<'loading' | 'needed' | 'ready'>('loading')

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

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

  // Fetch entries for a slice of dates, drop empties on past days, merge into
  // state. Returns the dates that survived cleanup.
  const fetchChunk = useCallback(async (dates: string[]): Promise<string[]> => {
    if (dates.length === 0) return []
    const entries = await window.api.getEntriesForDates(dates)

    const grouped: DayMap = {}
    for (const d of dates) grouped[d] = []
    for (const e of entries) (grouped[e.date] ??= []).push(e)
    for (const d of dates) grouped[d].sort((a, b) => a.created_at - b.created_at)

    const survived: string[] = []
    for (const d of dates) {
      if (d === today) { survived.push(d); continue }
      const empties = grouped[d].filter(e => !e.content || e.content.trim() === '')
      for (const e of empties) await window.api.deleteEntry(e.id)
      grouped[d] = grouped[d].filter(e => e.content && e.content.trim() !== '')
      if (grouped[d].length > 0) survived.push(d)
    }

    setDayMap(prev => ({ ...prev, ...grouped }))
    return survived
  }, [today])

  // Initial load: timeline → date list → first page → seed today if empty
  useEffect(() => {
    const init = async () => {
      const tl = await window.api.getTimelineIndex()
      const dates = [today, ...tl.map(t => t.date).filter(d => d !== today)]
      setAllDates(dates)

      const firstSlice = dates.slice(0, PAGE_SIZE)
      const survived = await fetchChunk(firstSlice)

      // Drop past days that emptied out during cleanup
      if (survived.length !== firstSlice.length) {
        setAllDates(prev => prev.filter(d => d === today || survived.includes(d) || !firstSlice.includes(d)))
      }

      // Seed today's empty bubble if none exists
      const todayHas = (await window.api.getEntriesForDates([today])).length > 0
      if (!todayHas) {
        const empty = await window.api.upsertEntry({ date: today, position: 0, content: '' })
        setDayMap(prev => ({ ...prev, [today]: [empty] }))
      }

      setLoadedCount(firstSlice.length)
    }
    init()
  }, [today, fetchChunk])

  // Pagination sentinel: load next chunk when bottom comes into view
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      async ([obs]) => {
        if (!obs.isIntersecting) return
        if (loadingRef.current) return
        if (loadedCount >= allDates.length) return
        loadingRef.current = true
        try {
          const nextSlice = allDates.slice(loadedCount, loadedCount + PAGE_SIZE)
          const survived = await fetchChunk(nextSlice)
          if (survived.length !== nextSlice.length) {
            setAllDates(prev => prev.filter(d => d === today || survived.includes(d) || !nextSlice.includes(d)))
          }
          setLoadedCount(c => c + nextSlice.length)
        } finally {
          loadingRef.current = false
        }
      },
      { root: scrollRef.current, rootMargin: '600px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [allDates, loadedCount, fetchChunk, today])

  // AI provider config
  useEffect(() => {
    window.api.ai.getConfig()
      .then(cfg => setAiConfigStatus(cfg ? 'ready' : 'needed'))
      .catch(err => {
        console.error('[App] ai.getConfig failed', err)
        setAiConfigStatus('ready')
      })
  }, [])

  // Cmd+F search
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

  const visibleDates = allDates.slice(0, loadedCount)

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <Titlebar onSearch={() => setSearchOpen(true)} />

      <div className="scroll-root" ref={scrollRef}>
        {visibleDates.map(date => (
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
        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />
      </div>

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
