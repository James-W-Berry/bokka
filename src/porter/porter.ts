// Bokka porter engine v2 — framework-free 2.5D pixel-art renderer.
// A traditional Japanese mountain porter (bokka / 歩荷) drawn with 4-shade
// material ramps, a top-left light source, articulated limbs, and animations
// that escalate with load: bouncy walk → trudge → panting + sweat → trembling
// with stumble events → flattened under the pile. Pure canvas 2D, zero
// dependencies, shared verbatim by the web app and the browser extension.

export const LOGICAL_W = 140
export const LOGICAL_H = 200
const G = 188 // ground line

export type PorterState =
  | 'idle'
  | 'light'
  | 'steady'
  | 'heavy'
  | 'overloaded'
  | 'flattened'
  | 'celebrate'

export const STATE_LABEL: Record<PorterState, string> = {
  idle: 'Resting',
  light: 'Warming up',
  steady: 'Steady pace',
  heavy: 'Heavy load',
  overloaded: 'Overloaded!',
  flattened: 'Flattened…',
  celebrate: 'Delivered!',
}

export function porterState(points: number, capacity: number): PorterState {
  if (points <= 0) return 'idle'
  const r = points / capacity
  if (r <= 1 / 3) return 'light'
  if (r <= 2 / 3) return 'steady'
  if (r <= 1) return 'heavy'
  if (r <= 1.5) return 'overloaded'
  return 'flattened'
}

export interface PorterOptions {
  points: number
  capacity: number
  t: number // seconds since mount
  celebrate?: boolean
  seed?: number // per-porter phase offset so a team doesn't move in lockstep
  ground?: boolean // grass under the porter (default true); the extension strip
  // draws its own continuous grass instead, so patches don't travel with sprites
}

// material ramps: [dark, mid, light, lighter]
const SKIN = ['#8a5232', '#c98a58', '#eeb27f', '#ffd4a3']
const INDIGO = ['#161e38', '#28395f', '#3a538a', '#5674ad']
const CLOTH = ['#8a8577', '#c9c2b0', '#efe9d8', '#fffdf4']
const STRAW = ['#6b4a1f', '#a3742f', '#caa04a', '#e6c878']
const WOOD = ['#3f2a14', '#6b4726', '#93643a', '#b98a52']
const HAIR = ['#12100f', '#26211d', '#3a322b', '#4d4238']
const KYAHAN = ['#7d7666', '#aaa38e', '#cdc6ad', '#e5deca']

const RED = '#c4383a'
const RED_LT = '#e05a50'
const SWEAT = '#6cc4e8'
const SWEAT_LT = '#b9e9fb'
const STAR = '#ffd75e'
const DUST = '#b9ab98'
const NOTE = '#b79be0'
const KETTLE = ['#2e2e36', '#4a4a55', '#6a6a78']
const SHADOW = 'rgba(10,6,16,0.32)'
const CONFETTI = ['#e05a50', '#ffd75e', '#6cc4e8', '#8fd074', '#b79be0']

interface CrateRamp {
  d: string
  m: string
  l: string
}
const CRATES: CrateRamp[] = [
  { d: '#6e4a1e', m: '#b07f3d', l: '#d8a75c' }, // wooden crate
  { d: '#38512f', m: '#5c7f4a', l: '#7fa267' }, // green bundle
  { d: '#6e2f2c', m: '#a04f45', l: '#c26f5d' }, // red cloth pack
  { d: '#77704f', m: '#aca377', l: '#cdc49a' }, // rice sack
]

class Px {
  constructor(private ctx: CanvasRenderingContext2D) {}
  r(x: number, y: number, w: number, h: number, c: string) {
    this.ctx.fillStyle = c
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  }
  p(x: number, y: number, c: string) {
    this.r(x, y, 1, 1, c)
  }
  // thick pixel line (limb segments)
  seg(x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let i = 0; i <= n; i++) {
      this.r(x0 + ((x1 - x0) * i) / n - (w - 1) / 2, y0 + ((y1 - y0) * i) / n - (w - 1) / 2, w, w, c)
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let yy = -ry; yy <= ry; yy++) {
      const xr = rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2))
      this.r(cx - xr, cy + yy, xr * 2, 1, c)
    }
  }
}

export function cratesFor(points: number, capacity: number): number {
  if (points <= 0) return 0
  const perCrate = Math.max(1, Math.round(capacity / 6))
  return Math.min(11, Math.ceil(points / perCrate))
}

export function drawPorter(ctx: CanvasRenderingContext2D, o: PorterOptions): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  const p = new Px(ctx)
  const t = o.t + (o.seed ?? 0) * 1.37
  const r = o.capacity > 0 ? o.points / o.capacity : 0
  const n = cratesFor(o.points, o.capacity)
  const state: PorterState = o.celebrate ? 'celebrate' : porterState(o.points, o.capacity)

  if (o.ground !== false) drawGrass(p, t)

  if (state === 'flattened') return drawFlattened(p, t, n)
  if (state === 'celebrate') return drawCelebrate(p, t)
  drawStanding(p, t, r, n, state)
}

// ---------------------------------------------------------------- ground

const GRASS = { soil: '#3c5a33', base: '#4e7a3a', blade: '#5d9948', bladeLt: '#7fb35e', tip: '#a4d47c' }

function drawGrass(p: Px, t: number) {
  p.r(0, G + 2, LOGICAL_W, 3, GRASS.soil)
  p.r(0, G + 2, LOGICAL_W, 1, GRASS.base)
  for (let x = 0; x < LOGICAL_W; x += 3) {
    const h = 2 + ((x * 7) % 3)
    const sway = Math.round(Math.sin(x * 0.35 + t * 2.4))
    p.r(x, G + 2 - h, 1, h, x % 6 === 0 ? GRASS.bladeLt : GRASS.blade)
    p.p(x + sway, G + 1 - h, GRASS.tip)
  }
}

// ---------------------------------------------------------------- crates

function crate(p: Px, x: number, y: number, w: number, h: number, v: CrateRamp, plank: boolean) {
  p.r(x, y, w, h, v.m)
  p.r(x, y, w, 1, v.l) // top light
  p.r(x, y + 1, 2, h - 1, v.l) // left light
  p.r(x + w - 2, y, 2, h, v.d) // right shade
  p.r(x, y + h - 2, w, 2, v.d) // bottom shade
  p.p(x + 1, y + 1, CLOTH[3]) // glint
  if (plank) p.r(x + 3, y + Math.floor(h / 2), w - 6, 1, v.d)
  // lashing ropes
  p.r(x + 6, y, 2, h, STRAW[0])
  p.p(x + 6, y + 1, STRAW[1])
  p.r(x + w - 9, y, 2, h, STRAW[0])
  p.p(x + w - 9, y + 1, STRAW[1])
}

function kettle(p: Px, x: number, y: number, t: number) {
  p.r(x, y, 9, 5, KETTLE[1])
  p.r(x, y, 9, 1, KETTLE[2])
  p.r(x, y + 4, 9, 1, KETTLE[0])
  p.r(x + 9, y + 1, 2, 2, KETTLE[1]) // spout
  p.r(x + 2, y - 2, 5, 1, KETTLE[0]) // handle
  p.p(x + 1, y - 1, KETTLE[0])
  p.p(x + 7, y - 1, KETTLE[0])
  const u = (t * 0.9) % 1.6
  if (u < 1) {
    p.p(x + 10, y - 1 - u * 5, CLOTH[3])
    if (u > 0.4) p.p(x + 11, y - 4 - u * 4, CLOTH[2])
  }
}

// ---------------------------------------------------------------- standing

function drawStanding(p: Px, t: number, r: number, n: number, state: PorterState) {
  const hipX = 74
  const walking = state !== 'idle'
  const spd = walking ? Math.max(0.55, 1.6 - Math.min(r, 1.5) * 0.75) : 0
  const phase = t * spd * Math.PI * 2
  const strideAmp = walking ? 7 * (1 - 0.35 * Math.min(r, 1.2)) : 0
  const tremble = r > 1 ? Math.round(Math.sin(t * 28)) : 0

  // stumble event: overloaded porters periodically pitch forward and catch it
  let su = 0
  if (state === 'overloaded') {
    const u = t % 5.5
    if (u < 0.7) su = Math.sin((Math.PI * u) / 0.7)
  }

  const lean = Math.min(r, 1.6) * 10 + su * 10
  const bend = Math.min(Math.max(r - 0.4, 0), 1) * 5 + su * 4
  const bob = walking ? -Math.abs(Math.cos(phase)) * 2 : Math.sin(t * 1.6) > 0 ? -1 : 0
  const panting = r > 0.66 ? Math.sin(t * 7) : 0

  const hipY = G - 22 + bend + bob
  const shoulderY = hipY - 18 + panting
  const s1 = Math.round(lean * 0.35) + tremble
  const s2 = Math.round(lean * 0.7) + tremble

  // shadow
  p.ellipse(hipX - 4, G + 2, 24 + n * 1.4, 2, SHADOW)

  // --- cargo stack + frame (behind everything)
  const railX = hipX - 8 + s1 - 4
  const platY = hipY - 14
  if (n > 0) {
    const stackX = railX - 25
    const tiltPer = lean * 0.18 + su * 2.2
    let topX = stackX
    let topY = platY
    for (let i = 0; i < n; i++) {
      const sway = Math.sin(t * (1 + r) + i * 0.65) * Math.min(i * 0.3, 2) * (r > 0.9 ? 1.4 : 0.7)
      const jig = ((i * 7) % 3) - 1
      const cx = stackX + jig + Math.round(tiltPer * i + sway) + (r > 1 ? tremble : 0)
      const cy = platY - 11 * (i + 1)
      crate(p, cx, cy, 26, 11, CRATES[i % CRATES.length], i % CRATES.length === 0)
      topX = cx
      topY = cy
    }
    if (n >= 4) kettle(p, topX + 8, topY - 6, t)
    // platform + rail
    p.r(railX - 24, platY, 27, 3, WOOD[2])
    p.r(railX - 24, platY, 27, 1, WOOD[3])
    p.r(railX - 24, platY + 2, 27, 1, WOOD[0])
    p.r(railX, shoulderY - 6, 3, hipY - shoulderY + 2, WOOD[1])
    p.p(railX, shoulderY - 6, WOOD[3])
    p.r(railX - 2, shoulderY - 6, 5, 2, WOOD[2])
  }

  // --- legs (far first, darker)
  for (const k of [1, 0]) {
    const ph = phase + k * Math.PI
    const fx = walking ? hipX + Math.sin(ph) * strideAmp : hipX + (k === 0 ? 4 : -4)
    const lift = walking ? Math.max(0, Math.cos(ph)) * 3.5 : 0
    const fy = G - lift
    const kx = (hipX + fx) / 2 + 3 - bend * 0.3 + (k === 1 ? -2 : 0)
    const ky = hipY + 11
    const pants = k === 1 ? INDIGO[0] : INDIGO[1]
    const wrap = k === 1 ? KYAHAN[0] : KYAHAN[1]
    const wrapLt = k === 1 ? KYAHAN[1] : KYAHAN[2]
    p.seg(hipX + (k === 1 ? -3 : 0), hipY, kx, ky, 5, pants)
    p.seg(kx, ky, fx, fy - 2, 4, wrap)
    p.p(kx + 1, ky + 3, wrapLt) // wrap highlight
    p.r(fx - 4, fy - 2, 9, 2, k === 1 ? STRAW[1] : STRAW[2]) // waraji sandal
    p.p(fx + 2, fy - 3, STRAW[0]) // toe strap
  }

  // --- far arm hint (behind torso, gripping strap)
  p.seg(hipX - 6 + s2, shoulderY + 2, hipX - 8 + s2, shoulderY + 9, 4, INDIGO[0])

  // --- torso: hips flare, waist + obi, chest — sheared forward by lean
  p.r(hipX - 9, hipY - 7, 18, 8, INDIGO[1])
  p.r(hipX - 9, hipY - 7, 2, 8, INDIGO[2])
  p.r(hipX + 7, hipY - 7, 2, 8, INDIGO[0])
  p.r(hipX - 8 + s1, hipY - 12, 16, 5, INDIGO[1])
  p.r(hipX - 8 + s2, shoulderY, 16, hipY - 12 - shoulderY, INDIGO[1])
  p.r(hipX - 8 + s2, shoulderY, 2, hipY - 12 - shoulderY, INDIGO[2]) // back-lit edge
  p.r(hipX + 6 + s2, shoulderY, 2, hipY - 12 - shoulderY, INDIGO[0]) // front shade
  // sashiko stitch dots
  for (let yy = shoulderY + 3; yy < hipY - 13; yy += 4) {
    p.p(hipX - 4 + s2 + (yy % 8 > 4 ? 2 : 0), yy, INDIGO[3])
  }
  // obi rope belt
  p.r(hipX - 8 + s1, hipY - 10, 16, 3, STRAW[1])
  p.r(hipX - 8 + s1, hipY - 10, 16, 1, STRAW[2])
  p.p(hipX + 5 + s1, hipY - 9, STRAW[0]) // knot
  // white collar along the front edge
  p.r(hipX + 5 + s2, shoulderY, 2, 7, CLOTH[2])
  p.p(hipX + 5 + s2, shoulderY, CLOTH[3])
  // shoulder strap of the shoiko
  if (n > 0) {
    p.seg(hipX - 2 + s2, shoulderY - 1, hipX + 2 + s2, hipY - 11, 3, STRAW[0])
    p.p(hipX + s2, shoulderY + 4, STRAW[1])
  }

  // --- near leg drawn above torso hips? no — near arm next
  const shx = hipX + 4 + s2
  if (r > 0.5) {
    // near arm braced on a walking stick
    const gx = hipX + 15 + s2
    const gy = hipY - 8
    p.seg(shx, shoulderY + 1, shx + 5, shoulderY + 8, 4, INDIGO[2])
    p.seg(shx + 5, shoulderY + 8, gx, gy, 4, INDIGO[2])
    const tip = gx + 6 + Math.round(Math.sin(phase) * 2)
    p.seg(gx + 2, gy - 7, tip, G, 2, WOOD[2])
    p.p(gx + 2, gy - 8, WOOD[3]) // knob
    p.r(gx, gy - 2, 4, 4, SKIN[2]) // fist on stick
    p.p(gx, gy - 2, SKIN[3])
  } else if (n > 0) {
    // gripping the shoulder strap
    p.seg(shx, shoulderY + 1, shx + 3, shoulderY + 8, 4, INDIGO[2])
    p.r(shx + 1, shoulderY + 6, 4, 4, SKIN[2])
    p.p(shx + 1, shoulderY + 6, SKIN[3])
  } else {
    // idle: hanging arm, with an occasional brow wipe
    const wipeU = t % 7
    if (wipeU < 1) {
      const reach = Math.sin(Math.PI * Math.min(wipeU, 1))
      const hx2 = shx + 6 - reach * 2
      const hy2 = shoulderY + 8 - reach * 16
      p.seg(shx, shoulderY + 1, shx + 5, shoulderY + 7, 4, INDIGO[2])
      p.seg(shx + 5, shoulderY + 7, hx2, hy2, 3, SKIN[2])
      p.r(hx2 - 2, hy2 - 3, 6, 4, CLOTH[2]) // towel
      p.p(hx2 - 2, hy2 - 3, CLOTH[3])
    } else {
      const sw = Math.sin(t * 1.6) * 1.5
      p.seg(shx, shoulderY + 1, shx + 1 + sw, shoulderY + 13, 4, INDIGO[2])
      p.r(shx + sw, shoulderY + 12, 3, 3, SKIN[2])
    }
  }

  // --- head
  const hx = hipX - 8 + Math.round(lean) + tremble
  const hy = shoulderY - 15 + Math.round(lean * 0.35)
  drawHead(p, hx, hy, t, r, su, state)

  // --- effects
  if (r > 0.55) {
    const fall = (t * 16) % 10
    p.p(hx + 18, hy + 3 + fall, SWEAT_LT)
    p.p(hx + 18, hy + 4 + fall, SWEAT)
    if (r > 0.9) {
      const fall2 = (t * 16 + 5) % 10
      p.p(hx - 2, hy + 2 + fall2, SWEAT)
    }
  }
  if (su > 0.5) {
    // sweat spray on the near-fall
    p.p(hx + 20, hy - 2, SWEAT_LT)
    p.p(hx + 22, hy + 2, SWEAT)
    p.p(hx - 4, hy - 1, SWEAT)
    // scuffed dust at the feet
    p.r(hipX + 8, G - 2, 3, 2, DUST)
    p.p(hipX + 12, G - 4, DUST)
  }
  if (state === 'light') {
    const u = t % 4.2
    if (u < 1.2) {
      const nx = hx + 21
      const ny = hy - 9 - u * 2
      p.r(nx, ny, 1, 5, NOTE)
      p.r(nx - 2, ny + 4, 2, 2, NOTE)
      p.p(nx + 1, ny, NOTE)
    }
  }
  if (r > 0.9) {
    bang(p, hx + 21, hy - 16)
    if (r > 1.2 || su > 0.3) bang(p, hx + 26, hy - 14)
  }
}

function bang(p: Px, x: number, y: number) {
  p.r(x, y, 3, 6, RED)
  p.r(x, y, 1, 6, RED_LT)
  p.r(x, y + 8, 3, 3, RED)
}

function drawHead(p: Px, hx: number, hy: number, t: number, r: number, su: number, state: PorterState) {
  // skull + skin shading
  p.r(hx, hy, 17, 14, SKIN[2])
  p.r(hx + 1, hy + 1, 6, 3, SKIN[3]) // top-left light
  p.r(hx, hy + 13, 17, 1, SKIN[0]) // jaw shade
  p.r(hx + 15, hy + 2, 2, 12, SKIN[1]) // front shade
  // hair
  p.r(hx, hy, 17, 3, HAIR[1])
  p.r(hx + 2, hy, 8, 1, HAIR[2])
  p.r(hx, hy, 5, 9, HAIR[1])
  p.p(hx + 4, hy + 8, HAIR[0])
  p.p(hx + 5, hy + 3, HAIR[0])
  // hachimaki headband + knot + fluttering tails
  p.r(hx + 3, hy + 4, 14, 2, CLOTH[2])
  p.r(hx + 3, hy + 4, 14, 1, CLOTH[3])
  p.r(hx - 3, hy + 4, 3, 3, RED)
  p.p(hx - 3, hy + 4, RED_LT)
  const fl = Math.sin(t * 6) > 0 ? 1 : 0
  p.r(hx - 6, hy + 6 + fl, 3, 1, RED)
  p.r(hx - 7, hy + 8 - fl, 3, 1, RED_LT)
  // ear
  p.r(hx + 6, hy + 8, 3, 4, SKIN[1])
  p.p(hx + 7, hy + 9, SKIN[0])
  // eye + brow
  const ex = hx + 11
  const ey = hy + 7
  const blink = t % 3.7 < 0.12
  if (blink) {
    p.r(ex, ey + 1, 3, 1, SKIN[0])
  } else {
    p.r(ex, ey, 3, 2, CLOTH[3])
    p.r(ex + 2, ey, 1, 2, HAIR[0]) // pupil forward
  }
  if (r > 0.66 || su > 0) {
    p.p(ex - 1, ey - 2, HAIR[0]) // strained brow, angled down-forward
    p.p(ex, ey - 2, HAIR[0])
    p.p(ex + 1, ey - 1, HAIR[0])
    p.r(hx + 9, ey + 4, 2, 1, RED_LT) // strain blush
  } else {
    p.r(ex - 1, ey - 2, 4, 1, HAIR[1])
  }
  // nose
  p.p(hx + 15, hy + 9, SKIN[0])
  // mouth by state
  const mx = hx + 12
  const my = hy + 11
  if (state === 'idle' || state === 'light') {
    p.p(mx, my + 1, SKIN[0])
    p.p(mx + 1, my, SKIN[0])
    p.p(mx + 2, my, SKIN[0])
  } else if (state === 'steady') {
    p.r(mx, my, 3, 1, SKIN[0])
  } else if (state === 'heavy') {
    p.r(mx - 1, my, 4, 2, HAIR[0]) // clenched grimace
    p.r(mx, my, 2, 1, CLOTH[2]) // teeth
  } else {
    p.r(mx - 1, my - 1, 4, 3, HAIR[0]) // open gasp
    p.p(mx, my + 1, RED) // tongue
  }
}

// --------------------------------------------------------------- flattened

function drawFlattened(p: Px, t: number, n: number) {
  p.ellipse(66, G + 2, 46, 2, SHADOW)

  // legs poking out to the left, feeble kick
  const kick = Math.sin(t * 3) > 0.6 ? 3 : 0
  p.seg(30, G - 3, 45, G - 3, 4, KYAHAN[1])
  p.r(25, G - 4, 5, 3, STRAW[2])
  p.seg(33, G - 8 - kick, 47, G - 6, 4, KYAHAN[0])
  p.r(28, G - 9 - kick, 5, 3, STRAW[1])

  // flattened torso
  p.r(44, G - 9, 30, 9, INDIGO[1])
  p.r(44, G - 9, 30, 1, INDIGO[2])
  p.r(44, G - 2, 30, 2, INDIGO[0])
  p.r(58, G - 9, 3, 9, STRAW[1]) // obi
  p.p(59, G - 8, STRAW[2])

  // arm reaching forward, hand weakly tapping
  const tap = Math.sin(t * 2.5) > 0.5 ? 1 : 0
  p.seg(76, G - 4, 98, G - 3, 3, INDIGO[2])
  p.r(98, G - 5 - tap, 5, 4, SKIN[2])
  p.p(98, G - 5 - tap, SKIN[3])

  // head sideways, cheek on the ground
  const hx = 72
  const hy = G - 13
  p.r(hx, hy, 16, 13, SKIN[2])
  p.r(hx + 1, hy + 1, 5, 3, SKIN[3])
  p.r(hx, hy + 12, 16, 1, SKIN[0])
  p.r(hx, hy, 16, 3, HAIR[1])
  p.r(hx, hy, 4, 8, HAIR[1])
  p.r(hx + 3, hy + 4, 12, 2, CLOTH[2])
  p.p(hx - 1, hy + 5, RED)
  p.p(hx - 2, hy + 7, RED_LT)
  // ×_× eye
  p.p(hx + 9, hy + 7, HAIR[0])
  p.p(hx + 11, hy + 9, HAIR[0])
  p.p(hx + 11, hy + 7, HAIR[0])
  p.p(hx + 9, hy + 9, HAIR[0])
  // open mouth + tongue
  p.r(hx + 12, hy + 11, 3, 2, HAIR[0])
  p.p(hx + 13, hy + 12, RED)

  // the mound: rows of crates crushing the torso
  const rows = [4, 3, 2, 1]
  let left = Math.max(n, 7)
  for (let j = 0; j < rows.length && left > 0; j++) {
    const count = Math.min(rows[j], left)
    left -= count
    const y = G - 11 - 11 * (j + 1)
    const start = 24 + j * 9 + ((j * 5) % 3)
    for (let k = 0; k < count; k++) {
      crate(p, start + k * 23 + ((k + j) % 2), y, 24, 11, CRATES[(j * 3 + k) % CRATES.length], (j + k) % 4 === 0)
    }
  }
  // one crate tumbled off to the right (drawn as a sheared box)
  for (let row = 0; row < 10; row++) {
    p.r(106 + Math.round(row * 0.5), G - 10 + row, 20 - row, 1, row < 2 ? CRATES[0].l : row > 7 ? CRATES[0].d : CRATES[0].m)
  }
  // fallen kettle + steam
  kettle(p, 112, G - 16, t + 0.5)

  // dizzy stars orbiting the head
  for (let k = 0; k < 3; k++) {
    const a = t * 2.5 + (k * Math.PI * 2) / 3
    const sx = Math.round(88 + Math.cos(a) * 13)
    const sy = Math.round(G - 22 + Math.sin(a) * 5)
    p.p(sx, sy, STAR)
    p.p(sx + 1, sy, STAR)
    p.p(sx - 1, sy, STAR)
    p.p(sx, sy + 1, STAR)
    p.p(sx, sy - 1, STAR)
  }
  // dust + sweat
  if (t % 1.2 < 0.5) {
    p.r(18, G - 10, 3, 3, DUST)
    p.p(16, G - 13, DUST)
    p.r(102, G - 7, 3, 2, DUST)
  }
  p.p(hx + 19, hy - 2 + ((t * 12) % 6), SWEAT)
}

// --------------------------------------------------------------- celebrate

function drawCelebrate(p: Px, t: number) {
  const hipX = 72
  const jump = Math.abs(Math.sin(t * 5)) * 8
  const hipY = G - 26 - jump
  const shoulderY = hipY - 18

  p.ellipse(hipX, G + 2, 20 - jump, 2, SHADOW)

  // tucked legs mid-jump
  for (const k of [1, 0]) {
    const ox = k === 1 ? -5 : 3
    const pants = k === 1 ? INDIGO[0] : INDIGO[1]
    const wrap = k === 1 ? KYAHAN[0] : KYAHAN[1]
    p.seg(hipX + ox, hipY, hipX + ox + 4, hipY + 9, 5, pants)
    p.seg(hipX + ox + 4, hipY + 9, hipX + ox + 1, hipY + 15 - jump * 0.3, 4, wrap)
    p.r(hipX + ox - 2, hipY + 14 - jump * 0.3, 8, 2, STRAW[2])
  }

  // torso
  p.r(hipX - 9, hipY - 7, 18, 8, INDIGO[1])
  p.r(hipX - 8, shoulderY, 16, hipY - 7 - shoulderY, INDIGO[1])
  p.r(hipX - 8, shoulderY, 2, 18, INDIGO[2])
  p.r(hipX + 6, shoulderY, 2, 18, INDIGO[0])
  p.r(hipX - 8, hipY - 10, 16, 3, STRAW[1])
  p.r(hipX + 5, shoulderY, 2, 7, CLOTH[2])

  // both arms thrown up
  p.seg(hipX - 6, shoulderY + 2, hipX - 13, shoulderY - 9, 4, INDIGO[2])
  p.seg(hipX + 6, shoulderY + 2, hipX + 13, shoulderY - 9, 4, INDIGO[2])
  p.r(hipX - 15, shoulderY - 13, 5, 5, SKIN[2])
  p.r(hipX + 11, shoulderY - 13, 5, 5, SKIN[2])
  p.p(hipX - 15, shoulderY - 13, SKIN[3])
  p.p(hipX + 11, shoulderY - 13, SKIN[3])

  // head with victory face
  const hx = hipX - 8
  const hy = shoulderY - 15
  p.r(hx, hy, 17, 14, SKIN[2])
  p.r(hx + 1, hy + 1, 6, 3, SKIN[3])
  p.r(hx, hy + 13, 17, 1, SKIN[0])
  p.r(hx, hy, 17, 3, HAIR[1])
  p.r(hx, hy, 5, 8, HAIR[1])
  p.r(hx + 3, hy + 4, 14, 2, CLOTH[2])
  p.r(hx - 3, hy + 4, 3, 3, RED)
  // tails flying upward
  p.r(hx - 6, hy + 1, 3, 1, RED)
  p.r(hx - 8, hy - 1, 3, 1, RED_LT)
  // ^ ^ happy closed eyes
  p.p(hx + 7, hy + 8, HAIR[0])
  p.p(hx + 8, hy + 7, HAIR[0])
  p.p(hx + 9, hy + 8, HAIR[0])
  p.p(hx + 12, hy + 8, HAIR[0])
  p.p(hx + 13, hy + 7, HAIR[0])
  p.p(hx + 14, hy + 8, HAIR[0])
  // grin
  p.r(hx + 9, hy + 11, 5, 2, HAIR[0])
  p.r(hx + 10, hy + 11, 3, 1, CLOTH[3])

  // confetti
  for (let i = 0; i < 10; i++) {
    const cx = 14 + i * 12 + ((i * 31) % 7)
    const cy = (i * 23 + t * 34) % 150
    p.r(cx, 20 + cy, 2, 2, CONFETTI[i % CONFETTI.length])
  }
}
