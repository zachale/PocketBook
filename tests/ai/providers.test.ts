// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { OllamaProvider } from '../../src/ai/providers/OllamaProvider'
import { OpenRouterProvider } from '../../src/ai/providers/OpenRouterProvider'

describe('OllamaProvider', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('listModels categorizes embeddings vs llms by name', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'qwen3-embedding' },
          { name: 'llama3.2:3b' },
          { name: 'nomic-embed-text' },
        ],
      }),
    })
    const p = new OllamaProvider({ provider: 'ollama', baseUrl: 'http://x', embeddingModel: '', llmModel: '' })
    const list = await p.listModels()
    expect(list.find(m => m.id === 'qwen3-embedding')?.kind).toBe('embedding')
    expect(list.find(m => m.id === 'nomic-embed-text')?.kind).toBe('embedding')
    expect(list.find(m => m.id === 'llama3.2:3b')?.kind).toBe('llm')
  })

  it('validate returns ok when listModels succeeds', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    })
    const p = new OllamaProvider({ provider: 'ollama', baseUrl: 'http://x', embeddingModel: '', llmModel: '' })
    const r = await p.validate()
    expect(r.ok).toBe(true)
  })

  it('validate returns error when fetch rejects', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'))
    const p = new OllamaProvider({ provider: 'ollama', baseUrl: 'http://x', embeddingModel: '', llmModel: '' })
    const r = await p.validate()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Couldn't reach Ollama/)
  })
})

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends Bearer token on validate', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 })
    const p = new OpenRouterProvider({
      provider: 'openrouter',
      apiKey: 'test-key',
      embeddingModel: 'e',
      llmModel: 'l',
    })
    await p.validate()
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key')
  })

  it('validate returns Invalid API key on 401', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 })
    const p = new OpenRouterProvider({
      provider: 'openrouter', apiKey: 'bad', embeddingModel: 'e', llmModel: 'l',
    })
    const r = await p.validate()
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Invalid API key')
  })
})
