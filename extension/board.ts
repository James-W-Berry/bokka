// Zero-setup sources for the GitHub Projects page the user is looking at.
// Two strategies, both attempted every pass:
//   1. Board-view DOM (live — reacts as cards are dragged)
//   2. Embedded JSON data islands (memex initial payload — covers table/roadmap
//      views and virtualized boards, but reflects page-load state)
// The one with better explicit-estimate coverage wins. Neither needs a token.
// GitHub's markup isn't a public API, so everything is defensive, and every
// pass records a per-card parse report retrievable via collectBoardDiagnostics
// (Shift+click on the pill) to debug against a real board.

import { pointsFromLabels, type MemberLoad } from '../src/github.ts'

const DONE_RE = /\b(done|closed|completed?|shipped|finished|delivered)\b/i
const ESTIMATE_COL_RE = /\b(estimate|(story\s*)?points?|size|effort|sp)\b/i
const TSHIRT: Record<string, number> = { xs: 1, s: 2, m: 3, l: 5, xl: 8, xxl: 13 }

const CARD_TEXT_PATTERNS = [
  /\b(?:sp|pts?|points?|estimate|size|effort)\b[\s:/=-]{0,3}(\d{1,3})\b/i,
  /\b(\d{1,3})\s*(?:sp|pts?|points?)\b/i,
]

type PtsSource = 'label' | 'text' | 'aria' | 'field' | 'size' | 'fallback'

interface CardParse {
  logins: string[]
  pts: number
  src: PtsSource
  done: boolean
  col?: string
  type?: string // contentType: Issue | PullRequest | DraftIssue
  fields?: Record<string, string[]> // normalized column name → resolved values
}

export interface ScrapeReport {
  strategy: 'board-dom' | 'islands'
  cards: number
  explicit: number // cards whose points did NOT come from the fallback
  members: MemberLoad[]
  detail: CardParse[]
  totalCount?: number // items the project reports vs. what the payload held
  columns?: string[] // column name:dataType summary, for diagnostics
}

let lastReports: ScrapeReport[] = []

// ---------------------------------------------------------------- shared

function tally(detail: CardParse[]): MemberLoad[] {
  const members = new Map<string, MemberLoad>()
  for (const card of detail) {
    const list = card.logins.length ? card.logins : ['Unassigned']
    const share = card.pts / list.length
    for (const login of list) {
      let m = members.get(login)
      if (!m) {
        m = { login, openPoints: 0, openIssues: 0, deliveredPoints: 0, deliveredIssues: 0 }
        members.set(login, m)
      }
      if (card.done) {
        m.deliveredPoints += share
        m.deliveredIssues += 1
      } else {
        m.openPoints += share
        m.openIssues += 1
      }
    }
  }
  return [...members.values()]
    .map((m) => ({
      ...m,
      openPoints: Math.round(m.openPoints),
      deliveredPoints: Math.round(m.deliveredPoints),
    }))
    .sort((a, b) => b.openPoints - a.openPoints)
}

function report(strategy: ScrapeReport['strategy'], detail: CardParse[]): ScrapeReport {
  return {
    strategy,
    cards: detail.length,
    explicit: detail.filter((d) => d.src !== 'fallback').length,
    members: tally(detail),
    detail,
  }
}

function sizeName(name: string): number | null {
  const trimmed = name.trim().toLowerCase()
  const m = trimmed.match(/(\d{1,3})/)
  if (m) return parseInt(m[1], 10)
  return TSHIRT[trimmed] ?? null
}

// element text with spaces between nodes ("Estimate" + "8" → "Estimate 8",
// not "Estimate8" like textContent gives)
function spacedText(el: Element): string {
  const parts: string[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const t = walker.currentNode.textContent?.trim()
    if (t) parts.push(t)
  }
  return parts.join(' ')
}

function ariaText(el: Element): string {
  const parts: string[] = []
  const own = el.getAttribute('aria-label')
  if (own) parts.push(own)
  for (const child of el.querySelectorAll('[aria-label]')) {
    parts.push(child.getAttribute('aria-label')!)
  }
  return parts.join(' ')
}

// ------------------------------------------------------- 1. board-view DOM

function cardPoints(card: Element, fallback: number): { pts: number; src: PtsSource } {
  const chips = card.querySelectorAll('.IssueLabel, [class*="IssueLabel"], [data-testid*="label" i]')
  const labelTexts = [...chips].map((c) => c.textContent?.trim() ?? '').filter(Boolean)
  const fromLabels = pointsFromLabels(labelTexts, -1)
  if (fromLabels >= 0) return { pts: fromLabels, src: 'label' }
  // aria-labels carry field values ("Estimate: 8") that textContent may not
  const aria = ariaText(card)
  for (const re of CARD_TEXT_PATTERNS) {
    const m = aria.match(re)
    if (m) return { pts: parseInt(m[1], 10), src: 'aria' }
  }
  const text = spacedText(card)
  for (const re of CARD_TEXT_PATTERNS) {
    const m = text.match(re)
    if (m) return { pts: parseInt(m[1], 10), src: 'text' }
  }
  return { pts: fallback, src: 'fallback' }
}

function cardLogins(card: Element): string[] {
  const out = new Set<string>()
  const imgs = card.querySelectorAll<HTMLImageElement>(
    'img[src*="avatars.githubusercontent.com"], img[class*="avatar" i]',
  )
  for (const img of imgs) {
    const alt = (img.alt || img.getAttribute('aria-label') || '')
      .replace(/^@/, '')
      .replace(/'s avatar$/i, '')
      .replace(/^assigned to\s+/i, '')
      .trim()
    if (alt) out.add(alt)
  }
  // avatars sometimes have empty alts; hovercard URLs and aria-labels fill in
  for (const el of card.querySelectorAll('[data-hovercard-url^="/users/"]')) {
    const m = el.getAttribute('data-hovercard-url')!.match(/^\/users\/([^/?]+)/)
    if (m) out.add(m[1])
  }
  const aria = ariaText(card)
  for (const m of aria.matchAll(/assigned to:?\s+@?([\w-]+)/gi)) out.add(m[1])
  return [...out]
}

function scrapeBoardDom(fallbackPts: number): ScrapeReport | null {
  let cols: Element[] = [...document.querySelectorAll('[data-testid="board-view-column"]')]
  if (!cols.length) {
    cols = [
      ...document.querySelectorAll(
        '[data-board-column], [data-testid="column-container"], [data-testid*="board-view-column"]:not([data-testid*="card"])',
      ),
    ]
  }
  // keep only innermost matches — a wrapper around all columns would
  // otherwise double-count every card
  cols = cols.filter((c) => !cols.some((other) => other !== c && c.contains(other)))
  if (!cols.length) return null

  const detail: CardParse[] = []
  for (const col of cols) {
    const title =
      col.querySelector('[data-testid*="column-title" i], [data-testid*="column-name" i], h2, h3')
        ?.textContent ?? ''
    const done = DONE_RE.test(title)
    let cards = [...col.querySelectorAll('[data-testid="board-view-column-card"]')]
    if (!cards.length) cards = [...col.querySelectorAll('[data-testid*="card" i]')]
    for (const card of cards) {
      const { pts, src } = cardPoints(card, fallbackPts)
      detail.push({ logins: cardLogins(card), pts, src, done, col: title.trim().slice(0, 40) })
    }
  }
  return detail.length ? report('board-dom', detail) : null
}

// ------------------------------------------------ 2. embedded JSON islands

type Json = unknown

function walk(node: Json, visit: (n: Record<string, Json>) => void, depth = 0): void {
  if (depth > 10 || node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, depth + 1)
    return
  }
  visit(node as Record<string, Json>)
  for (const child of Object.values(node as Record<string, Json>)) walk(child, visit, depth + 1)
}

function norm(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

interface ColumnMeta {
  estimateIds: Set<Json>
  sizeSelectIds: Set<Json>
  optionNames: Map<Json, string>
  idToName: Map<Json, string> // column id → normalized name
  iterationTags: Map<Json, string[]> // iteration option id → [title, @current…]
  knownFilterKeys: Set<string>
}

function parseColumns(columns: Array<Record<string, Json>>): ColumnMeta {
  const meta: ColumnMeta = {
    estimateIds: new Set(),
    sizeSelectIds: new Set(),
    optionNames: new Map(),
    idToName: new Map(),
    iterationTags: new Map(),
    knownFilterKeys: new Set(['assignee', 'label', 'is', 'no']),
  }
  const now = Date.now()
  for (const col of columns) {
    const name = String(col.name ?? '')
    const dataType = String(col.dataType ?? '')
    meta.idToName.set(col.id, norm(name))
    meta.knownFilterKeys.add(norm(name))
    if (dataType === 'number' && ESTIMATE_COL_RE.test(name)) meta.estimateIds.add(col.id)
    if (dataType === 'singleSelect') {
      if (ESTIMATE_COL_RE.test(name)) meta.sizeSelectIds.add(col.id)
      walk(col, (n) => {
        if (typeof n.id !== 'undefined' && typeof n.name === 'string' && n !== col) {
          meta.optionNames.set(n.id, n.name)
        }
      })
    }
    if (dataType === 'iteration') {
      // collect all iterations, then tag the current/next/previous by date
      const iters: Array<{ id: Json; title: string; start: number; end: number }> = []
      walk(col, (n) => {
        if (
          typeof n.id !== 'undefined' &&
          typeof n.title === 'string' &&
          typeof n.startDate === 'string' &&
          typeof n.duration === 'number'
        ) {
          const start = Date.parse(n.startDate)
          iters.push({ id: n.id, title: n.title, start, end: start + n.duration * 86400_000 })
        }
      })
      iters.sort((a, b) => a.start - b.start)
      const current = iters.find((i) => i.start <= now && now < i.end)
      const next = iters.find((i) => i.start > now)
      const previous = [...iters].reverse().find((i) => i.end <= now)
      for (const it of iters) {
        const tags = [it.title.toLowerCase()]
        if (it === current) tags.push('@current')
        if (it === next) tags.push('@next')
        if (it === previous) tags.push('@previous')
        meta.iterationTags.set(it.id, tags)
      }
    }
  }
  return meta
}

// ---- filterQuery: honor the view's own filter bar (fail-open on unknowns)

interface FilterToken {
  neg: boolean
  key: string
  values: string[]
}

export function tokenizeFilter(q: string): FilterToken[] {
  const out: FilterToken[] = []
  const re = /(-?)([A-Za-z0-9_-]+):((?:"[^"]*"|[^\s,]+)(?:,(?:"[^"]*"|[^\s,]+))*)/g
  for (const m of q.matchAll(re)) {
    const values = (m[3].match(/"[^"]*"|[^,]+/g) ?? []).map((v) =>
      v.replace(/^"|"$/g, '').trim().toLowerCase(),
    )
    out.push({ neg: m[1] === '-', key: m[2].toLowerCase(), values })
  }
  return out
}

function itemMatchesFilter(card: CardParse, tokens: FilterToken[], known: Set<string>): boolean {
  for (const tok of tokens) {
    let match: boolean
    if (tok.key === 'is') {
      const map: Record<string, string> = { issue: 'Issue', pr: 'PullRequest', draft: 'DraftIssue' }
      const types = tok.values.map((v) => map[v]).filter(Boolean)
      if (!types.length) continue // is:open etc. — unknown here, fail open
      match = types.includes(card.type ?? '')
    } else if (tok.key === 'no') {
      if (!tok.values.includes('assignee')) continue
      match = card.logins.length === 0
    } else {
      if (!known.has(tok.key)) continue // unrecognized column — never hide on it
      const vals = card.fields?.[tok.key] ?? []
      match = tok.values.some((v) => vals.includes(v))
    }
    if (tok.neg ? match : !match) return false
  }
  return true
}

function itemParse(
  item: Record<string, Json>,
  meta: ColumnMeta,
  fallbackPts: number,
): CardParse | null {
  const vals = item.memexProjectColumnValues
  if (!Array.isArray(vals)) return null
  const logins: string[] = []
  const labels: string[] = []
  const fields: Record<string, string[]> = {}
  const addField = (key: string, value: string) => {
    ;(fields[key] ??= []).push(value.toLowerCase())
  }
  let fieldPts: number | null = null
  let sizePts: number | null = null
  let done = false
  let col: string | undefined
  for (const v of vals as Array<Record<string, Json>>) {
    const cid = v.memexProjectColumnId
    const colName = meta.idToName.get(cid) ?? (typeof cid === 'string' ? norm(cid) : '')
    const value = v.value as Record<string, Json> | number | null | undefined
    if (cid === 'Assignees') {
      walk(v, (n) => {
        if (typeof n.login === 'string') logins.push(n.login)
      })
    } else if (cid === 'Labels') {
      walk(v, (n) => {
        if (typeof n.name === 'string' && typeof n.color !== 'undefined') labels.push(n.name)
      })
    } else if (meta.estimateIds.has(cid)) {
      let num: number | null = null
      if (typeof value === 'number') num = value
      else if (value && typeof (value as Record<string, Json>).value === 'number') {
        num = (value as Record<string, Json>).value as number
      }
      if (num !== null) {
        fieldPts = num
        if (colName) addField(colName, String(num))
      }
    } else if (typeof value === 'object' && value !== null) {
      const optId = (value as Record<string, Json>).id ?? (value as Record<string, Json>).optionId
      const iterTags = meta.iterationTags.get(optId)
      if (iterTags && colName) {
        for (const tag of iterTags) addField(colName, tag)
        continue
      }
      const optName =
        meta.optionNames.get(optId) ?? String((value as Record<string, Json>).name ?? '')
      if (optName) {
        if (colName) addField(colName, optName)
        if (cid === 'Status') col = optName
        if (DONE_RE.test(optName) && (cid === 'Status' || meta.optionNames.has(optId))) done = true
        if (meta.sizeSelectIds.has(cid) && sizePts === null) sizePts = sizeName(optName)
      }
    }
  }
  for (const l of logins) addField('assignee', l)
  for (const l of labels) addField('label', l)
  const labelPts = pointsFromLabels(labels, -1)
  let pts: number
  let src: PtsSource
  if (fieldPts !== null) {
    pts = fieldPts
    src = 'field'
  } else if (sizePts !== null) {
    pts = sizePts
    src = 'size'
  } else if (labelPts >= 0) {
    pts = labelPts
    src = 'label'
  } else {
    pts = fallbackPts
    src = 'fallback'
  }
  return {
    logins: [...new Set(logins)],
    pts,
    src,
    done,
    col,
    type: typeof item.contentType === 'string' ? item.contentType : undefined,
    fields,
  }
}

interface ItemSnapshot {
  items: Array<Record<string, Json>>
  totalCount?: number
}

function extractItems(parsed: Json, into: ItemSnapshot): void {
  walk(parsed, (n) => {
    if (Array.isArray(n.memexProjectColumnValues) && into.items.length < 5000) into.items.push(n)
    if (
      typeof n.totalCount === 'number' &&
      ('groupedItems' in n || 'groups' in n || 'nodes' in n || 'items' in n || 'pageInfo' in n)
    ) {
      into.totalCount = Math.max(into.totalCount ?? 0, n.totalCount)
    }
  })
}

// static page-load snapshot: items + columns + views from the JSON islands
interface BaseData extends ItemSnapshot {
  key: string
  columns: Array<Record<string, Json>>
  liveUrl?: string
  views: Array<{ number?: number; filter: string }>
}
let baseData: BaseData | null = null

function getBaseData(): BaseData {
  const key = location.pathname
  if (baseData?.key === key) return baseData
  const base: BaseData = { key, items: [], columns: [], views: [] }
  for (const script of document.querySelectorAll('script[type="application/json"]')) {
    const id = (script as HTMLElement).id || ''
    const text = script.textContent ?? ''
    // columns live in #memex-columns-data, whose JSON does NOT mention
    // "memexProject" — gate on the script id as well as the content
    if (!id.startsWith('memex') && !text.includes('memexProject')) continue
    let parsed: Json
    try {
      parsed = JSON.parse(text)
    } catch {
      continue
    }
    if (id === 'memex-paginated-items-get-api-data') {
      walk(parsed, (n) => {
        // this gets fetched with the user's session, so pin it to a same-origin
        // path: the first `url` walk() sees is the payload's own top-level one,
        // and a leading `//` or `/\` would still resolve off-origin
        if (!base.liveUrl && typeof n.url === 'string' && /^\/(?![/\\])/.test(n.url)) {
          base.liveUrl = n.url
        }
      })
    }
    extractItems(parsed, base)
    walk(parsed, (n) => {
      if (typeof n.dataType === 'string' && typeof n.name === 'string' && 'id' in n) {
        base.columns.push(n)
      }
      // saved views carry the filter the board is actually showing — it is
      // NOT in the URL unless the user has edited it this session
      if (typeof n.filter === 'string' && (typeof n.number === 'number' || typeof n.layout === 'string')) {
        base.views.push({
          number: typeof n.number === 'number' ? n.number : undefined,
          filter: n.filter,
        })
      }
    })
  }
  baseData = base
  return base
}

// the filter actually governing the board: an explicit URL filterQuery wins
// (even when empty — the user cleared it); otherwise the current view's saved
// filter from the islands
function effectiveFilter(base: BaseData): string {
  const urlQ = new URLSearchParams(location.search).get('filterQuery')
  if (urlQ !== null) return urlQ
  const m = location.pathname.match(/\/views\/(\d+)/)
  if (m) {
    const v = base.views.find((view) => view.number === Number(m[1]))
    if (v) return v.filter
  }
  return base.views[0]?.filter ?? ''
}

// live snapshot: re-fetched from the same internal endpoint the page uses,
// because the islands only reflect page-load state (Story Point edits and
// GitHub-side filter changes never update them)
interface LiveState {
  key: string
  snapshot: ItemSnapshot | null
  fetchedAt: number
  inFlight: boolean
}
let live: LiveState | null = null
const LIVE_MIN_GAP_MS = 15_000

export function maybeRefreshLive(onUpdate: () => void): void {
  if (document.hidden) return
  const base = getBaseData()
  if (!base.liveUrl || !base.items.length) return
  const q = effectiveFilter(base)
  const key = `${location.pathname}|${q}`
  if (live?.key !== key) live = { key, snapshot: null, fetchedAt: 0, inFlight: false }
  const state = live
  if (state.inFlight || Date.now() - state.fetchedAt < LIVE_MIN_GAP_MS) return
  state.inFlight = true
  void (async () => {
    try {
      const sep = base.liveUrl!.includes('?') ? '&' : '?'
      // ask the server to filter like the board does; fall back to a bare
      // request if it rejects the parameter
      let baseUrl = q ? `${base.liveUrl}${sep}q=${encodeURIComponent(q)}` : base.liveUrl!
      const snapshot: ItemSnapshot = { items: [] }
      let url: string | null = baseUrl
      for (let page = 0; page < 10 && url; page++) {
        const res = await fetch(url, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) {
          if (page === 0 && baseUrl !== base.liveUrl) {
            baseUrl = base.liveUrl!
            url = baseUrl
            page-- // retry unfiltered once
            continue
          }
          break
        }
        const body = (await res.json()) as Json
        extractItems(body, snapshot)
        if (snapshot.totalCount !== undefined && snapshot.items.length >= snapshot.totalCount) break
        let cursor: string | null = null
        walk(body, (n) => {
          if (typeof n.endCursor === 'string' && n.hasNextPage !== false) cursor = n.endCursor
        })
        url = cursor
          ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}after=${encodeURIComponent(cursor)}`
          : null
      }
      const prev = JSON.stringify(state.snapshot?.items ?? [])
      if (snapshot.items.length) {
        state.snapshot = snapshot
        state.fetchedAt = Date.now()
        if (JSON.stringify(snapshot.items) !== prev) onUpdate()
      } else {
        state.fetchedAt = Date.now() // don't hammer a failing endpoint
      }
    } catch {
      state.fetchedAt = Date.now()
    } finally {
      state.inFlight = false
    }
  })()
}

// live items override page-load items by id, but a short live page can never
// LOSE items the initial payload had (pagination protection)
function mergeSnapshots(base: BaseData, liveSnap: ItemSnapshot | null): ItemSnapshot {
  if (!liveSnap) return base
  const byId = new Map<Json, Record<string, Json>>()
  const noId: Array<Record<string, Json>> = []
  for (const it of base.items) {
    if (it.id !== undefined && it.id !== null) byId.set(it.id, it)
    else noId.push(it)
  }
  for (const it of liveSnap.items) {
    if (it.id !== undefined && it.id !== null) byId.set(it.id, it)
    else noId.push(it)
  }
  return {
    items: [...byId.values(), ...noId],
    totalCount: liveSnap.totalCount ?? base.totalCount,
  }
}

interface IslandCache {
  key: string
  result: ScrapeReport | null
}
let islandCache: IslandCache | null = null

function scrapeJsonIslands(fallbackPts: number): ScrapeReport | null {
  const base = getBaseData()
  const filter = effectiveFilter(base)
  const liveStamp = live?.key === `${location.pathname}|${filter}` ? live.fetchedAt : 0
  const key = `${location.pathname}|${location.search}|${filter}|${fallbackPts}|${liveStamp}`
  if (islandCache?.key === key) return islandCache.result

  const liveSnap = live?.key === `${location.pathname}|${filter}` ? live.snapshot : null
  const snapshot = mergeSnapshots(base, liveSnap)
  const meta = parseColumns(base.columns)
  let detail = snapshot.items
    .map((item) => itemParse(item, meta, fallbackPts))
    .filter((d): d is CardParse => d !== null)

  // honor the filter governing the board (saved view filter or URL override)
  // and the slice panel
  const params = new URLSearchParams(location.search)
  const tokens = tokenizeFilter(filter)
  if (tokens.length) detail = detail.filter((d) => itemMatchesFilter(d, tokens, meta.knownFilterKeys))
  const slice = (params.get('sliceBy[value]') ?? '').toLowerCase()
  if (slice) {
    const sliced = detail.filter(
      (d) =>
        d.logins.some((l) => l.toLowerCase() === slice) ||
        Object.values(d.fields ?? {}).some((vals) => vals.includes(slice)),
    )
    if (sliced.length) detail = sliced // fail open if the slice matches nothing
  }

  let result: ScrapeReport | null = null
  if (detail.length) {
    result = report('islands', detail)
    result.totalCount = snapshot.totalCount
    result.columns = base.columns.slice(0, 25).map((c) => `${String(c.name)}:${String(c.dataType)}`)
  }
  islandCache = { key, result }
  return result
}

// ---------------------------------------------------------------- exports

export function scrapeBoard(fallbackPts: number): MemberLoad[] | null {
  const dom = scrapeBoardDom(fallbackPts)
  const islands = scrapeJsonIslands(fallbackPts)
  lastReports = [dom, islands].filter((r): r is ScrapeReport => r !== null)
  if (!dom && !islands) return null
  if (dom && islands) {
    // prefer the strategy that actually read estimates; ties go to the DOM
    // since it updates live as cards move
    const domScore = dom.explicit / dom.cards
    const islandScore = islands.explicit / islands.cards
    return islandScore > domScore + 0.15 ? islands.members : dom.members
  }
  return (dom ?? islands)!.members
}

// Fingerprint of page structure + what each strategy parsed from each card
// (logins/points/status only — no ticket titles or content).
export function collectBoardDiagnostics(): string {
  const testids = new Map<string, number>()
  for (const el of document.querySelectorAll('[data-testid]')) {
    const id = el.getAttribute('data-testid')!
    testids.set(id, (testids.get(id) ?? 0) + 1)
  }
  const islands = [...document.querySelectorAll('script[type="application/json"]')].map((s) => {
    const text = s.textContent ?? ''
    let keys: string[] = ['unparsed']
    try {
      const j = JSON.parse(text)
      keys = j && typeof j === 'object' ? Object.keys(j).slice(0, 25) : [typeof j]
    } catch {
      // leave as unparsed
    }
    return { id: (s as HTMLElement).id || '(no id)', bytes: text.length, keys }
  })
  return JSON.stringify(
    {
      bokkaDiagnostics: 5,
      path: location.pathname,
      urlState: {
        urlFilterQuery: new URLSearchParams(location.search).get('filterQuery'),
        savedViewFilters: baseData?.views ?? [],
        effectiveFilter: baseData ? effectiveFilter(baseData) : null,
        filterTokens: baseData ? tokenizeFilter(effectiveFilter(baseData)) : [],
        slice: new URLSearchParams(location.search).get('sliceBy[value]'),
        liveUrlFound: Boolean(baseData?.liveUrl),
        liveItems: live?.snapshot?.items.length ?? null,
        baseItems: baseData?.items.length ?? null,
        liveAgeSec: live?.fetchedAt ? Math.round((Date.now() - live.fetchedAt) / 1000) : null,
      },
      strategies: lastReports.map((r) => ({
        strategy: r.strategy,
        cards: r.cards,
        explicit: r.explicit,
        totalCount: r.totalCount,
        columns: r.columns,
        members: r.members.map((m) => `${m.login} open:${m.openPoints} done:${m.deliveredPoints}`),
        // open items first — they're the ones people dispute
        detail: [...r.detail.filter((d) => !d.done), ...r.detail.filter((d) => d.done)].slice(0, 40),
      })),
      testids: Object.fromEntries([...testids].sort((a, b) => b[1] - a[1]).slice(0, 80)),
      jsonIslands: islands,
      avatarImgs: document.querySelectorAll('img[src*="avatars.githubusercontent.com"]').length,
    },
    null,
    1,
  )
}
