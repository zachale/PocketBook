import type { JSONSchema } from '../../shared/ai/types'

// LLM is asked to invent 2 brand-new tag candidates for the entry.
export const TagSuggestionSchema: JSONSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tags: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'description'],
      },
    },
  },
  required: ['tags'],
}

export interface TagSuggestionPayload {
  tags: { name: string; description: string }[]
}

// LLM is asked to rerank the top-N candidate tags into a final ordered list.
export const RerankSchema: JSONSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ranked: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string' },
    },
  },
  required: ['ranked'],
}

export interface RerankPayload {
  ranked: string[]
}
