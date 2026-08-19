import { useEffect, useMemo, useState } from 'react'
import { logoSVG } from './porter/logo.ts'
import { PorterCanvas } from './porter/PorterCanvas.tsx'
import { porterState, STATE_LABEL } from './porter/porter.ts'
import { fetchMilestones, syncRepo, type Milestone } from './github.ts'
import { loadState, saveState, newId, type AppState } from './store.ts'

export function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [celebrateUntil, setCelebrateUntil] = useState(0)
  const [newName, setNewName] = useState('')

  useEffect(() => saveState(state), [state])

  // deep-linked repo (?repo=owner/name) syncs on load — lets a URL act as a live team widget
  useEffect(() => {
    if (new URLSearchParams(location.search).has('repo') && state.gh.repo) void doSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const celebrating = celebrateUntil > Date.now()
  useEffect(() => {
    if (!celebrating) return
    const id = setTimeout(() => setCelebrateUntil(0), celebrateUntil - Date.now())
    return () => clearTimeout(id)
  }, [celebrating, celebrateUntil])

  const doSync = async () => {
    setSyncing(true)
    setError('')
    try {
      const cfg = { repo: state.gh.repo, token: state.gh.token || undefined, milestone: state.gh.milestone }
      const [result, ms] = await Promise.all([
        syncRepo(cfg, state.defaultPointsPerIssue, state.sprintDays),
        fetchMilestones(cfg).catch(() => [] as Milestone[]),
      ])
      setMilestones(ms)
      setState((s) => ({ ...s, lastSync: result }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  const team = useMemo(() => {
    if (state.mode === 'github') {
      return (state.lastSync?.members ?? []).map((m, i) => ({
        key: m.login,
        name: m.login,
        avatar: m.avatar,
        points: m.openPoints,
        issues: m.openIssues,
        delivered: m.deliveredPoints,
        seed: i,
      }))
    }
    return state.manual.members.map((m, i) => ({
      key: m.id,
      name: m.name,
      avatar: undefined,
      points: m.points,
      issues: undefined,
      delivered: undefined,
      seed: i,
    }))
  }, [state])

  const totalLoad = team.reduce((s, m) => s + m.points, 0)
  const totalDelivered =
    state.mode === 'github' ? (state.lastSync?.totalDeliveredPoints ?? 0) : state.manual.delivered

  const addPoints = (id: string, delta: number) =>
    setState((s) => ({
      ...s,
      manual: {
        ...s.manual,
        members: s.manual.members.map((m) =>
          m.id === id ? { ...m, points: Math.max(0, m.points + delta) } : m,
        ),
      },
    }))

  const completeSprint = () => {
    const carried = state.manual.members.reduce((sum, m) => sum + m.points, 0)
    setState((s) => ({
      ...s,
      manual: {
        delivered: s.manual.delivered + carried,
        members: s.manual.members.map((m) => ({ ...m, points: 0 })),
      },
    }))
    setCelebrateUntil(Date.now() + 3000)
  }

  const addMember = () => {
    const name = newName.trim()
    if (!name) return
    setState((s) => ({
      ...s,
      manual: { ...s.manual, members: [...s.manual.members, { id: newId(), name, points: 0 }] },
    }))
    setNewName('')
  }

  return (
    <div className="app">
      <header>
        <h1>
          <span className="logo" dangerouslySetInnerHTML={{ __html: logoSVG(34) }} /> BOKKA
        </h1>
        <p className="tagline">Every sprint point is cargo. Someone has to carry it.</p>
      </header>

      <nav className="tabs">
        <button
          className={state.mode === 'github' ? 'tab active' : 'tab'}
          onClick={() => setState((s) => ({ ...s, mode: 'github' }))}
        >
          GitHub
        </button>
        <button
          className={state.mode === 'manual' ? 'tab active' : 'tab'}
          onClick={() => setState((s) => ({ ...s, mode: 'manual' }))}
        >
          Manual
        </button>
      </nav>

      <section className="panel">
        <div className="controls">
          <label>
            Capacity
            <input
              type="number"
              min={1}
              value={state.capacity}
              onChange={(e) =>
                setState((s) => ({ ...s, capacity: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </label>
          {state.mode === 'github' && (
            <>
              <label className="grow">
                Repo (owner/name)
                <input
                  placeholder="facebook/react"
                  value={state.gh.repo}
                  onChange={(e) => setState((s) => ({ ...s, gh: { ...s.gh, repo: e.target.value } }))}
                />
              </label>
              <label className="grow">
                Token (optional, stays in your browser)
                <input
                  type="password"
                  placeholder="ghp_…"
                  value={state.gh.token}
                  onChange={(e) => setState((s) => ({ ...s, gh: { ...s.gh, token: e.target.value } }))}
                />
              </label>
              <label>
                Milestone
                <select
                  value={state.gh.milestone}
                  onChange={(e) =>
                    setState((s) => ({ ...s, gh: { ...s.gh, milestone: e.target.value } }))
                  }
                >
                  <option value="">All</option>
                  {milestones.map((m) => (
                    <option key={m.number} value={String(m.number)}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sprint days
                <input
                  type="number"
                  min={1}
                  value={state.sprintDays}
                  onChange={(e) =>
                    setState((s) => ({ ...s, sprintDays: Math.max(1, Number(e.target.value) || 14) }))
                  }
                />
              </label>
              <label>
                Pts/issue fallback
                <input
                  type="number"
                  min={1}
                  value={state.defaultPointsPerIssue}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      defaultPointsPerIssue: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </label>
              <button className="primary" onClick={doSync} disabled={syncing || !state.gh.repo}>
                {syncing ? 'Hauling…' : 'Sync'}
              </button>
            </>
          )}
          {state.mode === 'manual' && (
            <>
              <label className="grow">
                New porter
                <input
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMember()}
                />
              </label>
              <button onClick={addMember}>Add</button>
              <button className="primary" onClick={completeSprint} disabled={totalLoad === 0}>
                Complete sprint
              </button>
            </>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {state.mode === 'github' && state.lastSync && (
          <p className="synced">
            {state.lastSync.repo} — synced {new Date(state.lastSync.fetchedAt).toLocaleTimeString()}.
            Points read from labels like <code>sp:3</code>, <code>5 pts</code>, <code>size/8</code>;
            unlabeled issues count as {state.defaultPointsPerIssue}.
          </p>
        )}
      </section>

      <section className="stats">
        <div className="stat">
          <span className="stat-value">{totalLoad}</span>
          <span className="stat-label">points in transit</span>
        </div>
        <div className="stat">
          <span className="stat-value">{team.length}</span>
          <span className="stat-label">porters on the trail</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totalDelivered}</span>
          <span className="stat-label">
            {state.mode === 'github' ? `delivered (last ${state.sprintDays}d)` : 'cargo delivered'}
          </span>
        </div>
      </section>

      {team.length === 0 && (
        <p className="empty">
          {state.mode === 'github'
            ? 'Point Bokka at a repo and hit Sync — every assignee becomes a porter.'
            : 'Add a porter to get started.'}
        </p>
      )}

      <section className="grid">
        {team.map((m) => {
          const st = celebrating ? 'celebrate' : porterState(m.points, state.capacity)
          const pct = Math.min(100, Math.round((m.points / state.capacity) * 100))
          return (
            <div className={`card state-${st}`} key={m.key}>
              <PorterCanvas
                points={m.points}
                capacity={state.capacity}
                celebrate={celebrating}
                seed={m.seed}
              />
              <div className="card-info">
                <div className="card-name">
                  {m.avatar && <img src={m.avatar} alt="" className="avatar" />}
                  <span>{m.name}</span>
                </div>
                <div className="load-bar">
                  <div className="load-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="card-meta">
                  <span>
                    {m.points}/{state.capacity} pts
                    {m.issues !== undefined ? ` · ${m.issues} issues` : ''}
                  </span>
                  <span className="state-label">{STATE_LABEL[st]}</span>
                </div>
                {m.delivered !== undefined && m.delivered > 0 && (
                  <div className="card-delivered">delivered {m.delivered} pts this sprint</div>
                )}
                {state.mode === 'manual' && (
                  <div className="btn-row">
                    {[1, 2, 3, 5, 8].map((n) => (
                      <button key={n} onClick={() => addPoints(m.key, n)}>
                        +{n}
                      </button>
                    ))}
                    <button className="ghost" onClick={() => addPoints(m.key, -1e9)}>
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </section>

      <footer>
        Bokka: the mountain porters of Japan who haul supplies to remote huts on wooden
        frames — sometimes over 100&nbsp;kg. Be kind to your porters.
      </footer>
    </div>
  )
}
