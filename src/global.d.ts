interface Window {
  api: {
    getEntriesForDates: (dates: string[]) => Promise<import('./shared/types').Entry[]>
    upsertEntry: (args: import('./shared/types').UpsertEntryArgs) => Promise<import('./shared/types').Entry>
    deleteEntry: (id: number) => Promise<void>
    getTimelineIndex: () => Promise<import('./shared/types').TimelineEntry[]>
    searchEntries: (term: string) => Promise<import('./shared/types').SearchResult[]>
    ai: {
      getConfig: () => Promise<import('./shared/ai/types').AIProviderConfigPublic | null>
      saveConfig: (config: import('./shared/ai/types').AIProviderConfig) => Promise<import('./shared/ai/types').ValidationResult>
      listOllamaModels: (baseUrl?: string) => Promise<import('./shared/ai/types').ModelInfo[]>
      validateConfig: (config: import('./shared/ai/types').AIProviderConfig) => Promise<import('./shared/ai/types').ValidationResult>
      embed: (text: string) => Promise<number[]>
      chat: (messages: import('./shared/ai/types').ChatMessage[]) => Promise<string>
    }
    tags: {
      list: () => Promise<import('./shared/ai/tag-types').TagPublic[]>
      forEntry: (entryId: number) => Promise<import('./shared/ai/tag-types').TagPublic[]>
      create: (input: { name: string; description?: string }) => Promise<import('./shared/ai/tag-types').TagPublic>
      add: (entryId: number, tagId: number) => Promise<void>
      remove: (entryId: number, tagId: number) => Promise<void>
      suggest: (entryId: number, content: string) => Promise<import('./shared/ai/tag-types').TagSuggestion[]>
    }
  }
}
