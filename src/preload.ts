import { contextBridge, ipcRenderer } from 'electron'
import type { UpsertEntryArgs } from './shared/types'
import type { AIProviderConfig, ChatMessage } from './shared/ai/types'

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

  ai: {
    getConfig: () => ipcRenderer.invoke('ai:get-config'),
    saveConfig: (config: AIProviderConfig) => ipcRenderer.invoke('ai:save-config', config),
    listOllamaModels: (baseUrl?: string) => ipcRenderer.invoke('ai:list-ollama-models', baseUrl),
    validateConfig: (config: AIProviderConfig) => ipcRenderer.invoke('ai:validate-config', config),
    embed: (text: string) => ipcRenderer.invoke('ai:embed', text),
    chat: (messages: ChatMessage[]) => ipcRenderer.invoke('ai:chat', messages),
  },

  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    forEntry: (entryId: number) => ipcRenderer.invoke('tags:for-entry', entryId),
    create: (input: { name: string; description?: string }) => ipcRenderer.invoke('tags:create', input),
    add: (entryId: number, tagId: number) => ipcRenderer.invoke('tags:add', entryId, tagId),
    remove: (entryId: number, tagId: number) => ipcRenderer.invoke('tags:remove', entryId, tagId),
    suggest: (entryId: number, content: string) => ipcRenderer.invoke('tags:suggest', entryId, content),
  },
})
