// Renderer-facing tag types. Mirrors src/db.ts Tag minus the binary fields.

export interface TagPublic {
  id: number
  name: string
  description: string
  created_at: number
}

export interface TagSuggestion {
  // Existing tags carry an id; AI-generated novel suggestions carry null
  // until the user clicks (at which point we createTag and persist).
  tagId: number | null
  name: string
  description: string
  aiGenerated: boolean
}
