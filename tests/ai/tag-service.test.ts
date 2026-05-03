// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createDb, upsertEntry, createTag, addTagToEntry, getTagsForEntry } from '../../src/db'
import { TagService } from '../../src/ai/tags/TagService'
import type { AIProvider } from '../../src/shared/ai/types'

let db: Database.Database

function fakeProvider(opts: {
  embed?: (text: string) => Promise<number[]>
  generateStructured?: (...args: unknown[]) => Promise<unknown>
} = {}): AIProvider {
  return {
    id: 'ollama',
    embed: opts.embed ?? (async () => [1, 0, 0]),
    chat: async () => '',
    generateStructured: (opts.generateStructured ?? (async () => ({}))) as AIProvider['generateStructured'],
    listModels: async () => [],
    validate: async () => ({ ok: true }),
  }
}

beforeEach(() => {
  db = createDb(':memory:')
})

describe('TagService.create', () => {
  it('creates a tag and tries to embed it', async () => {
    const embed = vi.fn(async () => [0.1, 0.2, 0.3])
    const svc = new TagService(db, () => fakeProvider({ embed }), () => 'm1')
    const tag = await svc.create({ name: 'morning', description: 'fresh start' })
    expect(tag.name).toBe('morning')
    expect(embed).toHaveBeenCalledOnce()
  })

  it('returns the existing tag if name is taken (case-insensitive)', async () => {
    const svc = new TagService(db, () => null, () => null)
    const a = await svc.create({ name: 'Mood' })
    const b = await svc.create({ name: 'mood' })
    expect(b.id).toBe(a.id)
  })

  it('still creates the tag if embedding fails', async () => {
    const embed = vi.fn(async () => { throw new Error('offline') })
    const svc = new TagService(db, () => fakeProvider({ embed }), () => 'm1')
    const tag = await svc.create({ name: 'work' })
    expect(tag.name).toBe('work')
  })
})

describe('TagService.suggest', () => {
  it('returns [] when no provider configured', async () => {
    const svc = new TagService(db, () => null, () => null)
    const r = await svc.suggest(1, 'a journal entry about heron season and magnolia trees')
    expect(r).toEqual([])
  })

  it('runs the pipeline and returns ranked suggestions', async () => {
    // Seed an existing tag with a known embedding to be picked up.
    const e = upsertEntry(db, { date: '2026-05-01', position: 0, content: 'x' })
    createTag(db, { name: 'reflection' })

    let embedCall = 0
    const embed = vi.fn(async () => {
      // Return a vector close to the query for the first call (chunk),
      // a different vector for tag embed calls.
      embedCall++
      return embedCall === 1 ? [1, 0, 0, 0] : [0.9, 0.1, 0, 0]
    })

    let structuredCall = 0
    const generateStructured = vi.fn(async (_msgs: unknown, schema: unknown) => {
      structuredCall++
      // First call: TagSuggestionSchema → return 2 generated tags.
      // Second call: RerankSchema → return ordered names.
      if (structuredCall === 1) {
        return { tags: [
          { name: 'heron-watch', description: 'birding observations' },
          { name: 'spring', description: 'seasonal notes' },
        ] }
      }
      const _ = schema
      return { ranked: ['heron-watch', 'reflection', 'spring'] }
    })

    const svc = new TagService(db, () => fakeProvider({ embed, generateStructured }), () => 'm1')
    const result = await svc.suggest(e.id, 'I saw a heron on the canal walk this morning '.repeat(3))

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].name).toBe('heron-watch')
    expect(result[0].aiGenerated).toBe(true)
    const reflection = result.find(r => r.name === 'reflection')
    expect(reflection?.aiGenerated).toBe(false)
  })

  it('skips suggestions already attached to the entry', async () => {
    const e = upsertEntry(db, { date: '2026-05-01', position: 0, content: 'x' })
    const tag = createTag(db, { name: 'attached' })
    addTagToEntry(db, e.id, tag.id)

    const embed = vi.fn(async () => [1, 0, 0])
    const generateStructured = vi.fn(async () =>
      ({ tags: [
        { name: 'fresh1', description: 'a' },
        { name: 'fresh2', description: 'b' },
      ], ranked: ['attached', 'fresh1', 'fresh2'] })
    )

    const svc = new TagService(db, () => fakeProvider({ embed, generateStructured }), () => 'm1')
    const result = await svc.suggest(e.id, 'enough words to pass the minimum threshold here today')
    expect(result.find(r => r.name === 'attached')).toBeUndefined()
    // Sanity: the entry still has its attached tag in DB.
    expect(getTagsForEntry(db, e.id).map(t => t.name)).toContain('attached')
  })
})
