import type Database from 'better-sqlite3'
import { safeStorage } from 'electron'
import { getSetting, setSetting, deleteSetting } from '../db'
import type { AIProviderConfig, AIProviderConfigPublic } from '../shared/ai/types'

const KEY = 'ai.config'
const ENC_PREFIX = 'enc:' // marks a base64 ciphertext payload

function encryptKey(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[ai/settings] safeStorage unavailable; storing API key in plaintext')
    return plain
  }
  return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
}

function decryptKey(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored
  const ciphertext = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64')
  return safeStorage.decryptString(ciphertext)
}

export function loadConfig(db: Database.Database): AIProviderConfig | null {
  const raw = getSetting(db, KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AIProviderConfig
    if (parsed.provider === 'openrouter' && parsed.apiKey) {
      parsed.apiKey = decryptKey(parsed.apiKey)
    }
    return parsed
  } catch (err) {
    console.error('[ai/settings] failed to parse stored config', err)
    return null
  }
}

export function saveConfig(db: Database.Database, config: AIProviderConfig): void {
  const toStore: AIProviderConfig =
    config.provider === 'openrouter'
      ? { ...config, apiKey: encryptKey(config.apiKey) }
      : config
  setSetting(db, KEY, JSON.stringify(toStore))
}

export function clearConfig(db: Database.Database): void {
  deleteSetting(db, KEY)
}

// Strips secrets so the renderer never sees an apiKey.
export function publicView(config: AIProviderConfig): AIProviderConfigPublic {
  if (config.provider === 'ollama') {
    return {
      provider: 'ollama',
      baseUrl: config.baseUrl,
      embeddingModel: config.embeddingModel,
      llmModel: config.llmModel,
    }
  }
  return {
    provider: 'openrouter',
    embeddingModel: config.embeddingModel,
    llmModel: config.llmModel,
    hasKey: true,
  }
}
