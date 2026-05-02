// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { countWords, chunkWords, stripMarkdown } from '../../src/ai/tags/chunking'

describe('countWords', () => {
  it('returns 0 for empty', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
  })
  it('counts whitespace-separated tokens', () => {
    expect(countWords('one two   three')).toBe(3)
  })
})

describe('chunkWords', () => {
  it('returns empty for empty input', () => {
    expect(chunkWords('', 5, 1)).toEqual([])
  })

  it('returns single chunk when below size', () => {
    expect(chunkWords('a b c', 5, 1)).toEqual(['a b c'])
  })

  it('produces overlapping windows', () => {
    const text = Array.from({ length: 10 }, (_, i) => `w${i}`).join(' ')
    const chunks = chunkWords(text, 4, 1)
    // step = 3 → starts at 0, 3, 6, 9
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks[0]).toBe('w0 w1 w2 w3')
    expect(chunks[1]).toBe('w3 w4 w5 w6')
  })

  it('rejects invalid params', () => {
    expect(() => chunkWords('a', 0, 0)).toThrow()
    expect(() => chunkWords('a', 5, 5)).toThrow()
    expect(() => chunkWords('a', 5, 6)).toThrow()
  })
})

describe('stripMarkdown', () => {
  it('removes headings, bold, italic, lists, links', () => {
    const md = '# Title\n\nSome **bold** and *italic* and [link](http://x).\n\n- item one\n- item two\n\n```code\nblock\n```'
    const out = stripMarkdown(md)
    expect(out).toContain('Title')
    expect(out).toContain('bold')
    expect(out).toContain('italic')
    expect(out).toContain('link')
    expect(out).not.toContain('**')
    expect(out).not.toContain('```')
    expect(out).not.toContain('#')
  })
})
