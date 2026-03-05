// pages/start.js
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { COLOURS, COLOUR_HEX, COLOUR_TEXT, AGE_GROUP_LABELS, AGE_GROUP_ORDER } from '../lib/constants'

// ── helpers ──────────────────────────────────────────────────
function ColourDot({ colour, size = 36 }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        background: COLOUR_HEX[colour],
        color: COLOUR_TEXT[colour],
        fontFamily: 'var(--font-head)', fontWeight: 700,
        fontSize: size * 0.28,
        letterSpacing: '0.03em',
        border: '2px solid rgba(255,255,255,0.18)',
        flexShrink: 0,
      }}
    >
      {colour.slice(0, 3).toUpperCase()}
    </span>
  )
}

function StatusPill({ status }) {
  const cfg = {
    free:     { bg: '#22c55e22', color: '#22c55e', label: 'FREE' },
    warning:  { bg: '#f9731622', color: '#f97316', label: 'WARNING' },
    running:  { bg: '#ef444422', color: '#ef4444', label: 'RUNNING' },
  }
  const c = cfg[status] || cfg.free
  return (
    <span className="badge" style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}55` }}>
      {c.label}
    </span>
  )
}

// ── main ──────────────────────────────────────────────────────
export default function StartLine() {
  const [teams,        setTeams]        = useState([])
  const [runs,         setRuns]         = useState([])
  const [colourSlots,  setColourSlots]  = useState([])
  const [loading,      setLoading]      = useState(true)

  // Dispatch modal state
  const [dispatchTeam,  setDispatchTeam]  = useState(null) // team object
  const [memberCount,   setMemberCount]   = useState(5)
  const [chosenColour,  setChosenColour]  = useState(null)
  const [dispatching,   setDispatching]   = useState(false)
  const [dispatchError, setDispatchError] = useState('')
  const [warnColour,    setWarnColour]    = useState(false)

  // Load all data
  const loadAll = useCallback(async () => {
    const [teamsRes, runsRes, slotsRes] = await Promise.all([
      supabase.from('teams').select('*').order('name'),
      supabase.from('runs').select('*, teams(name, age_group)').order('created_at'),
      supabase.from('colour_slots').select('*'),
    ])
    if (!teamsRes.error) setTeams(teamsRes.data || [])
    if (!runsRes.error)  setRuns(runsRes.data || [])
    if (!slotsRes.error) setColourSlots(slotsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()

    // Realtime subscriptions
    const channel = supabase
      .channel('start-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' },          () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'colour_slots' },  () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' },         () => loadAll())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [loadAll])

  // ── derive queue: teams that haven't completed 2 runs, in run-order ──
  // Determine how many runs each team has done or is doing
  function getTeamRunCount(teamId) {
    return runs.filter(r => r.team_id === teamId).length
  }
  function getTeamRunStatus(teamId, runNum) {
    return runs.find(r => r.team_id === teamId && r.run_number === runNum)
  }

  // Teams queued for a run = teams with < 2 finished runs and not currently running
  const currentlyRunning = runs.filter(r => r.status === 'running' || r.status === 'finishing')

  // Queue logic: teams ordered by age group then alphabetically, who still have runs to do
  const teamsWithStatus = teams.map(t => {
    const teamRuns  = runs.filter(r => r.team_id === t.id)
    const run1      = teamRuns.find(r => r.run_number === 1)
    const run2      = teamRuns.find(r => r.run_number === 2)
    const isRunning = teamRuns.some(r => r.status === 'running' || r.status === 'finishing')
    const doneCount = teamRuns.filter(r => r.status === 'done').length
    const nextRun   = !run1 ? 1 : (!run2 ? 2 : null) // null means both runs done
    return { ...t, run1, run2, isRunning, doneCount, nextRun }
  })

  // Queue = not currently running, not both runs done, sorted by age group order then name
  const queue = teamsWithStatus
    .filter(t => t.nextRun !== null && !t.isRunning)
    .sort((a, b) => {
      const ag = AGE_GROUP_ORDER.indexOf(a.age_group) - AGE_GROUP_ORDER.indexOf(b.age_group)
      if (ag !== 0) return ag
      return a.name.localeCompare(b.name)
    })

  const nextTeam = queue[0] || null

  // Colour slot map
  const slotMap = Object.fromEntries(colourSlots.map(s => [s.colour, s]))

  function openDispatch(team) {
    setDispatchTeam(team)
    setMemberCount(5)
    setChosenColour(null)
    setDispatchError('')
    setWarnColour(false)
  }

  function selectColour(colour) {
    const slot = slotMap[colour]
    if (slot?.status === 'running') return // can't select running
    setChosenColour(colour)
    setWarnColour(slot?.status === 'warning')
    setDispatchError('')
  }

  async function dispatchTeamNow() {
    if (!dispatchTeam || !chosenColour) return
    setDispatchError('')
    const slot = slotMap[chosenColour]
    if (slot?.status === 'running') {
      setDispatchError('That colour is still running! Choose another.')
      return
    }
    setDispatching(true)
    const now = new Date().toISOString()

    // Insert run
    const { data: runData, error: runErr } = await supabase
      .from('runs')
      .insert({
        team_id:      dispatchTeam.id,
        run_number:   dispatchTeam.nextRun,
        member_count: memberCount,
        colour:       chosenColour,
        started_at:   now,
        status:       'running',
        finishers:    0,
      })
      .select()
      .single()

    if (runErr) { setDispatchError(runErr.message); setDispatching(false); return }

    // Update colour slot → running
    await supabase.from('colour_slots').update({
      status:     'running',
      run_id:     runData.id,
      updated_at: now,
    }).eq('colour', chosenColour)

    setDispatching(false)
    setDispatchTeam(null)
    loadAll()
  }

  // ── UI ──
  if (loading) return <div className="page"><p className="text-muted">Loading…</p></div>

  return (
    <div className="page">
      <div className="mb-2">
        <h1 style={{ fontSize: '2.2rem' }}>Start Line</h1>
        <p className="text-muted text-sm mt-1">Dispatch teams and assign colour bibs.</p>
      </div>

      {/* Currently Running Strip */}
      {currentlyRunning.length > 0 && (
        <div className="card mt-3" style={{ borderColor: 'var(--danger)44' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: '0.75rem' }}>
            Currently On Course ({currentlyRunning.length})
          </h3>
          <div className="flex wrap gap-2">
            {currentlyRunning.map(run => {
              const elapsed = run.started_at
                ? Math.floor((Date.now() - new Date(run.started_at).getTime()) / 1000)
                : 0
              const mins = Math.floor(elapsed / 60)
              const secs = elapsed % 60
              return (
                <div key={run.id} className="card" style={{ flex: '1 1 220px', borderColor: COLOUR_HEX[run.colour] + '66', padding: '0.85rem' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <ColourDot colour={run.colour} size={32} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{run.teams?.name}</div>
                      <div className="text-muted text-sm">{AGE_GROUP_LABELS[run.teams?.age_group]} · Run {run.run_number}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    {run.finishers}/{run.member_count} finishers · {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')} elapsed
                  </div>
                  {run.status === 'finishing' && (
                    <div className="badge mt-1" style={{ background: '#f9731622', color: '#f97316', border: '1px solid #f9731655' }}>
                      3+ finished — waiting for remainder
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main layout: queue + colour grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>

        {/* Queue */}
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Team Queue</h3>
          {queue.length === 0 ? (
            <p className="text-muted text-sm">No teams waiting.</p>
          ) : (
            queue.map((team, i) => (
              <div
                key={team.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.65rem 0.5rem',
                  borderBottom: i < queue.length - 1 ? '1px solid var(--border)' : 'none',
                  background: i === 0 ? 'rgba(245,158,11,0.07)' : 'transparent',
                  borderRadius: i === 0 ? '6px' : 0,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {i === 0 && <span style={{ color: 'var(--accent)', marginRight: '0.4rem' }}>▶</span>}
                    {team.name}
                  </div>
                  <div className="text-muted text-sm">
                    {AGE_GROUP_LABELS[team.age_group]} · Run {team.nextRun}
                    {team.doneCount > 0 && ` · Run 1 done`}
                  </div>
                </div>
                {i === 0 ? (
                  <button className="btn-primary btn-sm" onClick={() => openDispatch(team)}>
                    Dispatch →
                  </button>
                ) : (
                  <button className="btn-secondary btn-sm" onClick={() => openDispatch(team)}>
                    Send
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Colour grid */}
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Colour Bib Status</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            {COLOURS.map(colour => {
              const slot = slotMap[colour]
              const status = slot?.status || 'free'
              const runId  = slot?.run_id
              const runInfo = runs.find(r => r.id === runId)
              return (
                <div
                  key={colour}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.5rem 0.65rem',
                    background: 'var(--surface2)',
                    borderRadius: '6px',
                    border: `1px solid ${status === 'running' ? COLOUR_HEX[colour] + '88' : 'var(--border)'}`,
                  }}
                >
                  <ColourDot colour={colour} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{colour}</div>
                    <StatusPill status={status} />
                    {runInfo && status !== 'free' && (
                      <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {runInfo.teams?.name || ''}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Dispatch Modal */}
      {dispatchTeam && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem',
          }}
          onClick={e => { if (e.target === e.currentTarget) setDispatchTeam(null) }}
        >
          <div
            className="card animate-in"
            style={{ width: '100%', maxWidth: '520px', border: '1px solid var(--accent)66' }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 style={{ fontSize: '1.5rem' }}>Dispatch Team</h2>
              <button className="btn-secondary btn-sm" onClick={() => setDispatchTeam(null)}>✕</button>
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: '6px', padding: '0.85rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{dispatchTeam.name}</div>
              <div className="text-muted text-sm">{AGE_GROUP_LABELS[dispatchTeam.age_group]} · Run {dispatchTeam.nextRun}</div>
            </div>

            {/* Member count */}
            <div className="mb-3">
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontFamily: 'var(--font-head)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Number of Team Members (3–10)
              </label>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setMemberCount(v => Math.max(3, v - 1))}
                  style={{ width: '2.2rem', height: '2.2rem', padding: 0, fontSize: '1.2rem' }}
                >−</button>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 900, minWidth: '2rem', textAlign: 'center' }}>
                  {memberCount}
                </span>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setMemberCount(v => Math.min(10, v + 1))}
                  style={{ width: '2.2rem', height: '2.2rem', padding: 0, fontSize: '1.2rem' }}
                >+</button>
              </div>
            </div>

            {/* Colour picker */}
            <div className="mb-3">
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontFamily: 'var(--font-head)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Assign Colour Bib
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                {COLOURS.map(colour => {
                  const slot   = slotMap[colour]
                  const status = slot?.status || 'free'
                  const isRunning = status === 'running'
                  const isWarn    = status === 'warning'
                  const isChosen  = chosenColour === colour
                  return (
                    <button
                      key={colour}
                      disabled={isRunning}
                      onClick={() => selectColour(colour)}
                      title={isRunning ? 'Currently in use' : isWarn ? 'Warning: may still have runners' : 'Available'}
                      style={{
                        background:    isChosen ? COLOUR_HEX[colour] : isRunning ? '#1a1a1a' : 'var(--surface2)',
                        color:         isChosen ? COLOUR_TEXT[colour] : isRunning ? '#444' : 'var(--text)',
                        border:        isChosen
                          ? `2px solid ${COLOUR_HEX[colour]}`
                          : isWarn
                          ? '2px solid var(--warning)'
                          : '2px solid var(--border)',
                        borderRadius:  '8px',
                        padding:       '0.55rem 0.25rem',
                        display:       'flex',
                        flexDirection: 'column',
                        alignItems:    'center',
                        gap:           '0.3rem',
                        fontSize:      '0.72rem',
                        fontFamily:    'var(--font-head)',
                        fontWeight:    700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        cursor:        isRunning ? 'not-allowed' : 'pointer',
                        transition:    'all 0.15s',
                        opacity:       isRunning ? 0.35 : 1,
                      }}
                    >
                      <span
                        style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: COLOUR_HEX[colour],
                          opacity: isRunning ? 0.4 : 1,
                          border: '2px solid rgba(255,255,255,0.2)',
                          display: 'block',
                        }}
                      />
                      {colour}
                      {isRunning && <span style={{ color: '#666', fontSize: '0.6rem' }}>IN USE</span>}
                      {isWarn    && <span style={{ color: 'var(--warning)', fontSize: '0.6rem' }}>WARN</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Warning banner */}
            {warnColour && chosenColour && (
              <div style={{ background: '#f9731618', border: '1px solid #f9731688', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', color: '#f97316', fontSize: '0.88rem' }}>
                ⚠️ <strong>Warning:</strong> There may still be runners with a {chosenColour} bib who haven't finished yet. Assign this colour only if you're sure the course is clear.
              </div>
            )}

            {dispatchError && (
              <div className="text-danger text-sm mb-2">{dispatchError}</div>
            )}

            <div className="flex gap-2">
              <button
                className="btn-primary"
                style={{ flex: 1, fontSize: '1.1rem', padding: '0.85rem' }}
                disabled={!chosenColour || dispatching}
                onClick={dispatchTeamNow}
              >
                {dispatching ? 'Starting…' : '🚦 Start Team!'}
              </button>
              <button className="btn-secondary" onClick={() => setDispatchTeam(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All Teams Overview at bottom */}
      <div className="card mt-4">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>All Teams — Run Overview</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Age Group</th>
                <th>Run 1</th>
                <th>Run 2</th>
              </tr>
            </thead>
            <tbody>
              {AGE_GROUP_ORDER.flatMap(g =>
                teamsWithStatus
                  .filter(t => t.age_group === g)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(team => (
                    <tr key={team.id}>
                      <td style={{ fontWeight: 600 }}>{team.name}</td>
                      <td><span className="badge" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{AGE_GROUP_LABELS[team.age_group]}</span></td>
                      <td><RunStatusCell run={team.run1} /></td>
                      <td><RunStatusCell run={team.run2} /></td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function RunStatusCell({ run }) {
  if (!run) return <span className="text-muted text-sm">Not started</span>
  const cfg = {
    queued:    { color: 'var(--text-muted)',  label: 'Queued' },
    running:   { color: 'var(--danger)',      label: 'Running' },
    finishing: { color: 'var(--warning)',     label: 'Finishing' },
    done:      { color: 'var(--success)',     label: 'Done' },
  }
  const c = cfg[run.status] || cfg.queued
  return (
    <span style={{ color: c.color, fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {c.label}
      {run.colour && <span style={{ marginLeft: '0.4rem', opacity: 0.7 }}>· {run.colour}</span>}
    </span>
  )
}
