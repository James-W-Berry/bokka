import type { SyncResult } from './github.ts'

export interface ManualMember {
  id: string
  name: string
  points: number
}

export interface AppState {
  mode: 'github' | 'manual'
  capacity: number
  sprintDays: number
  defaultPointsPerIssue: number
  gh: { repo: string; token: string; milestone: string }
  manual: { members: ManualMember[]; delivered: number }
  lastSync?: SyncResult
}

const KEY = 'bokka-state-v1'

export const initialState: AppState = {
  mode: 'github',
  capacity: 24,
  sprintDays: 14,
  defaultPointsPerIssue: 3,
  gh: { repo: '', token: '', milestone: '' },
  manual: {
    members: [
      { id: 'm1', name: 'Aiko', points: 6 },
      { id: 'm2', name: 'Ben', points: 16 },
      { id: 'm3', name: 'Chen', points: 26 },
      { id: 'm4', name: 'Devi', points: 40 },
    ],
    delivered: 128,
  },
}

export function loadState(): AppState {
  let state = initialState
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>
      state = { ...initialState, ...parsed, gh: { ...initialState.gh, ...parsed.gh }, manual: { ...initialState.manual, ...parsed.manual } }
    }
  } catch {
    // fall through to defaults
  }
  // URL overrides for deep links / embedding: ?mode=manual&repo=owner/name
  const params = new URLSearchParams(location.search)
  const mode = params.get('mode')
  if (mode === 'manual' || mode === 'github') state = { ...state, mode }
  const repo = params.get('repo')
  if (repo) state = { ...state, mode: 'github', gh: { ...state.gh, repo } }
  return state
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage full or unavailable — state just won't persist
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 9)
}
