// pages/finish.js
// Changes from v1:
//   • Colour buttons stay fully active (not greyed out) for the entire time a run
//     is in 'running' OR 'finishing' state — they only go dark when status is 'free'.
//   • Button label shows "X / Y FINISHERS" at all times while active (no WARN text).
//     It shows "FREE" only once the colour is fully freed.
//   • Force Finish button (red, per active run row) terminates a run immediately:
//       – If < FINISH_THRESHOLD finishers: shows a confirmation dialog.
//       – If time already recorded (≥ threshold): frees the colour without changing the time.

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { COLOURS, COLOUR_HEX, COLOUR_TEXT, FINISH_THRESHOLD } from '../lib/constants'

function fmtMs(ms) {
  if (ms == null) return '—'
  const s     = Math.floor(ms / 1000)
  const m     = Math.floor(s / 60)
  const sec   = s % 60
  const tenth = Math.floor((ms % 1000) / 100)
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${tenth}`
}

export default function FinishLine() {
  const [colourSlots, setColourSlots] = useState([])
  const [runs,        setRuns]        = useState([])
  const [flash,       setFlash]       = useState({})
  const [recentLog,   setRecentLog]   = useState([])
  const [loading,     setLoading]     = useState(true)

  const runsRef = useRef([])
  runsRef.current = runs

  const loadAll = useCallback(async () => {
    const [runsRes, slotsRes] = await Promise.all([
      supabase.from('runs').select('*, teams(name)').in('status', ['running', 'finishing']),
      supabase.from('colour_slots').select('*'),
    ])
    if (!runsRes.error)  setRuns(runsRes.data || [])
    if (!slotsRes.error) setColourSlots(slotsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('finish-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' },         () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'colour_slots' }, () => loadAll())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadAll])

  const slotMap = Object.fromEntries(colourSlots.map(s => [s.colour, s]))

  // ── tap a colour ──────────────────────────────────────────
  async function tapColour(colour) {
    const slot = slotMap[colour]

    // Free colours do nothing
    if (!slot || slot.status === 'free') {
      triggerFlash(colour, 'ignore')
      return
    }

    const activeRun = runsRef.current.find(r =>
      r.id === slot.run_id &&
      (r.status === 'running' || r.status === 'finishing')
    )

    if (!activeRun) {
      triggerFlash(colour, 'ignore')
      return
    }

    // Past full member count — ignore
    if (activeRun.finishers >= activeRun.member_count) {
      triggerFlash(colour, 'ignore')
      return
    }

    triggerFlash(colour, 'ok')

    const newFinishers = activeRun.finishers + 1
    const now          = new Date()
    const elapsed      = now.getTime() - new Date(activeRun.started_at).getTime()

    let newRunStatus  = activeRun.status
    let newSlotStatus = slot.status

    if (newFinishers >= activeRun.member_count) {
      newRunStatus  = 'done'
      newSlotStatus = 'free'
    } else if (newFinishers === FINISH_THRESHOLD && activeRun.status === 'running') {
      // Exactly hits threshold — record time, move to finishing/warning
      newRunStatus  = 'finishing'
      newSlotStatus = 'warning'
    }
    // If already in 'finishing' and adding more (but not yet to member_count), stay as-is

    const runUpdate = { finishers: newFinishers, status: newRunStatus }
    if (newFinishers === FINISH_THRESHOLD && activeRun.status === 'running') {
      runUpdate.finished_at = now.toISOString()
      runUpdate.elapsed_ms  = elapsed
    }
    if (newRunStatus === 'done' && !activeRun.finished_at) {
      runUpdate.finished_at = now.toISOString()
      runUpdate.elapsed_ms  = elapsed
    }

    await supabase.from('runs').update(runUpdate).eq('id', activeRun.id)

    if (newSlotStatus === 'free') {
      await supabase.from('colour_slots').update({ status: 'free', run_id: null, updated_at: now.toISOString() }).eq('colour', colour)
    } else if (newSlotStatus === 'warning') {
      await supabase.from('colour_slots').update({ status: 'warning', updated_at: now.toISOString() }).eq('colour', colour)
    }

    const logEntry = {
      id:        Date.now(),
      colour,
      team:      activeRun.teams?.name || colour,
      finishers: newFinishers,
      total:     activeRun.member_count,
      milestone: newFinishers === FINISH_THRESHOLD
        ? `⏱ TIME RECORDED — ${fmtMs(elapsed)}`
        : newRunStatus === 'done'
        ? `✅ ALL FINISHED — ${fmtMs(activeRun.elapsed_ms ?? elapsed)}`
        : null,
    }
    setRecentLog(prev => [logEntry, ...prev].slice(0, 20))
    loadAll()
  }

  // ── force finish ──────────────────────────────────────────
  async function forceFinish(run, colour) {
    const timeRecorded = run.finishers >= FINISH_THRESHOLD

    if (!timeRecorded) {
      const confirmed = window.confirm(
        `A time has not been recorded yet for ${run.teams?.name || colour} (only ${run.finishers} of 3 required finishers have crossed).\n\nAre you sure you want to terminate this run? No time will be saved.`
      )
      if (!confirmed) return
    }

    const now     = new Date()
    const elapsed = now.getTime() - new Date(run.started_at).getTime()

    // Build run update — preserve time if already recorded
    const runUpdate = { status: 'done', finishers: run.member_count }
    if (!timeRecorded) {
      // No time was recorded — we still need to set something so the row is valid,
      // but we mark elapsed_ms as null to signal no valid time
      runUpdate.finished_at = now.toISOString()
      runUpdate.elapsed_ms  = null
    }

    await supabase.from('runs').update(runUpdate).eq('id', run.id)
    await supabase.from('colour_slots').update({ status: 'free', run_id: null, updated_at: now.toISOString() }).eq('colour', colour)

    const logEntry = {
      id:        Date.now(),
      colour,
      team:      run.teams?.name || colour,
      finishers: run.member_count,
      total:     run.member_count,
      milestone: `🛑 FORCE FINISHED${timeRecorded ? ` — ${fmtMs(run.elapsed_ms)}` : ' — NO TIME'}`,
    }
    setRecentLog(prev => [logEntry, ...prev].slice(0, 20))
    loadAll()
  }

  function triggerFlash(colour, type) {
    setFlash(prev => ({ ...prev, [colour]: type }))
    setTimeout(() => setFlash(prev => { const n = { ...prev }; delete n[colour]; return n }), 600)
  }

  if (loading) return <div className="page"><p className="text-muted">Loading…</p></div>

  return (
    <div className="page">
      <div className="mb-3">
        <h1 style={{ fontSize: '2.2rem' }}>Finish Line</h1>
        <p className="text-muted text-sm mt-1">
          Tap a colour button each time a runner of that colour crosses the finish line.
        </p>
      </div>

      {/* Big colour tap buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
        {COLOURS.map(colour => {
          const slot      = slotMap[colour]
          const status    = slot?.status || 'free'
          // A button is "live" (tappable, fully coloured) if the slot is running OR warning
          // i.e., any time a run is associated — we only grey out when truly free
          const isLive    = status === 'running' || status === 'warning'
          const activeRun = isLive ? runs.find(r => r.id === slot?.run_id) : null
          const flashType = flash[colour]

          let borderCol = 'transparent'
          let glowCol   = 'transparent'
          if (isLive)                    { borderCol = COLOUR_HEX[colour]; glowCol = COLOUR_HEX[colour] + '55' }
          if (flashType === 'ok')        { borderCol = '#22c55e'; glowCol = '#22c55e66' }
          if (flashType === 'ignore')    { borderCol = '#ef4444'; glowCol = '#ef444444' }

          return (
            <button
              key={colour}
              onClick={() => tapColour(colour)}
              style={{
                background:     isLive ? COLOUR_HEX[colour] : '#1a1d24',
                color:          isLive ? COLOUR_TEXT[colour] : '#444',
                border:         `3px solid ${borderCol}`,
                borderRadius:   '12px',
                padding:        '1rem 0.5rem',
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            '0.4rem',
                cursor:         isLive ? 'pointer' : 'default',
                transition:     'border-color 0.15s, box-shadow 0.15s, background 0.2s',
                boxShadow:      `0 0 0 3px ${glowCol}`,
                fontSize:       '0.9rem',
                fontFamily:     'var(--font-head)',
                fontWeight:     900,
                letterSpacing:  '0.04em',
                textTransform:  'uppercase',
                userSelect:     'none',
                minHeight:      '110px',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: COLOUR_HEX[colour],
                  border: '2px solid rgba(255,255,255,0.25)',
                  display: 'block',
                  opacity: isLive ? 1 : 0.3,
                }}
              />
              <span style={{ opacity: isLive ? 1 : 0.3 }}>{colour}</span>

              {/* Always show X / Y FINISHERS while live — no WARN text */}
              {isLive && activeRun && (
                <span style={{
                  fontSize:   '0.7rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-head)',
                  opacity:    0.95,
                  textAlign:  'center',
                  lineHeight: 1.3,
                }}>
                  {activeRun.finishers} / {activeRun.member_count}
                  <br />FINISHERS
                </span>
              )}

              {/* TIME SET badge — shown once 3 have finished but not all */}
              {status === 'warning' && activeRun && (
                <span className="badge flashing" style={{ background: 'rgba(0,0,0,0.35)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: '0.58rem' }}>
                  ⏱ TIME SET
                </span>
              )}

              {/* FREE label only when truly free */}
              {!isLive && (
                <span style={{ fontSize: '0.68rem', color: '#555', fontFamily: 'var(--font-head)' }}>
                  FREE
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Active runs table with Force Finish */}
      {runs.length > 0 && (
        <div className="card mt-4">
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Active Runs</h3>
          <table>
            <thead>
              <tr>
                <th>Colour</th>
                <th>Team</th>
                <th>Finishers</th>
                <th>Elapsed</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => {
                const slotColour = COLOURS.find(c => {
                  const s = slotMap[c]
                  return s?.run_id === run.id
                }) || run.colour

                const elapsedSec = run.started_at
                  ? Math.floor((Date.now() - new Date(run.started_at).getTime()) / 1000)
                  : 0
                const m = Math.floor(elapsedSec / 60)
                const s = elapsedSec % 60

                return (
                  <tr key={run.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: COLOUR_HEX[run.colour], display: 'inline-block', border: '1px solid rgba(255,255,255,0.2)' }} />
                        {run.colour}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{run.teams?.name}</td>
                    <td>{run.finishers} / {run.member_count}</td>
                    <td className="mono">{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</td>
                    <td>
                      <span style={{
                        fontFamily:    'var(--font-head)',
                        fontWeight:    700,
                        fontSize:      '0.78rem',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: run.status === 'finishing' ? 'var(--warning)' : 'var(--danger)',
                      }}>
                        {run.status === 'finishing'
                          ? `Finishing · ⏱ ${fmtMs(run.elapsed_ms)}`
                          : 'Running'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => forceFinish(run, run.colour)}
                        style={{
                          background:    '#ef444422',
                          color:         '#ef4444',
                          border:        '1px solid #ef444455',
                          borderRadius:  '6px',
                          padding:       '0.35rem 0.75rem',
                          fontFamily:    'var(--font-head)',
                          fontWeight:    700,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          fontSize:      '0.75rem',
                          cursor:        'pointer',
                          transition:    'all 0.15s',
                          whiteSpace:    'nowrap',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#ef444433' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#ef444422' }}
                      >
                        🛑 Force Finish
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Event log */}
      {recentLog.length > 0 && (
        <div className="card mt-4">
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Finish Log</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '300px', overflowY: 'auto' }}>
            {recentLog.map(entry => (
              <div
                key={entry.id}
                className="animate-in"
                style={{
                  display:       'flex',
                  alignItems:    'center',
                  gap:           '0.75rem',
                  padding:       '0.5rem 0.65rem',
                  background:    'var(--surface2)',
                  borderRadius:  '6px',
                  borderLeft:    `3px solid ${COLOUR_HEX[entry.colour]}`,
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: COLOUR_HEX[entry.colour], flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{entry.team}</span>
                <span className="text-muted text-sm">{entry.finishers}/{entry.total} finished</span>
                {entry.milestone && (
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-head)', fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 700 }}>
                    {entry.milestone}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
