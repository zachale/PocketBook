// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createDb, getSetting, setSetting, deleteSetting } from '../../src/db'

let db: Database.Database

beforeEach(() => {
  db = createDb(':memory:')
})

describe('settings', () => {
  it('returns null for an unknown key', () => {
    expect(getSetting(db, 'missing')).toBeNull()
  })

  it('round-trips a value', () => {
    setSetting(db, 'foo', 'bar')
    expect(getSetting(db, 'foo')).toBe('bar')
  })

  it('overwrites on conflict', () => {
    setSetting(db, 'foo', 'a')
    setSetting(db, 'foo', 'b')
    expect(getSetting(db, 'foo')).toBe('b')
  })

  it('deletes a setting', () => {
    setSetting(db, 'foo', 'bar')
    deleteSetting(db, 'foo')
    expect(getSetting(db, 'foo')).toBeNull()
  })
})
