// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  createDb,
  upsertEntry,
  getEntriesForDates,
  deleteEntry,
  getTimelineIndex,
  searchEntries,
  createTag,
  listTags,
  findTagByName,
  getTagsForEntry,
  addTagToEntry,
  removeTagFromEntry,
  updateTagEmbedding,
} from '../src/db'

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
  it('returns entries for requested dates ordered by creation time', () => {
    upsertEntry(db, { date: '2026-05-01', position: 0, content: 'first' })
    upsertEntry(db, { date: '2026-05-01', position: 1, content: 'second' })
    upsertEntry(db, { date: '2026-04-30', position: 0, content: 'yesterday' })

    const results = getEntriesForDates(db, ['2026-05-01'])
    expect(results).toHaveLength(2)
    expect(results[0].content).toBe('first')
    expect(results[1].content).toBe('second')
  })

  it('orders chronologically even when positions are out of order', () => {
    // Reproduce the user-reported bug: older entry has higher position
    // (e.g. due to historical insert/delete shuffling).
    upsertEntry(db, { date: '2026-05-01', position: 3, content: 'older' })
    upsertEntry(db, { date: '2026-05-01', position: 1, content: 'newer' })

    const results = getEntriesForDates(db, ['2026-05-01'])
    expect(results[0].content).toBe('older')
    expect(results[1].content).toBe('newer')
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

describe('tags', () => {
  it('creates and lists tags', () => {
    createTag(db, { name: 'Reflection', description: 'inward' })
    createTag(db, { name: 'work', description: '' })
    const all = listTags(db)
    expect(all).toHaveLength(2)
    expect(all[0].name).toBe('Reflection')  // ORDER BY name COLLATE NOCASE
  })

  it('rejects duplicate name (case-insensitive)', () => {
    createTag(db, { name: 'Mood' })
    expect(() => createTag(db, { name: 'mood' })).toThrow(/UNIQUE/)
  })

  it('finds tag by name case-insensitively', () => {
    const t = createTag(db, { name: 'Heron' })
    expect(findTagByName(db, 'heron')?.id).toBe(t.id)
    expect(findTagByName(db, 'HERON')?.id).toBe(t.id)
    expect(findTagByName(db, 'magnolia')).toBeNull()
  })

  it('associates tags with entries and dissociates', () => {
    const e = upsertEntry(db, { date: '2026-05-01', position: 0, content: 'sample' })
    const a = createTag(db, { name: 'a' })
    const b = createTag(db, { name: 'b' })
    addTagToEntry(db, e.id, a.id)
    addTagToEntry(db, e.id, b.id)
    addTagToEntry(db, e.id, a.id)  // duplicate ignored
    expect(getTagsForEntry(db, e.id)).toHaveLength(2)
    removeTagFromEntry(db, e.id, a.id)
    const remaining = getTagsForEntry(db, e.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('b')
  })

  it('cascades entry_tags rows when an entry is deleted', () => {
    const e = upsertEntry(db, { date: '2026-05-01', position: 0, content: 'sample' })
    const t = createTag(db, { name: 'cascade' })
    addTagToEntry(db, e.id, t.id)
    deleteEntry(db, e.id)
    const rows = db.prepare('SELECT * FROM entry_tags WHERE entry_id = ?').all(e.id)
    expect(rows).toHaveLength(0)
    // The tag itself remains.
    expect(findTagByName(db, 'cascade')?.id).toBe(t.id)
  })

  it('persists embedding bytes and model', () => {
    const t = createTag(db, { name: 'embedded' })
    const vec = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer)
    updateTagEmbedding(db, t.id, vec, 'qwen3-embedding')
    const reloaded = findTagByName(db, 'embedded')!
    expect(reloaded.embedding_model).toBe('qwen3-embedding')
    expect(reloaded.embedding?.length).toBe(12)  // 3 floats * 4 bytes
  })
})
