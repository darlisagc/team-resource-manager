import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { WEEKS_PER_QUARTER } from '../../utils/calculations'

export default function Initiatives() {
  const { getAuthHeader } = useAuth()
  const [initiatives, setInitiatives] = useState([])
  const [goals, setGoals] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [timeOff, setTimeOff] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [quarters, setQuarters] = useState([])
  const [selectedQuarter, setSelectedQuarter] = useState('')

  useEffect(() => {
    fetchQuarters()
    fetchTeamMembers()
    fetchTimeOff()
    fetchGoalsAndKRs()
  }, [])

  useEffect(() => {
    if (selectedQuarter) {
      fetchInitiatives()
    }
  }, [selectedQuarter])

  const fetchGoalsAndKRs = async () => {
    try {
      const [goalsRes, krsRes] = await Promise.all([
        fetch('/api/goals', { headers: getAuthHeader() }),
        fetch('/api/key-results', { headers: getAuthHeader() })
      ])
      const goalsData = await goalsRes.json()
      const krsData = await krsRes.json()
      setGoals(goalsData)
      setKeyResults(krsData)
    } catch (error) {
      console.error('Failed to fetch goals/KRs:', error)
    }
  }

  const fetchQuarters = async () => {
    try {
      const res = await fetch('/api/dashboard/quarters', { headers: getAuthHeader() })
      const data = await res.json()
      // Add "All Quarters" option at the beginning, default to it
      setQuarters(['All Quarters', ...data])
      setSelectedQuarter('All Quarters')
    } catch (error) {
      console.error('Failed to fetch quarters:', error)
    }
  }

  const fetchInitiatives = async () => {
    setLoading(true)
    try {
      // If "All Quarters" selected, don't filter by quarter
      const url = selectedQuarter === 'All Quarters'
        ? '/api/initiatives'
        : `/api/initiatives?quarter=${encodeURIComponent(selectedQuarter)}`
      const res = await fetch(url, { headers: getAuthHeader() })
      const data = await res.json()
      setInitiatives(data)
    } catch (error) {
      console.error('Failed to fetch initiatives:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTeamMembers = async () => {
    try {
      const res = await fetch('/api/members', { headers: getAuthHeader() })
      const data = await res.json()
      setTeamMembers(data)
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    }
  }

  const fetchTimeOff = async () => {
    try {
      const res = await fetch('/api/timeoff', { headers: getAuthHeader() })
      const data = await res.json()
      setTimeOff(data)
    } catch (error) {
      console.error('Failed to fetch time off:', error)
    }
  }

  const updateEstimate = async (initiativeId, hours) => {
    setSaving(prev => ({ ...prev, [initiativeId]: true }))
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/estimate`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimated_hours: parseFloat(hours) || 0 })
      })
      if (res.ok) {
        setInitiatives(prev => prev.map(i =>
          i.id === initiativeId ? { ...i, estimated_hours: parseFloat(hours) || 0 } : i
        ))
      }
    } catch (error) {
      console.error('Failed to update estimate:', error)
    } finally {
      setSaving(prev => ({ ...prev, [initiativeId]: false }))
    }
  }

  const moveToQuarter = async (initiativeId, targetQuarter) => {
    if (targetQuarter === selectedQuarter) return

    setSaving(prev => ({ ...prev, [initiativeId]: true }))
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/quarter`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter: targetQuarter })
      })
      if (res.ok) {
        // Remove from current list since it moved to another quarter
        setInitiatives(prev => prev.filter(i => i.id !== initiativeId))
      }
    } catch (error) {
      console.error('Failed to move initiative:', error)
    } finally {
      setSaving(prev => ({ ...prev, [initiativeId]: false }))
    }
  }

  // Group all goals, KRs, and initiatives together
  const groupedByGoal = useMemo(() => {
    const groups = {}

    // First, add all goals (filtered by selected quarter or show all)
    goals.forEach(goal => {
      // Filter by quarter if not "All Quarters"
      if (selectedQuarter !== 'All Quarters' && goal.quarter !== selectedQuarter) {
        return
      }

      groups[goal.title] = {
        goalId: goal.id,
        goalTitle: goal.title,
        goalQuarter: goal.quarter,
        goalProgress: goal.progress || 0,
        keyResults: {}
      }
    })

    // Add key results to their goals
    keyResults.forEach(kr => {
      const goal = goals.find(g => g.id === kr.goal_id)
      if (!goal || !groups[goal.title]) return

      groups[goal.title].keyResults[kr.title] = {
        krId: kr.id,
        krTitle: kr.title,
        krProgress: kr.progress || 0,
        krTarget: kr.target_value,
        krCurrent: kr.current_value,
        initiatives: []
      }
    })

    // Add initiatives to their key results
    initiatives.forEach(init => {
      const goalKey = init.goal_title
      if (!groups[goalKey]) return

      const krKey = init.key_result_title
      if (!groups[goalKey].keyResults[krKey]) {
        groups[goalKey].keyResults[krKey] = {
          krId: init.key_result_id,
          krTitle: krKey,
          krProgress: 0,
          initiatives: []
        }
      }
      groups[goalKey].keyResults[krKey].initiatives.push(init)
    })

    return groups
  }, [initiatives, goals, keyResults, selectedQuarter])

  // Calculate totals
  const totals = useMemo(() => {
    const totalEstimatedHours = initiatives.reduce((sum, i) => sum + (i.estimated_hours || 0), 0)
    const totalFTEWeeks = totalEstimatedHours / 40

    // Team capacity
    const totalWeeklyHours = teamMembers.reduce((sum, m) => sum + (m.weekly_hours || 40), 0)
    const totalCapacityHours = totalWeeklyHours * WEEKS_PER_QUARTER
    const totalTimeOffHours = timeOff.reduce((sum, t) => sum + (t.hours || 0), 0)
    const availableHours = totalCapacityHours - totalTimeOffHours

    return {
      estimatedHours: totalEstimatedHours,
      estimatedFTEWeeks: totalFTEWeeks,
      capacityHours: totalCapacityHours,
      timeOffHours: totalTimeOffHours,
      availableHours,
      remainingHours: availableHours - totalEstimatedHours,
      utilizationPercent: availableHours > 0 ? (totalEstimatedHours / availableHours) * 100 : 0
    }
  }, [initiatives, teamMembers, timeOff])

  if (loading && initiatives.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sw-gold font-orbitron animate-pulse">LOADING ESTIMATES...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Quarter Estimation</h1>
          <p className="text-sw-gray text-sm">Forecast effort needed for each initiative</p>
        </div>
        <select
          value={selectedQuarter}
          onChange={(e) => setSelectedQuarter(e.target.value)}
          className="input-field w-40"
        >
          {quarters.map(q => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase">Estimated Work</p>
          <p className="text-sw-gold font-orbitron text-2xl">{totals.estimatedHours.toLocaleString()}h</p>
          <p className="text-sw-gray text-xs">{totals.estimatedFTEWeeks.toFixed(1)} FTE weeks</p>
        </div>
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase">Team Capacity</p>
          <p className="text-sw-blue font-orbitron text-2xl">{totals.capacityHours.toLocaleString()}h</p>
          <p className="text-sw-gray text-xs">{WEEKS_PER_QUARTER} weeks × {teamMembers.length} members</p>
        </div>
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase">Time Off</p>
          <p className="text-sw-purple font-orbitron text-2xl">{totals.timeOffHours}h</p>
          <p className="text-sw-gray text-xs">{(totals.timeOffHours / 8).toFixed(0)} days</p>
        </div>
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase">Available</p>
          <p className="text-sw-green font-orbitron text-2xl">{totals.availableHours.toLocaleString()}h</p>
          <p className="text-sw-gray text-xs">after time off</p>
        </div>
        <div className={`hologram-card p-4 ${totals.remainingHours < 0 ? 'border-sw-red/50' : ''}`}>
          <p className="text-sw-gray text-xs uppercase">Remaining</p>
          <p className={`font-orbitron text-2xl ${totals.remainingHours < 0 ? 'text-sw-red' : 'text-sw-green'}`}>
            {totals.remainingHours.toLocaleString()}h
          </p>
          <p className="text-sw-gray text-xs">{totals.utilizationPercent.toFixed(0)}% planned</p>
        </div>
      </div>

      {/* Capacity Bar */}
      <div className="hologram-card p-4">
        <div className="flex justify-between text-xs text-sw-gray mb-2">
          <span>Capacity Utilization</span>
          <span>{totals.estimatedHours}h / {totals.availableHours}h ({totals.utilizationPercent.toFixed(0)}%)</span>
        </div>
        <div className="h-6 bg-sw-darker rounded-lg overflow-hidden flex">
          <div
            className={`h-full transition-all ${totals.utilizationPercent > 100 ? 'bg-sw-red' : totals.utilizationPercent > 80 ? 'bg-sw-gold' : 'bg-sw-green'}`}
            style={{ width: `${Math.min(totals.utilizationPercent, 100)}%` }}
          />
          {totals.utilizationPercent > 100 && (
            <div
              className="h-full bg-sw-red/50 animate-pulse"
              style={{ width: `${Math.min(totals.utilizationPercent - 100, 50)}%` }}
            />
          )}
        </div>
        {totals.remainingHours < 0 && (
          <p className="text-sw-red text-xs mt-2">Over capacity by {Math.abs(totals.remainingHours)}h ({(totals.utilizationPercent - 100).toFixed(0)}%)</p>
        )}
      </div>

      {/* Initiatives by Goal */}
      <div className="space-y-6">
        {Object.entries(groupedByGoal).map(([goalTitle, goalData]) => (
          <div key={goalTitle} className="hologram-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-orbitron text-sw-gold text-lg">{goalTitle}</h3>
              <span className="px-2 py-1 bg-sw-gray/20 text-sw-gray text-xs rounded">{goalData.goalQuarter}</span>
            </div>

            {Object.keys(goalData.keyResults).length === 0 ? (
              <p className="text-sw-gray text-sm italic">No key results</p>
            ) : Object.entries(goalData.keyResults).map(([krTitle, krData]) => (
              <div key={krTitle} className="mb-4 last:mb-0">
                <h4 className="text-sw-blue text-sm mb-2 flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-sw-blue/20 text-sw-blue text-xs rounded">KR</span>
                  {krTitle}
                  {krData.krTarget && (
                    <span className="text-sw-gray text-xs">({krData.krCurrent || 0}/{krData.krTarget})</span>
                  )}
                </h4>

                <div className="space-y-2 ml-4">
                  {(!krData.initiatives || krData.initiatives.length === 0) ? (
                    <p className="text-sw-gray text-xs italic py-2">No initiatives</p>
                  ) : krData.initiatives.map(init => {
                    const fteWeeks = (init.estimated_hours || 0) / 40
                    return (
                      <div key={init.id} className="flex items-center gap-4 p-3 bg-sw-darker/50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {init.project_priority && (
                              <span className={`px-1.5 py-0.5 text-xs rounded ${
                                init.project_priority === 'P1' ? 'bg-red-500/20 text-red-400' :
                                init.project_priority === 'P2' ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-blue-500/20 text-blue-400'
                              }`}>{init.project_priority}</span>
                            )}
                            {init.source === 'miro' && (
                              <span className="px-1.5 py-0.5 bg-sw-gold/20 text-sw-gold text-xs rounded">Miro</span>
                            )}
                            <span className="text-sw-light">{init.name}</span>
                          </div>
                          {init.owner_name && (
                            <p className="text-sw-gray text-xs mt-0.5">Lead: {init.owner_name}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Quarter selector */}
                          <select
                            value={init.goal_quarter || selectedQuarter}
                            onChange={(e) => moveToQuarter(init.id, e.target.value)}
                            className="px-2 py-1 bg-sw-darker border border-sw-gray/30 rounded text-sw-gray text-xs focus:border-sw-gold focus:outline-none cursor-pointer"
                            title="Move to different quarter"
                          >
                            {quarters.map(q => (
                              <option key={q} value={q}>{q}</option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1">
                            {/* Whole FTE */}
                            <input
                              type="number"
                              value={Math.floor(fteWeeks) || ''}
                              onChange={(e) => {
                                const wholeFte = parseInt(e.target.value) || 0
                                const currentFraction = fteWeeks - Math.floor(fteWeeks)
                                const newFte = wholeFte + currentFraction
                                const hoursValue = Math.round(newFte * 40)
                                setInitiatives(prev => prev.map(i =>
                                  i.id === init.id ? { ...i, estimated_hours: hoursValue } : i
                                ))
                              }}
                              onBlur={() => updateEstimate(init.id, init.estimated_hours)}
                              placeholder="0"
                              className="w-12 px-1 py-1 bg-sw-darker border border-sw-gold/50 rounded text-sw-gold text-right font-orbitron focus:border-sw-gold focus:outline-none"
                              min="0"
                            />
                            <span className="text-sw-gold text-xs">FTE</span>
                            {/* Percentage */}
                            <select
                              value={Math.round((fteWeeks - Math.floor(fteWeeks)) * 100)}
                              onChange={(e) => {
                                const pct = parseInt(e.target.value) || 0
                                const wholeFte = Math.floor(fteWeeks)
                                const newFte = wholeFte + (pct / 100)
                                const hoursValue = Math.round(newFte * 40)
                                setInitiatives(prev => prev.map(i =>
                                  i.id === init.id ? { ...i, estimated_hours: hoursValue } : i
                                ))
                                updateEstimate(init.id, hoursValue)
                              }}
                              className="w-16 px-1 py-1 bg-sw-darker border border-sw-gold/50 rounded text-sw-gold text-xs font-orbitron focus:border-sw-gold focus:outline-none"
                            >
                              <option value="0">0%</option>
                              <option value="25">25%</option>
                              <option value="50">50%</option>
                              <option value="75">75%</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-1 text-sw-gray">
                            <span className="text-xs">=</span>
                            <span className="text-sw-light font-orbitron text-sm">{init.estimated_hours || 0}</span>
                            <span className="text-sw-gray text-xs">hrs</span>
                          </div>

                          {saving[init.id] && (
                            <span className="text-sw-gold text-xs animate-pulse">Saving...</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Goal subtotal */}
            <div className="mt-4 pt-3 border-t border-sw-gray/20 flex justify-between text-sm">
              <span className="text-sw-gray">Goal subtotal:</span>
              <div>
                <span className="text-sw-gold font-orbitron">
                  {Object.values(goalData.keyResults).reduce((sum, kr) => sum + (kr.initiatives || []).reduce((s, i) => s + (i.estimated_hours || 0), 0), 0)}h
                </span>
                <span className="text-sw-gray ml-2">
                  ({(Object.values(goalData.keyResults).reduce((sum, kr) => sum + (kr.initiatives || []).reduce((s, i) => s + (i.estimated_hours || 0), 0), 0) / 40).toFixed(1)} FTE wks)
                </span>
              </div>
            </div>
          </div>
        ))}

        {initiatives.length === 0 && (
          <div className="hologram-card p-8 text-center">
            <p className="text-sw-gray">No initiatives found for {selectedQuarter}</p>
            <p className="text-sw-gray text-sm mt-2">Import from Miro or Leapsome to get started</p>
          </div>
        )}
      </div>

      {/* Quick Reference */}
      <div className="hologram-card p-4">
        <h3 className="font-orbitron text-sw-gold text-sm mb-3">QUICK REFERENCE</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
          <div className="p-2 bg-sw-darker/50 rounded">
            <p className="text-sw-gold font-orbitron">8h</p>
            <p className="text-sw-gray text-xs">= 1 day</p>
          </div>
          <div className="p-2 bg-sw-darker/50 rounded">
            <p className="text-sw-gold font-orbitron">40h</p>
            <p className="text-sw-gray text-xs">= 1 FTE week</p>
          </div>
          <div className="p-2 bg-sw-darker/50 rounded">
            <p className="text-sw-gold font-orbitron">160h</p>
            <p className="text-sw-gray text-xs">= 1 FTE month</p>
          </div>
          <div className="p-2 bg-sw-darker/50 rounded">
            <p className="text-sw-gold font-orbitron">520h</p>
            <p className="text-sw-gray text-xs">= 1 FTE quarter</p>
          </div>
        </div>
      </div>
    </div>
  )
}
