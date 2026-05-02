// In-memory vector math. JS-side ranking is fine at our scale
// (< 1k tags, < 5 chunks per entry). sqlite-vec is loaded but
// only used for SQL-level distance functions when convenient.

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: dimension mismatch (${a.length} vs ${b.length})`)
  }
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function meanVector(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 0) throw new Error('meanVector: empty input')
  const dim = vectors[0].length
  const out = new Float32Array(dim)
  for (const v of vectors) {
    if (v.length !== dim) throw new Error(`meanVector: dimension mismatch (${v.length} vs ${dim})`)
    for (let i = 0; i < dim; i++) out[i] += v[i]
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length
  return out
}

export function bufferToFloat32(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

export function float32ToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)
}

export function numbersToFloat32(arr: number[]): Float32Array {
  return Float32Array.from(arr)
}
