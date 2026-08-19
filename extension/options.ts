import { drawPorter } from '../src/porter/porter.ts'
import { logoElement } from '../src/porter/logo.ts'
import { loadSettings, saveSettings, type Settings } from './settings.ts'

const fields = ['capacity', 'sprintDays', 'defaultPointsPerIssue', 'maxPorters', 'logins'] as const

const input = (id: string) => document.getElementById(id) as HTMLInputElement

// ---- the valley: a low-res pixel scene behind the form — sunny sky, hazy
// ridges, wind rolling through the grass, and a porter out on a gentle hike

const SKY_TOP: [number, number, number] = [111, 179, 220]
const SKY_HORIZON: [number, number, number] = [227, 240, 216]

function mix(a: [number, number, number], b: [number, number, number], u: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * u))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function startScene(): void {
  document.getElementById('logo')!.appendChild(logoElement(34))
  const scene = document.getElementById('scene') as HTMLCanvasElement | null
  const ctx = scene?.getContext('2d')
  if (!scene || !ctx) return
  const PIX = 3
  let W = 0
  let H = 0
  const resize = () => {
    W = Math.ceil(window.innerWidth / PIX)
    H = Math.ceil(window.innerHeight / PIX)
    scene.width = W
    scene.height = H
    ctx.imageSmoothingEnabled = false
  }
  window.addEventListener('resize', resize)
  resize()

  // offscreen porter sprite, composited into the scene at half size
  const off = document.createElement('canvas')
  off.width = 140
  off.height = 200
  const octx = off.getContext('2d')!
  octx.imageSmoothingEnabled = false

  const clouds = [
    { y: 0.10, w: 26, spd: 2.2, x0: 30 },
    { y: 0.18, w: 34, spd: 1.4, x0: 160 },
    { y: 0.07, w: 20, spd: 3.0, x0: 300 },
    { y: 0.24, w: 28, spd: 1.8, x0: 430 },
  ]

  const ridgeFar = (x: number) => H * 0.40 + 9 * Math.sin(x * 0.020 + 1.2) + 5 * Math.sin(x * 0.051 + 3)
  const ridgeMid = (x: number) => H * 0.55 + 7 * Math.sin(x * 0.031 + 0.4) + 4 * Math.sin(x * 0.077 + 2)

  const start = performance.now()
  const tick = (now: number) => {
    const t = (now - start) / 1000
    // sky bands
    const horizon = Math.round(H * 0.52)
    const BANDS = 12
    for (let i = 0; i < BANDS; i++) {
      const y0 = Math.round((horizon * i) / BANDS)
      const y1 = Math.round((horizon * (i + 1)) / BANDS)
      ctx.fillStyle = mix(SKY_TOP, SKY_HORIZON, i / (BANDS - 1))
      ctx.fillRect(0, y0, W, y1 - y0)
    }
    // sun with rays
    const sx = Math.round(W * 0.80)
    const sy = Math.round(H * 0.14)
    ctx.fillStyle = '#fff3c4'
    ctx.fillRect(sx - 10, sy - 3, 20, 6)
    ctx.fillRect(sx - 3, sy - 10, 6, 20)
    ctx.fillStyle = '#ffd75e'
    ctx.fillRect(sx - 7, sy - 5, 14, 10)
    ctx.fillRect(sx - 5, sy - 7, 10, 14)
    ctx.fillStyle = '#fff3c4'
    ctx.fillRect(sx - 4, sy - 4, 4, 3)
    // clouds
    for (const c of clouds) {
      const cx = Math.round(((c.x0 + t * c.spd) % (W + 90)) - 45)
      const cy = Math.round(H * c.y)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(cx, cy, c.w, 4)
      ctx.fillRect(cx + 4, cy - 3, c.w - 10, 3)
      ctx.fillStyle = '#e4efe9'
      ctx.fillRect(cx + 2, cy + 4, c.w - 4, 2)
    }
    // ridges
    for (let x = 0; x < W; x++) {
      const yF = Math.round(ridgeFar(x))
      ctx.fillStyle = '#9db8cf'
      ctx.fillRect(x, yF, 1, Math.round(H * 0.62) - yF)
      if (yF < H * 0.40 - 6) {
        ctx.fillStyle = '#f2f7fa'
        ctx.fillRect(x, yF, 1, 2)
      }
      const yM = Math.round(ridgeMid(x))
      ctx.fillStyle = '#6f9e7a'
      ctx.fillRect(x, yM, 1, Math.round(H * 0.78) - yM)
      ctx.fillStyle = '#87b28c'
      ctx.fillRect(x, yM, 1, 1)
    }
    // valley floor
    const floorY = Math.round(H * 0.74)
    ctx.fillStyle = '#7fb35e'
    ctx.fillRect(0, floorY, W, H - floorY)
    ctx.fillStyle = '#8fc06a'
    ctx.fillRect(0, floorY, W, 2)
    // wind
    const gust = Math.sin(t * 0.9) * 0.6 + Math.sin(t * 0.23) * 0.4
    // flowers + mid-field tufts (behind the porter)
    for (let k = 0; k < 16; k++) {
      const fx = (k * 53 + 17) % W
      const fy = H - 10 - ((k * 29) % Math.max(6, H - 12 - floorY))
      const sway = Math.round(Math.sin(fx * 0.25 + t * 2.2 + gust) + gust)
      ctx.fillStyle = '#5d9948'
      ctx.fillRect(fx, fy, 1, 3)
      ctx.fillStyle = ['#c4383a', '#fffdf4', '#ffd75e'][k % 3]
      ctx.fillRect(fx + sway - 1, fy - 2, 2, 2)
    }
    // the porter, hiking with a light load — starts mid-valley, not off-screen
    const span = W + 90
    const px = ((t * 9 + W * 0.45) % span) - 45
    drawPorter(octx, { points: 7, capacity: 24, t, seed: 2, ground: false })
    ctx.drawImage(off, 0, 0, 140, 200, Math.round(px), H - 6 - 66, 46, 66)
    // foreground grass blades (in front of the porter)
    for (let x = 0; x < W; x += 2) {
      const h = 3 + ((x * 7) % 4)
      const offTip = Math.round((Math.sin(x * 0.22 + t * 2.6) + gust) * 2)
      ctx.fillStyle = x % 4 === 0 ? '#5d9948' : '#a4d47c'
      ctx.fillRect(x, H - h, 1, h)
      ctx.fillRect(x + Math.round(offTip / 2), H - h - 1, 1, 2)
      ctx.fillRect(x + offTip, H - h - 2, 1, 2)
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function init(): Promise<void> {
  const s = await loadSettings()
  for (const f of fields) input(f).value = String(s[f])
  startScene()
  document.getElementById('save')!.addEventListener('click', async () => {
    const patch: Partial<Settings> = {
      logins: input('logins').value.trim(),
      capacity: Math.max(1, Number(input('capacity').value) || 24),
      sprintDays: Math.max(1, Number(input('sprintDays').value) || 14),
      defaultPointsPerIssue: Math.max(1, Number(input('defaultPointsPerIssue').value) || 3),
      maxPorters: Math.min(20, Math.max(1, Number(input('maxPorters').value) || 10)),
    }
    await saveSettings(patch)
    const status = document.getElementById('status')!
    status.textContent = 'saved ✓'
    setTimeout(() => (status.textContent = ''), 2000)
  })
}

void init()
