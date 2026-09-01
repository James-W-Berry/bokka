// GitHub sync for Bokka — reads issues from a repo and turns them into
// per-assignee porter loads. Runs entirely client-side (api.github.com
// allows CORS); a token is only needed for private repos or rate limits.

export interface GhConfig {
  repo: string // "owner/name"
  token?: string
  milestone?: string // milestone number as string, or '' for all
}

export interface MemberLoad {
  login: string
  avatar?: string
  openPoints: number
  openIssues: number
  deliveredPoints: number
  deliveredIssues: number
}

export interface Milestone {
  number: number
  title: string
}

export interface SyncResult {
  repo: string
  fetchedAt: string
  members: MemberLoad[]
  totalOpenPoints: number
  totalDeliveredPoints: number
}

const POINT_PATTERNS = [
  /^(?:sp|pts?|points?|estimate|size|story\s*points?)[\s:/=–-]*(\d{1,3})$/i,
  /^(\d{1,3})\s*(?:sp|pts?|points?)$/i,
  /^(\d{1,3})$/,
]

export function pointsFromLabels(labels: string[], fallback: number): number {
  for (const raw of labels) {
    const name = raw.trim()
    for (const re of POINT_PATTERNS) {
      const m = name.match(re)
      if (m) return parseInt(m[1], 10)
    }
  }
  return fallback
}

async function ghFetch(path: string, token?: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    // callers add their own remedy — the extension has no token field, the
    // web app does
    const detail = res.status === 403 ? ' (rate limited)' : ''
    throw new Error(`GitHub ${res.status} on ${path}${detail}`)
  }
  return res.json()
}

interface GhIssue {
  pull_request?: unknown
  closed_at: string | null
  labels: Array<{ name: string } | string>
  assignees: Array<{ login: string; avatar_url: string }>
}

function labelNames(issue: GhIssue): string[] {
  return issue.labels.map((l) => (typeof l === 'string' ? l : l.name))
}

export async function fetchMilestones(cfg: GhConfig): Promise<Milestone[]> {
  const data = (await ghFetch(
    `/repos/${cfg.repo}/milestones?state=open&per_page=50`,
    cfg.token,
  )) as Array<{ number: number; title: string }>
  return data.map((m) => ({ number: m.number, title: m.title }))
}

async function fetchIssues(cfg: GhConfig, params: string): Promise<GhIssue[]> {
  const out: GhIssue[] = []
  const milestone = cfg.milestone ? `&milestone=${cfg.milestone}` : ''
  for (let page = 1; page <= 3; page++) {
    const batch = (await ghFetch(
      `/repos/${cfg.repo}/issues?per_page=100&page=${page}${milestone}&${params}`,
      cfg.token,
    )) as GhIssue[]
    out.push(...batch.filter((i) => !i.pull_request))
    if (batch.length < 100) break
  }
  return out
}

export async function syncRepo(
  cfg: GhConfig,
  defaultPointsPerIssue: number,
  sprintDays: number,
): Promise<SyncResult> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo.trim())) {
    throw new Error('Repo must look like owner/name')
  }
  const repo = cfg.repo.trim()
  const sprintStart = new Date(Date.now() - sprintDays * 86400_000)
  const since = sprintStart.toISOString()

  const [open, closed] = await Promise.all([
    fetchIssues({ ...cfg, repo }, 'state=open'),
    fetchIssues({ ...cfg, repo }, `state=closed&since=${since}&sort=updated&direction=desc`),
  ])

  const members = new Map<string, MemberLoad>()
  const get = (login: string, avatar?: string): MemberLoad => {
    let m = members.get(login)
    if (!m) {
      m = { login, avatar, openPoints: 0, openIssues: 0, deliveredPoints: 0, deliveredIssues: 0 }
      members.set(login, m)
    }
    return m
  }

  const attribute = (issue: GhIssue, kind: 'open' | 'delivered') => {
    const pts = pointsFromLabels(labelNames(issue), defaultPointsPerIssue)
    const assignees = issue.assignees.length
      ? issue.assignees
      : [{ login: 'Unassigned', avatar_url: '' }]
    const share = pts / assignees.length
    for (const a of assignees) {
      const m = get(a.login, a.avatar_url || undefined)
      if (kind === 'open') {
        m.openPoints += share
        m.openIssues += 1
      } else {
        m.deliveredPoints += share
        m.deliveredIssues += 1
      }
    }
  }

  for (const issue of open) attribute(issue, 'open')
  for (const issue of closed) {
    if (issue.closed_at && new Date(issue.closed_at) >= sprintStart) attribute(issue, 'delivered')
  }

  const list = [...members.values()]
    .map((m) => ({
      ...m,
      openPoints: Math.round(m.openPoints),
      deliveredPoints: Math.round(m.deliveredPoints),
    }))
    .sort((a, b) => b.openPoints - a.openPoints)

  return {
    repo,
    fetchedAt: new Date().toISOString(),
    members: list,
    totalOpenPoints: list.reduce((s, m) => s + m.openPoints, 0),
    totalDeliveredPoints: list.reduce((s, m) => s + m.deliveredPoints, 0),
  }
}
