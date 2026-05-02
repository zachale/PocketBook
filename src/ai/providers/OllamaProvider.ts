import type {
  AIProvider,
  ChatMessage,
  JSONSchema,
  ModelInfo,
  OllamaConfig,
  ValidationResult,
} from '../../shared/ai/types'

interface OllamaTagsResponse {
  models?: { name: string }[]
}

interface OllamaEmbedResponse {
  embedding: number[]
}

interface OllamaChatResponse {
  message?: { content: string }
}

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama' as const

  constructor(private config: OllamaConfig) {}

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.config.baseUrl}/api/tags`)
    if (!res.ok) throw new Error(`Ollama /api/tags returned ${res.status}`)
    const json = (await res.json()) as OllamaTagsResponse
    const tags = json.models ?? []
    return tags.map(({ name }) => ({
      id: name,
      kind: /embed/i.test(name) ? 'embedding' : 'llm',
    }))
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.config.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.config.embeddingModel, prompt: text }),
    })
    if (!res.ok) throw new Error(`Ollama /api/embeddings returned ${res.status}`)
    const json = (await res.json()) as OllamaEmbedResponse
    return json.embedding
  }

  async generateStructured<T>(messages: ChatMessage[], schema: JSONSchema): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.llmModel,
        messages,
        // Ollama 0.5+ accepts a JSON Schema object here; older builds get
        // the literal 'json' string and rely on the prompt to constrain shape.
        format: schema,
        stream: false,
      }),
    })
    if (!res.ok) throw new Error(`Ollama /api/chat returned ${res.status}`)
    const json = (await res.json()) as OllamaChatResponse
    const content = json.message?.content ?? ''
    try {
      return JSON.parse(content) as T
    } catch (err) {
      throw new Error(`Ollama returned non-JSON content: ${content.slice(0, 200)} (${err})`)
    }
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.llmModel,
        messages,
        stream: false,
      }),
    })
    if (!res.ok) throw new Error(`Ollama /api/chat returned ${res.status}`)
    const json = (await res.json()) as OllamaChatResponse
    return json.message?.content ?? ''
  }

  async validate(): Promise<ValidationResult> {
    try {
      await this.listModels()
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `Couldn't reach Ollama at ${this.config.baseUrl}: ${message}` }
    }
  }
}
