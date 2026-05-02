interface Window {
  api: {
    getEntriesForDates: (dates: string[]) => Promise<import('./shared/types').Entry[]>
    upsertEntry: (args: import('./shared/types').UpsertEntryArgs) => Promise<import('./shared/types').Entry>
    deleteEntry: (id: number) => Promise<void>
    getTimelineIndex: () => Promise<import('./shared/types').TimelineEntry[]>
    searchEntries: (term: string) => Promise<import('./shared/types').SearchResult[]>
  }
}
