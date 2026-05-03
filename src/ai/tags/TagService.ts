import type Database from 'better-sqlite3'
import type { AIProvider, ChatMessage } from '../../shared/ai/types'
import type { TagPublic, TagSuggestion } from '../../shared/ai/tag-types'
import {
  createTag as dbCreateTag,
  listTags as dbListTags,
  getTagsForEntry as dbGetTagsForEntry,
  addTagToEntry as dbAddTag,
  removeTagFromEntry as dbRemoveTag,
  findTagByName,
  updateTagEmbedding,
  getSuggestionsForEntry,
  saveSuggestionsForEntry,
  type Tag,
} from '../../db'
import { stripMarkdown, chunkWords } from './chunking'
import {
  cosine,
  meanVector,
  bufferToFloat32,
  float32ToBuffer,
  numbersToFloat32,
} from './cosine'
import {
  TagSuggestionSchema,
  RerankSchema,
  type TagSuggestionPayload,
  type RerankPayload,
} from './schemas'

const COSINE_TOP_K = 10
const FINAL_TOP_N = 4

function publicTag(t: Tag): TagPublic {
  return { id: t.id, name: t.name, description: t.description, created_at: t.created_at }
}

export class TagService {
  // De-dupe concurrent suggestion runs per entry.
  private inflight = new Map<number, Promise<TagSuggestion[]>>()
  // Cache the last suggestion result per entry keyed by content hash so
  // repeated triggers on identical text skip the pipeline.
  private lastByEntry = new Map<number, { hash: string; result: TagSuggestion[] }>()

  constructor(
    private db: Database.Database,
    private getProvider: () => AIProvider | null,
    private getEmbeddingModel: () => string | null,
  ) {}

  list(): TagPublic[] {
    return dbListTags(this.db).map(publicTag)
  }

  forEntry(entryId: number): TagPublic[] {
    return dbGetTagsForEntry(this.db, entryId).map(publicTag)
  }

  async create(input: { name: string; description?: string }): Promise<TagPublic> {
    const trimmed = input.name.trim()
    if (!trimmed) throw new Error('Tag name cannot be empty')
    const existing = findTagByName(this.db, trimmed)
    if (existing) return publicTag(existing)

    const tag = dbCreateTag(this.db, { name: trimmed, description: input.description?.trim() ?? '' })

    // Best-effort embed; ignore failures so manual tagging still works offline.
    const provider = this.getProvider()
    const model = this.getEmbeddingModel()
    if (provider && model) {
      try {
        const vec = await provider.embed(`${tag.name}: ${tag.description}`.trim())
        updateTagEmbedding(this.db, tag.id, float32ToBuffer(numbersToFloat32(vec)), model)
      } catch (err) {
        console.warn('[TagService] failed to embed new tag', err)
      }
    }
    return publicTag(tag)
  }

  add(entryId: number, tagId: number): void {
    dbAddTag(this.db, entryId, tagId)
  }

  remove(entryId: number, tagId: number): void {
    dbRemoveTag(this.db, entryId, tagId)
  }

  /** Read-only — returns the persisted suggestions if any (no LLM work). */
  getSaved(entryId: number): TagSuggestion[] {
    return getSuggestionsForEntry(this.db, entryId)?.suggestions ?? []
  }

  async suggest(entryId: number, content: string): Promise<TagSuggestion[]> {
    const provider = this.getProvider()
    const model = this.getEmbeddingModel()
    if (!provider || !model) return []

    const stripped = stripMarkdown(content)
    if (stripped.split(/\s+/).filter(Boolean).length < 5) return []

    const hash = `${model}:${stripped.length}:${stripped}`

    // In-memory cache (this run)
    const cached = this.lastByEntry.get(entryId)
    if (cached?.hash === hash) return cached.result

    // DB cache (survives restarts) — hydrate the in-memory cache too
    const saved = getSuggestionsForEntry(this.db, entryId)
    if (saved && saved.hash === hash) {
      this.lastByEntry.set(entryId, { hash, result: saved.suggestions })
      return saved.suggestions
    }

    const inflight = this.inflight.get(entryId)
    if (inflight) return inflight

    const promise = this.runPipeline(entryId, stripped, provider, model)
      .then(result => {
        this.lastByEntry.set(entryId, { hash, result })
        try {
          saveSuggestionsForEntry(this.db, entryId, hash, result)
        } catch (err) {
          console.warn('[TagService] failed to persist suggestions', err)
        }
        return result
      })
      .finally(() => this.inflight.delete(entryId))
    this.inflight.set(entryId, promise)
    return promise
  }

  private async runPipeline(
    entryId: number,
    text: string,
    provider: AIProvider,
    model: string,
  ): Promise<TagSuggestion[]> {
    // 1. Chunk + embed.
    const chunks = chunkWords(text, 300, 20)
    if (chunks.length === 0) return []
    const chunkVectors: Float32Array[] = []
    for (const c of chunks) {
      const v = await provider.embed(c)
      chunkVectors.push(numbersToFloat32(v))
    }
    const queryVec = meanVector(chunkVectors)

    // 2. LLM generates 2 brand-new tag candidates.
    const generated = await this.generateNewTags(provider, chunks)

    // 3. Pull existing tags + lazy-backfill embeddings for the active model.
    const existingTags = await this.ensureEmbeddings(provider, model)

    // 4. Build candidate pool: existing + 2 generated. Embed generated tags.
    const generatedVectors = await Promise.all(
      generated.map(g => provider.embed(`${g.name}: ${g.description}`.trim())),
    )
    type Cand = { name: string; description: string; tagId: number | null; aiGenerated: boolean; vec: Float32Array }
    const candidates: Cand[] = [
      ...existingTags.map(t => ({
        name: t.name,
        description: t.description,
        tagId: t.id,
        aiGenerated: false,
        vec: bufferToFloat32(t.embedding!),
      })),
      ...generated.map((g, i) => ({
        name: g.name,
        description: g.description,
        tagId: null,
        aiGenerated: true,
        vec: numbersToFloat32(generatedVectors[i]),
      })),
    ]
    if (candidates.length === 0) return []

    // 5. Cosine rank → top K.
    const scored = candidates
      .map(c => ({ c, score: cosineSafe(c.vec, queryVec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, COSINE_TOP_K)

    // 6. LLM rerank top K → top N.
    const ranked = await this.rerank(provider, text, scored.map(s => s.c))
    const byName = new Map(scored.map(s => [s.c.name.toLowerCase(), s.c]))
    const final: TagSuggestion[] = []
    for (const name of ranked) {
      const c = byName.get(name.toLowerCase())
      if (!c) continue
      final.push({
        tagId: c.tagId,
        name: c.name,
        description: c.description,
        aiGenerated: c.aiGenerated,
      })
      if (final.length >= FINAL_TOP_N) break
    }
    // Fallback: if rerank returned nothing usable, take top cosine results.
    if (final.length === 0) {
      for (const s of scored.slice(0, FINAL_TOP_N)) {
        final.push({
          tagId: s.c.tagId,
          name: s.c.name,
          description: s.c.description,
          aiGenerated: s.c.aiGenerated,
        })
      }
    }

    // Skip already-attached tags.
    const attached = new Set(dbGetTagsForEntry(this.db, entryId).map(t => t.id))
    return final.filter(s => s.tagId == null || !attached.has(s.tagId))
  }

  private async generateNewTags(
    provider: AIProvider,
    chunks: string[],
  ): Promise<{ name: string; description: string }[]> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You generate concise topical tags for a personal journal entry. ' +
          'Tags are 1–3 words, lowercase, no punctuation. Description is one short sentence. ' +
          'Return exactly 2 fresh tag suggestions in JSON.',
      },
      {
        role: 'user',
        content: chunks.join('\n\n').slice(0, 4000),
      },
    ]
    try {
      const result = await provider.generateStructured<TagSuggestionPayload>(messages, TagSuggestionSchema)
      return (result.tags ?? []).slice(0, 2).map(t => ({
        name: t.name.trim().toLowerCase().replace(/\s+/g, '-'),
        description: t.description.trim(),
      })).filter(t => t.name.length > 0)
    } catch (err) {
      console.warn('[TagService] generateNewTags failed', err)
      return []
    }
  }

  private async rerank(
    provider: AIProvider,
    text: string,
    candidates: { name: string; description: string }[],
  ): Promise<string[]> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          `Rerank these candidate tags by relevance to the journal entry. ` +
          `Return the most relevant tag names in order, max ${FINAL_TOP_N}. Use only names from the input list.`,
      },
      {
        role: 'user',
        content:
          `Entry:\n${text.slice(0, 3000)}\n\n` +
          `Candidates:\n${candidates.map(c => `- ${c.name}: ${c.description}`).join('\n')}`,
      },
    ]
    try {
      const result = await provider.generateStructured<RerankPayload>(messages, RerankSchema)
      return result.ranked ?? []
    } catch (err) {
      console.warn('[TagService] rerank failed', err)
      return []
    }
  }

  private async ensureEmbeddings(
    provider: AIProvider,
    model: string,
  ): Promise<Tag[]> {
    const all = dbListTags(this.db)
    const out: Tag[] = []
    for (const t of all) {
      if (t.embedding && t.embedding_model === model) {
        out.push(t)
        continue
      }
      try {
        const vec = await provider.embed(`${t.name}: ${t.description}`.trim())
        const buf = float32ToBuffer(numbersToFloat32(vec))
        updateTagEmbedding(this.db, t.id, buf, model)
        out.push({ ...t, embedding: buf, embedding_model: model })
      } catch (err) {
        console.warn(`[TagService] failed to embed tag ${t.name}`, err)
      }
    }
    return out
  }
}

function cosineSafe(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -Infinity
  return cosine(a, b)
}
