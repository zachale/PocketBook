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
