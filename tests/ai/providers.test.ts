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

  it('generateStructured passes response_format and parses JSON content', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"a":1,"b":"x"}' } }] }),
    })
    const p = new OpenRouterProvider({
      provider: 'openrouter', apiKey: 'k', embeddingModel: 'e', llmModel: 'l',
    })
    const result = await p.generateStructured<{ a: number; b: string }>(
      [{ role: 'user', content: 'hi' }],
      { type: 'object', properties: { a: { type: 'number' }, b: { type: 'string' } } },
    )
    expect(result).toEqual({ a: 1, b: 'x' })
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.strict).toBe(true)
  })
})

describe('OllamaProvider.generateStructured', () => {
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { vi.restoreAllMocks() })

  it('passes schema as format and parses JSON content', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{"ranked":["a","b"]}' } }),
    })
    const p = new OllamaProvider({ provider: 'ollama', baseUrl: 'http://x', embeddingModel: '', llmModel: 'l' })
    const result = await p.generateStructured<{ ranked: string[] }>(
      [{ role: 'user', content: 'rank' }],
      { type: 'object', properties: { ranked: { type: 'array' } } },
    )
    expect(result).toEqual({ ranked: ['a', 'b'] })
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.format).toEqual({ type: 'object', properties: { ranked: { type: 'array' } } })
    expect(body.stream).toBe(false)
  })
})
