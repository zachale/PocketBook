import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { TimelineEntry } from '../shared/types'

interface Props {
  timeline: TimelineEntry[]
  loadedDates: string[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  onJumpToDate: (date: string) => void
}

function getMonthLabels(timeline: TimelineEntry[]): { label: string; ratio: number }[] {
  if (timeline.length === 0) return []
  const oldest = timeline[timeline.length - 1].date
  const newest = timeline[0].date
  const totalMs = new Date(newest + 'T12:00:00').getTime() - new Date(oldest + 'T12:00:00').getTime()
  if (totalMs === 0) return []

  const seen = new Set<string>()
  return timeline
    .filter(({ date }) => {
      const month = date.slice(0, 7)
      if (seen.has(month)) return false
      seen.add(month)
      return true
    })
    .map(({ date }) => {
      const d = new Date(date + 'T12:00:00')
      const elapsed = new Date(newest + 'T12:00:00').getTime() - d.getTime()
      return {
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        ratio: elapsed / totalMs,
      }
    })
}

export function Scrubber({ timeline, loadedDates, scrollRef, onJumpToDate }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [handleRatio, setHandleRatio] = useState(0)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [canScroll, setCanScroll] = useState(false)
  const isDragging = useRef(false)
  const onJumpToDateRef = useRef(onJumpToDate)

  // Capture the element from the ref after mount
  useEffect(() => {
    setScrollEl(scrollRef.current)
  }, [scrollRef])

  // Update the ref whenever onJumpToDate changes
  useEffect(() => {
    onJumpToDateRef.current = onJumpToDate
  }, [onJumpToDate])

  // Track whether content overflows viewport — re-check on resize and DOM mutation
  useEffect(() => {
    if (!scrollEl) return
    const update = () => {
      setCanScroll(scrollEl.scrollHeight > scrollEl.clientHeight + 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(scrollEl)
    const mo = new MutationObserver(update)
    mo.observe(scrollEl, { childList: true, subtree: true, characterData: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [scrollEl])

  // Sync handle to scroll position — depends on scrollEl state
  useEffect(() => {
    if (!scrollEl) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl
      const max = scrollHeight - clientHeight
      setHandleRatio(max > 0 ? scrollTop / max : 0)
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', onScroll)
  }, [scrollEl])

  const ratioToDate = useCallback(
    (ratio: number): string => {
      if (loadedDates.length === 0) return ''
      const idx = Math.round(ratio * (loadedDates.length - 1))
      return loadedDates[Math.min(idx, loadedDates.length - 1)]
    },
    [loadedDates]
  )

  const handleDrag = useCallback(
    (clientY: number) => {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      setHandleRatio(ratio)
      const date = ratioToDate(ratio)
      if (date) onJumpToDateRef.current(date)
    },
    [ratioToDate]
  )

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (isDragging.current) handleDrag(e.clientY) }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [handleDrag])

  if (loadedDates.length <= 1 || !canScroll) return null

  const labels = getMonthLabels(timeline)

  return (
    <div className="scrubber">
      <div
        className="scrubber-track"
        ref={trackRef}
        onClick={e => handleDrag(e.clientY)}
      />
      {labels.map(({ label, ratio }) => (
        <span
          key={label}
          className="scrubber-label"
          style={{ top: `calc(${ratio * 100}% - 6px)` }}
        >
          {label}
        </span>
      ))}
      <div
        className="scrubber-handle"
        style={{ top: `calc(${handleRatio * 100}% - 6px)` }}
        onMouseDown={e => { e.preventDefault(); isDragging.current = true }}
      />
    </div>
  )
}
