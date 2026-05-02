// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createDb, upsertEntry } from '../src/db'
import { KeywordSearchProvider } from '../src/search/KeywordSearchProvider'

let db: Database.Database

beforeEach(() => {
  db = createDb(':memory:')
  upsertEntry(db, { date: '2026-05-01', position: 0, content: 'the quick brown fox jumps' })
  upsertEntry(db, { date: '2026-04-30', position: 0, content: 'lazy dog sits quietly' })
  upsertEntry(db, { date: '2026-04-29', position: 0, content: 'quick thoughts on design' })
})

describe('KeywordSearchProvider', () => {
  it('returns results matching the term', async () => {
    const provider = new KeywordSearchProvider(db)
    const results = await provider.query('quick')
    expect(results.length).toBe(2)
    expect(results.every(r => r.snippet.toLowerCase().includes('quick'))).toBe(true)
  })

  it('returns empty array for no match', async () => {
    const provider = new KeywordSearchProvider(db)
    const results = await provider.query('zxqwerty')
    expect(results).toHaveLength(0)
  })

  it('returns empty array for blank query', async () => {
    const provider = new KeywordSearchProvider(db)
    const results = await provider.query('   ')
    expect(results).toHaveLength(0)
  })

  it('results include date and snippet', async () => {
    const provider = new KeywordSearchProvider(db)
    const results = await provider.query('dog')
    expect(results[0].date).toBe('2026-04-30')
    expect(results[0].snippet).toBeTruthy()
    expect(results[0].entryId).toBeGreaterThan(0)
  })
})
