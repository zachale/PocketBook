import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { createDb, upsertEntry, getEntriesForDates, deleteEntry, getTimelineIndex, searchEntries } from './db'
import type { UpsertEntryArgs } from './shared/types'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

let db: ReturnType<typeof createDb>

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

function wrap<T>(channel: string, fn: () => T): T {
  try {
    return fn()
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

app.whenReady().then(() => {
  db = createDb(path.join(app.getPath('userData'), 'pocketbook.db'))
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
