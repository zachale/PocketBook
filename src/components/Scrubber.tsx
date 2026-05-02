import React from 'react'
import type { TimelineEntry } from '../shared/types'

interface Props {
  timeline: TimelineEntry[]
  loadedDates: string[]
  scrollEl: HTMLElement | null
  onJumpToDate: (date: string) => void
}

export function Scrubber(_props: Props) {
  return null
}
