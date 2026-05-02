# PocketBook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PocketBook — a macOS journaling app with Frutiger Aero aesthetics, infinite-scroll timeline, Tiptap live-markdown editing, SQLite storage, and modular keyword search.

**Architecture:** Electron Forge + Vite + React. Main process owns SQLite via `better-sqlite3`, exposing all DB operations over IPC. Renderer is a React tree: `App` (scroll root) → `DaySection` (date group) → `Bubble` (Tiptap editor). A right-side `Scrubber` syncs with scroll position. A `Search` overlay is triggered by `Cmd+F`.

**Tech Stack:** Electron 28+, React 18, TypeScript 5, Tiptap + tiptap-markdown, better-sqlite3, SQLite FTS5, Vitest, @testing-library/react

---

## File Map

```
PocketBook/
├── forge.config.ts               # Electron Forge config (native module rebuild)
├── vite.main.config.ts           # Vite config for main process (externals)
├── vite.preload.config.ts        # Vite config for preload
├── vite.renderer.config.ts       # Vite config for renderer
├── vitest.config.ts              # Vitest config (jsdom for components, node for db)
├── tsconfig.json
├── index.html                    # HTML shell
├── src/
│   ├── main.ts                   # Electron main entry → BrowserWindow setup
│   ├── preload.ts                # contextBridge IPC exposure
│   ├── renderer.tsx              # React root mount
│   ├── db.ts                     # All SQLite logic (schema, CRUD, FTS5, timeline)
│   ├── shared/
│   │   └── types.ts              # Entry, TimelineEntry, SearchResult, SearchProvider
│   ├── components/
│   │   ├── App.tsx               # Scroll root, infinite load, day state
│   │   ├── DaySection.tsx        # Date header + ordered bubble list
│   │   ├── Bubble.tsx            # Tiptap editor, expand, debounced save
│   │   ├── Scrubber.tsx          # Timeline handle, drag-to-jump, scroll sync
│   │   └── Search.tsx            # Cmd+F overlay, SearchProvider consumer
│   ├── search/
│   │   └── KeywordSearchProvider.ts  # FTS5 implementation of SearchProvider
│   └── styles/
│       └── global.css            # Frutiger Aero CSS, bubble styles, animations
└── tests/
    ├── db.test.ts                # Unit tests for db.ts (in-memory SQLite)
    ├── search.test.ts            # Unit tests for KeywordSearchProvider
    └── components/
        ├── Bubble.test.tsx       # Component tests (mocked window.api)
        └── Search.test.tsx       # Search overlay tests
```

---

## Task 1: Scaffold the project

**Files:**
- Create: `forge.config.ts`
- Create: `vite.main.config.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Initialize Electron Forge with Vite TypeScript template**

```bash
cd /Users/zachlegesse/Workspace/MaySprint/auto-note
npm init electron-app@latest . -- --template=vite-typescript
```

Expected: project scaffold created with `src/main.ts`, `src/preload.ts`, `index.html`, `forge.config.ts`, `vite.*.config.ts` files.

- [ ] **Step 2: Install dependencies**

```bash
npm install better-sqlite3 @tiptap/react @tiptap/starter-kit tiptap-markdown
npm install --save-dev @types/better-sqlite3 vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom @electron-forge/plugin-vite
```

- [ ] **Step 3: Configure native module rebuild in forge.config.ts**

Replace the contents of `forge.config.ts`:

```ts
import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

const config: ForgeConfig = {
  packagerConfig: { asar: true },
  rebuildConfig: { force: true, onlyModules: ['better-sqlite3'] },
  makers: [new MakerSquirrel({}), new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
}

export default config
```

- [ ] **Step 4: Configure Vite main process to externalize better-sqlite3**

Replace `vite.main.config.ts`:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
})
```

- [ ] **Step 5: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    environmentMatchGlobs: [
      ['tests/db.test.ts', 'node'],
      ['tests/search.test.ts', 'node'],
    ],
  },
})
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Add test script to package.json**

In `package.json`, add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Verify scaffold starts**

```bash
npm start
```

Expected: Electron window opens (blank or default Forge content). No errors in terminal.

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Electron Forge + Vite TypeScript project"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Write types**

Create `src/shared/types.ts`:

```ts
export interface Entry {
  id: number
  date: string      // 'YYYY-MM-DD'
  position: number  // 0-indexed order within day
  content: string   // markdown string
  created_at: number
  updated_at: number
}

export interface TimelineEntry {
  date: string
  count: number
}

export interface SearchResult {
  entryId: number
  date: string
  snippet: string
  score: number
}

export interface SearchProvider {
  query(term: string): Promise<SearchResult[]>
}

export interface UpsertEntryArgs {
  id?: number
  date: string
  position: number
  content: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared types"
```

---

## Task 3: Database layer

**Files:**
- Create: `src/db.ts`
- Create: `tests/db.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/db.test.ts`:

```ts
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
})

describe('getEntriesForDates', () => {
  it('returns entries for requested dates ordered by position', () => {
    upsertEntry(db, { date: '2026-05-01', position: 1, content: 'second' })
    upsertEntry(db, { date: '2026-05-01', position: 0, content: 'first' })
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/db.test.ts
```

Expected: FAIL — `Cannot find module '../src/db'`

- [ ] **Step 3: Implement db.ts**

Create `src/db.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/db.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db.ts tests/db.test.ts tests/setup.ts vitest.config.ts
git commit -m "feat: add SQLite database layer with FTS5 search"
```

---

## Task 4: Main process & IPC bridge

**Files:**
- Modify: `src/main.ts`
- Modify: `src/preload.ts`

- [ ] **Step 1: Write main.ts**

Replace `src/main.ts` entirely:

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { createDb, upsertEntry, getEntriesForDates, deleteEntry, getTimelineIndex, searchEntries } from './db'
import type { UpsertEntryArgs } from './shared/types'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

const db = createDb(path.join(app.getPath('userData'), 'pocketbook.db'))

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
}

// IPC handlers
ipcMain.handle('get-entries-for-dates', (_e, dates: string[]) =>
  getEntriesForDates(db, dates)
)

ipcMain.handle('upsert-entry', (_e, args: UpsertEntryArgs) =>
  upsertEntry(db, args)
)

ipcMain.handle('delete-entry', (_e, id: number) =>
  deleteEntry(db, id)
)

ipcMain.handle('get-timeline-index', () =>
  getTimelineIndex(db)
)

ipcMain.handle('search-entries', (_e, term: string) =>
  searchEntries(db, term)
)

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

- [ ] **Step 2: Write preload.ts**

Replace `src/preload.ts` entirely:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { UpsertEntryArgs } from './shared/types'

contextBridge.exposeInMainWorld('api', {
  getEntriesForDates: (dates: string[]) =>
    ipcRenderer.invoke('get-entries-for-dates', dates),

  upsertEntry: (args: UpsertEntryArgs) =>
    ipcRenderer.invoke('upsert-entry', args),

  deleteEntry: (id: number) =>
    ipcRenderer.invoke('delete-entry', id),

  getTimelineIndex: () =>
    ipcRenderer.invoke('get-timeline-index'),

  searchEntries: (term: string) =>
    ipcRenderer.invoke('search-entries', term),
})
```

- [ ] **Step 3: Add window.api type declaration**

Create `src/renderer.d.ts`:

```ts
import type { Entry, TimelineEntry, SearchResult, UpsertEntryArgs } from './shared/types'

export {}

declare global {
  interface Window {
    api: {
      getEntriesForDates: (dates: string[]) => Promise<Entry[]>
      upsertEntry: (args: UpsertEntryArgs) => Promise<Entry>
      deleteEntry: (id: number) => Promise<void>
      getTimelineIndex: () => Promise<TimelineEntry[]>
      searchEntries: (term: string) => Promise<SearchResult[]>
    }
  }
}
```

- [ ] **Step 4: Verify app starts and IPC works**

```bash
npm start
```

Open DevTools (`Cmd+Option+I`). In console run:

```js
await window.api.getTimelineIndex()
```

Expected: `[]` (empty array, no errors).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/preload.ts src/renderer.d.ts
git commit -m "feat: main process BrowserWindow with vibrancy and IPC handlers"
```

---

## Task 5: Global styles & App shell

**Files:**
- Create: `src/styles/global.css`
- Modify: `src/renderer.tsx`
- Create: `src/components/App.tsx` (skeleton — full implementation in Task 8)

- [ ] **Step 1: Write global CSS**

Create `src/styles/global.css`:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --blue-100: rgba(220, 240, 255, 0.85);
  --blue-200: rgba(190, 225, 255, 0.70);
  --blue-accent: #5599cc;
  --blue-deep: #1a3a60;
  --blue-mid: #2196F3;
  --bubble-bg: rgba(255, 255, 255, 0.62);
  --bubble-border: rgba(160, 210, 255, 0.35);
  --bubble-shadow: 0 2px 16px rgba(100, 160, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  --radius-bubble: 18px;
  --radius-overlay: 20px;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  -webkit-font-smoothing: antialiased;
  color: var(--blue-deep);
}

body {
  background: linear-gradient(145deg, var(--blue-100), var(--blue-200));
  /* macOS vibrancy is applied via Electron — this gradient shows on non-vibrancy fallback */
}

/* Scroll container */
.scroll-root {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  padding: 48px 0 80px 0;
}

.scroll-root::-webkit-scrollbar { width: 0; }

/* Day section */
.day-section {
  max-width: 680px;
  margin: 0 auto;
  padding: 0 32px;
  margin-bottom: 40px;
}

/* Date header */
.date-header {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--blue-accent);
  margin-bottom: 12px;
  padding-left: 4px;
  user-select: none;
}

/* Bubble */
.bubble {
  background: var(--bubble-bg);
  border: 1px solid var(--bubble-border);
  border-radius: var(--radius-bubble);
  box-shadow: var(--bubble-shadow);
  padding: 16px 20px;
  margin-bottom: 16px;
  min-height: 80px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transition: min-height 0.15s ease;
  cursor: text;
}

.bubble:last-child { margin-bottom: 0; }

.bubble.empty {
  border-style: dashed;
  border-color: rgba(160, 210, 255, 0.5);
  background: rgba(255, 255, 255, 0.35);
}

/* Tiptap editor */
.ProseMirror {
  outline: none;
  font-size: 14px;
  line-height: 1.7;
  color: var(--blue-deep);
  min-height: 48px;
}

.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: #88aac8;
  font-style: italic;
  pointer-events: none;
  float: left;
  height: 0;
}

.ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
  font-weight: 700;
  color: #0d2a50;
  line-height: 1.3;
  margin-bottom: 4px;
}

.ProseMirror strong { font-weight: 700; color: #0d2a50; }
.ProseMirror em { font-style: italic; }
.ProseMirror code {
  font-family: 'SF Mono', monospace;
  font-size: 12px;
  background: rgba(100, 160, 255, 0.1);
  border-radius: 4px;
  padding: 1px 5px;
}

/* Scrubber */
.scrubber {
  position: fixed;
  right: 8px;
  top: 0;
  bottom: 0;
  width: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  z-index: 10;
}

.scrubber-track {
  flex: 1;
  width: 3px;
  background: rgba(160, 210, 255, 0.2);
  border-radius: 3px;
  position: relative;
  cursor: pointer;
}

.scrubber-handle {
  width: 3px;
  height: 40px;
  background: linear-gradient(180deg, #6ab8f7, #3d8fdb);
  border-radius: 3px;
  position: absolute;
  left: 0;
  top: 0;
  box-shadow: 0 2px 6px rgba(80, 150, 240, 0.4);
  cursor: grab;
  transition: height 0.1s ease;
}

.scrubber-handle:active { cursor: grabbing; }

.scrubber-label {
  position: absolute;
  right: 12px;
  font-size: 9px;
  font-weight: 600;
  color: var(--blue-accent);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

/* Search overlay */
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  background: rgba(180, 220, 255, 0.15);
  backdrop-filter: blur(4px);
}

.search-panel {
  width: 560px;
  background: linear-gradient(145deg, rgba(215, 238, 255, 0.92), rgba(185, 220, 255, 0.88));
  border: 1px solid rgba(160, 210, 255, 0.5);
  border-radius: var(--radius-overlay);
  box-shadow: 0 24px 64px rgba(80, 140, 220, 0.3);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  overflow: hidden;
}

.search-input {
  width: 100%;
  padding: 16px 20px;
  font-size: 15px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  color: var(--blue-deep);
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--bubble-border);
  outline: none;
}

.search-input::placeholder { color: #88aac8; }

.search-results { max-height: 360px; overflow-y: auto; }
.search-results::-webkit-scrollbar { width: 0; }

.search-result {
  padding: 12px 20px;
  cursor: pointer;
  border-bottom: 1px solid rgba(160, 210, 255, 0.2);
  transition: background 0.1s ease;
}

.search-result:hover { background: rgba(255, 255, 255, 0.3); }
.search-result:last-child { border-bottom: none; }

.search-result-date {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--blue-accent);
  margin-bottom: 4px;
}

.search-result-snippet {
  font-size: 13px;
  line-height: 1.5;
  color: var(--blue-deep);
}

.search-result-snippet mark {
  background: rgba(33, 150, 243, 0.2);
  border-radius: 2px;
  padding: 0 2px;
  color: inherit;
}

.search-empty {
  padding: 24px 20px;
  font-size: 13px;
  color: #88aac8;
  text-align: center;
}

/* Titlebar drag region */
.titlebar-drag {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 38px;
  -webkit-app-region: drag;
  z-index: 50;
}
```

- [ ] **Step 2: Write renderer entry**

Replace `src/renderer.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './components/App'

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
```

Update `index.html` to have `<div id="root"></div>` in body and reference `src/renderer.tsx`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PocketBook</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write App.tsx skeleton**

Create `src/components/App.tsx`:

```tsx
import React from 'react'

export function App() {
  return (
    <div>
      <div className="titlebar-drag" />
      <p style={{ padding: 60, color: '#5599cc' }}>PocketBook loading...</p>
    </div>
  )
}
```

- [ ] **Step 4: Verify app renders**

```bash
npm start
```

Expected: Electron window with frosted glass vibrancy, "PocketBook loading..." text visible. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css src/renderer.tsx src/components/App.tsx index.html
git commit -m "feat: global Aero styles and app shell"
```

---

## Task 6: Bubble component

**Files:**
- Create: `src/components/Bubble.tsx`
- Create: `tests/components/Bubble.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/components/Bubble.test.tsx`:

```tsx
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Bubble } from '../../src/components/Bubble'
import type { Entry } from '../../src/shared/types'

const mockEntry: Entry = {
  id: 1,
  date: '2026-05-01',
  position: 0,
  content: '',
  created_at: Date.now(),
  updated_at: Date.now(),
}

beforeEach(() => {
  window.api = {
    getEntriesForDates: vi.fn(),
    upsertEntry: vi.fn().mockResolvedValue({ ...mockEntry, id: 1 }),
    deleteEntry: vi.fn(),
    getTimelineIndex: vi.fn(),
    searchEntries: vi.fn(),
  }
})

describe('Bubble', () => {
  it('renders placeholder text when content is empty', () => {
    render(<Bubble entry={mockEntry} onNewBubble={vi.fn()} />)
    expect(screen.getByText(/start writing/i)).toBeInTheDocument()
  })

  it('renders existing content', () => {
    const entry = { ...mockEntry, content: 'Hello world' }
    render(<Bubble entry={entry} onNewBubble={vi.fn()} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('calls upsertEntry after typing (debounced)', async () => {
    vi.useFakeTimers()
    render(<Bubble entry={mockEntry} onNewBubble={vi.fn()} />)
    const editor = screen.getByRole('textbox')
    await userEvent.type(editor, 'Hello')
    vi.advanceTimersByTime(600)
    await waitFor(() => {
      expect(window.api.upsertEntry).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Hello') })
      )
    })
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Install userEvent and marked**

```bash
npm install marked
npm install --save-dev @testing-library/user-event @types/marked
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- tests/components/Bubble.test.tsx
```

Expected: FAIL — `Cannot find module '../../src/components/Bubble'`

- [ ] **Step 4: Implement Bubble.tsx**

Create `src/components/Bubble.tsx`:

```tsx
import React, { useCallback, useRef, useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { Extension } from '@tiptap/core'
import { marked } from 'marked'
import type { Entry } from '../shared/types'

interface Props {
  entry: Entry
  onNewBubble: () => void
  autoFocus?: boolean
}

function NewBubbleExtension(onNewBubble: () => void) {
  return Extension.create({
    name: 'newBubble',
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          const { state } = this.editor
          const { $from } = state.selection
          const isEmptyParagraph =
            $from.parent.type.name === 'paragraph' &&
            $from.parent.content.size === 0
          const isAtDocEnd =
            $from.pos === state.doc.content.size - 1

          if (isEmptyParagraph && isAtDocEnd) {
            this.editor.commands.deleteCurrentNode()
            onNewBubble()
            return true
          }
          return false
        },
      }
    },
  })
}

// ActiveEditor is a separate component so useEditor only runs when visible
function ActiveEditor({
  entry,
  onNewBubble,
  autoFocus,
  onHTMLChange,
}: {
  entry: Entry
  onNewBubble: () => void
  autoFocus: boolean
  onHTMLChange: (html: string) => void
}) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const entryRef = useRef(entry)
  entryRef.current = entry

  const save = useCallback((content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.api.upsertEntry({
        id: entryRef.current.id,
        date: entryRef.current.date,
        position: entryRef.current.position,
        content,
      })
    }, 500)
  }, [])

  const editor = useEditor({
    extensions: [StarterKit, Markdown, NewBubbleExtension(onNewBubble)],
    content: entry.content,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        'aria-label': 'entry editor',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor }) => {
      const content = editor.storage.markdown.getMarkdown()
      save(content)
      onHTMLChange(editor.getHTML())
      const { view } = editor
      const { head } = view.state.selection
      const coords = view.coordsAtPos(head)
      const scrollRoot = document.querySelector('.scroll-root') as HTMLElement
      if (scrollRoot && coords.bottom > window.innerHeight - 60) {
        scrollRoot.scrollTop += coords.bottom - window.innerHeight + 60
      }
    },
  })

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  return <EditorContent editor={editor} />
}

export function Bubble({ entry, onNewBubble, autoFocus = false }: Props) {
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(autoFocus)
  const [cachedHTML, setCachedHTML] = useState(() =>
    entry.content ? (marked.parse(entry.content) as string) : ''
  )

  useEffect(() => {
    const el = bubbleRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([obs]) => setIsVisible(obs.isIntersecting),
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const isEmpty = !entry.content || entry.content.trim() === ''

  return (
    <div
      ref={bubbleRef}
      className={`bubble${isEmpty ? ' empty' : ''}`}
      onClick={() => setIsVisible(true)}
    >
      {isVisible ? (
        <ActiveEditor
          entry={entry}
          onNewBubble={onNewBubble}
          autoFocus={autoFocus}
          onHTMLChange={setCachedHTML}
        />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: cachedHTML }} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/components/Bubble.test.tsx
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/Bubble.tsx tests/components/Bubble.test.tsx
git commit -m "feat: Bubble component with Tiptap live markdown and double-enter new bubble"
```

---

## Task 7: DaySection component

**Files:**
- Create: `src/components/DaySection.tsx`

- [ ] **Step 1: Implement DaySection.tsx**

Create `src/components/DaySection.tsx`:

```tsx
import React, { useCallback } from 'react'
import { Bubble } from './Bubble'
import type { Entry } from '../shared/types'

interface Props {
  date: string           // 'YYYY-MM-DD'
  entries: Entry[]
  isToday: boolean
  onEntriesChange: (date: string, entries: Entry[]) => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()

  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return isToday ? `Today — ${formatted}` : formatted
}

export function DaySection({ date, entries, isToday, onEntriesChange }: Props) {
  const handleNewBubble = useCallback(
    async (afterPosition: number) => {
      const newEntry = await window.api.upsertEntry({
        date,
        position: afterPosition + 1,
        content: '',
      })
      const updated = [...entries]
      updated.splice(afterPosition + 1, 0, newEntry)
      onEntriesChange(date, updated)
    },
    [date, entries, onEntriesChange]
  )

  return (
    <div className="day-section" data-date={date}>
      <div className="date-header">{formatDate(date)}</div>
      {entries.map((entry, idx) => (
        <Bubble
          key={entry.id}
          entry={entry}
          onNewBubble={() => handleNewBubble(idx)}
          autoFocus={isToday && idx === entries.length - 1}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify in app — temporarily add DaySection to App.tsx**

In `src/components/App.tsx`, replace contents temporarily:

```tsx
import React from 'react'
import { DaySection } from './DaySection'
import type { Entry } from '../shared/types'

const today = new Date().toISOString().split('T')[0]
const mockEntry: Entry = {
  id: -1,
  date: today,
  position: 0,
  content: '',
  created_at: Date.now(),
  updated_at: Date.now(),
}

export function App() {
  return (
    <div>
      <div className="titlebar-drag" />
      <div className="scroll-root">
        <DaySection
          date={today}
          entries={[mockEntry]}
          isToday={true}
          onEntriesChange={() => {}}
        />
      </div>
    </div>
  )
}
```

```bash
npm start
```

Expected: Window shows today's date header and an empty bubble. Typing in the bubble works. 

- [ ] **Step 3: Commit**

```bash
git add src/components/DaySection.tsx src/components/App.tsx
git commit -m "feat: DaySection component with date header and bubble list"
```

---

## Task 8: App.tsx — infinite scroll

**Files:**
- Modify: `src/components/App.tsx` (full implementation replaces skeleton)

- [ ] **Step 1: Implement full App.tsx**

Replace `src/components/App.tsx` entirely:

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { DaySection } from './DaySection'
import { Scrubber } from './Scrubber'
import { Search } from './Search'
import type { Entry, TimelineEntry } from '../shared/types'

type DayMap = Record<string, Entry[]>

function dateRange(startDate: string, count: number): string[] {
  const dates: string[] = []
  const d = new Date(startDate + 'T12:00:00')
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() - 1)
  }
  return dates
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function App() {
  const [dayMap, setDayMap] = useState<DayMap>({})
  const [loadedDates, setLoadedDates] = useState<string[]>([])
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const oldestLoadedRef = useRef<string>(todayStr())

  // Initial load
  useEffect(() => {
    const init = async () => {
      const today = todayStr()
      const dates = dateRange(today, 7)
      oldestLoadedRef.current = dates[dates.length - 1]

      const [entries, tl] = await Promise.all([
        window.api.getEntriesForDates(dates),
        window.api.getTimelineIndex(),
      ])

      const map: DayMap = {}
      for (const d of dates) map[d] = []
      for (const e of entries) {
        if (!map[e.date]) map[e.date] = []
        map[e.date].push(e)
        map[e.date].sort((a, b) => a.position - b.position)
      }

      // Ensure today has at least one empty entry
      if (map[today].length === 0) {
        const empty = await window.api.upsertEntry({ date: today, position: 0, content: '' })
        map[today] = [empty]
      }

      setDayMap(map)
      setLoadedDates(dates)
      setTimeline(tl)
    }
    init()
  }, [])

  const loadMoreDays = useCallback(async () => {
    if (isLoading || !hasMore) return
    setIsLoading(true)

    const oldest = oldestLoadedRef.current
    const d = new Date(oldest + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    const nextStart = d.toISOString().split('T')[0]
    const dates = dateRange(nextStart, 7)
    oldestLoadedRef.current = dates[dates.length - 1]

    // Stop if we've gone back 2 years with no data
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 2)
    if (new Date(dates[dates.length - 1]) < cutoff) {
      setHasMore(false)
      setIsLoading(false)
      return
    }

    const entries = await window.api.getEntriesForDates(dates)

    setDayMap(prev => {
      const next = { ...prev }
      for (const d of dates) if (!next[d]) next[d] = []
      for (const e of entries) {
        if (!next[e.date]) next[e.date] = []
        next[e.date].push(e)
        next[e.date].sort((a, b) => a.position - b.position)
      }
      return next
    })

    setLoadedDates(prev => [...prev, ...dates])
    setIsLoading(false)
  }, [isLoading, hasMore])

  // IntersectionObserver on sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreDays() },
      { root: scrollRef.current, rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMoreDays])

  // Cmd+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleEntriesChange = useCallback((date: string, entries: Entry[]) => {
    setDayMap(prev => ({ ...prev, [date]: entries }))
  }, [])

  const handleJumpToDate = useCallback((date: string) => {
    const el = document.querySelector(`[data-date="${date}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const today = todayStr()

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <div className="titlebar-drag" />

      <div className="scroll-root" ref={scrollRef}>
        {loadedDates.map(date => (
          <DaySection
            key={date}
            date={date}
            entries={dayMap[date] ?? []}
            isToday={date === today}
            onEntriesChange={handleEntriesChange}
          />
        ))}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {!hasMore && (
          <p style={{ textAlign: 'center', color: '#88aac8', padding: '20px', fontSize: 12 }}>
            Beginning of PocketBook
          </p>
        )}
      </div>

      <Scrubber
        timeline={timeline}
        loadedDates={loadedDates}
        scrollEl={scrollRef.current}
        onJumpToDate={handleJumpToDate}
      />

      {searchOpen && (
        <Search
          onClose={() => setSearchOpen(false)}
          onSelectResult={(date) => {
            setSearchOpen(false)
            handleJumpToDate(date)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify infinite scroll**

```bash
npm start
```

Expected: Today's section visible, empty bubble focused. Scrolling down loads past days (date headers appear, empty days show only headers).

- [ ] **Step 3: Commit**

```bash
git add src/components/App.tsx
git commit -m "feat: App with infinite scroll, lazy day loading, and Cmd+F search toggle"
```

---

## Task 9: Scrubber component

**Files:**
- Create: `src/components/Scrubber.tsx`

- [ ] **Step 1: Implement Scrubber.tsx**

Create `src/components/Scrubber.tsx`:

```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { TimelineEntry } from '../shared/types'

interface Props {
  timeline: TimelineEntry[]
  loadedDates: string[]
  scrollEl: HTMLElement | null
  onJumpToDate: (date: string) => void
}

function getMonthLabels(timeline: TimelineEntry[]): { label: string; ratio: number }[] {
  if (timeline.length === 0) return []
  const oldest = timeline[timeline.length - 1].date
  const newest = timeline[0].date
  const totalMs = new Date(newest).getTime() - new Date(oldest).getTime()
  if (totalMs === 0) return []

  const seen = new Set<string>()
  return timeline
    .filter(({ date }) => {
      const month = date.slice(0, 7)
      if (seen.has(month)) return false
      seen.add(month)
      return true
    })
    .map(({ date }) => {
      const d = new Date(date)
      const elapsed = new Date(newest).getTime() - d.getTime()
      return {
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        ratio: elapsed / totalMs,
      }
    })
}

export function Scrubber({ timeline, loadedDates, scrollEl, onJumpToDate }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [handleRatio, setHandleRatio] = useState(0)
  const isDragging = useRef(false)

  // Sync handle to scroll position
  useEffect(() => {
    const el = scrollEl
    if (!el) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const max = scrollHeight - clientHeight
      setHandleRatio(max > 0 ? scrollTop / max : 0)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollEl])

  const ratioToDate = useCallback(
    (ratio: number): string => {
      if (loadedDates.length === 0) return ''
      const idx = Math.round(ratio * (loadedDates.length - 1))
      return loadedDates[Math.min(idx, loadedDates.length - 1)]
    },
    [loadedDates]
  )

  const handleDrag = useCallback(
    (clientY: number) => {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      setHandleRatio(ratio)
      const date = ratioToDate(ratio)
      if (date) onJumpToDate(date)
    },
    [ratioToDate, onJumpToDate]
  )

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (isDragging.current) handleDrag(e.clientY) }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [handleDrag])

  const labels = getMonthLabels(timeline)

  return (
    <div className="scrubber">
      <div
        className="scrubber-track"
        ref={trackRef}
        onClick={e => handleDrag(e.clientY)}
      >
        <div
          className="scrubber-handle"
          style={{ top: `calc(${handleRatio * 100}% - 20px)` }}
          onMouseDown={e => { e.preventDefault(); isDragging.current = true }}
        />
        {labels.map(({ label, ratio }) => (
          <span
            key={label}
            className="scrubber-label"
            style={{ top: `${ratio * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify scrubber in app**

```bash
npm start
```

Expected: Thin blue scrubber track visible on right edge. Scrolling down moves the handle. Month labels appear once timeline has data.

- [ ] **Step 3: Commit**

```bash
git add src/components/Scrubber.tsx
git commit -m "feat: Scrubber timeline component with drag-to-jump and scroll sync"
```

---

## Task 10: Search

**Files:**
- Create: `src/search/KeywordSearchProvider.ts`
- Create: `src/components/Search.tsx`
- Create: `tests/search.test.ts`

- [ ] **Step 1: Write failing search tests**

Create `tests/search.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/search.test.ts
```

Expected: FAIL — `Cannot find module '../src/search/KeywordSearchProvider'`

- [ ] **Step 3: Implement KeywordSearchProvider**

Create `src/search/KeywordSearchProvider.ts`:

```ts
import type Database from 'better-sqlite3'
import type { SearchProvider, SearchResult } from '../shared/types'
import { searchEntries } from '../db'

export class KeywordSearchProvider implements SearchProvider {
  constructor(private db: Database.Database) {}

  async query(term: string): Promise<SearchResult[]> {
    return searchEntries(this.db, term)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/search.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Implement Search.tsx**

Create `src/components/Search.tsx`:

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { SearchResult } from '../shared/types'

interface Props {
  onClose: () => void
  onSelectResult: (date: string, entryId: number) => void
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function Search({ onClose, onSelectResult }: Props) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedTerm = useDebounce(term, 300)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!debouncedTerm.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    window.api.searchEntries(debouncedTerm).then(r => {
      setResults(r)
      setSearched(true)
    })
  }, [debouncedTerm])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() },
    [onClose]
  )

  return (
    <div className="search-overlay" onClick={handleOverlayClick}>
      <div className="search-panel">
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search entries..."
          value={term}
          onChange={e => setTerm(e.target.value)}
        />
        <div className="search-results">
          {searched && results.length === 0 && (
            <div className="search-empty">No entries found for "{term}"</div>
          )}
          {results.map(result => (
            <div
              key={result.entryId}
              className="search-result"
              onClick={() => onSelectResult(result.date, result.entryId)}
            >
              <div className="search-result-date">
                {new Date(result.date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </div>
              <div
                className="search-result-snippet"
                dangerouslySetInnerHTML={{ __html: result.snippet }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Update App.tsx to pass entryId to onSelectResult**

In `src/components/App.tsx`, update the `Search` usage — the `onSelectResult` now receives both `date` and `entryId`:

```tsx
{searchOpen && (
  <Search
    onClose={() => setSearchOpen(false)}
    onSelectResult={(date, _entryId) => {
      setSearchOpen(false)
      handleJumpToDate(date)
    }}
  />
)}
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 8: Verify full flow in app**

```bash
npm start
```

Verification checklist:
- [ ] App opens with frosted glass window, today's date header, empty bubble with cursor
- [ ] Typing in bubble saves to SQLite (relaunch app, content persists)
- [ ] Double Enter creates a new bubble below
- [ ] Scrolling down reveals past days (date headers appear)
- [ ] Scrubber handle moves as you scroll
- [ ] `Cmd+F` opens search overlay
- [ ] Typing in search returns results with highlighted snippets
- [ ] Clicking a result closes overlay and scrolls to that day

- [ ] **Step 9: Final commit**

```bash
git add src/search/KeywordSearchProvider.ts src/components/Search.tsx tests/search.test.ts
git commit -m "feat: keyword search with FTS5, modular SearchProvider interface, and search overlay UI"
```

---

## Done

All 10 tasks complete. PocketBook is a fully functional macOS journaling app with:
- Frutiger Aero frosted glass UI (native macOS vibrancy)
- Live markdown editing (Tiptap, Obsidian-style)
- Double-enter bubble splitting
- Infinite scroll timeline (scroll down = go back in time)
- Right-side scrubber with month labels
- SQLite storage with FTS5 keyword search
- Modular `SearchProvider` interface ready for future embedding providers
