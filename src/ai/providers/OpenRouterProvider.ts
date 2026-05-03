import type {
  AIProvider,
  ChatMessage,
  JSONSchema,
  ModelInfo,
  OpenRouterConfig,
  ValidationResult,
} from '../../shared/ai/types'

const BASE = 'https://openrouter.ai/api/v1'

interface OpenRouterModelsResponse {
  data?: { id: string }[]
}

interface OpenRouterEmbedResponse {
  data?: { embedding: number[] }[]
}

interface OpenRouterChatResponse {
  choices?: { message?: { content: string } }[]
}

export class OpenRouterProvider implements AIProvider {
  readonly id = 'openrouter' as const

  constructor(private config: OpenRouterConfig) {}

  private headers(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      // Optional referer/title — OpenRouter encourages these for analytics.
      'HTTP-Referer': 'https://github.com/zachale/PocketBook',
      'X-Title': 'PocketBook',
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${BASE}/models`, { headers: this.headers() })
    if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`)
    const json = (await res.json()) as OpenRouterModelsResponse
    const models = json.data ?? []
    return models.map(({ id }) => ({
      id,
      kind: /embed/i.test(id) ? 'embedding' : 'llm',
    }))
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${BASE}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model: this.config.embeddingModel, input: text }),
    })
    if (!res.ok) throw new Error(`OpenRouter /embeddings returned ${res.status}`)
    const json = (await res.json()) as OpenRouterEmbedResponse
    return json.data?.[0]?.embedding ?? []
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model: this.config.llmModel, messages }),
    })
    if (!res.ok) throw new Error(`OpenRouter /chat/completions returned ${res.status}`)
    const json = (await res.json()) as OpenRouterChatResponse
    return json.choices?.[0]?.message?.content ?? ''
  }

  async generateStructured<T>(messages: ChatMessage[], schema: JSONSchema): Promise<T> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.llmModel,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'output', schema, strict: true },
        },
      }),
    })
    if (!res.ok) throw new Error(`OpenRouter /chat/completions returned ${res.status}`)
    const json = (await res.json()) as OpenRouterChatResponse
    const content = json.choices?.[0]?.message?.content ?? ''
    try {
      return JSON.parse(content) as T
    } catch (err) {
      throw new Error(`OpenRouter returned non-JSON content: ${content.slice(0, 200)} (${err})`)
    }
  }

  async validate(): Promise<ValidationResult> {
    try {
      const res = await fetch(`${BASE}/auth/key`, { headers: this.headers() })
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'Invalid API key' }
      }
      if (!res.ok) {
        return { ok: false, error: `OpenRouter responded ${res.status}` }
      }
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `Couldn't reach OpenRouter: ${message}` }
    }
  }
}
