// Shared settings storage for the extension. Falls back to localStorage when
// chrome.storage is unavailable (e.g. the test harness page served by vite).

export interface Settings {
  capacity: number
  sprintDays: number
  defaultPointsPerIssue: number
  maxPorters: number
  logins: string // optional comma-separated filter, e.g. "alice,bob"
  hidden: boolean
}

export const DEFAULTS: Settings = {
  capacity: 24,
  sprintDays: 14,
  defaultPointsPerIssue: 3,
  maxPorters: 10,
  logins: '',
  hidden: false,
}

declare const chrome: any

const hasChromeStorage = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome?.storage?.local

const LS_KEY = 'bokka-ext'

export async function loadSettings(): Promise<Settings> {
  if (hasChromeStorage()) {
    return new Promise((res) =>
      chrome.storage.local.get(DEFAULTS, (v: Partial<Settings>) => res({ ...DEFAULTS, ...v })),
    )
  }
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  if (hasChromeStorage()) {
    return new Promise((res) => chrome.storage.local.set(patch, () => res()))
  }
  const cur = await loadSettings()
  localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...patch }))
}

export function onSettingsChanged(fn: () => void): void {
  if (hasChromeStorage()) chrome.storage.onChanged.addListener(fn)
}

export function openOptions(): void {
  // web pages may not open extension URLs directly — ask the background to do
  // it. No-op in the test harness, which has no extension to talk to.
  if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: 'bokka:open-options' })
  }
}
