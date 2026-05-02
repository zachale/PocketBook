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
  `)

  return db
}

export function upsertEntry(db: Database.Database, args: UpsertEntryArgs): Entry {
  const now = Date.now()

  if (args.id != null) {
    db.prepare(`
      UPDATE entries SET content = ?, position = ?, updated_at = ? WHERE id = ?
    `).run(args.content, args.position, now, args.id)

    return db.prepare('SELECT * FROM entries WHERE id = ?').get(args.id) as Entry
  }

  const result = db.prepare(`
    INSERT INTO entries (date, position, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(args.date, args.position, args.content, now, now)

  return db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid) as Entry
}

export function getEntriesForDates(db: Database.Database, dates: string[]): Entry[] {
  if (dates.length === 0) return []
  const placeholders = dates.map(() => '?').join(',')
  return db.prepare(`
    SELECT * FROM entries WHERE date IN (${placeholders}) ORDER BY date DESC, position ASC
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
  `).all(term + '*') as SearchResult[]
  return rows
}
