import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { createDb, upsertEntry, getEntriesForDates, deleteEntry, getTimelineIndex, searchEntries } from './db'
import type { UpsertEntryArgs } from './shared/types'
import type { AIProvider, AIProviderConfig, ChatMessage, ModelInfo } from './shared/ai/types'
import { OLLAMA_DEFAULT_BASE_URL } from './shared/ai/presets'
import { createProvider } from './ai/registry'
import { OllamaProvider } from './ai/providers/OllamaProvider'
import { loadConfig, saveConfig, publicView } from './ai/settings'
import { TagService } from './ai/tags/TagService'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

let db: ReturnType<typeof createDb>
let activeProvider: AIProvider | null = null
let activeProviderConfig: import('./shared/ai/types').AIProviderConfig | null = null
let tagService: TagService | null = null

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
    let retries = 0
    const MAX_RETRIES = 10
    win.webContents.on('did-fail-load', (_e, errorCode, _desc, _url, isMainFrame) => {
      if (win.isDestroyed() || !isMainFrame || retries >= MAX_RETRIES) return
      // Retry only on connection refused/aborted (Vite dev server not yet listening)
      if (errorCode === -102 || errorCode === -101) {
        retries++
        setTimeout(() => {
          if (!win.isDestroyed()) win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
        }, 500)
      }
    })
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
}

function wrap<T>(channel: string, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    console.error(`[ipc] ${channel}`, err)
    throw err
  }
}

async function wrapAsync<T>(channel: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[ipc] ${channel}`, err)
    throw err
  }
}

ipcMain.handle('get-entries-for-dates', (_e, dates: string[]) =>
  wrap('get-entries-for-dates', () => getEntriesForDates(db, dates))
)

ipcMain.handle('upsert-entry', (_e, args: UpsertEntryArgs) =>
  wrap('upsert-entry', () => upsertEntry(db, args))
)

ipcMain.handle('delete-entry', (_e, id: number) =>
  wrap('delete-entry', () => deleteEntry(db, id))
)

ipcMain.handle('get-timeline-index', (_e) =>
  wrap('get-timeline-index', () => getTimelineIndex(db))
)

ipcMain.handle('search-entries', (_e, term: string) =>
  wrap('search-entries', () => searchEntries(db, term))
)

// ── AI provider IPC ─────────────────────────────────────────────
ipcMain.handle('ai:get-config', () =>
  wrap('ai:get-config', () => {
    const cfg = loadConfig(db)
    return cfg ? publicView(cfg) : null
  })
)

ipcMain.handle('ai:save-config', (_e, config: AIProviderConfig) =>
  wrapAsync('ai:save-config', async () => {
    const provider = createProvider(config)
    const result = await provider.validate()
    if (!result.ok) return result
    saveConfig(db, config)
    activeProvider = provider
    activeProviderConfig = config
    return { ok: true }
  })
)

ipcMain.handle('ai:list-ollama-models', (_e, baseUrl?: string) =>
  wrapAsync('ai:list-ollama-models', async (): Promise<ModelInfo[]> => {
    const probe = new OllamaProvider({
      provider: 'ollama',
      baseUrl: baseUrl || OLLAMA_DEFAULT_BASE_URL,
      embeddingModel: '',
      llmModel: '',
    })
    return probe.listModels()
  })
)

ipcMain.handle('ai:validate-config', (_e, config: AIProviderConfig) =>
  wrapAsync('ai:validate-config', () => createProvider(config).validate())
)

ipcMain.handle('ai:embed', (_e, text: string) =>
  wrapAsync('ai:embed', () => {
    if (!activeProvider) throw new Error('no provider configured')
    return activeProvider.embed(text)
  })
)

ipcMain.handle('ai:chat', (_e, messages: ChatMessage[]) =>
  wrapAsync('ai:chat', () => {
    if (!activeProvider) throw new Error('no provider configured')
    return activeProvider.chat(messages)
  })
)

// ── Tag IPC ─────────────────────────────────────────────────────
ipcMain.handle('tags:list', () =>
  wrap('tags:list', () => tagService!.list())
)

ipcMain.handle('tags:for-entry', (_e, entryId: number) =>
  wrap('tags:for-entry', () => tagService!.forEntry(entryId))
)

ipcMain.handle('tags:create', (_e, input: { name: string; description?: string }) =>
  wrapAsync('tags:create', () => tagService!.create(input))
)

ipcMain.handle('tags:add', (_e, entryId: number, tagId: number) =>
  wrap('tags:add', () => tagService!.add(entryId, tagId))
)

ipcMain.handle('tags:remove', (_e, entryId: number, tagId: number) =>
  wrap('tags:remove', () => tagService!.remove(entryId, tagId))
)

ipcMain.handle('tags:suggest', (_e, entryId: number, content: string) =>
  wrapAsync('tags:suggest', () => tagService!.suggest(entryId, content))
)

ipcMain.handle('tags:get-suggestions', (_e, entryId: number) =>
  wrap('tags:get-suggestions', () => tagService!.getSaved(entryId))
)

app.whenReady().then(() => {
  db = createDb(path.join(app.getPath('userData'), 'pocketbook.db'))
  const stored = loadConfig(db)
  if (stored) {
    try {
      activeProvider = createProvider(stored)
      activeProviderConfig = stored
    } catch (err) {
      console.error('[main] failed to instantiate stored AI provider', err)
    }
  }
  tagService = new TagService(
    db,
    () => activeProvider,
    () => activeProviderConfig?.embeddingModel ?? null,
  )
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
