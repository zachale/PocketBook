// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { cosine, meanVector, bufferToFloat32, float32ToBuffer } from '../../src/ai/tags/cosine'

describe('cosine', () => {
  it('is 1 for identical vectors', () => {
    const a = Float32Array.from([1, 2, 3])
    expect(cosine(a, a)).toBeCloseTo(1, 5)
  })
  it('is 0 for orthogonal vectors', () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0, 5)
  })
  it('is -1 for opposite vectors', () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([-1, 0]))).toBeCloseTo(-1, 5)
  })
  it('throws on dim mismatch', () => {
    expect(() => cosine(Float32Array.from([1, 0]), Float32Array.from([1, 0, 0]))).toThrow()
  })
})

describe('meanVector', () => {
  it('averages element-wise', () => {
    const v = meanVector([Float32Array.from([1, 2]), Float32Array.from([3, 4])])
    expect(v[0]).toBeCloseTo(2)
    expect(v[1]).toBeCloseTo(3)
  })
  it('throws on dim mismatch', () => {
    expect(() => meanVector([Float32Array.from([1]), Float32Array.from([1, 2])])).toThrow()
  })
})

describe('buffer round-trip', () => {
  it('converts Float32Array <-> Buffer losslessly', () => {
    const v = Float32Array.from([0.1, -0.2, 0.3])
    const buf = float32ToBuffer(v)
    const round = bufferToFloat32(buf)
    expect(Array.from(round)).toEqual(Array.from(v))
  })
})
