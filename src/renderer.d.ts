import type { Entry, TimelineEntry, SearchResult, UpsertEntryArgs } from './shared/types'

export {}

declare global {
  interface Window {
    api: {
      getEntriesForDates: (dates: string[]) => Promise<Entry[]>
      upsertEntry: (args: UpsertEntryArgs) => Promise<Entry>
      deleteEntry: (id: number) => Promise<void>
      getTimelineIndex: () => Promise<TimelineEntry[]>
      searchEntries: (term: string) => Promise<SearchResult[]>
    }
  }
}
