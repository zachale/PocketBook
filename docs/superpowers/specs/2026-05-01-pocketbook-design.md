# PocketBook — Design Spec

**Date:** 2026-05-01  
**Status:** Approved  

---

## Context

PocketBook is a personal journaling app for macOS. The goal is a distraction-free writing environment that feels like a physical notebook — you open it, you write, and your history is always one scroll away. It uses a Frutiger Aero aesthetic (frosted glass, bubbly corners, Ice Blue palette) with native macOS vibrancy. Entries are stored locally as markdown in SQLite. The app is not a productivity tool — it's a writing companion.

---

## Stack

| Layer | Choice |
|---|---|
| Shell | Electron (Electron Forge + Vite) |
| UI | React + TypeScript |
| Editor | Tiptap (ProseMirror, live markdown render — Obsidian-style) |
| Database | SQLite via `better-sqlite3` |
| Search | SQLite FTS5 (keyword), modular interface for future embedding providers |
| Platform | macOS only (native `vibrancy` BrowserWindow) |

---

## Architecture

```
PocketBook/
├── main/
│   ├── index.ts          # BrowserWindow: frameless, vibrancy: 'under-window', macOS
│   └── db.ts             # All SQLite operations, exposed via IPC handlers
├── renderer/
│   ├── App.tsx           # Root: scroll container + scrubber + search overlay
│   ├── DaySection.tsx    # Date header + ordered list of Bubble components
│   ├── Bubble.tsx        # Tiptap editor, expand behavior, save on debounce
│   ├── Scrubber.tsx      # Right-side timeline handle, drag-to-jump
│   └── Search.tsx        # Cmd+F overlay, modular SearchProvider interface
└── shared/
    └── types.ts          # Entry, Day, SearchResult, SearchProvider types
```

**IPC boundary:** renderer never imports `better-sqlite3`. All DB operations go through `ipcRenderer.invoke()` → main process `db.ts`. Keeps the DB layer isolated and testable.

---

## Data Model

```sql
CREATE TABLE entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,        -- 'YYYY-MM-DD'
  position    INTEGER NOT NULL,     -- order within day, 0-indexed
  content     TEXT NOT NULL,        -- markdown string
  created_at  INTEGER NOT NULL,     -- unix ms
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_entries_date ON entries(date);

-- FTS5 virtual table for keyword search
CREATE VIRTUAL TABLE fts_entries USING fts5(
  content,
  entry_id UNINDEXED
);

-- Sync triggers
CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO fts_entries(content, entry_id) VALUES (new.content, new.id);
END;
CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
  UPDATE fts_entries SET content = new.content WHERE entry_id = new.id;
END;
CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
  DELETE FROM fts_entries WHERE entry_id = old.id;
END;
```

**Scrubber index:** on startup, one query — `SELECT date, COUNT(*) FROM entries GROUP BY date ORDER BY date` — builds the full timeline map used by the scrubber.

---

## Editor & Bubble Behavior

- Each bubble is an independent Tiptap instance
- `onUpdate` → 500ms debounce → `ipcRenderer.invoke('upsert-entry', { date, position, content })`
- Bubble height is `auto` with `min-height: 80px` and CSS transition — expands as text wraps
- Autoscroll: once cursor goes below viewport, `scrollIntoView({ behavior: 'smooth', block: 'end' })`

**Double-enter creates new bubble:**  
Custom Tiptap extension intercepts `Enter`. If last two characters before cursor are `\n\n`:
1. Trim trailing newlines from current bubble, save
2. Insert new `Entry` row with `position + 1`
3. Render new `Bubble` below with focus

**Past bubbles:** rendered as static HTML (inactive). Click → activates Tiptap editor for that bubble.

**First launch / new day:** if today has no entries, one empty entry is inserted on app open. There is always a writable bubble at the top.

---

## Infinite Scroll & Scrubber

**Scroll model:**
- `App.tsx` holds `days: Day[]` in state, initially today + 6 previous days
- Sentinel `<div ref={bottomRef}>` below last rendered day
- `IntersectionObserver` on sentinel → `loadMoreDays()` → appends next 7 days
- Days with no entries render their date header only — no bubble (today is the only day with a writable empty bubble)

**Performance — editor virtualization:**  
Bubbles outside the visible viewport have their Tiptap editor unmounted, replaced with `<div dangerouslySetInnerHTML>` (pre-rendered markdown HTML). Editor remounts on click. Keeps active editor count low regardless of scroll depth.

**Scrubber:**
- 3px track, right edge of window
- Draggable handle — position maps linearly across full date range
- Month/year labels float beside track, spaced by entry density
- Drag → `element.scrollIntoView()` on target `DaySection`
- Normal scroll → scrubber handle syncs via `scroll` event

---

## Search

**Modular interface:**

```ts
interface SearchProvider {
  query(term: string): Promise<SearchResult[]>
}

interface SearchResult {
  entryId: number
  date: string
  snippet: string   // ~100 char context window around match
  score: number
}
```

`KeywordSearchProvider` uses FTS5 (`MATCH` query, `snippet()` function for context). Future `EmbeddingSearchProvider` implements the same interface — no changes to the UI layer.

**UI:**
- `Cmd+F` → frosted glass overlay, same Ice Blue aesthetic
- 300ms debounced input → `searchProvider.query(term)` → results list
- Result rows: date + highlighted snippet
- Click result → scroll to day, highlight bubble, place cursor at match

---

## Visual System

- **Window:** `vibrancy: 'under-window'`, `titleBarStyle: 'hiddenInset'`, `transparent: true`
- **Background:** `linear-gradient(145deg, rgba(220,240,255,0.85), rgba(190,225,255,0.70))`
- **Bubble background:** `rgba(255,255,255,0.62)` with `backdrop-filter: blur(20px)`
- **Border radius:** 18px on bubbles, 20px on overlays
- **Box shadow:** `0 2px 16px rgba(100,160,255,0.15), inset 0 1px 0 rgba(255,255,255,0.9)`
- **Accent / date labels:** `#5599cc`, uppercase, letter-spaced
- **Font:** SF Pro Text (system default on macOS)
- **Cursor:** 2px `#2196F3` animated blink

---

## Out of Scope (v1)

- Cloud sync
- Image attachments
- Dark mode
- Export to PDF/HTML
- Semantic / embedding search (interface is ready, provider not implemented)
