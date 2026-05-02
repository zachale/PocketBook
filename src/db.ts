import Database from 'better-sqlite3'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqliteVec = require('sqlite-vec') as { load: (db: Database.Database) => void }
import type { Entry, TimelineEntry, SearchResult, UpsertEntryArgs } from './shared/types'

export interface Tag {
  id: number
  name: string
  description: string
  embedding: Buffer | null
  embedding_model: string | null
  created_at: number
}

export function createDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')

  try {
    sqliteVec.load(db)
  } catch (err) {
    console.warn('[db] sqlite-vec failed to load (cosine ranking will fall back to JS):', err)
  }

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

    CREATE TABLE IF NOT EXISTS tags (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      embedding       BLOB,
      embedding_model TEXT,
      created_at      INTEGER NOT NULL,
      UNIQUE (name COLLATE NOCASE)
    );

    CREATE TABLE IF NOT EXISTS entry_tags (
      entry_id   INTEGER NOT NULL,
      tag_id     INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (entry_id, tag_id),
      FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id)   REFERENCES tags(id)    ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_entry_tags_entry ON entry_tags(entry_id);
    CREATE INDEX IF NOT EXISTS idx_entry_tags_tag   ON entry_tags(tag_id);
  `)

  // FK enforcement is per-connection in SQLite.
  db.pragma('foreign_keys = ON')

  return db
}

// ── Tag helpers ─────────────────────────────────────────────────
export function createTag(
  db: Database.Database,
  args: { name: string; description?: string },
): Tag {
  const now = Date.now()
  const result = db.prepare(`
    INSERT INTO tags (name, description, created_at) VALUES (?, ?, ?)
  `).run(args.name, args.description ?? '', now)
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid) as Tag
}

export function listTags(db: Database.Database): Tag[] {
  return db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC').all() as Tag[]
}

export function findTagByName(db: Database.Database, name: string): Tag | null {
  const row = db.prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE').get(name) as Tag | undefined
  return row ?? null
}

export function getTagsForEntry(db: Database.Database, entryId: number): Tag[] {
  return db.prepare(`
    SELECT t.* FROM tags t
    JOIN entry_tags et ON et.tag_id = t.id
    WHERE et.entry_id = ?
    ORDER BY et.created_at ASC
  `).all(entryId) as Tag[]
}

export function addTagToEntry(db: Database.Database, entryId: number, tagId: number): void {
  db.prepare(`
    INSERT OR IGNORE INTO entry_tags (entry_id, tag_id, created_at) VALUES (?, ?, ?)
  `).run(entryId, tagId, Date.now())
}

export function removeTagFromEntry(db: Database.Database, entryId: number, tagId: number): void {
  db.prepare('DELETE FROM entry_tags WHERE entry_id = ? AND tag_id = ?').run(entryId, tagId)
}

export function updateTagEmbedding(
  db: Database.Database,
  tagId: number,
  embedding: Buffer,
  model: string,
): void {
  db.prepare('UPDATE tags SET embedding = ?, embedding_model = ? WHERE id = ?')
    .run(embedding, model, tagId)
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
