import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import AllocationGrid from './AllocationGrid'
import MemberSelector from './MemberSelector'

// Helper: Get Monday of a given week
function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// Helper: Format date for display
function formatWeekLabel(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function WeeklyInput() {
  const { getAuthHeader } = useAuth()
  const [selectedMember, setSelectedMember] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(getMonday(new Date()))
  const [memberInitiatives, setMemberInitiatives] = useState([])
  const [allocations, setAllocations] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [totalAllocation, setTotalAllocation] = useState(0)
  const [hasChanges, setHasChanges] = useState(false)
  const [showBulkMode, setShowBulkMode] = useState(false)

  useEffect(() => {
    if (selectedMember) {
      fetchMemberInitiatives()
      fetchAllocations()
    }
  }, [selectedMember, selectedWeek])

  useEffect(() => {
    const total = allocations.reduce((sum, a) => sum + (parseFloat(a.allocation_percentage) || 0), 0)
    setTotalAllocation(total)
  }, [allocations])

  const fetchMemberInitiatives = async () => {
    try {
      const res = await fetch(`/api/initiatives/member/${selectedMember.id}`, {
        headers: getAuthHeader()
      })
      const data = await res.json()
      setMemberInitiatives(data)
    } catch (error) {
      console.error('Failed to fetch member initiatives:', error)
    }
  }

  const fetchAllocations = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/weekly-allocations/member/${selectedMember.id}?week_start=${selectedWeek}`,
        { headers: getAuthHeader() }
      )
      const data = await res.json()

      // Merge initiatives with existing allocations
      const allocMap = {}
      data.allocations.forEach(a => {
        allocMap[a.initiative_id] = a
      })

      const merged = memberInitiatives.length > 0
        ? memberInitiatives.map(init => ({
            initiative_id: init.id,
            initiative_name: init.name,
            project_priority: init.project_priority,
            role: init.role,
            allocation_percentage: allocMap[init.id]?.allocation_percentage || 0,
            notes: allocMap[init.id]?.notes || '',
            status: allocMap[init.id]?.status || 'planned'
          }))
        : data.allocations.map(a => ({
            initiative_id: a.initiative_id,
            initiative_name: a.initiative_name,
            project_priority: a.project_priority,
            role: a.role,
            allocation_percentage: a.allocation_percentage,
            notes: a.notes || '',
            status: a.status
          }))

      setAllocations(merged)
      setHasChanges(false)
    } catch (error) {
      console.error('Failed to fetch allocations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAllocationChange = (initiativeId, field, value) => {
    setAllocations(prev => prev.map(a =>
      a.initiative_id === initiativeId ? { ...a, [field]: value } : a
    ))
    setHasChanges(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        team_member_id: selectedMember.id,
        week_start: selectedWeek,
        allocations: allocations.filter(a => a.allocation_percentage > 0).map(a => ({
          initiative_id: a.initiative_id,
          allocation_percentage: parseFloat(a.allocation_percentage) || 0,
          notes: a.notes,
          status: a.status
        }))
      }

      const res = await fetch('/api/weekly-allocations/bulk', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const data = await res.json()
        setHasChanges(false)
        // Refresh data
        fetchAllocations()
      }
    } catch (error) {
      console.error('Failed to save allocations:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleCopyFromLastWeek = async () => {
    const lastWeek = new Date(selectedWeek)
    lastWeek.setDate(lastWeek.getDate() - 7)
    const lastWeekStr = lastWeek.toISOString().split('T')[0]

    try {
      const res = await fetch('/api/weekly-allocations/copy-from-week', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_member_id: selectedMember.id,
          source_week: lastWeekStr,
          target_week: selectedWeek
        })
      })

      if (res.ok) {
        fetchAllocations()
      }
    } catch (error) {
      console.error('Failed to copy from last week:', error)
    }
  }

  const navigateWeek = (direction) => {
    const current = new Date(selectedWeek)
    current.setDate(current.getDate() + (direction * 7))
    setSelectedWeek(current.toISOString().split('T')[0])
  }

  const priorityColors = {
    P1: 'text-sw-red',
    P2: 'text-sw-gold',
    P3: 'text-sw-blue',
    P4: 'text-sw-green'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Weekly Allocation Check-in</h1>
          <p className="text-sw-gray text-sm">Record your time allocation per initiative</p>
        </div>
        <button
          onClick={() => setShowBulkMode(!showBulkMode)}
          className="btn-secondary text-sm"
        >
          {showBulkMode ? 'Single Mode' : 'Manager View'}
        </button>
      </div>

      {/* Week Selection */}
      <div className="hologram-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigateWeek(-1)}
              className="text-sw-blue hover:text-sw-gold text-xl"
            >
              &lt;
            </button>
            <div className="text-center">
              <p className="text-sw-gray text-xs">Week of</p>
              <p className="font-orbitron text-sw-gold text-lg">{formatWeekLabel(selectedWeek)}</p>
            </div>
            <button
              onClick={() => navigateWeek(1)}
              className="text-sw-blue hover:text-sw-gold text-xl"
            >
              &gt;
            </button>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="date"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(getMonday(e.target.value))}
              className="input-field"
            />
            <button
              onClick={() => setSelectedWeek(getMonday(new Date()))}
              className="btn-secondary text-sm"
            >
              Current Week
            </button>
          </div>
        </div>
      </div>

      {/* Member Selection */}
      <MemberSelector
        selectedMember={selectedMember}
        onSelectMember={setSelectedMember}
      />

      {/* Allocation Grid */}
      {selectedMember ? (
        <div className="hologram-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-orbitron text-sw-light">
              Allocations for {selectedMember.name}
            </h2>
            <div className="flex items-center gap-4">
              <button
                onClick={handleCopyFromLastWeek}
                className="btn-secondary text-sm"
              >
                Copy from Last Week
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="text-sw-gold font-orbitron animate-pulse">Loading allocations...</div>
            </div>
          ) : allocations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sw-gray">No initiatives assigned to this member.</p>
              <p className="text-sw-gray text-sm mt-2">Assign initiatives first in the Initiatives page.</p>
            </div>
          ) : (
            <>
              <AllocationGrid
                allocations={allocations}
                priorityColors={priorityColors}
                onAllocationChange={handleAllocationChange}
              />

              {/* Summary */}
              <div className="mt-6 pt-6 border-t border-sw-gray/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-sw-gray text-sm">Total Allocation</p>
                      <p className={`font-orbitron text-2xl ${
                        totalAllocation > 100 ? 'text-sw-red' :
                        totalAllocation < 80 ? 'text-sw-gold' : 'text-sw-green'
                      }`}>
                        {totalAllocation}%
                      </p>
                    </div>
                    <div>
                      <p className="text-sw-gray text-sm">Available</p>
                      <p className="font-orbitron text-2xl text-sw-blue">100%</p>
                    </div>
                    {totalAllocation > 100 && (
                      <div className="text-sw-red text-sm">
                        Over-allocated by {totalAllocation - 100}%
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {hasChanges && (
                      <span className="text-sw-gold text-sm">Unsaved changes</span>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={saving || !hasChanges}
                      className={`btn-primary ${(!hasChanges || saving) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {saving ? 'Saving...' : 'Save Week'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="hologram-card p-8 text-center">
          <p className="text-sw-gray font-orbitron">Select a team member to enter allocations</p>
        </div>
      )}
    </div>
  )
}
