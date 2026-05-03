import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Entry } from '../shared/types'

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════
const CFG = {
  accent: '#5599cc',
  monoFont: "'SF Mono', Menlo, monospace",
  graph:  { threshold: 0.55, capPerNode: 12 },
  layout: { padding: 32, minDistFactor: 0.50, densityScale: 1.2, maxTriesFactor: 400 },
  drift:  { ampX: [1.5, 4.0] as [number, number], ampY: [1.0, 3.0] as [number, number], freq: [0.18, 0.53] as [number, number] },
  node:   { sizeBase: 4, sizeCoef: 4.5 },
  ring:   { chance: 0.10, hueRange: 40, hueCenter: 200 },
  moon:   {
    cap: 5, chanceBase: 0.08, chanceFromSize: 0.45,
    sizeRange: [1.4, 3.0] as [number, number],
    periodRange: [6, 12] as [number, number],
    flatten: 0.7,
  },
  edge:   { opacityCoef: 0.7, widthBase: 0.4, widthCoef: 2.5 },
  stars:  {
    count: 120,
    sizeRange: [6, 12] as [number, number],
    opacityRange: [0.15, 0.60] as [number, number],
    hueRange: [200, 260] as [number, number],
  },
  shootingStar: {
    rollIntervalMs: 30000,
    rollChance: 0.30,
    durationMs: 1000,
    initialDelayMs: 1500,
    color: 'hsl(220, 60%, 70%)',
  },
}

const STAR_GLYPHS = ['·', '.', '⋅', '∙', '+', '✦', '✧', '*']
const MOON_SHAPES = ['circle', 'triangle', 'diamond', 'plus', 'asterisk'] as const
const SHOT_GLYPHS = ['✦', '✧', '·', '∙', '·', '.', '.', '.']
const SHOT_SIZES  = [16,  13,  12,  11,  10,  9,   8,   7]

const EMBED_DIM = 8

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
type Rng = () => number
type MoonShape = typeof MOON_SHAPES[number]

interface Vec { x: number; y: number }
interface Drift {
  ampX: number; ampY: number
  freqX: number; freqY: number
  phaseX: number; phaseY: number
}
interface LayoutPoint extends Vec { drift: Drift }
interface PEntry { id: number; embedding: number[] }
interface Edge { a: number; b: number; w: number }
interface Graph { edges: Edge[]; degree: number[] }
interface Metrics { sizes: number[]; percentiles: number[] }
interface Moon {
  shape: MoonShape
  radius: number
  size: number
  period: number
  phase: number
  direction: 1 | -1
  hue: number
  opacity: number
}
interface Ring {
  tilt: number; innerScale: number; outerScale: number
  yScale: number; opacity: number; color: string
}
interface Star {
  x: number; y: number
  glyph: string; size: number
  baseOpacity: number; hue: number
  twinkleFreq: number; twinklePhase: number
}
interface Shot {
  x1: number; y1: number; x2: number; y2: number
  start: number; duration: number
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════
function mulberry32(a: number): Rng {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lerp  = (a: number, b: number, t: number) => a + (b - a) * t
const range = (rng: Rng, [lo, hi]: [number, number]) => lo + rng() * (hi - lo)
const pick  = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!

function cosine(a: number[], b: number[]): number {
  let d = 0
  for (let i = 0; i < a.length; i++) d += a[i] * b[i]
  return d
}

function normalize(v: number[]): number[] {
  const m = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map(x => x / m)
}

// 32-bit FNV-1a string hash → seed
function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Per-entry stable seed. Same content + id → same seed forever.
function entrySeed(e: Entry): number {
  return hashStr(e.content || `entry-${e.id}`) ^ (e.id | 0)
}

// Salts isolate per-entry feature RNGs so adding a new feature (e.g. color)
// can't shift the rolls of existing features (moons, rings, …). To add a
// feature: pick a fresh 32-bit constant here and derive its rng via
// `subRng(entrySeed, NEW_SALT)`. Never reuse or reorder these.
const SALT = {
  moons:   0x9e3779b1,
  rings:   0x7f4a7c15,
  // future: color, halo tint, accretion variant, ...
}

const subRng = (seed: number, salt: number): Rng => mulberry32((seed ^ salt) >>> 0)

// Synthetic embedding from entry content. Stable per-content-string; replaced
// by real model embeddings once the AI pipeline lands.
function syntheticEmbedding(content: string, seed: number): number[] {
  const rng = mulberry32(seed)
  const v = new Array(EMBED_DIM).fill(0).map(() => rng() - 0.5)
  const firstWord = (content.trim().split(/\s+/)[0] || '').toLowerCase()
  v[0] += firstWord.length * 0.1
  v[1] += Math.min(20, content.length) * 0.05
  return normalize(v)
}

// 2D value noise with smoothstep interpolation.
function makeNoise2D(seed: number) {
  const corner = (ix: number, iy: number) => {
    let h = ((ix * 73856093) ^ (iy * 19349663) ^ seed) | 0
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const sx = smooth(fx), sy = smooth(fy)
    const a = corner(ix,     iy)
    const b = corner(ix + 1, iy)
    const c = corner(ix,     iy + 1)
    const d = corner(ix + 1, iy + 1)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy
  }
}

// ═══════════════════════════════════════════════════════════════
// Builders
// ═══════════════════════════════════════════════════════════════
function buildGraph(entries: PEntry[]): Graph {
  const { threshold, capPerNode } = CFG.graph
  const adj: { peer: number; w: number }[][] = entries.map(() => [])
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const w = cosine(entries[i].embedding, entries[j].embedding)
      if (w >= threshold) {
        adj[i].push({ peer: j, w })
        adj[j].push({ peer: i, w })
      }
    }
  }
  adj.forEach(list => {
    list.sort((a, b) => b.w - a.w)
    list.length = Math.min(list.length, capPerNode)
  })

  const edges: Edge[] = []
  const seen = new Set<string>()
  for (let i = 0; i < entries.length; i++) {
    for (const { peer, w } of adj[i]) {
      const a = Math.min(i, peer), b = Math.max(i, peer)
      const key = `${a}-${b}`
      if (seen.has(key)) continue
      if (!adj[peer].some(e => e.peer === i)) continue
      seen.add(key)
      edges.push({ a, b, w })
    }
  }

  const degree = entries.map(() => 0)
  for (const e of edges) { degree[e.a] += e.w; degree[e.b] += e.w }
  return { edges, degree }
}

function nodeMetrics(degree: number[]): Metrics {
  const max = Math.max(...degree, 1)
  const min = Math.min(...degree)
  const span = (max - min) || 1
  return {
    sizes:       degree.map(d => CFG.node.sizeBase + Math.sqrt(d) * CFG.node.sizeCoef),
    percentiles: degree.map(d => (d - min) / span),
  }
}

function buildLayout(count: number, width: number, height: number, seed: number): LayoutPoint[] {
  const rng = mulberry32(seed)
  const noise = makeNoise2D(seed)
  const density = (x: number, y: number) =>
    Math.min(1, (noise(x / 180, y / 180) + 0.5 * noise(x / 80, y / 80)) / 1.5)

  const { padding, minDistFactor, densityScale, maxTriesFactor } = CFG.layout
  const minDist = Math.sqrt((width * height) / Math.max(1, count)) * minDistFactor
  const minD2 = minDist * minDist

  const points: Vec[] = []
  let tries = 0
  while (points.length < count && tries < count * maxTriesFactor) {
    tries++
    const x = padding + rng() * (width  - padding * 2)
    const y = padding + rng() * (height - padding * 2)
    if (rng() > density(x, y) * densityScale) continue
    if (points.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < minD2)) continue
    points.push({ x, y })
  }
  while (points.length < count) {
    points.push({
      x: padding + rng() * (width - padding * 2),
      y: padding + rng() * (height - padding * 2),
    })
  }

  return points.map(p => ({
    x: p.x, y: p.y,
    drift: {
      ampX: range(rng, CFG.drift.ampX),
      ampY: range(rng, CFG.drift.ampY),
      freqX: range(rng, CFG.drift.freq),
      freqY: range(rng, CFG.drift.freq),
      phaseX: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2,
    },
  }))
}

function buildMoons(nodeRadius: number, sizePercentile: number, rng: Rng): Moon[] {
  const chance = CFG.moon.chanceBase + sizePercentile * CFG.moon.chanceFromSize
  const moons: Moon[] = []
  let runningR = nodeRadius + 7
  for (let i = 0; i < CFG.moon.cap; i++) {
    if (rng() >= chance) break
    const size = range(rng, CFG.moon.sizeRange)
    const orbitR = runningR + size + 2
    moons.push({
      shape: pick(rng, MOON_SHAPES),
      radius: orbitR,
      size,
      period: range(rng, CFG.moon.periodRange),
      phase: rng() * Math.PI * 2,
      direction: rng() < 0.5 ? 1 : -1,
      hue: -20 + rng() * 40,
      opacity: 0.6 + rng() * 0.35,
    })
    runningR = orbitR + size + 5
  }
  return moons
}

function buildRing(rng: Rng): Ring | null {
  if (rng() >= CFG.ring.chance) return null
  const hue = CFG.ring.hueCenter + (rng() - 0.5) * CFG.ring.hueRange
  const sat = 35 + rng() * 20
  const light = 60 + rng() * 15
  return {
    tilt:       -30 + rng() * 60,
    innerScale: 1.4 + rng() * 0.2,
    outerScale: 1.7 + rng() * 0.3,
    yScale:     0.18 + rng() * 0.18,
    opacity:    0.45 + rng() * 0.30,
    color:      `hsl(${hue}, ${sat}%, ${light}%)`,
  }
}

function buildStars(width: number, height: number, seed: number): Star[] {
  const rng = mulberry32(seed)
  const out: Star[] = []
  for (let i = 0; i < CFG.stars.count; i++) {
    out.push({
      x: rng() * width,
      y: rng() * height,
      glyph: pick(rng, STAR_GLYPHS),
      size: range(rng, CFG.stars.sizeRange),
      baseOpacity: range(rng, CFG.stars.opacityRange),
      hue: range(rng, CFG.stars.hueRange),
      twinkleFreq: 0.4 + rng() * 1.6,
      twinklePhase: rng() * Math.PI * 2,
    })
  }
  return out
}

// ═══════════════════════════════════════════════════════════════
// Animation kernels
// ═══════════════════════════════════════════════════════════════
const planetPosAt = (l: LayoutPoint, t: number): Vec => ({
  x: l.x + Math.sin(t * l.drift.freqX + l.drift.phaseX) * l.drift.ampX,
  y: l.y + Math.sin(t * l.drift.freqY + l.drift.phaseY) * l.drift.ampY,
})

const moonOffsetAt = (m: Moon, t: number): Vec => {
  const a = (t / m.period) * Math.PI * 2 * m.direction + m.phase
  return { x: Math.cos(a) * m.radius, y: Math.sin(a) * m.radius * CFG.moon.flatten }
}

const twinkleOpacity = (s: Star, t: number) => {
  const tw = Math.sin(t * s.twinkleFreq + s.twinklePhase)
  return s.baseOpacity * (0.4 + 0.6 * tw * tw)
}

// ═══════════════════════════════════════════════════════════════
// Render components
// ═══════════════════════════════════════════════════════════════
const jitterColor = (h: number) => `hsl(${207 + h}, 50%, 57%)`

function PlanetGradients({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-body`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stopColor="#7ab4dc" />
        <stop offset="100%" stopColor="#3a78a8" />
      </linearGradient>
      <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="rgba(85,153,204,0.30)" />
        <stop offset="60%"  stopColor="rgba(85,153,204,0.08)" />
        <stop offset="100%" stopColor="rgba(85,153,204,0)" />
      </radialGradient>
      {[0, 1, 2, 3].map(s => (
        <filter
          key={s}
          id={`${id}-tex-${s}`}
          x="-20%" y="-20%" width="140%" height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency={0.9 + s * 0.15} numOctaves={2} seed={11 + s * 7} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values={`
            0 0 0 0 0.04
            0 0 0 0 0.18
            0 0 0 0 0.36
            0 0 0 0.7 -0.2`} />
        </filter>
      ))}
    </defs>
  )
}

function PlanetRing({ r, ring, half }: { r: number; ring: Ring | null; half: 'back' | 'front' }) {
  if (!ring) return null
  const rx = r * ring.outerScale
  const ry = rx * ring.yScale
  const stroke = r * (ring.outerScale - ring.innerScale)
  return (
    <g transform={`rotate(${ring.tilt})`}>
      {half === 'back' ? (
        <ellipse rx={rx} ry={ry} fill="none" stroke={ring.color}
          strokeOpacity={ring.opacity * 0.7} strokeWidth={stroke} />
      ) : (
        <path d={`M ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0`}
          fill="none" stroke={ring.color}
          strokeOpacity={ring.opacity} strokeWidth={stroke} />
      )}
    </g>
  )
}

function PlanetNode({ r, gradId, textureSeed, ring }: {
  r: number; gradId: string; textureSeed: number; ring: Ring | null
}) {
  const clipId = `${gradId}-clip-${textureSeed}`
  return (
    <g>
      <PlanetRing r={r} ring={ring} half="back" />
      <circle r={r + 1.5} fill={`url(#${gradId}-halo)`} />
      <circle r={r}       fill={`url(#${gradId}-body)`} />
      <defs><clipPath id={clipId}><circle r={r} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`} opacity="0.55">
        <rect x={-r} y={-r} width={r * 2} height={r * 2} filter={`url(#${gradId}-tex-${textureSeed % 4})`} />
      </g>
      <circle r={r} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
      <PlanetRing r={r} ring={ring} half="front" />
    </g>
  )
}

function MoonGlyph({ shape, size: s, color, opacity }: {
  shape: MoonShape; size: number; color: string; opacity: number
}) {
  switch (shape) {
    case 'circle':   return <circle r={s} fill={color} opacity={opacity} />
    case 'triangle': return <polygon points={`0,${-s} ${s*0.87},${s*0.5} ${-s*0.87},${s*0.5}`} fill={color} opacity={opacity} />
    case 'diamond':  return <polygon points={`0,${-s} ${s},0 0,${s} ${-s},0`} fill={color} opacity={opacity} />
    case 'plus':
      return (
        <g stroke={color} strokeWidth={s*0.6} strokeLinecap="round" opacity={opacity}>
          <line x1={-s} y1={0} x2={s} y2={0} />
          <line x1={0} y1={-s} x2={0} y2={s} />
        </g>
      )
    case 'asterisk':
      return (
        <g stroke={color} strokeWidth={s*0.5} strokeLinecap="round" opacity={opacity}>
          <line x1={-s} y1={0} x2={s} y2={0} />
          <line x1={0} y1={-s} x2={0} y2={s} />
          <line x1={-s*0.7} y1={-s*0.7} x2={s*0.7} y2={s*0.7} />
          <line x1={-s*0.7} y1={s*0.7} x2={s*0.7} y2={-s*0.7} />
        </g>
      )
  }
}

// ═══════════════════════════════════════════════════════════════
// Shooting star
// ═══════════════════════════════════════════════════════════════
function pickEdgePoint(width: number, height: number, side: number): Vec {
  switch (side) {
    case 0: return { x: -20,        y: 30 + Math.random() * (height - 60) }
    case 1: return { x: width + 20, y: 30 + Math.random() * (height - 60) }
    case 2: return { x: 30 + Math.random() * (width - 60), y: -20 }
    default: return { x: 30 + Math.random() * (width - 60), y: height + 20 }
  }
}

function spawnShot(width: number, height: number): Shot {
  const sa = Math.floor(Math.random() * 4)
  const sb = (sa + 2) % 4
  const a = pickEdgePoint(width, height, sa)
  const b = pickEdgePoint(width, height, sb)
  return {
    x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    start: performance.now(),
    duration: CFG.shootingStar.durationMs,
  }
}

function ShootingStar({ width, height }: { width: number; height: number }) {
  const [shot, setShot] = useState<Shot | null>(null)
  const groupRef = useRef<SVGGElement>(null)

  useEffect(() => {
    const first = window.setTimeout(
      () => setShot(spawnShot(width, height)),
      CFG.shootingStar.initialDelayMs,
    )
    const rolling = window.setInterval(() => {
      if (Math.random() < CFG.shootingStar.rollChance) {
        setShot(spawnShot(width, height))
      }
    }, CFG.shootingStar.rollIntervalMs)
    return () => { clearTimeout(first); clearInterval(rolling) }
  }, [width, height])

  useEffect(() => {
    if (!shot) return
    let raf = 0
    const tick = (now: number) => {
      const head = (now - shot.start) / shot.duration
      if (head >= 1) { setShot(null); return }
      const g = groupRef.current
      if (g) {
        const len = g.children.length
        for (let i = 0; i < len; i++) {
          const tt = head - i * 0.05
          const child = g.children[i] as SVGElement
          if (tt < 0 || tt > 1) { child.setAttribute('opacity', '0'); continue }
          const x = lerp(shot.x1, shot.x2, tt)
          const y = lerp(shot.y1, shot.y2, tt)
          child.setAttribute('transform', `translate(${x}, ${y})`)
          child.setAttribute('opacity', String((1 - i / len) * 0.95))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [shot])

  if (!shot) return null
  return (
    <g ref={groupRef}>
      {SHOT_GLYPHS.map((ch, i) => (
        <text key={i}
          fill={CFG.shootingStar.color}
          fontFamily={CFG.monoFont}
          fontSize={SHOT_SIZES[i]}
          textAnchor="middle" dominantBaseline="middle"
          opacity="0">{ch}</text>
      ))}
    </g>
  )
}

// ═══════════════════════════════════════════════════════════════
// Galaxy — public component
// ═══════════════════════════════════════════════════════════════
export interface GalaxyProps {
  entries: Entry[]
  width?: number
  height?: number
}

export function Galaxy({ entries, width = 880, height = 380 }: GalaxyProps) {
  const data = useMemo(() => {
    // Per-entry seed: same content + id → same seed across reloads.
    const seeds = entries.map(entrySeed)

    const planetEntries: PEntry[] = entries.map((e, i) => ({
      id: e.id,
      embedding: syntheticEmbedding(e.content, seeds[i]),
    }))
    const graph   = buildGraph(planetEntries)
    const metrics = nodeMetrics(graph.degree)

    // Galaxy-wide layout/star seed: stable across reloads for the same set of
    // entries. Position itself isn't entry-stable (rejection sampling iterates
    // over the set), but the same set produces the same layout.
    let galaxySeed = 0x9e3779b9
    for (const s of seeds) galaxySeed = (galaxySeed ^ s) >>> 0
    const layout = buildLayout(planetEntries.length, width, height, galaxySeed)
    const stars  = buildStars(width, height, (galaxySeed ^ 0x5bd1e995) >>> 0)

    // Per-entry feature rolls. Each feature gets its own salted sub-rng so
    // adding a new feature doesn't shift existing rolls.
    const moons = planetEntries.map((_, i) =>
      buildMoons(metrics.sizes[i], metrics.percentiles[i], subRng(seeds[i], SALT.moons))
    )
    const rings = planetEntries.map((_, i) => buildRing(subRng(seeds[i], SALT.rings)))

    return { entries: planetEntries, graph, layout, metrics, moons, rings, stars }
  }, [entries, width, height])

  const nodeRefs = useRef<Record<number, SVGGElement | null>>({})
  const edgeRefs = useRef<Record<string, SVGLineElement | null>>({})
  const moonRefs = useRef<Record<string, SVGGElement | null>>({})
  const starRefs = useRef<Record<number, SVGTextElement | null>>({})

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const { entries: pe, graph: { edges }, layout, moons, stars } = data

    const tick = (now: number) => {
      const t = (now - start) / 1000
      const positions = pe.map((_, i) => planetPosAt(layout[i], t))

      for (let i = 0; i < pe.length; i++) {
        const g = nodeRefs.current[i]
        if (g) g.setAttribute('transform', `translate(${positions[i].x}, ${positions[i].y})`)
      }

      for (const e of edges) {
        const line = edgeRefs.current[`${e.a}-${e.b}`]
        if (!line) continue
        line.setAttribute('x1', String(positions[e.a].x))
        line.setAttribute('y1', String(positions[e.a].y))
        line.setAttribute('x2', String(positions[e.b].x))
        line.setAttribute('y2', String(positions[e.b].y))
      }

      for (let i = 0; i < pe.length; i++) {
        for (let m = 0; m < moons[i].length; m++) {
          const off = moonOffsetAt(moons[i][m], t)
          const node = moonRefs.current[`${i}-${m}`]
          if (node) node.setAttribute('transform', `translate(${off.x}, ${off.y})`)
        }
      }

      for (let i = 0; i < stars.length; i++) {
        const el = starRefs.current[i]
        if (el) el.setAttribute('opacity', String(twinkleOpacity(stars[i], t)))
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [data])

  const { entries: pe, graph: { edges }, metrics, moons, rings, stars } = data
  const edgeStyle = (e: Edge) => ({
    opacity: Math.max(0.02, (e.w - 0.5) * CFG.edge.opacityCoef),
    width:   CFG.edge.widthBase + (e.w - CFG.graph.threshold) * CFG.edge.widthCoef,
  })

  return (
    <div className="galaxy-card">
      <svg className="galaxy-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <PlanetGradients id="planet" />

        {stars.map((s, i) => (
          <text
            key={`star-${i}`}
            ref={el => { starRefs.current[i] = el }}
            x={s.x} y={s.y}
            fontSize={s.size}
            fontFamily={CFG.monoFont}
            fill={`hsl(${s.hue}, 60%, 70%)`}
            textAnchor="middle" dominantBaseline="middle"
            opacity={s.baseOpacity}
          >{s.glyph}</text>
        ))}

        <ShootingStar width={width} height={height} />

        {edges.map(e => {
          const s = edgeStyle(e)
          return (
            <line key={`${e.a}-${e.b}`}
              ref={el => { edgeRefs.current[`${e.a}-${e.b}`] = el }}
              stroke={CFG.accent}
              strokeOpacity={s.opacity}
              strokeWidth={s.width}
              strokeLinecap="round" />
          )
        })}

        {pe.map((_, i) => (
          <g key={i} ref={el => { nodeRefs.current[i] = el }}>
            {moons[i].map((m, mi) => (
              <ellipse key={`ring-${mi}`}
                rx={m.radius} ry={m.radius * CFG.moon.flatten}
                fill="none" stroke="rgba(85,153,204,0.5)" strokeOpacity={0.5}
                strokeDasharray="2 4" strokeWidth={0.7} />
            ))}
            <PlanetNode r={metrics.sizes[i]} gradId="planet" textureSeed={i} ring={rings[i]} />
            {moons[i].map((m, mi) => (
              <g key={`moon-${mi}`} ref={el => { moonRefs.current[`${i}-${mi}`] = el }}>
                <MoonGlyph shape={m.shape} size={m.size} color={jitterColor(m.hue)} opacity={m.opacity} />
              </g>
            ))}
          </g>
        ))}
      </svg>
      <div className="galaxy-label">your galaxy</div>
    </div>
  )
}
