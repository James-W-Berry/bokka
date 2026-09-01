// Bokka content script: a strip of pixel porters walking along the bottom of
// the window while you work the sprint board. Pointer events pass straight
// through to the page — only the small Bokka pill is interactive.

import {
  drawPorter,
  drawGrassBand,
  porterState,
  GRASS_BAND_H,
  LOGICAL_W,
  LOGICAL_H,
  STATE_LABEL,
} from '../src/porter/porter.ts'
import { syncRepo, type MemberLoad } from '../src/github.ts'
import { logoElement } from '../src/porter/logo.ts'
import { scrapeBoard, collectBoardDiagnostics, maybeRefreshLive } from './board.ts'
import { loadSettings, saveSettings, onSettingsChanged, openOptions, type Settings } from './settings.ts'

const SCALE = 0.62
const SPRITE_W = Math.round(LOGICAL_W * SCALE)
const SPRITE_H = Math.round(LOGICAL_H * SCALE)
const POLL_MS = 60_000
const MIN_SYNC_GAP_MS = 10_000

interface Sprite {
  member: MemberLoad
  el: HTMLDivElement
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  label: HTMLDivElement
  x: number
  dir: 1 | -1
  seed: number
  celebrateUntil: number
}

let settings: Settings
let sprites = new Map<string, Sprite>()
let lastMembers = new Map<string, MemberLoad>()
let strip: HTMLDivElement
let pill: HTMLButtonElement
let pillText: HTMLSpanElement
let grass: HTMLCanvasElement
let lastSyncAt = 0

function setPill(text: string, err = false): void {
  pillText.textContent = text
  pill.classList.toggle('err', err)
}
let syncing = false
let source: 'board' | 'api' | 'none' = 'none'
let lastRepo = ''

// first URL segments that can never be a repo owner
const RESERVED = new Set([
  'orgs', 'users', 'settings', 'marketplace', 'explore', 'topics', 'trending',
  'sponsors', 'notifications', 'issues', 'pulls', 'codespaces', 'search',
  'organizations', 'apps', 'login', 'features', 'about', 'pricing',
  'collections', 'events', 'new', 'dashboard', 'account',
])

function inferRepo(): string {
  const m = location.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/)
  if (m && !RESERVED.has(m[1].toLowerCase())) return `${m[1]}/${m[2]}`
  return ''
}

function makeUi(): void {
  // an extension reload leaves the previous script's strip behind, frozen
  // (its rAF died with the old context) — remove any stale hosts first
  for (const stale of document.querySelectorAll('#bokka-host')) stale.remove()
  const host = document.createElement('div')
  host.id = 'bokka-host'
  host.style.cssText =
    'all:initial; position:fixed; left:0; right:0; bottom:0; z-index:2147483646; pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = `
    .strip { position: relative; height: ${SPRITE_H + 16}px; pointer-events: none; }
    .strip.hidden { display: none; }
    .grass { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: ${GRASS_BAND_H}px;
             image-rendering: pixelated; pointer-events: none; z-index: 2; }
    .porter { position: absolute; bottom: 0; width: ${SPRITE_W}px; pointer-events: none;
              transition: none; will-change: transform; z-index: 1; }
    .porter canvas { image-rendering: pixelated; width: ${SPRITE_W}px; height: ${SPRITE_H}px; display: block; }
    .tag { position: absolute; top: 0; left: 50%; transform: translateX(-50%);
           font: 700 10px ui-monospace, Menlo, monospace; color: #e8e2d8;
           background: rgba(23,19,31,0.75); border: 1px solid #3b3347;
           padding: 1px 5px; white-space: nowrap; border-radius: 3px; }
    .tag.hot { color: #ff8a7a; border-color: #e04b4b; }
    .pill { position: absolute; right: 10px; bottom: 8px; pointer-events: auto; cursor: pointer;
            font: 700 11px ui-monospace, Menlo, monospace; color: #2a2233;
            background: #f7f2e6; border: 2px solid #2a2233;
            padding: 4px 9px; border-radius: 12px;
            box-shadow: 0 2px 0 rgba(20,14,30,0.35);
            display: inline-flex; align-items: center; gap: 5px; }
    .pill svg { display: block; }
    .pill .pill-text:empty { display: none; }
    .pill:hover { background: #fffdf4; }
    .pill.err { color: #9c2b26; border-color: #c4383a; }
  `
  strip = document.createElement('div')
  strip.className = 'strip'
  grass = document.createElement('canvas')
  grass.className = 'grass'
  strip.appendChild(grass)

  pill = document.createElement('button')
  pill.className = 'pill'
  const icon = document.createElement('span')
  icon.appendChild(logoElement(14))
  pillText = document.createElement('span')
  pillText.className = 'pill-text'
  pill.append(icon, pillText)
  pill.title = 'Bokka — click to show/hide porters, Alt+click for settings'
  const copyDiagnostics = () => {
    const diag = collectBoardDiagnostics()
    console.log('[bokka] board diagnostics:\n' + diag)
    void navigator.clipboard?.writeText(diag).then(
      () => {
        setPill('copied!')
        pill.title =
          'A parse report (logins/points/structure only, no ticket content) was copied to your clipboard — paste it to Claude to fix scraping. Also logged to the console.'
      },
      () => {
        setPill('console')
        pill.title = 'Clipboard blocked — the parse report was logged to the devtools console instead.'
      },
    )
  }

  pill.addEventListener('click', (e) => {
    if (e.altKey) {
      openOptions()
      return
    }
    // Shift+click anywhere: dump what each strategy parsed (for wrong counts)
    if (e.shiftKey) {
      copyDiagnostics()
      return
    }
    if (source === 'none') {
      // on a project page we should have found data — hand the user a
      // structure fingerprint they can report so scraping can be fixed
      if (/\/projects\//.test(location.pathname)) {
        copyDiagnostics()
      } else {
        openOptions()
      }
      return
    }
    settings.hidden = !settings.hidden
    void saveSettings({ hidden: settings.hidden })
    strip.classList.toggle('hidden', settings.hidden)
  })

  shadow.append(style, strip, pill)
  document.documentElement.appendChild(host)
}

function makeSprite(member: MemberLoad, index: number, count: number): Sprite {
  const el = document.createElement('div')
  el.className = 'porter'
  const canvas = document.createElement('canvas')
  canvas.width = LOGICAL_W
  canvas.height = LOGICAL_H
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const label = document.createElement('div')
  label.className = 'tag'
  el.append(canvas, label)
  strip.appendChild(el)
  // spread the troupe evenly — flattened porters never walk, so collisions stick
  const span = Math.max(1, window.innerWidth - SPRITE_W - 12)
  return {
    member,
    el,
    canvas,
    ctx,
    label,
    x: 6 + ((index + 0.5) / Math.max(1, count)) * span,
    dir: index % 2 === 0 ? 1 : -1,
    seed: index,
    celebrateUntil: 0,
  }
}

function applyMembers(members: MemberLoad[]): void {
  const filter = settings.logins
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  let picked = filter.length
    ? members.filter((m) => filter.includes(m.login.toLowerCase()))
    : members
  picked = picked.slice(0, Math.max(1, settings.maxPorters))

  const keep = new Set(picked.map((m) => m.login))
  for (const [login, s] of sprites) {
    if (!keep.has(login)) {
      s.el.remove()
      sprites.delete(login)
    }
  }
  picked.forEach((m, i) => {
    let s = sprites.get(m.login)
    if (!s) {
      s = makeSprite(m, i, picked.length)
      sprites.set(m.login, s)
    } else {
      const prev = lastMembers.get(m.login)
      if (prev && m.openPoints < prev.openPoints && m.deliveredPoints > prev.deliveredPoints) {
        s.celebrateUntil = performance.now() + 3000
      }
      s.member = m
    }
    const st = porterState(m.openPoints, settings.capacity)
    s.label.textContent = `${m.login} ${m.openPoints}/${settings.capacity}`
    s.label.title = STATE_LABEL[st]
    s.label.classList.toggle('hot', m.openPoints > settings.capacity)
  })
  lastMembers = new Map(members.map((m) => [m.login, m]))

  const total = picked.reduce((sum, m) => sum + m.openPoints, 0)
  setPill(`${total}pt`)
}

async function sync(repo: string, force = false): Promise<void> {
  if (!repo || syncing) return
  const gap = force ? MIN_SYNC_GAP_MS : POLL_MS
  if (repo === lastRepo && Date.now() - lastSyncAt < gap) return
  syncing = true
  try {
    const result = await syncRepo(
      { repo, token: settings.token || undefined },
      settings.defaultPointsPerIssue,
      settings.sprintDays,
    )
    lastSyncAt = Date.now()
    lastRepo = repo
    applyMembers(result.members)
    pill.title = `Bokka — watching ${repo} via the GitHub API. Click to hide/show, Alt+click for settings`
  } catch (e) {
    setPill('!', true)
    const msg = e instanceof Error ? e.message : String(e)
    pill.title = /404|403/.test(msg)
      ? `${msg} — private repo? Add a token via Alt+click`
      : msg
  } finally {
    syncing = false
  }
}

// decide where load data comes from on this page, cheapest source first
function evaluate(apiForce = false): void {
  // islands reflect page-load state only — keep them fresh via the project's
  // own internal API (throttled inside; re-evaluates when data changed)
  maybeRefreshLive(() => evaluate())
  const scraped = scrapeBoard(settings.defaultPointsPerIssue)
  if (scraped) {
    source = 'board'
    applyMembers(scraped)
    pill.title = 'Bokka — reading this board live, no setup needed. Click to hide/show, Alt+click for settings'
    return
  }
  const repo = inferRepo() || settings.repo
  if (repo) {
    source = 'api'
    void sync(repo, apiForce || repo !== lastRepo)
    return
  }
  source = 'none'
  if (sprites.size === 0) {
    if (/\/projects\//.test(location.pathname)) {
      setPill('?')
      pill.title =
        "Bokka couldn't read this project layout yet — click to copy a structure fingerprint for debugging. Alt+click for settings."
    } else {
      setPill('')
      pill.title = 'Bokka — open a repo or project board and porters appear. Alt+click for settings'
    }
  }
}

function walkSpeed(member: MemberLoad): number {
  const r = member.openPoints / settings.capacity
  if (member.openPoints <= 0) return 0 // resting porters stand still
  const st = porterState(member.openPoints, settings.capacity)
  if (st === 'flattened') return 0
  return Math.max(9, 42 - r * 22) // px/sec — heavier porters trudge
}

// full-width wind-blown grass the porters walk through — one continuous
// strip, so it doesn't travel with the sprites
function drawGrassStrip(t: number): void {
  const ctx = grass.getContext('2d')
  if (!ctx) return
  // one logical grass pixel per CSS pixel: the porters are drawn at SCALE, but
  // downsampling the blades to 0.62px drops every other one and turns the band
  // to mush, so the grass keeps the same pixel size it has under a lone porter
  const gw = Math.ceil(window.innerWidth)
  if (grass.width !== gw || grass.height !== GRASS_BAND_H) {
    grass.width = gw
    grass.height = GRASS_BAND_H
  }
  ctx.imageSmoothingEnabled = false
  const gust = Math.sin(t * 0.9) * 0.6 + Math.sin(t * 0.23) * 0.4
  drawGrassBand(ctx, gw, t, gust)
}

function startLoop(): void {
  const start = performance.now()
  let prev = start
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - prev) / 1000)
    prev = now
    const t = (now - start) / 1000
    drawGrassStrip(t)
    const minX = 6
    const maxX = Math.max(minX + 1, window.innerWidth - SPRITE_W - 6)
    for (const s of sprites.values()) {
      const celebrating = s.celebrateUntil > now
      // occasional pause so the troupe doesn't march in unison
      const moving = !celebrating && Math.sin(t * 0.35 + s.seed * 2.7) > -0.6
      if (moving) {
        s.x += s.dir * walkSpeed(s.member) * dt
        if (s.x <= minX) {
          s.x = minX
          s.dir = 1
        } else if (s.x >= maxX) {
          s.x = maxX
          s.dir = -1
        }
      }
      s.el.style.transform = `translateX(${Math.round(s.x)}px)`
      s.canvas.style.transform = s.dir === -1 ? 'scaleX(-1)' : ''
      drawPorter(s.ctx, {
        points: s.member.openPoints,
        capacity: settings.capacity,
        t,
        seed: s.seed,
        celebrate: celebrating,
        ground: false,
      })
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function main(): Promise<void> {
  settings = await loadSettings()
  makeUi()
  strip.classList.toggle('hidden', settings.hidden)
  startLoop()

  // test seam: the harness page can inject canned members to skip the network.
  // Invisible in production — content scripts don't see page globals.
  const fake = (globalThis as { __BOKKA_FAKE_MEMBERS__?: MemberLoad[] }).__BOKKA_FAKE_MEMBERS__
  if (fake) {
    applyMembers(fake)
    return
  }

  evaluate(true)

  // board mutations (dragging cards, editing assignees) → re-read shortly after.
  // Our own strip lives outside document.body, so it never triggers this.
  let debounce: ReturnType<typeof setTimeout> | undefined
  const onChange = (apiForce = false) => {
    clearTimeout(debounce)
    debounce = setTimeout(() => evaluate(apiForce), 800)
  }
  new MutationObserver(() => onChange()).observe(document.body, {
    childList: true,
    subtree: true,
  })
  // adopt new settings (filter, capacity, …) and re-evaluate; storage.onChanged
  // doesn't reliably reach content scripts everywhere, so this is also polled
  const adoptSettings = async () => {
    const s = await loadSettings()
    const changed = JSON.stringify(s) !== JSON.stringify(settings)
    settings = s
    if (changed) {
      strip.classList.toggle('hidden', s.hidden)
      evaluate(true)
    }
    return changed
  }

  // catches soft navigation between repos/boards, API-mode staleness, and
  // settings edited in the options page
  setInterval(() => {
    void adoptSettings().then((changed) => {
      if (!changed) evaluate()
    })
  }, 5000)
  document.addEventListener('pointerup', () => onChange(source === 'api'), true)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void adoptSettings().then((changed) => {
      if (!changed) evaluate()
    })
  })
  onSettingsChanged(() => void adoptSettings())
}

void main()
