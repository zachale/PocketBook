export interface Entry {
  id: number
  date: string      // 'YYYY-MM-DD'
  position: number  // 0-indexed order within day
  content: string   // markdown string
  created_at: number
  updated_at: number
}

export interface TimelineEntry {
  date: string
  count: number
}

export interface SearchResult {
  entryId: number
  date: string
  snippet: string
  score: number
}

export interface SearchProvider {
  query(term: string): Promise<SearchResult[]>
}

export interface UpsertEntryArgs {
  id?: number
  date: string
  position: number
  content: string
}
