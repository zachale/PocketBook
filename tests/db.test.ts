// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createDb, upsertEntry, getEntriesForDates, deleteEntry, getTimelineIndex, searchEntries } from '../src/db'

let db: Database.Database

beforeEach(() => {
  db = createDb(':memory:')
})

describe('upsertEntry', () => {
  it('inserts a new entry and returns it with an id', () => {
    const entry = upsertEntry(db, { date: '2026-05-01', position: 0, content: '# Hello' })
    expect(entry.id).toBeGreaterThan(0)
    expect(entry.date).toBe('2026-05-01')
    expect(entry.content).toBe('# Hello')
  })

  it('updates existing entry when id is provided', () => {
    const original = upsertEntry(db, { date: '2026-05-01', position: 0, content: 'first' })
    const updated = upsertEntry(db, { id: original.id, date: '2026-05-01', position: 0, content: 'updated' })
    expect(updated.id).toBe(original.id)
    expect(updated.content).toBe('updated')
  })

  it('throws when updating a non-existent id', () => {
    expect(() => upsertEntry(db, { id: 9999, date: '2026-05-01', position: 0, content: 'x' }))
      .toThrow('no entry found with id 9999')
  })
})

describe('getEntriesForDates', () => {
  it('returns entries for requested dates ordered by position', () => {
    // Insert at position 0 first, then at position 1 — no shifting needed
    upsertEntry(db, { date: '2026-05-01', position: 0, content: 'first' })
    upsertEntry(db, { date: '2026-05-01', position: 1, content: 'second' })
    upsertEntry(db, { date: '2026-04-30', position: 0, content: 'yesterday' })

    const results = getEntriesForDates(db, ['2026-05-01'])
    expect(results).toHaveLength(2)
    expect(results[0].position).toBe(0)
    expect(results[1].position).toBe(1)
  })

  it('returns empty array for dates with no entries', () => {
    const results = getEntriesForDates(db, ['2026-01-01'])
    expect(results).toHaveLength(0)
  })
})

describe('deleteEntry', () => {
  it('removes the entry', () => {
    const entry = upsertEntry(db, { date: '2026-05-01', position: 0, content: 'delete me' })
    deleteEntry(db, entry.id)
    const results = getEntriesForDates(db, ['2026-05-01'])
    expect(results).toHaveLength(0)
  })
})

describe('getTimelineIndex', () => {
  it('returns date counts ordered by date descending', () => {
    upsertEntry(db, { date: '2026-04-30', position: 0, content: 'a' })
    upsertEntry(db, { date: '2026-05-01', position: 0, content: 'b' })
    upsertEntry(db, { date: '2026-05-01', position: 1, content: 'c' })

    const index = getTimelineIndex(db)
    expect(index[0].date).toBe('2026-05-01')
    expect(index[0].count).toBe(2)
    expect(index[1].date).toBe('2026-04-30')
    expect(index[1].count).toBe(1)
  })
})

describe('searchEntries', () => {
  it('finds entries containing the search term', () => {
    upsertEntry(db, { date: '2026-05-01', position: 0, content: 'the quick brown fox' })
    upsertEntry(db, { date: '2026-05-01', position: 1, content: 'something unrelated' })

    const results = searchEntries(db, 'quick')
    expect(results).toHaveLength(1)
    expect(results[0].snippet).toContain('quick')
  })

  it('returns empty array for no match', () => {
    upsertEntry(db, { date: '2026-05-01', position: 0, content: 'hello world' })
    const results = searchEntries(db, 'xyznotfound')
    expect(results).toHaveLength(0)
  })

  it('reflects updated content in search', () => {
    const e = upsertEntry(db, { date: '2026-05-01', position: 0, content: 'original term' })
    upsertEntry(db, { id: e.id, date: '2026-05-01', position: 0, content: 'replaced content' })
    expect(searchEntries(db, 'original')).toHaveLength(0)
    expect(searchEntries(db, 'replaced')).toHaveLength(1)
  })

  it('does not return deleted entries', () => {
    const e = upsertEntry(db, { date: '2026-05-01', position: 0, content: 'will be deleted' })
    deleteEntry(db, e.id)
    expect(searchEntries(db, 'deleted')).toHaveLength(0)
  })
})
