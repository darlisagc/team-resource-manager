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
  // Per-quarter BAU and Events estimation (local only, not connected to goals)
  // Format: { 'Q1 2026': { fte: 1, pct: 50 }, ... } where hours = fte × (pct/100) × 40 × weeks
  const [bauAllocations, setBauAllocations] = useState({})
  const [eventsAllocations, setEventsAllocations] = useState({})

  // Per-initiative FTE allocations: { [initId]: { fte: number, pct: number } }
  const [initiativeAllocations, setInitiativeAllocations] = useState({})

  // Per-member assignments: { [initId]: assignment[] }
  const [assignments, setAssignments] = useState({})
  // Track which initiatives are expanded to show per-member allocations
  const [expandedInitiatives, setExpandedInitiatives] = useState({})
  // Track which initiative has "add member" dropdown open
  const [addMemberDropdown, setAddMemberDropdown] = useState(null)
  // Debounce timer refs
  const [updateTimers, setUpdateTimers] = useState({})

  useEffect(() => {
    fetchQuarters()
    fetchTeamMembers()
    fetchGoalsAndKRs()
    fetchTimeOff()
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
      // Filter out "All" from API response, sort quarters, add "Full Year" and "All (Overview)"
      const quarterList = data
        .filter(q => q !== 'All' && q !== 'All Quarters')
        .sort((a, b) => {
          const [qA, yA] = a.split(' ')
          const [qB, yB] = b.split(' ')
          if (yA !== yB) return yA.localeCompare(yB)
          return qA.localeCompare(qB)
        })
      setQuarters([...quarterList, 'Full Year', 'All (Overview)'])
      setSelectedQuarter('All (Overview)')
    } catch (error) {
      console.error('Failed to fetch quarters:', error)
    }
  }

  // Check if using full year view (52 weeks capacity)
  const isFullYearView = selectedQuarter === 'Full Year' || selectedQuarter === 'All (Overview)'

  // Get actual quarter list (excluding Full Year and All Overview)
  const actualQuarters = quarters.filter(q => q !== 'Full Year' && q !== 'All (Overview)')

  // Calculate weeks based on assigned quarter
  const getWeeksForQuarter = (assignedQuarter) => {
    if (assignedQuarter === 'Full Year') return WEEKS_PER_QUARTER * 4 // 52 weeks
    if (!assignedQuarter || assignedQuarter === 'All (Overview)') return WEEKS_PER_QUARTER // default 13
    return WEEKS_PER_QUARTER // Q1-Q4 = 13 weeks each
  }

  // Calculate hours from FTE allocation: FTE × (pct/100) × 40 × weeks
  const calculateHours = (fte, pct, weeks) => {
    return Math.round(fte * (pct / 100) * 40 * weeks)
  }

  // Get allocation for an initiative (with defaults)
  const getAllocation = (initId) => {
    return initiativeAllocations[initId] || { fte: 0, pct: 0 }
  }

  // Update allocation and save hours to backend
  const updateAllocation = async (initId, assignedQuarter, newFte, newPct) => {
    const weeks = getWeeksForQuarter(assignedQuarter)
    const hours = calculateHours(newFte, newPct, weeks)

    // Update local state
    setInitiativeAllocations(prev => ({
      ...prev,
      [initId]: { fte: newFte, pct: newPct }
    }))
    setInitiatives(prev => prev.map(i =>
      i.id === initId ? { ...i, estimated_hours: hours } : i
    ))

    // Save to backend
    setSaving(prev => ({ ...prev, [initId]: true }))
    try {
      await fetch(`/api/initiatives/${initId}/estimate`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimated_hours: hours })
      })
    } catch (error) {
      console.error('Failed to update estimate:', error)
    } finally {
      setSaving(prev => ({ ...prev, [initId]: false }))
    }
  }

  const fetchInitiatives = async () => {
    setLoading(true)
    try {
      // Always fetch all initiatives, filter client-side by assigned_quarter
      const res = await fetch('/api/initiatives', { headers: getAuthHeader() })
      const data = await res.json()
      setInitiatives(data)

      // Fetch assignments for all initiatives in batch
      if (data.length > 0) {
        const initIds = data.map(i => i.id).join(',')
        const assignRes = await fetch(`/api/initiatives/assignments/batch?ids=${initIds}`, { headers: getAuthHeader() })
        if (assignRes.ok) {
          const assignData = await assignRes.json()
          setAssignments(assignData)
        }
      }
    } catch (error) {
      console.error('Failed to fetch initiatives:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter initiatives by assigned_quarter for display
  const filteredInitiatives = useMemo(() => {
    if (selectedQuarter === 'All (Overview)') {
      return initiatives
    }
    // Filter by assigned_quarter matching selected quarter
    return initiatives.filter(init => init.assigned_quarter === selectedQuarter)
  }, [initiatives, selectedQuarter])

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
      // Always fetch all time off - filtering is done in totals calculation
      const res = await fetch('/api/timeoff', { headers: getAuthHeader() })
      const data = await res.json()
      setTimeOff(data)
    } catch (error) {
      console.error('Failed to fetch time off:', error)
    }
  }

  // PTO: 23 days per employee per year
  const PTO_DAYS_PER_EMPLOYEE = 23
  const HOURS_PER_DAY = 8

  // PTO distribution percentages by quarter
  const PTO_DISTRIBUTION = { Q1: 0.15, Q2: 0.25, Q3: 0.25, Q4: 0.35 }

  // Calculate time off hours for a specific quarter
  // - Bank holidays & birthdays: from calendar (by actual dates)
  // - PTO: fixed 23 days/employee/year, distributed by quarter percentage
  const calculateTimeOffForQuarter = (allTimeOff, quarter, numEmployees) => {
    // Calculate fixed PTO: 23 days × 8 hours × number of employees
    const totalAnnualPtoHours = numEmployees * PTO_DAYS_PER_EMPLOYEE * HOURS_PER_DAY

    // Get only bank holidays and birthdays from calendar
    const bankHolidaysAndBirthdays = allTimeOff.filter(t =>
      t.type === 'bank_holiday' || t.type === 'birthday'
    )

    if (!quarter || quarter === 'Full Year' || quarter === 'All (Overview)') {
      // Full year: all bank holidays/birthdays + full annual PTO
      const calendarHours = bankHolidaysAndBirthdays.reduce((sum, t) => sum + (t.hours || 0), 0)
      return Math.round(calendarHours + totalAnnualPtoHours)
    }

    const match = quarter.match(/Q(\d)\s+(\d{4})/)
    if (!match) return 0

    const quarterNum = parseInt(match[1])
    const year = match[2]
    const startMonth = (quarterNum - 1) * 3 + 1
    const endMonth = startMonth + 2
    const endDay = [1, 3, 5, 7, 8, 10, 12].includes(endMonth) ? 31 : 30

    const quarterStart = new Date(`${year}-${String(startMonth).padStart(2, '0')}-01`)
    const quarterEnd = new Date(`${year}-${String(endMonth).padStart(2, '0')}-${endDay}`)

    let totalHours = 0

    // Bank holidays & birthdays: use actual dates from calendar
    bankHolidaysAndBirthdays.forEach(t => {
      const startDate = new Date(t.start_date)
      const endDate = new Date(t.end_date)

      // Check if overlaps with quarter
      if (startDate <= quarterEnd && endDate >= quarterStart) {
        // Calculate overlap
        const overlapStart = startDate < quarterStart ? quarterStart : startDate
        const overlapEnd = endDate > quarterEnd ? quarterEnd : endDate

        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
        const overlapDays = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1

        // Prorate hours
        const proratedHours = totalDays > 0 ? (t.hours * overlapDays / totalDays) : t.hours
        totalHours += proratedHours
      }
    })

    // PTO: fixed 23 days/employee distributed by quarter percentage
    const quarterKey = `Q${quarterNum}`
    totalHours += totalAnnualPtoHours * (PTO_DISTRIBUTION[quarterKey] || 0.25)

    return Math.round(totalHours)
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

  const updateKrEstimate = async (krId, hours) => {
    setSaving(prev => ({ ...prev, [`kr-${krId}`]: true }))
    try {
      const res = await fetch(`/api/key-results/${krId}/estimate`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimated_hours: parseFloat(hours) || 0 })
      })
      if (res.ok) {
        setKeyResults(prev => prev.map(kr =>
          kr.id === krId ? { ...kr, estimated_hours: parseFloat(hours) || 0 } : kr
        ))
      }
    } catch (error) {
      console.error('Failed to update KR estimate:', error)
    } finally {
      setSaving(prev => ({ ...prev, [`kr-${krId}`]: false }))
    }
  }

  const moveToQuarter = async (initiativeId, targetQuarter) => {
    // Update local state immediately
    setInitiatives(prev => prev.map(i =>
      i.id === initiativeId ? { ...i, assigned_quarter: targetQuarter || null } : i
    ))

    // If empty, just update local state (unassigned)
    if (!targetQuarter) return

    setSaving(prev => ({ ...prev, [initiativeId]: true }))
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/quarter`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter: targetQuarter })
      })
      if (res.ok) {
        const updated = await res.json()
        setInitiatives(prev => prev.map(i =>
          i.id === initiativeId ? { ...i, assigned_quarter: updated.assigned_quarter } : i
        ))
      }
    } catch (error) {
      console.error('Failed to assign quarter:', error)
    } finally {
      setSaving(prev => ({ ...prev, [initiativeId]: false }))
    }
  }

  // Calculate hours for a single member's allocation
  const calculateMemberHours = (pct, weeks = 13) => Math.round(pct / 100 * 40 * weeks)

  // Toggle initiative expansion
  const toggleExpanded = (initId) => {
    setExpandedInitiatives(prev => ({
      ...prev,
      [initId]: !prev[initId]
    }))
  }

  // Add member to initiative
  const handleAddAssignment = async (initId, memberId) => {
    setAddMemberDropdown(null)
    try {
      const res = await fetch(`/api/initiatives/${initId}/assignments`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_member_id: memberId, allocation_percentage: 0 })
      })
      if (res.ok) {
        const newAssignment = await res.json()
        setAssignments(prev => ({
          ...prev,
          [initId]: [...(prev[initId] || []), newAssignment]
        }))
        // Update initiative's estimated_hours from response
        if (newAssignment.initiative_estimated_hours !== undefined) {
          setInitiatives(prev => prev.map(i =>
            i.id === initId ? { ...i, estimated_hours: newAssignment.initiative_estimated_hours } : i
          ))
        }
      }
    } catch (error) {
      console.error('Failed to add assignment:', error)
    }
  }

  // Update member allocation with debounce
  const handleUpdateAllocation = (initId, memberId, pct) => {
    // Optimistic update for UI
    setAssignments(prev => ({
      ...prev,
      [initId]: (prev[initId] || []).map(a =>
        a.team_member_id === memberId ? { ...a, allocation_percentage: pct } : a
      )
    }))

    // Calculate new total for this initiative
    const currentAssignments = assignments[initId] || []
    const newTotal = currentAssignments.reduce((sum, a) => {
      if (a.team_member_id === memberId) return sum + pct
      return sum + (a.allocation_percentage || 0)
    }, 0)
    const weeks = getWeeksForQuarter(initiatives.find(i => i.id === initId)?.assigned_quarter)
    const newHours = Math.round(newTotal / 100 * 40 * weeks)
    setInitiatives(prev => prev.map(i =>
      i.id === initId ? { ...i, estimated_hours: newHours, total_allocation_pct: newTotal } : i
    ))

    // Debounced API call
    const timerKey = `${initId}-${memberId}`
    if (updateTimers[timerKey]) {
      clearTimeout(updateTimers[timerKey])
    }
    const timer = setTimeout(async () => {
      setSaving(prev => ({ ...prev, [`assign-${initId}-${memberId}`]: true }))
      try {
        const res = await fetch(`/api/initiatives/${initId}/assignments/${memberId}`, {
          method: 'PUT',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ allocation_percentage: pct })
        })
        if (res.ok) {
          const updated = await res.json()
          // Sync estimated_hours from backend
          if (updated.initiative_estimated_hours !== undefined) {
            setInitiatives(prev => prev.map(i =>
              i.id === initId ? { ...i, estimated_hours: updated.initiative_estimated_hours } : i
            ))
          }
        }
      } catch (error) {
        console.error('Failed to update allocation:', error)
      } finally {
        setSaving(prev => ({ ...prev, [`assign-${initId}-${memberId}`]: false }))
      }
    }, 500)
    setUpdateTimers(prev => ({ ...prev, [timerKey]: timer }))
  }

  // Remove member from initiative
  const handleRemoveAssignment = async (initId, memberId) => {
    // Optimistic update
    setAssignments(prev => ({
      ...prev,
      [initId]: (prev[initId] || []).filter(a => a.team_member_id !== memberId)
    }))

    try {
      const res = await fetch(`/api/initiatives/${initId}/assignments/${memberId}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      })
      if (res.ok) {
        const data = await res.json()
        // Update estimated_hours from response
        if (data.initiative_estimated_hours !== undefined) {
          setInitiatives(prev => prev.map(i =>
            i.id === initId ? { ...i, estimated_hours: data.initiative_estimated_hours } : i
          ))
        }
      }
    } catch (error) {
      console.error('Failed to remove assignment:', error)
    }
  }

  // Get available members (not already assigned to this initiative)
  const getAvailableMembers = (initId) => {
    const assigned = assignments[initId] || []
    const assignedIds = assigned.map(a => a.team_member_id)
    return teamMembers.filter(m => !assignedIds.includes(m.id))
  }

  // Assign KR to a quarter
  const updateKrQuarter = async (krId, targetQuarter) => {
    // Update local state immediately
    setKeyResults(prev => prev.map(kr =>
      kr.id === krId ? { ...kr, assigned_quarter: targetQuarter || null } : kr
    ))

    if (!targetQuarter) return

    setSaving(prev => ({ ...prev, [`kr-${krId}`]: true }))
    try {
      await fetch(`/api/key-results/${krId}/quarter`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter: targetQuarter })
      })
    } catch (error) {
      console.error('Failed to assign KR quarter:', error)
    } finally {
      setSaving(prev => ({ ...prev, [`kr-${krId}`]: false }))
    }
  }

  // Group all goals, KRs, and initiatives together
  const groupedByGoal = useMemo(() => {
    const groups = {}
    const unassigned = []

    // First, organize filtered initiatives by goal and KR
    filteredInitiatives.forEach(init => {
      // Skip BAU and Events - handled as generic estimates
      if (init.goal_title?.includes('Business as Usual') || init.goal_title === 'Events') {
        return
      }

      const goalKey = init.goal_title
      if (!goalKey) {
        // Initiative has no goal
        unassigned.push(init)
        return
      }

      // Create goal group if needed
      if (!groups[goalKey]) {
        const goal = goals.find(g => g.title === goalKey)
        groups[goalKey] = {
          goalId: goal?.id,
          goalTitle: goalKey,
          goalQuarter: goal?.quarter,
          goalProgress: goal?.progress || 0,
          keyResults: {}
        }
      }

      const krKey = init.key_result_title
      if (!krKey) {
        // Initiative has goal but no KR - track under "Unassigned KR"
        if (!groups[goalKey].keyResults['_unassigned']) {
          groups[goalKey].keyResults['_unassigned'] = {
            krId: null,
            krTitle: 'Unassigned to Key Result',
            krProgress: 0,
            initiatives: []
          }
        }
        groups[goalKey].keyResults['_unassigned'].initiatives.push(init)
        return
      }

      // Create KR group if needed
      if (!groups[goalKey].keyResults[krKey]) {
        const kr = keyResults.find(k => k.id === init.key_result_id)
        groups[goalKey].keyResults[krKey] = {
          krId: init.key_result_id,
          krTitle: krKey,
          krProgress: kr?.progress || 0,
          krTarget: kr?.target_value,
          krCurrent: kr?.current_value,
          krAssignedQuarter: kr?.assigned_quarter || null,
          initiatives: []
        }
      }
      groups[goalKey].keyResults[krKey].initiatives.push(init)
    })

    return { groups, unassigned }
  }, [filteredInitiatives, goals, keyResults])

  // Calculate totals (exclude BAU/Events initiatives, use generic estimates instead)
  const totals = useMemo(() => {
    // Calculate initiative hours from per-member assignments
    const initiativeHours = filteredInitiatives
      .filter(i => !i.goal_title?.includes('Business as Usual') && i.goal_title !== 'Events')
      .reduce((sum, i) => {
        const initAssignments = assignments[i.id] || []
        const totalPct = initAssignments.reduce((s, a) => s + (a.allocation_percentage || 0), 0)
        const weeks = getWeeksForQuarter(i.assigned_quarter)
        return sum + Math.round(totalPct / 100 * 40 * weeks)
      }, 0)

    const krHours = keyResults
      .filter(kr => !kr.goal_title?.includes('Business as Usual') && kr.goal_title !== 'Events')
      .reduce((sum, kr) => sum + (kr.estimated_hours || 0), 0)

    // Calculate BAU/Events hours from allocations (summed if Full Year/All view)
    const bauHours = isFullYearView
      ? actualQuarters.reduce((sum, q) => {
          const alloc = bauAllocations[q] || { fte: 0, pct: 0 }
          return sum + calculateHours(alloc.fte, alloc.pct, WEEKS_PER_QUARTER)
        }, 0)
      : (() => {
          const alloc = bauAllocations[selectedQuarter] || { fte: 0, pct: 0 }
          return calculateHours(alloc.fte, alloc.pct, WEEKS_PER_QUARTER)
        })()

    const eventsHours = isFullYearView
      ? actualQuarters.reduce((sum, q) => {
          const alloc = eventsAllocations[q] || { fte: 0, pct: 0 }
          return sum + calculateHours(alloc.fte, alloc.pct, WEEKS_PER_QUARTER)
        }, 0)
      : (() => {
          const alloc = eventsAllocations[selectedQuarter] || { fte: 0, pct: 0 }
          return calculateHours(alloc.fte, alloc.pct, WEEKS_PER_QUARTER)
        })()

    const totalEstimatedHours = initiativeHours + krHours + bauHours + eventsHours
    const totalFTEWeeks = totalEstimatedHours / 40

    // Team capacity - use 52 weeks for Full Year / All views, 13 weeks for single quarter
    const weeksForCapacity = isFullYearView ? WEEKS_PER_QUARTER * 4 : WEEKS_PER_QUARTER
    const totalWeeklyHours = teamMembers.reduce((sum, m) => sum + (m.effective_weekly_hours || m.weekly_hours || 40), 0)
    const totalCapacityHours = totalWeeklyHours * weeksForCapacity
    // Calculate time off:
    // - Bank holidays & birthdays: from calendar (by actual dates)
    // - PTO: 23 days/employee/year distributed (Q1:15%, Q2:25%, Q3:25%, Q4:35%)
    const totalTimeOffHours = calculateTimeOffForQuarter(timeOff, selectedQuarter, teamMembers.length)
    const availableHours = totalCapacityHours - totalTimeOffHours

    return {
      estimatedHours: totalEstimatedHours,
      estimatedFTEWeeks: totalFTEWeeks,
      capacityHours: totalCapacityHours,
      timeOffHours: totalTimeOffHours,
      availableHours,
      remainingHours: availableHours - totalEstimatedHours,
      utilizationPercent: availableHours > 0 ? (totalEstimatedHours / availableHours) * 100 : 0,
      weeksUsed: weeksForCapacity,
      bauHours,
      eventsHours
    }
  }, [filteredInitiatives, teamMembers, timeOff, bauAllocations, eventsAllocations, isFullYearView, keyResults, selectedQuarter, actualQuarters, assignments])

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
          <p className="text-sw-gray text-xs">{totals.weeksUsed} weeks × {teamMembers.length} members</p>
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

      {/* Unassigned Initiatives */}
      {groupedByGoal.unassigned && groupedByGoal.unassigned.length > 0 && (
        <div className="hologram-card p-6 border-sw-gold/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-orbitron text-sw-gold text-lg">Unassigned Tasks</h3>
            <span className="px-2 py-1 bg-sw-gold/20 text-sw-gold text-xs rounded">{groupedByGoal.unassigned.length} tasks</span>
          </div>
          <p className="text-sw-gray text-sm mb-4">Assign these tasks to a quarter to include them in capacity planning</p>
          <div className="space-y-2">
            {groupedByGoal.unassigned.map(init => {
              const allocation = getAllocation(init.id)
              const weeks = getWeeksForQuarter(init.assigned_quarter)
              const calculatedHours = calculateHours(allocation.fte, allocation.pct, weeks)
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
                      <span className="text-sw-light">{init.name}</span>
                    </div>
                    {init.owner_name && (
                      <p className="text-sw-gray text-xs mt-0.5">Lead: {init.owner_name}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Quarter selector */}
                    <select
                      value={init.assigned_quarter || ''}
                      onChange={(e) => moveToQuarter(init.id, e.target.value)}
                      className="px-2 py-1 bg-sw-darker border border-sw-gold/50 rounded text-sw-gold text-xs focus:border-sw-gold focus:outline-none cursor-pointer"
                      title="Assign to quarter"
                    >
                      <option value="">Select one option</option>
                      {quarters.filter(q => q !== 'All (Overview)').map(q => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={allocation.fte || ''}
                        onChange={(e) => {
                          const newFte = parseInt(e.target.value) || 0
                          updateAllocation(init.id, init.assigned_quarter, newFte, allocation.pct)
                        }}
                        placeholder="0"
                        className="w-12 px-1 py-1 bg-sw-darker border border-sw-gold/50 rounded text-sw-gold text-right font-orbitron focus:border-sw-gold focus:outline-none"
                        min="0"
                      />
                      <span className="text-sw-gold text-xs">FTE @</span>
                      <div className="flex items-center">
                        <input
                          type="number"
                          value={allocation.pct || ''}
                          onChange={(e) => {
                            const newPct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                            updateAllocation(init.id, init.assigned_quarter, allocation.fte, newPct)
                          }}
                          placeholder="0"
                          min="0"
                          max="100"
                          step="5"
                          className="w-14 px-1 py-1 bg-sw-darker border border-sw-gold/50 rounded text-sw-gold text-right text-xs font-orbitron focus:border-sw-gold focus:outline-none"
                        />
                        <span className="text-sw-gold text-xs ml-1">%</span>
                      </div>
                      <span className="text-sw-gray text-xs">× {weeks}w</span>
                    </div>

                    <div className="flex items-center gap-1 text-sw-gray">
                      <span className="text-xs">=</span>
                      <span className="text-sw-light font-orbitron text-sm">{calculatedHours}</span>
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
      )}

      {/* Initiatives by Goal */}
      <div className="space-y-6">
        {Object.entries(groupedByGoal.groups || {}).map(([goalTitle, goalData]) => (
          <div key={goalTitle} className="hologram-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-orbitron text-sw-gold text-lg">{goalTitle}</h3>
            </div>

            {Object.keys(goalData.keyResults).length === 0 ? (
              <p className="text-sw-gray text-sm italic">No key results</p>
            ) : Object.entries(goalData.keyResults).map(([krTitle, krData]) => {
              return (
              <div key={krTitle} className="mb-4 last:mb-0">
                <div className="flex items-center gap-2 mb-2 p-2 bg-sw-blue/5 rounded-lg">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="px-2 py-0.5 bg-sw-blue/20 text-sw-blue text-xs rounded">KR</span>
                    <span className="text-sw-blue text-sm">{krTitle}</span>
                    {krData.krTarget && (
                      <span className="text-sw-gray text-xs">({krData.krCurrent || 0}/{krData.krTarget})</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 ml-4">
                  {(!krData.initiatives || krData.initiatives.length === 0) ? (
                    <p className="text-sw-gray text-xs italic py-2">No initiatives</p>
                  ) : krData.initiatives.map(init => {
                    const initAssignments = assignments[init.id] || []
                    const isExpanded = expandedInitiatives[init.id]
                    const weeks = getWeeksForQuarter(init.assigned_quarter)
                    const totalPct = initAssignments.reduce((sum, a) => sum + (a.allocation_percentage || 0), 0)
                    const totalHours = Math.round(totalPct / 100 * 40 * weeks)
                    const availableMembers = getAvailableMembers(init.id)

                    return (
                      <div key={init.id} className="bg-sw-darker/50 rounded-lg overflow-hidden">
                        {/* Collapsed/Header Row */}
                        <div
                          className={`flex items-center gap-4 p-3 cursor-pointer hover:bg-sw-darker/70 transition-colors ${isExpanded ? 'border-b border-sw-gray/20' : ''}`}
                          onClick={() => toggleExpanded(init.id)}
                        >
                          <button className="text-sw-gold text-sm">
                            {isExpanded ? '▼' : '▶'}
                          </button>
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
                          </div>

                          <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                            {/* Summary badge */}
                            <span className="px-2 py-0.5 bg-sw-gold/20 text-sw-gold text-xs rounded">
                              {initAssignments.length} member{initAssignments.length !== 1 ? 's' : ''} @ {totalPct}%
                            </span>

                            {/* Quarter badge */}
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              !init.assigned_quarter
                                ? 'bg-sw-gray/20 text-sw-gray'
                                : init.assigned_quarter === 'Full Year'
                                  ? 'bg-sw-purple/20 text-sw-purple'
                                  : 'bg-sw-blue/20 text-sw-blue'
                            }`}>
                              {init.assigned_quarter || 'Unassigned'}
                            </span>

                            {/* Quarter selector */}
                            <select
                              value={init.assigned_quarter || ''}
                              onChange={(e) => moveToQuarter(init.id, e.target.value)}
                              className="px-2 py-1 bg-sw-darker border border-sw-gray/30 rounded text-sw-gray text-xs focus:border-sw-gold focus:outline-none cursor-pointer"
                              title="Assign to quarter"
                            >
                              <option value="">Select one option</option>
                              {quarters.filter(q => q !== 'All (Overview)').map(q => (
                                <option key={q} value={q}>{q}</option>
                              ))}
                            </select>

                            <div className="flex items-center gap-1 text-sw-gray">
                              <span className="text-xs">=</span>
                              <span className="text-sw-light font-orbitron text-sm">{totalHours}</span>
                              <span className="text-sw-gray text-xs">hrs</span>
                            </div>

                            {saving[init.id] && (
                              <span className="text-sw-gold text-xs animate-pulse">Saving...</span>
                            )}
                          </div>
                        </div>

                        {/* Expanded: Per-member allocations */}
                        {isExpanded && (
                          <div className="p-3 pl-10 space-y-2 bg-sw-darker/30">
                            {initAssignments.map(assignment => (
                              <div key={assignment.team_member_id} className="flex items-center gap-3 p-2 bg-sw-darker/50 rounded">
                                <span className="text-sw-gray text-xs">├─</span>
                                <span className="text-sw-light text-sm flex-1">
                                  {assignment.member_name}
                                  <span className="text-sw-gray text-xs ml-2">({assignment.role || 'Contributor'})</span>
                                </span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={assignment.allocation_percentage || ''}
                                    onChange={(e) => {
                                      const newPct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                                      handleUpdateAllocation(init.id, assignment.team_member_id, newPct)
                                    }}
                                    placeholder="0"
                                    min="0"
                                    max="100"
                                    step="5"
                                    className="w-14 px-1 py-1 bg-sw-darker border border-sw-gold/50 rounded text-sw-gold text-right text-xs font-orbitron focus:border-sw-gold focus:outline-none"
                                  />
                                  <span className="text-sw-gold text-xs">%</span>
                                </div>
                                <div className="flex items-center gap-1 text-sw-gray w-20">
                                  <span className="text-xs">=</span>
                                  <span className="text-sw-light font-orbitron text-xs">
                                    {calculateMemberHours(assignment.allocation_percentage || 0, weeks)}h
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleRemoveAssignment(init.id, assignment.team_member_id)}
                                  className="text-sw-red hover:text-red-400 text-xs px-1"
                                  title="Remove member"
                                >
                                  ✕
                                </button>
                                {saving[`assign-${init.id}-${assignment.team_member_id}`] && (
                                  <span className="text-sw-gold text-xs animate-pulse">...</span>
                                )}
                              </div>
                            ))}

                            {/* Add member dropdown */}
                            <div className="flex items-center gap-3 p-2">
                              <span className="text-sw-gray text-xs">└─</span>
                              {addMemberDropdown === init.id ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    autoFocus
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        handleAddAssignment(init.id, parseInt(e.target.value))
                                      }
                                    }}
                                    onBlur={() => setAddMemberDropdown(null)}
                                    className="px-2 py-1 bg-sw-darker border border-sw-gold/50 rounded text-sw-gold text-xs focus:border-sw-gold focus:outline-none"
                                  >
                                    <option value="">Select member...</option>
                                    {availableMembers.map(m => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => setAddMemberDropdown(null)}
                                    className="text-sw-gray text-xs"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAddMemberDropdown(init.id)}
                                  className="text-sw-green text-xs hover:text-green-400"
                                  disabled={availableMembers.length === 0}
                                >
                                  + Add member
                                </button>
                              )}
                            </div>

                            {/* Total row */}
                            <div className="flex items-center justify-end gap-3 pt-2 border-t border-sw-gray/20">
                              <span className="text-sw-gray text-xs">Total:</span>
                              <span className="text-sw-gold font-orbitron text-sm">{totalPct}%</span>
                              <span className="text-sw-gray text-xs">=</span>
                              <span className="text-sw-gold font-orbitron text-sm">{totalHours}h</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )})}

            {/* Goal subtotal */}
            {(() => {
              const goalTotalHours = Object.values(goalData.keyResults).reduce((sum, kr) => {
                return sum + (kr.krEstimatedHours || 0) + (kr.initiatives || []).reduce((s, i) => {
                  const initAssigns = assignments[i.id] || []
                  const totalPct = initAssigns.reduce((pSum, a) => pSum + (a.allocation_percentage || 0), 0)
                  const weeks = getWeeksForQuarter(i.assigned_quarter)
                  return s + Math.round(totalPct / 100 * 40 * weeks)
                }, 0)
              }, 0)
              return (
                <div className="mt-4 pt-3 border-t border-sw-gray/20 flex justify-between text-sm">
                  <span className="text-sw-gray">Goal subtotal:</span>
                  <div>
                    <span className="text-sw-gold font-orbitron">{goalTotalHours}h</span>
                    <span className="text-sw-gray ml-2">({(goalTotalHours / 40).toFixed(1)} FTE wks)</span>
                  </div>
                </div>
              )
            })()}
          </div>
        ))}

        {/* BAU Estimation - Per Quarter or Summary */}
        <div className="hologram-card p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-orbitron text-sw-gold text-lg">Business as Usual (BAU)</h3>
            <span className="px-2 py-1 bg-sw-gold/20 text-sw-gold text-xs rounded">
              {isFullYearView ? 'All Quarters Summary' : selectedQuarter}
            </span>
          </div>
          <p className="text-sw-gray text-sm mb-4">
            {isFullYearView
              ? 'Summary of BAU hours across all quarters'
              : `Estimate FTE hours needed for BAU activities in ${selectedQuarter}`}
          </p>

          {isFullYearView ? (
            // Summary view - show all quarters
            <div className="space-y-2">
              {actualQuarters.map(q => {
                const alloc = bauAllocations[q] || { fte: 0, pct: 0 }
                const weeks = WEEKS_PER_QUARTER
                const hours = calculateHours(alloc.fte, alloc.pct, weeks)
                return (
                  <div key={q} className="flex items-center gap-4 p-3 bg-sw-darker/50 rounded-lg">
                    <span className="text-sw-blue text-sm w-24">{q}</span>
                    <span className="text-sw-light flex-1">BAU</span>
                    <div className="flex items-center gap-1">
                      <span className="text-sw-gold font-orbitron text-sm">{alloc.fte}</span>
                      <span className="text-sw-gold text-xs">FTE @</span>
                      <span className="text-sw-gold font-orbitron text-sm">{alloc.pct}%</span>
                      <span className="text-sw-gray text-xs">× {weeks}w</span>
                    </div>
                    <div className="flex items-center gap-1 text-sw-gray">
                      <span className="text-xs">=</span>
                      <span className="text-sw-light font-orbitron text-sm">{hours}</span>
                      <span className="text-sw-gray text-xs">hrs</span>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-4 p-3 bg-sw-gold/10 rounded-lg border border-sw-gold/30 mt-3">
                <span className="text-sw-gold font-orbitron flex-1">TOTAL BAU</span>
                <span className="text-sw-gold font-orbitron text-lg">{totals.bauHours}h</span>
              </div>
            </div>
          ) : (
            // Single quarter editable view
            (() => {
              const alloc = bauAllocations[selectedQuarter] || { fte: 0, pct: 0 }
              const weeks = WEEKS_PER_QUARTER
              const hours = calculateHours(alloc.fte, alloc.pct, weeks)
              return (
                <div className="flex items-center gap-4 p-3 bg-sw-darker/50 rounded-lg">
                  <span className="text-sw-light flex-1">BAU / Operational Work</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={alloc.fte || ''}
                      onChange={(e) => {
                        const newFte = parseInt(e.target.value) || 0
                        setBauAllocations(prev => ({ ...prev, [selectedQuarter]: { ...alloc, fte: newFte } }))
                      }}
                      placeholder="0"
                      className="w-12 px-1 py-1 bg-sw-darker border border-sw-gold/50 rounded text-sw-gold text-right font-orbitron focus:border-sw-gold focus:outline-none"
                      min="0"
                    />
                    <span className="text-sw-gold text-xs">FTE @</span>
                    <div className="flex items-center">
                      <input
                        type="number"
                        value={alloc.pct || ''}
                        onChange={(e) => {
                          const newPct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                          setBauAllocations(prev => ({ ...prev, [selectedQuarter]: { ...alloc, pct: newPct } }))
                        }}
                        placeholder="0"
                        min="0"
                        max="100"
                        step="5"
                        className="w-14 px-1 py-1 bg-sw-darker border border-sw-gold/50 rounded text-sw-gold text-right text-xs font-orbitron focus:border-sw-gold focus:outline-none"
                      />
                      <span className="text-sw-gold text-xs ml-1">%</span>
                    </div>
                    <span className="text-sw-gray text-xs">× {weeks}w</span>
                  </div>
                  <div className="flex items-center gap-1 text-sw-gray">
                    <span className="text-xs">=</span>
                    <span className="text-sw-light font-orbitron text-sm">{hours}</span>
                    <span className="text-sw-gray text-xs">hrs</span>
                  </div>
                </div>
              )
            })()
          )}
        </div>

        {/* Events Estimation - Per Quarter or Summary */}
        <div className="hologram-card p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-orbitron text-sw-purple text-lg">Events</h3>
            <span className="px-2 py-1 bg-sw-purple/20 text-sw-purple text-xs rounded">
              {isFullYearView ? 'All Quarters Summary' : selectedQuarter}
            </span>
          </div>
          <p className="text-sw-gray text-sm mb-4">
            {isFullYearView
              ? 'Summary of Events hours across all quarters'
              : `Estimate FTE hours needed for events and conferences in ${selectedQuarter}`}
          </p>

          {isFullYearView ? (
            // Summary view - show all quarters
            <div className="space-y-2">
              {actualQuarters.map(q => {
                const alloc = eventsAllocations[q] || { fte: 0, pct: 0 }
                const weeks = WEEKS_PER_QUARTER
                const hours = calculateHours(alloc.fte, alloc.pct, weeks)
                return (
                  <div key={q} className="flex items-center gap-4 p-3 bg-sw-darker/50 rounded-lg">
                    <span className="text-sw-blue text-sm w-24">{q}</span>
                    <span className="text-sw-light flex-1">Events</span>
                    <div className="flex items-center gap-1">
                      <span className="text-sw-purple font-orbitron text-sm">{alloc.fte}</span>
                      <span className="text-sw-purple text-xs">FTE @</span>
                      <span className="text-sw-purple font-orbitron text-sm">{alloc.pct}%</span>
                      <span className="text-sw-gray text-xs">× {weeks}w</span>
                    </div>
                    <div className="flex items-center gap-1 text-sw-gray">
                      <span className="text-xs">=</span>
                      <span className="text-sw-light font-orbitron text-sm">{hours}</span>
                      <span className="text-sw-gray text-xs">hrs</span>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-4 p-3 bg-sw-purple/10 rounded-lg border border-sw-purple/30 mt-3">
                <span className="text-sw-purple font-orbitron flex-1">TOTAL EVENTS</span>
                <span className="text-sw-purple font-orbitron text-lg">{totals.eventsHours}h</span>
              </div>
            </div>
          ) : (
            // Single quarter editable view
            (() => {
              const alloc = eventsAllocations[selectedQuarter] || { fte: 0, pct: 0 }
              const weeks = WEEKS_PER_QUARTER
              const hours = calculateHours(alloc.fte, alloc.pct, weeks)
              return (
                <div className="flex items-center gap-4 p-3 bg-sw-darker/50 rounded-lg">
                  <span className="text-sw-light flex-1">Events / Conferences</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={alloc.fte || ''}
                      onChange={(e) => {
                        const newFte = parseInt(e.target.value) || 0
                        setEventsAllocations(prev => ({ ...prev, [selectedQuarter]: { ...alloc, fte: newFte } }))
                      }}
                      placeholder="0"
                      className="w-12 px-1 py-1 bg-sw-darker border border-sw-purple/50 rounded text-sw-purple text-right font-orbitron focus:border-sw-purple focus:outline-none"
                      min="0"
                    />
                    <span className="text-sw-purple text-xs">FTE @</span>
                    <div className="flex items-center">
                      <input
                        type="number"
                        value={alloc.pct || ''}
                        onChange={(e) => {
                          const newPct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                          setEventsAllocations(prev => ({ ...prev, [selectedQuarter]: { ...alloc, pct: newPct } }))
                        }}
                        placeholder="0"
                        min="0"
                        max="100"
                        step="5"
                        className="w-14 px-1 py-1 bg-sw-darker border border-sw-purple/50 rounded text-sw-purple text-right text-xs font-orbitron focus:border-sw-purple focus:outline-none"
                      />
                      <span className="text-sw-purple text-xs ml-1">%</span>
                    </div>
                    <span className="text-sw-gray text-xs">× {weeks}w</span>
                  </div>
                  <div className="flex items-center gap-1 text-sw-gray">
                    <span className="text-xs">=</span>
                    <span className="text-sw-light font-orbitron text-sm">{hours}</span>
                    <span className="text-sw-gray text-xs">hrs</span>
                  </div>
                </div>
              )
            })()
          )}
        </div>

        {Object.keys(groupedByGoal.groups || {}).length === 0 && (groupedByGoal.unassigned || []).length === 0 && initiatives.length === 0 && (
          <div className="hologram-card p-8 text-center">
            <p className="text-sw-gray">No initiatives found for {selectedQuarter}</p>
            <p className="text-sw-gray text-sm mt-2">Import from Miro or Leapsome to get started</p>
          </div>
        )}
      </div>

      {/* Quick Reference */}
      <div className="hologram-card p-4">
        <h3 className="font-orbitron text-sw-gold text-sm mb-3">CALCULATION: FTE × % × 40h × weeks</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
          <div className="p-2 bg-sw-darker/50 rounded">
            <p className="text-sw-gold font-orbitron">1 @ 100%</p>
            <p className="text-sw-gray text-xs">= 520h / quarter</p>
          </div>
          <div className="p-2 bg-sw-darker/50 rounded">
            <p className="text-sw-gold font-orbitron">1 @ 50%</p>
            <p className="text-sw-gray text-xs">= 260h / quarter</p>
          </div>
          <div className="p-2 bg-sw-darker/50 rounded">
            <p className="text-sw-gold font-orbitron">2 @ 25%</p>
            <p className="text-sw-gray text-xs">= 260h / quarter</p>
          </div>
          <div className="p-2 bg-sw-darker/50 rounded">
            <p className="text-sw-gold font-orbitron">1 @ 10%</p>
            <p className="text-sw-gray text-xs">= 52h / quarter</p>
          </div>
        </div>
      </div>
    </div>
  )
}
