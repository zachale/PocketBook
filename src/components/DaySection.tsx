import React, { useCallback } from 'react'
import { Bubble } from './Bubble'
import type { Entry } from '../shared/types'

interface Props {
  date: string           // 'YYYY-MM-DD'
  entries: Entry[]
  isToday: boolean
  onEntriesChange: (date: string, entries: Entry[]) => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()

  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return isToday ? `Today — ${formatted}` : formatted
}

export function DaySection({ date, entries, isToday, onEntriesChange }: Props) {
  const handleNewBubble = useCallback(
    async (afterPosition: number) => {
      const newEntry = await window.api.upsertEntry({
        date,
        position: afterPosition + 1,
        content: '',
      })
      const updated = [...entries]
      updated.splice(afterPosition + 1, 0, newEntry)
      onEntriesChange(date, updated)
    },
    [date, entries, onEntriesChange]
  )

  return (
    <div className="day-section" data-date={date}>
      <div className="date-header">{formatDate(date)}</div>
      {entries.map((entry, idx) => (
        <Bubble
          key={entry.id}
          entry={entry}
          onNewBubble={() => handleNewBubble(idx)}
          autoFocus={isToday && idx === entries.length - 1}
        />
      ))}
    </div>
  )
}
