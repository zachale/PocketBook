import type {
  AIProvider,
  ChatMessage,
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
