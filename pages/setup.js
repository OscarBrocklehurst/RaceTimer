// pages/setup.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { AGE_GROUP_LABELS, AGE_GROUP_ORDER } from '../lib/constants'

export default function Setup() {
  const [teams,   setTeams]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [name,     setName]     = useState('')
  const [ageGroup, setAgeGroup] = useState('under_12')

  // Edit state
  const [editId,       setEditId]       = useState(null)
  const [editName,     setEditName]     = useState('')
  const [editAgeGroup, setEditAgeGroup] = useState('under_12')

  const fetchTeams = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('name')
    if (!error) setTeams(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTeams() }, [fetchTeams])

  async function addTeam(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!name.trim()) { setError('Team name is required.'); return }
    setSaving(true)
    const { error } = await supabase
      .from('teams')
      .insert({ name: name.trim(), age_group: ageGroup })
    if (error) {
      setError(error.message.includes('unique') ? 'A team with that name already exists.' : error.message)
    } else {
      setSuccess(`Team "${name.trim()}" added.`)
      setName('')
      fetchTeams()
    }
    setSaving(false)
  }

  async function deleteTeam(id, teamName) {
    if (!confirm(`Delete team "${teamName}"? This cannot be undone.`)) return
    await supabase.from('teams').delete().eq('id', id)
    fetchTeams()
  }

  async function saveEdit(id) {
    if (!editName.trim()) return
    await supabase.from('teams').update({ name: editName.trim(), age_group: editAgeGroup }).eq('id', id)
    setEditId(null)
    fetchTeams()
  }

  // Group teams by age group for display
  const grouped = AGE_GROUP_ORDER.reduce((acc, g) => {
    acc[g] = teams.filter(t => t.age_group === g).sort((a, b) => a.name.localeCompare(b.name))
    return acc
  }, {})

  const totalTeams = teams.length

  return (
    <div className="page">
      <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem' }}>Team Setup</h1>
          <p className="text-muted text-sm mt-1">
            Enter teams before race day. Name &amp; age group only — member count is added on the day.
          </p>
        </div>
        <div className="badge" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', fontSize: '1rem', padding: '0.4rem 1rem' }}>
          {totalTeams} team{totalTeams !== 1 ? 's' : ''} registered
        </div>
      </div>

      {/* Add team form */}
      <div className="card mt-3">
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>Add New Team</h2>
        <form onSubmit={addTeam}>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontFamily: 'var(--font-head)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Team Name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. The Lightning Bolts"
                maxLength={60}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontFamily: 'var(--font-head)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Age Group
              </label>
              <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)}>
                {AGE_GROUP_ORDER.map(g => (
                  <option key={g} value={g}>{AGE_GROUP_LABELS[g]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : '+ Add Team'}
            </button>
            {error   && <span className="text-danger text-sm">{error}</span>}
            {success && <span className="text-success text-sm">{success}</span>}
          </div>
        </form>
      </div>

      {/* Teams list grouped by age group */}
      {loading ? (
        <p className="text-muted mt-4">Loading teams…</p>
      ) : totalTeams === 0 ? (
        <p className="text-muted mt-4">No teams registered yet.</p>
      ) : (
        AGE_GROUP_ORDER.map(g => grouped[g].length === 0 ? null : (
          <div key={g} className="card mt-3">
            <h3 style={{ fontSize: '1.1rem', color: 'var(--accent)', marginBottom: '0.75rem' }}>
              {AGE_GROUP_LABELS[g]}
              <span className="text-muted text-sm" style={{ marginLeft: '0.75rem', fontFamily: 'var(--font-body)', fontWeight: 400, letterSpacing: 0 }}>
                ({grouped[g].length} team{grouped[g].length !== 1 ? 's' : ''})
              </span>
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Team Name</th>
                  <th>Age Group</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {grouped[g].map(team => (
                  <tr key={team.id}>
                    <td>
                      {editId === team.id ? (
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          style={{ maxWidth: '260px' }}
                        />
                      ) : (
                        <span style={{ fontWeight: 600 }}>{team.name}</span>
                      )}
                    </td>
                    <td>
                      {editId === team.id ? (
                        <select value={editAgeGroup} onChange={e => setEditAgeGroup(e.target.value)}>
                          {AGE_GROUP_ORDER.map(g2 => (
                            <option key={g2} value={g2}>{AGE_GROUP_LABELS[g2]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          {AGE_GROUP_LABELS[team.age_group]}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editId === team.id ? (
                        <span className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn-success btn-sm" onClick={() => saveEdit(team.id)}>Save</button>
                          <button className="btn-secondary btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                        </span>
                      ) : (
                        <span className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => { setEditId(team.id); setEditName(team.name); setEditAgeGroup(team.age_group) }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-danger btn-sm"
                            onClick={() => deleteTeam(team.id, team.name)}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
