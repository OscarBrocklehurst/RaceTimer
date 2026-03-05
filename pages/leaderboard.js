// pages/leaderboard.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { AGE_GROUP_LABELS, AGE_GROUP_ORDER } from '../lib/constants'
import { formatMs } from '../lib/formatTime'

// ── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    not_started:      { bg: '#1a1d2400', color: '#444',    label: 'Not Started'  },
    go_to_start:      { bg: '#3b82f622', color: '#3b82f6', label: '→ Start Line' },
    currently_running:{ bg: '#ef444422', color: '#ef4444', label: '🏃 On Course'  },
    done_run1:        { bg: '#f9731622', color: '#f97316', label: 'Run 1 Done'   },
    done_both:        { bg: '#22c55e22', color: '#22c55e', label: '✓ Finished'   },
  }
  const c = cfg[status] || cfg.not_started
  return (
    <span style={{
      display:       'inline-block',
      padding:       '0.15rem 0.5rem',
      borderRadius:  '999px',
      fontFamily:    'var(--font-head)',
      fontSize:      '0.72rem',
      fontWeight:    700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      whiteSpace:    'nowrap',
      background:    c.bg,
      color:         c.color,
      border:        `1px solid ${c.color}44`,
    }}>
      {c.label}
    </span>
  )
}

// ── Age group section header row ──────────────────────────────
function GroupHeader({ group, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{
        background:    'var(--surface2)',
        color:         'var(--accent)',
        fontFamily:    'var(--font-head)',
        fontWeight:    900,
        fontSize:      '0.78rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding:       '0.35rem 0.6rem',
        borderBottom:  '1px solid var(--border)',
      }}>
        {AGE_GROUP_LABELS[group]}
      </td>
    </tr>
  )
}

// ── TimeCell ──────────────────────────────────────────────────
function TimeCell({ run, revealed }) {
  if (!run) return <span style={{ color: '#333', fontSize: '0.8rem' }}>—</span>

  if (run.status !== 'done') {
    const map = {
      queued:    { color: '#444',              label: 'Queued'   },
      running:   { color: 'var(--danger)',     label: 'Running'  },
      finishing: { color: 'var(--warning)',    label: 'Finishing'},
    }
    const s = map[run.status] || map.queued
    return <span style={{ color: s.color, fontFamily: 'var(--font-head)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.label}</span>
  }

  if (!revealed) {
    return <span style={{ background: '#22c55e1a', color: '#22c55e', border: '1px solid #22c55e33', borderRadius: '999px', padding: '0.12rem 0.45rem', fontSize: '0.68rem', fontFamily: 'var(--font-head)', fontWeight: 700, letterSpacing: '0.05em' }}>✓</span>
  }

  return (
    <span style={{ fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '0.95rem', color: 'var(--text)', letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>
      {formatMs(run.elapsed_ms)}
    </span>
  )
}

// ── TeamRow ───────────────────────────────────────────────────
function TeamRow({ team, rank, showRank, showAgeGroup, revealRun1, revealRun2 }) {
  const isBestRun1 = team.run1?.status === 'done' && team.run2?.status === 'done'
    && team.run1.elapsed_ms != null && team.run2.elapsed_ms != null
    && team.run1.elapsed_ms <= team.run2.elapsed_ms
  const isBestRun2 = team.run1?.status === 'done' && team.run2?.status === 'done'
    && team.run1.elapsed_ms != null && team.run2.elapsed_ms != null
    && team.run2.elapsed_ms < team.run1.elapsed_ms

  const isGoToStart = team.status === 'go_to_start'

  return (
    <tr style={{
      background: rank === 1 && revealRun2
        ? 'rgba(245,158,11,0.07)'
        : isGoToStart
        ? 'rgba(59,130,246,0.05)'
        : 'transparent',
    }}>
      {showRank && (
        <td style={{ textAlign: 'center', padding: '0.3rem 0.4rem', width: '2rem' }}>
          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : <span style={{ color: '#444', fontSize: '0.8rem' }}>{rank}</span>}
        </td>
      )}
      <td style={{ padding: '0.3rem 0.6rem', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
        {team.name}
        {showAgeGroup && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: '0.4rem', fontWeight: 400 }}>
            {AGE_GROUP_LABELS[team.age_group]}
          </span>
        )}
      </td>
      {!showAgeGroup && (
        <td style={{ padding: '0.3rem 0.6rem', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{AGE_GROUP_LABELS[team.age_group]}</span>
        </td>
      )}
      <td style={{ padding: '0.3rem 0.6rem' }}>
        <StatusBadge status={team.status} />
      </td>
      <td style={{ padding: '0.3rem 0.6rem', background: isBestRun1 && revealRun1 && revealRun2 ? 'rgba(34,197,94,0.08)' : 'transparent' }}>
        <TimeCell run={team.run1} revealed={revealRun1} />
      </td>
      <td style={{ padding: '0.3rem 0.6rem', background: isBestRun2 && revealRun2 ? 'rgba(34,197,94,0.08)' : 'transparent' }}>
        <TimeCell run={team.run2} revealed={revealRun2} />
      </td>
      <td style={{ padding: '0.3rem 0.6rem' }}>
        {!revealRun2
          ? <span style={{ color: '#333', fontSize: '0.8rem' }}>—</span>
          : team.bestTime != null
          ? <span style={{ fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '0.95rem', color: rank === 1 ? 'var(--accent)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{formatMs(team.bestTime)}</span>
          : <span style={{ color: '#333', fontSize: '0.8rem' }}>—</span>
        }
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────
export default function Leaderboard() {
  const [teams,   setTeams]   = useState([])
  const [runs,    setRuns]    = useState([])
  const [loading, setLoading] = useState(true)

  const [revealRun1, setRevealRun1] = useState(false)
  const [revealRun2, setRevealRun2] = useState(false)
  const [sorted,     setSorted]     = useState(false)

  const loadAll = useCallback(async () => {
    const [teamsRes, runsRes] = await Promise.all([
      supabase.from('teams').select('*').order('name'),
      supabase.from('runs').select('*'),
    ])
    if (!teamsRes.error) setTeams(teamsRes.data || [])
    if (!runsRes.error)  setRuns(runsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('leaderboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' },  () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => loadAll())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadAll])

  // ── Enrich ───────────────────────────────────────────────
  const enriched = teams.map(team => {
    const teamRuns  = runs.filter(r => r.team_id === team.id)
    const run1      = teamRuns.find(r => r.run_number === 1)
    const run2      = teamRuns.find(r => r.run_number === 2)
    const isRunning = teamRuns.some(r => r.status === 'running' || r.status === 'finishing')
    const done1     = run1?.status === 'done'
    const done2     = run2?.status === 'done'
    const times     = [run1, run2].filter(r => r?.status === 'done' && r.elapsed_ms != null).map(r => r.elapsed_ms)
    const bestTime  = times.length > 0 ? Math.min(...times) : null

    let status = 'not_started'
    if (isRunning)           status = 'currently_running'
    else if (done1 && done2) status = 'done_both'
    else if (done1)          status = 'done_run1'
    else if (run1)           status = 'currently_running'
    else                     status = 'not_started'

    return { ...team, run1, run2, isRunning, done1, done2, bestTime, status }
  })

  // ── Queue logic: run 1s always before run 2s ─────────────
  //
  // Phase 1: any team that hasn't done run 1 yet (and isn't currently running) is eligible.
  // Phase 2: only when ALL teams have completed run 1 do we start showing run 2 next.
  //
  // Within each phase, ordering is age-group then alphabetical.

  const allRun1Done = enriched.every(t => t.done1 || t.isRunning)

  const awaitingRun1 = enriched
    .filter(t => !t.done1 && !t.isRunning)
    .sort((a, b) => {
      const ag = AGE_GROUP_ORDER.indexOf(a.age_group) - AGE_GROUP_ORDER.indexOf(b.age_group)
      return ag !== 0 ? ag : a.name.localeCompare(b.name)
    })

  const awaitingRun2 = enriched
    .filter(t => t.done1 && !t.done2 && !t.isRunning)
    .sort((a, b) => {
      const ag = AGE_GROUP_ORDER.indexOf(a.age_group) - AGE_GROUP_ORDER.indexOf(b.age_group)
      return ag !== 0 ? ag : a.name.localeCompare(b.name)
    })

  // Pick the next team to get the 'go_to_start' badge
  const nextTeam = awaitingRun1.length > 0
    ? awaitingRun1[0]        // still run 1s to do — always pick from there
    : awaitingRun2[0] || null  // all run 1s done — pick first awaiting run 2

  if (nextTeam) {
    const match = enriched.find(t => t.id === nextTeam.id)
    if (match) match.status = 'go_to_start'
  }

  // ── Sort for display ──────────────────────────────────────
  let display = [...enriched]
  if (sorted && revealRun2) {
    display.sort((a, b) => {
      if (a.bestTime != null && b.bestTime != null) return a.bestTime - b.bestTime
      if (a.bestTime != null) return -1
      if (b.bestTime != null) return  1
      return a.name.localeCompare(b.name)
    })
  } else {
    display.sort((a, b) => {
      const ag = AGE_GROUP_ORDER.indexOf(a.age_group) - AGE_GROUP_ORDER.indexOf(b.age_group)
      return ag !== 0 ? ag : a.name.localeCompare(b.name)
    })
  }

  const totalCount    = enriched.length
  const finishedCount = enriched.filter(t => t.done1 || t.done2).length
  const showRankCol   = sorted && revealRun2

  if (loading) return (
    <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading leaderboard…</div>
  )

  return (
    // Full-viewport fluid container — no max-width cap, scales freely when zoomed out
    <div style={{ width: '100%', padding: '0.75rem 1rem 2rem', boxSizing: 'border-box' }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 2.2rem)', marginBottom: '0.15rem' }}>🏆 Leaderboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Live · {totalCount} teams · {finishedCount} with at least one run complete
            {nextTeam && (
              <span style={{ marginLeft: '0.75rem', color: '#3b82f6', fontFamily: 'var(--font-head)', fontWeight: 700 }}>
                · Next: {nextTeam.name} ({awaitingRun1.length > 0 ? 'Run 1' : 'Run 2'})
              </span>
            )}
          </p>
        </div>

        {/* Controls — compact horizontal strip */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>

          <button
            onClick={() => setRevealRun1(v => !v)}
            style={{
              background:    revealRun1 ? '#ef444422' : '#3b82f618',
              color:         revealRun1 ? '#ef4444'   : '#3b82f6',
              border:        `1px solid ${revealRun1 ? '#ef444455' : '#3b82f644'}`,
              borderRadius:  '6px',
              padding:       '0.45rem 0.9rem',
              fontFamily:    'var(--font-head)',
              fontWeight:    700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontSize:      '0.78rem',
              cursor:        'pointer',
              whiteSpace:    'nowrap',
            }}
          >
            {revealRun1 ? '🙈 Hide Run 1' : '🌅 Reveal Run 1'}
          </button>

          <button
            onClick={() => { setRevealRun2(v => !v); if (revealRun2) setSorted(false) }}
            style={{
              background:    revealRun2 ? '#ef444422' : '#f59e0b18',
              color:         revealRun2 ? '#ef4444'   : '#f59e0b',
              border:        `1px solid ${revealRun2 ? '#ef444455' : '#f59e0b44'}`,
              borderRadius:  '6px',
              padding:       '0.45rem 0.9rem',
              fontFamily:    'var(--font-head)',
              fontWeight:    700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontSize:      '0.78rem',
              cursor:        'pointer',
              whiteSpace:    'nowrap',
            }}
          >
            {revealRun2 ? '🙈 Hide Run 2' : '🌇 Reveal Run 2'}
          </button>

          <button
            disabled={!revealRun2}
            onClick={() => setSorted(v => !v)}
            style={{
              background:    sorted ? '#22c55e22' : 'var(--surface2)',
              color:         sorted ? '#22c55e'   : revealRun2 ? 'var(--text)' : '#333',
              border:        `1px solid ${sorted ? '#22c55e55' : 'var(--border)'}`,
              borderRadius:  '6px',
              padding:       '0.45rem 0.9rem',
              fontFamily:    'var(--font-head)',
              fontWeight:    700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontSize:      '0.78rem',
              cursor:        revealRun2 ? 'pointer' : 'not-allowed',
              opacity:       revealRun2 ? 1 : 0.35,
              whiteSpace:    'nowrap',
            }}
          >
            {sorted ? '🔤 Original' : '🏅 Rank by Time'}
          </button>
        </div>
      </div>

      {/* Status banner */}
      {revealRun1 && !revealRun2 && (
        <div style={{ background: '#3b82f610', border: '1px solid #3b82f630', borderRadius: '5px', padding: '0.3rem 0.8rem', marginBottom: '0.5rem', color: '#3b82f6', fontSize: '0.75rem', fontFamily: 'var(--font-head)', letterSpacing: '0.05em' }}>
          🌅 MORNING RESULTS VISIBLE — Afternoon times still hidden
        </div>
      )}
      {revealRun2 && (
        <div style={{ background: '#f59e0b10', border: '1px solid #f59e0b30', borderRadius: '5px', padding: '0.3rem 0.8rem', marginBottom: '0.5rem', color: 'var(--accent)', fontSize: '0.75rem', fontFamily: 'var(--font-head)', letterSpacing: '0.05em' }}>
          🌇 ALL TIMES REVEALED
        </div>
      )}

      {/* ── Table — fluid width, compact rows ── */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              {showRankCol && <th style={{ ...thStyle, width: '2rem', textAlign: 'center' }}>#</th>}
              <th style={{ ...thStyle }}>Team</th>
              {!showRankCol && <th style={{ ...thStyle }}>Group</th>}
              <th style={{ ...thStyle }}>Status</th>
              <th style={{ ...thStyle }}>
                Run 1{!revealRun1 && <span style={{ color: '#383838', marginLeft: '0.3rem', fontWeight: 400 }}>●</span>}
              </th>
              <th style={{ ...thStyle }}>
                Run 2{!revealRun2 && <span style={{ color: '#383838', marginLeft: '0.3rem', fontWeight: 400 }}>●</span>}
              </th>
              <th style={{ ...thStyle }}>
                Best{!revealRun2 && <span style={{ color: '#383838', marginLeft: '0.3rem', fontWeight: 400 }}>●</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {showRankCol ? (
              display.map((team, i) => (
                <TeamRow
                  key={team.id}
                  team={team}
                  rank={i + 1}
                  showRank={true}
                  showAgeGroup={true}
                  revealRun1={revealRun1}
                  revealRun2={revealRun2}
                />
              ))
            ) : (
              AGE_GROUP_ORDER.flatMap(g => {
                const groupTeams = display.filter(t => t.age_group === g)
                if (groupTeams.length === 0) return []
                return [
                  <GroupHeader key={`h-${g}`} group={g} colSpan={6} />,
                  ...groupTeams.map(team => (
                    <TeamRow
                      key={team.id}
                      team={team}
                      rank={null}
                      showRank={false}
                      showAgeGroup={false}
                      revealRun1={revealRun1}
                      revealRun2={revealRun2}
                    />
                  )),
                ]
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Shared th style ───────────────────────────────────────────
const thStyle = {
  fontFamily:    'var(--font-head)',
  fontWeight:    700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  fontSize:      '0.7rem',
  color:         'var(--text-muted)',
  textAlign:     'left',
  padding:       '0.4rem 0.6rem',
  borderBottom:  '1px solid var(--border)',
  whiteSpace:    'nowrap',
}
