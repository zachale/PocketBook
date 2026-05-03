// Word-based chunker for entry text. Used by the suggestion pipeline to
// produce 300-word windows with 20-word overlap for embedding.

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).length
}

export function chunkWords(text: string, size = 300, overlap = 20): string[] {
  if (size <= 0) throw new Error('chunkWords: size must be > 0')
  if (overlap < 0 || overlap >= size) throw new Error('chunkWords: overlap must be in [0, size)')
  const trimmed = text.trim()
  if (trimmed === '') return []
  const words = trimmed.split(/\s+/)
  if (words.length <= size) return [words.join(' ')]
  const chunks: string[] = []
  const step = size - overlap
  for (let i = 0; i < words.length; i += step) {
    chunks.push(words.slice(i, i + size).join(' '))
    if (i + size >= words.length) break
  }
  return chunks
}

// Strip markdown to plain text. Cheap regex pass — not a full parser.
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')           // fenced code blocks
    .replace(/`[^`]*`/g, ' ')                   // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')      // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // links → text
    .replace(/^#{1,6}\s+/gm, '')                // headings
    .replace(/^>\s*/gm, '')                     // blockquotes
    .replace(/^[-*+]\s+/gm, '')                 // list bullets
    .replace(/^\d+\.\s+/gm, '')                 // numbered lists
    .replace(/(\*\*|__)(.*?)\1/g, '$2')         // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')            // italic
    .replace(/~~(.*?)~~/g, '$1')                // strikethrough
    .replace(/\s+/g, ' ')
    .trim()
}
