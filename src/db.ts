import Database from 'better-sqlite3'
import type { Entry, TimelineEntry, SearchResult, UpsertEntryArgs } from './shared/types'

export function createDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      position    INTEGER NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);

    CREATE VIRTUAL TABLE IF NOT EXISTS fts_entries USING fts5(
      content,
      entry_id UNINDEXED
    );

    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO fts_entries(content, entry_id) VALUES (new.content, new.id);
    END;

    CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
      UPDATE fts_entries SET content = new.content WHERE entry_id = new.id;
    END;

    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
      DELETE FROM fts_entries WHERE entry_id = old.id;
    END;

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  return db
}

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

export function deleteSetting(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function upsertEntry(db: Database.Database, args: UpsertEntryArgs): Entry {
  const now = Date.now()

  if (args.id != null) {
    const info = db.prepare(`
      UPDATE entries SET content = ?, position = ?, updated_at = ? WHERE id = ?
    `).run(args.content, args.position, now, args.id)

    if (info.changes === 0) {
      throw new Error(`upsertEntry: no entry found with id ${args.id}`)
    }

    return db.prepare('SELECT * FROM entries WHERE id = ?').get(args.id) as Entry
  }

  // Shift siblings at or after this position up by 1 (do this in a transaction to be safe)
  const insertWithShift = db.transaction(() => {
    db.prepare(`
      UPDATE entries SET position = position + 1 WHERE date = ? AND position >= ?
    `).run(args.date, args.position)

    const result = db.prepare(`
      INSERT INTO entries (date, position, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(args.date, args.position, args.content, now, now)

    return db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid) as Entry
  })

  return insertWithShift()
}

export function getEntriesForDates(db: Database.Database, dates: string[]): Entry[] {
  if (dates.length === 0) return []
  if (dates.length > 999) {
    throw new Error(`getEntriesForDates: too many dates requested (max 999, got ${dates.length})`)
  }
  const placeholders = dates.map(() => '?').join(',')
  // Order by creation time within each day so the user always sees their entries
  // in the order they wrote them. `position` is kept for forward compatibility
  // (e.g. drag-to-reorder) but is no longer the source of truth.
  return db.prepare(`
    SELECT * FROM entries WHERE date IN (${placeholders}) ORDER BY date DESC, created_at ASC, id ASC
  `).all(...dates) as Entry[]
}

export function deleteEntry(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
}

export function getTimelineIndex(db: Database.Database): TimelineEntry[] {
  return db.prepare(`
    SELECT date, COUNT(*) as count FROM entries GROUP BY date ORDER BY date DESC
  `).all() as TimelineEntry[]
}

export function searchEntries(db: Database.Database, term: string): SearchResult[] {
  if (!term.trim()) return []
  // Wrap in phrase quotes to prevent FTS5 syntax errors on special characters
  const safeTerm = '"' + term.replace(/"/g, '""') + '"*'
  const rows = db.prepare(`
    SELECT
      e.id as entryId,
      e.date,
      snippet(fts_entries, 0, '<mark>', '</mark>', '...', 20) as snippet,
      rank as score
    FROM fts_entries
    JOIN entries e ON e.id = fts_entries.entry_id
    WHERE fts_entries MATCH ?
    ORDER BY rank
    LIMIT 50
  `).all(safeTerm) as SearchResult[]
  return rows
}
