import React, { useState, useEffect, useRef, useCallback } from 'react'
import { DaySection } from './DaySection'
import { Scrubber } from './Scrubber'
import { Search } from './Search'
import type { Entry, TimelineEntry } from '../shared/types'

type DayMap = Record<string, Entry[]>

function dateRange(startDate: string, count: number): string[] {
  const dates: string[] = []
  const d = new Date(startDate + 'T12:00:00')
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() - 1)
  }
  return dates
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function App() {
  const [dayMap, setDayMap] = useState<DayMap>({})
  const [loadedDates, setLoadedDates] = useState<string[]>([])
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isLoadingRef = useRef(false)
  const oldestLoadedRef = useRef<string>(todayStr())

  const today = React.useMemo(() => todayStr(), [])

  // Initial load
  useEffect(() => {
    const init = async () => {
      const dates = dateRange(today, 7)
      oldestLoadedRef.current = dates[dates.length - 1]

      const [entries, tl] = await Promise.all([
        window.api.getEntriesForDates(dates),
        window.api.getTimelineIndex(),
      ])

      const map: DayMap = {}
      for (const d of dates) map[d] = []
      for (const e of entries) {
        if (!map[e.date]) map[e.date] = []
        map[e.date].push(e)
        map[e.date].sort((a, b) => a.position - b.position)
      }

      // Ensure today has at least one empty entry
      if (map[today].length === 0) {
        const empty = await window.api.upsertEntry({ date: today, position: 0, content: '' })
        map[today] = [empty]
      }

      setDayMap(map)
      setLoadedDates(dates)
      setTimeline(tl)
    }
    init()
  }, [today])

  const loadMoreDays = useCallback(async () => {
    if (isLoadingRef.current || !hasMore) return
    isLoadingRef.current = true
    setIsLoading(true)

    const oldest = oldestLoadedRef.current
    const d = new Date(oldest + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    const nextStart = d.toISOString().split('T')[0]
    const dates = dateRange(nextStart, 7)
    oldestLoadedRef.current = dates[dates.length - 1]

    // Stop if we've gone back 2 years with no data
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 2)
    if (new Date(dates[dates.length - 1]) < cutoff) {
      setHasMore(false)
      isLoadingRef.current = false
      setIsLoading(false)
      return
    }

    const entries = await window.api.getEntriesForDates(dates)

    setDayMap(prev => {
      const next = { ...prev }
      for (const d of dates) if (!next[d]) next[d] = []
      for (const e of entries) {
        if (!next[e.date]) next[e.date] = []
        next[e.date].push(e)
        next[e.date].sort((a, b) => a.position - b.position)
      }
      return next
    })

    setLoadedDates(prev => [...prev, ...dates])
    isLoadingRef.current = false
    setIsLoading(false)
  }, [hasMore])

  // IntersectionObserver on sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreDays() },
      { root: scrollRef.current, rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMoreDays])

  // Cmd+F to open search
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

  const handleJumpToDate = useCallback((date: string) => {
    const el = document.querySelector(`[data-date="${date}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <div className="titlebar-drag" />

      <div className="scroll-root" ref={scrollRef}>
        {loadedDates.map(date => (
          <DaySection
            key={date}
            date={date}
            entries={dayMap[date] ?? []}
            isToday={date === today}
            onEntriesChange={handleEntriesChange}
          />
        ))}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {!hasMore && (
          <p style={{ textAlign: 'center', color: '#88aac8', padding: '20px', fontSize: 12 }}>
            Beginning of PocketBook
          </p>
        )}
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
    </div>
  )
}
