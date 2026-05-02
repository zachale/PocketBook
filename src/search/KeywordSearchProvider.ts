import type Database from 'better-sqlite3'
import type { SearchProvider, SearchResult } from '../shared/types'
import { searchEntries } from '../db'

export class KeywordSearchProvider implements SearchProvider {
  constructor(private db: Database.Database) {}

  async query(term: string): Promise<SearchResult[]> {
    return searchEntries(this.db, term)
  }
}
