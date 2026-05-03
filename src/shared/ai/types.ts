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

// Minimal JSON Schema shape we accept. Both Ollama (format: schema) and
// OpenRouter (response_format.json_schema) understand this surface.
export interface JSONSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export interface AIProvider {
  readonly id: AIProviderId
  embed(text: string): Promise<number[]>
  chat(messages: ChatMessage[]): Promise<string>
  generateStructured<T>(messages: ChatMessage[], schema: JSONSchema): Promise<T>
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
