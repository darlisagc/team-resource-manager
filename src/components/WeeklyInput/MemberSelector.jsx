import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

export default function MemberSelector({ selectedMember, onSelectMember }) {
  const { getAuthHeader } = useAuth()
  const [members, setMembers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

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

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.team?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Group members by team
  const membersByTeam = filteredMembers.reduce((acc, member) => {
    const team = member.team || 'No Team'
    if (!acc[team]) acc[team] = []
    acc[team].push(member)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="hologram-card p-4">
        <div className="text-sw-gold font-orbitron animate-pulse text-sm">Loading team members...</div>
      </div>
    )
  }

  return (
    <div className="hologram-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-orbitron text-sw-blue text-sm">SELECT TEAM MEMBER</h3>
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-field w-48 text-sm"
        />
      </div>

      {selectedMember ? (
        <div className="flex items-center justify-between p-3 bg-sw-gold/10 border border-sw-gold/30 rounded">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sw-gold/20 border border-sw-gold/50 flex items-center justify-center">
              <span className="text-sw-gold font-orbitron font-bold">
                {selectedMember.name.charAt(0)}
              </span>
            </div>
            <div>
              <p className="text-sw-light font-medium">{selectedMember.name}</p>
              <p className="text-sw-gray text-xs">{selectedMember.team} - {selectedMember.role}</p>
            </div>
          </div>
          <button
            onClick={() => onSelectMember(null)}
            className="text-sw-blue hover:text-sw-gold text-sm"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="space-y-4 max-h-64 overflow-y-auto">
          {Object.entries(membersByTeam).map(([team, teamMembers]) => (
            <div key={team}>
              <h4 className="text-sw-gray text-xs font-orbitron mb-2">{team}</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {teamMembers.map(member => (
                  <button
                    key={member.id}
                    onClick={() => onSelectMember(member)}
                    className="p-2 text-left bg-sw-darker/50 hover:bg-sw-gold/10 border border-sw-gray/20 hover:border-sw-gold/30 rounded transition-colors"
                  >
                    <p className="text-sw-light text-sm truncate">{member.name}</p>
                    <p className="text-sw-gray text-xs truncate">{member.role}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {filteredMembers.length === 0 && (
            <p className="text-sw-gray text-center py-4">No members found</p>
          )}
        </div>
      )}
    </div>
  )
}
