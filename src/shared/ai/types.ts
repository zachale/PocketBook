export type AIProviderId = 'ollama' | 'openrouter'

export type ModelKind = 'embedding' | 'llm'

export interface ModelInfo {
  id: string
  kind: ModelKind
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIProvider {
  readonly id: AIProviderId
  embed(text: string): Promise<number[]>
  chat(messages: ChatMessage[]): Promise<string>
  listModels(): Promise<ModelInfo[]>
  validate(): Promise<ValidationResult>
}

export interface OllamaConfig {
  provider: 'ollama'
  baseUrl: string
  embeddingModel: string
  llmModel: string
}

export interface OpenRouterConfig {
  provider: 'openrouter'
  apiKey: string
  embeddingModel: string
  llmModel: string
}

export type AIProviderConfig = OllamaConfig | OpenRouterConfig

// Renderer-safe view: never contains apiKey.
export type AIProviderConfigPublic =
  | { provider: 'ollama'; baseUrl: string; embeddingModel: string; llmModel: string }
  | { provider: 'openrouter'; embeddingModel: string; llmModel: string; hasKey: true }

export interface ValidationResult {
  ok: boolean
  error?: string
}
