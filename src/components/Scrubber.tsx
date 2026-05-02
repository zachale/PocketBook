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
  const totalMs = new Date(newest).getTime() - new Date(oldest).getTime()
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
      const d = new Date(date)
      const elapsed = new Date(newest).getTime() - d.getTime()
      return {
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        ratio: elapsed / totalMs,
      }
    })
}

export function Scrubber({ timeline, loadedDates, scrollRef, onJumpToDate }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [handleRatio, setHandleRatio] = useState(0)
  const isDragging = useRef(false)

  // Sync handle to scroll position
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const max = scrollHeight - clientHeight
      setHandleRatio(max > 0 ? scrollTop / max : 0)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef])

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
      if (date) onJumpToDate(date)
    },
    [ratioToDate, onJumpToDate]
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

  const labels = getMonthLabels(timeline)

  return (
    <div className="scrubber">
      <div
        className="scrubber-track"
        ref={trackRef}
        onClick={e => handleDrag(e.clientY)}
      >
        <div
          className="scrubber-handle"
          style={{ top: `calc(${handleRatio * 100}% - 20px)` }}
          onMouseDown={e => { e.preventDefault(); isDragging.current = true }}
        />
        {labels.map(({ label, ratio }) => (
          <span
            key={label}
            className="scrubber-label"
            style={{ top: `${ratio * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
