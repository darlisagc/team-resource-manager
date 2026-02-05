import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { formatFTE } from '../../utils/calculations'

export default function TeamOverview() {
  const { getAuthHeader } = useAuth()
  const [members, setMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', role: '', team: '', weekly_hours: 40 })

  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/members', { headers: getAuthHeader() })
      const data = await res.json()
      setMembers(data)
    } catch (error) {
      console.error('Failed to fetch members:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMemberDetails = async (id) => {
    try {
      const res = await fetch(`/api/members/${id}`, { headers: getAuthHeader() })
      const data = await res.json()
      setSelectedMember(data)
    } catch (error) {
      console.error('Failed to fetch member details:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const method = formData.id ? 'PUT' : 'POST'
      const url = formData.id ? `/api/members/${formData.id}` : '/api/members'

      await fetch(url, {
        method,
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      setShowForm(false)
      setFormData({ name: '', email: '', role: '', team: '', weekly_hours: 40 })
      fetchMembers()
    } catch (error) {
      console.error('Failed to save member:', error)
    }
  }

  const handleEdit = (member) => {
    setFormData(member)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to remove this crew member?')) return
    try {
      await fetch(`/api/members/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      })
      fetchMembers()
      if (selectedMember?.id === id) setSelectedMember(null)
    } catch (error) {
      console.error('Failed to delete member:', error)
    }
  }

  const teams = [...new Set(members.map(m => m.team).filter(Boolean))]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sw-gold font-orbitron animate-pulse">SCANNING CREW DATABASE...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Crew Roster</h1>
          <p className="text-sw-gray text-sm">{members.length} crew members registered</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Add Crew Member
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Member List */}
        <div className="lg:col-span-2 space-y-4">
          {teams.map(team => (
            <div key={team} className="hologram-card p-4">
              <h3 className="font-orbitron text-sw-blue text-sm mb-3">{team}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {members.filter(m => m.team === team).map(member => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    isSelected={selectedMember?.id === member.id}
                    onClick={() => fetchMemberDetails(member.id)}
                    onEdit={() => handleEdit(member)}
                    onDelete={() => handleDelete(member.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Members without team */}
          {members.filter(m => !m.team).length > 0 && (
            <div className="hologram-card p-4">
              <h3 className="font-orbitron text-sw-gray text-sm mb-3">Unassigned</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {members.filter(m => !m.team).map(member => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    isSelected={selectedMember?.id === member.id}
                    onClick={() => fetchMemberDetails(member.id)}
                    onEdit={() => handleEdit(member)}
                    onDelete={() => handleDelete(member.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Member Details Panel */}
        <div className="lg:col-span-1">
          {selectedMember ? (
            <div className="hologram-card p-6 sticky top-6">
              <div className="text-center mb-6">
                <div className="w-20 h-20 mx-auto rounded-full bg-sw-gold/20 border-2 border-sw-gold flex items-center justify-center mb-3">
                  <span className="text-sw-gold font-orbitron text-2xl font-bold">
                    {selectedMember.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <h3 className="font-orbitron text-sw-light text-lg">{selectedMember.name}</h3>
                <p className="text-sw-gray text-sm">{selectedMember.role}</p>
                <p className="text-sw-blue text-xs">{selectedMember.team}</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between py-2 border-b border-sw-gray/20">
                  <span className="text-sw-gray text-sm">Weekly Hours</span>
                  <span className="text-sw-gold font-orbitron">{selectedMember.weekly_hours}h</span>
                </div>
                <div className="flex justify-between py-2 border-b border-sw-gray/20">
                  <span className="text-sw-gray text-sm">FTE</span>
                  <span className="text-sw-gold font-orbitron">{formatFTE(selectedMember.weekly_hours)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-sw-gray/20">
                  <span className="text-sw-gray text-sm">Email</span>
                  <span className="text-sw-light text-sm">{selectedMember.email || '-'}</span>
                </div>
              </div>

              {/* Assigned Goals */}
              {selectedMember.goals?.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-orbitron text-sw-gold text-xs mb-3">
                    ASSIGNED GOALS ({selectedMember.goals.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedMember.goals.map(goal => (
                      <div key={goal.id} className="p-2 bg-sw-darker/50 rounded border-l-2 border-sw-gold">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sw-light text-sm font-medium truncate">{goal.title}</p>
                            <p className="text-sw-gray text-xs">{goal.quarter}</p>
                          </div>
                          <div className="text-right ml-2">
                            <span className="text-sw-gold font-orbitron text-sm">{goal.progress || 0}%</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-1 text-xs text-sw-gray">
                          <span>{goal.key_result_count} KRs</span>
                          <span>{goal.initiative_count} initiatives</span>
                        </div>
                        <div className="lightsaber-bar mt-1 h-1">
                          <div
                            className={`lightsaber-bar-fill h-1 ${goal.progress >= 80 ? 'lightsaber-green' : goal.progress >= 50 ? 'lightsaber-gold' : 'lightsaber-blue'}`}
                            style={{ width: `${goal.progress || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assigned Key Results */}
              {selectedMember.keyResults?.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-orbitron text-sw-blue text-xs mb-3">
                    ASSIGNED KEY RESULTS ({selectedMember.keyResults.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedMember.keyResults.map(kr => (
                      <div key={kr.id} className="p-2 bg-sw-darker/50 rounded border-l-2 border-sw-blue">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sw-light text-sm truncate">{kr.title}</p>
                            <p className="text-sw-gray text-xs truncate">{kr.goal_title}</p>
                          </div>
                          <div className="text-right ml-2">
                            <span className="text-sw-blue font-orbitron text-sm">{kr.progress || 0}%</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-1 text-xs text-sw-gray">
                          <span>{kr.initiative_count} initiatives</span>
                          <span className={`badge badge-${kr.status === 'active' ? 'info' : kr.status === 'completed' ? 'success' : 'warning'}`}>
                            {kr.status}
                          </span>
                        </div>
                        <div className="lightsaber-bar mt-1 h-1">
                          <div
                            className="lightsaber-bar-fill h-1 lightsaber-blue"
                            style={{ width: `${kr.progress || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assigned Initiatives */}
              {selectedMember.initiatives?.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-orbitron text-sw-green text-xs mb-3">
                    ASSIGNED INITIATIVES ({selectedMember.initiatives.length})
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedMember.initiatives.map(init => (
                      <div key={init.id} className="p-2 bg-sw-darker/50 rounded border-l-2 border-sw-green">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sw-light text-sm truncate">{init.name}</p>
                            <p className="text-sw-gray text-xs truncate">{init.key_result_title || 'No Key Result'}</p>
                          </div>
                          <div className="text-right ml-2">
                            <span className="text-sw-green font-orbitron text-sm">{init.progress || 0}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`badge badge-${init.status === 'active' ? 'info' : init.status === 'completed' ? 'success' : 'warning'}`}>
                            {init.status}
                          </span>
                          {init.assignment_role && (
                            <span className="text-sw-gold text-xs">{init.assignment_role}</span>
                          )}
                          {init.actual_hours > 0 && (
                            <span className="text-sw-gray text-xs">{init.actual_hours}h logged</span>
                          )}
                        </div>
                        <div className="lightsaber-bar mt-1 h-1">
                          <div
                            className="lightsaber-bar-fill h-1 lightsaber-green"
                            style={{ width: `${init.progress || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No assignments message */}
              {!selectedMember.goals?.length && !selectedMember.keyResults?.length && !selectedMember.initiatives?.length && (
                <div className="mt-6 p-4 bg-sw-darker/30 rounded text-center">
                  <p className="text-sw-gray text-sm">No goals, key results, or initiatives assigned</p>
                </div>
              )}

              {/* Allocations */}
              {selectedMember.allocations?.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-orbitron text-sw-gold text-xs mb-3">CURRENT ASSIGNMENTS</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedMember.allocations.map(alloc => (
                      <div key={alloc.id} className="p-2 bg-sw-darker/50 rounded">
                        <div className="flex justify-between text-sm">
                          <span className="text-sw-light">{alloc.goal_title || alloc.task_title || 'Direct Assignment'}</span>
                          <span className="text-sw-gold">{alloc.allocation_percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Time Off */}
              {selectedMember.timeOff?.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-orbitron text-sw-gold text-xs mb-3">TIME OFF RECORDS</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedMember.timeOff.map(record => (
                      <div key={record.id} className="flex justify-between text-sm p-2 bg-sw-darker/50 rounded">
                        <span className={`badge badge-${record.type === 'PTO' ? 'info' : record.type === 'sick' ? 'danger' : 'warning'}`}>
                          {record.type}
                        </span>
                        <span className="text-sw-gray">{record.start_date}</span>
                        <span className="text-sw-light">{record.hours}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hologram-card p-6 text-center text-sw-gray">
              <p className="font-orbitron text-sm">Select a crew member to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="hologram-card p-6 w-full max-w-md">
            <h3 className="font-orbitron text-sw-gold text-lg mb-4">
              {formData.id ? 'Edit Crew Member' : 'Add New Crew Member'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sw-gray text-xs uppercase mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sw-gray text-xs uppercase mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sw-gray text-xs uppercase mb-1">Role</label>
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sw-gray text-xs uppercase mb-1">Team</label>
                <input
                  type="text"
                  value={formData.team}
                  onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                  className="input-field"
                  list="teams"
                />
                <datalist id="teams">
                  {teams.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sw-gray text-xs uppercase mb-1">Weekly Hours</label>
                <select
                  value={formData.weekly_hours}
                  onChange={(e) => setFormData({ ...formData, weekly_hours: parseInt(e.target.value) })}
                  className="input-field"
                >
                  <option value={40}>40 hours (1 FTE)</option>
                  <option value={30}>30 hours (0.75 FTE)</option>
                  <option value={20}>20 hours (0.5 FTE)</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-primary flex-1">Save</button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setFormData({ name: '', email: '', role: '', team: '', weekly_hours: 40 })
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberCard({ member, isSelected, onClick, onEdit, onDelete }) {
  return (
    <div
      className={`p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-sw-gold/20 border border-sw-gold'
          : 'bg-sw-darker/50 border border-sw-gray/20 hover:border-sw-gold/50'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-sw-gold/20 flex items-center justify-center">
          <span className="text-sw-gold font-orbitron text-sm">
            {member.name.split(' ').map(n => n[0]).join('')}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sw-light font-medium truncate">{member.name}</p>
          <p className="text-sw-gray text-xs truncate">{member.role}</p>
        </div>
        <div className="text-right">
          <p className="text-sw-gold font-orbitron text-sm">{member.weekly_hours}h</p>
          <p className={`text-xs ${member.current_allocation > 100 ? 'text-sw-red' : member.current_allocation > 0 ? 'text-sw-green' : 'text-sw-gray'}`}>
            {member.current_allocation || 0}% util
          </p>
          {member.time_off_hours > 0 && (
            <p className="text-xs text-sw-red">{member.time_off_hours}h off</p>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-2 justify-end">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="text-sw-blue text-xs hover:text-sw-gold"
        >
          Edit
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-sw-red/70 text-xs hover:text-sw-red"
        >
          Remove
        </button>
      </div>
    </div>
  )
}
