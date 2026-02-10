import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getWeekStart,
  getProgressBgClass,
  getStatusColorClass,
  STATUS_OPTIONS,
  handleApiError
} from '../../constants'

// BAU Categories for Business as Usual tasks
const BAU_CATEGORIES = [
  'Marketing',
  'Business operation',
  'BD - Enterprise Adoption',
  'BD - Web3 Adoption',
  'BD - Account management',
  'Legal',
  'Venture Hub',
  'Academy',
  'Ecosystem Support',
  'Finances'
]

export default function GoalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getAuthHeader } = useAuth()
  const [goal, setGoal] = useState(null)
  const [keyResults, setKeyResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedKR, setExpandedKR] = useState(null)
  const [updating, setUpdating] = useState(null)

  // Update modal state
  const [updateModal, setUpdateModal] = useState(null) // { type: 'initiative'|'kr', id, currentStatus, name }
  const [updateForm, setUpdateForm] = useState({ status: '', comment: '', link: '', currentValue: 0, targetValue: 0 })
  const [updateHistory, setUpdateHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Assignee management state
  const [teamMembers, setTeamMembers] = useState([])
  const [assigneeModal, setAssigneeModal] = useState(null) // { type: 'goal'|'kr'|'initiative', id, currentAssignees }
  const [assigneeSearch, setAssigneeSearch] = useState('')

  // Add initiative state
  const [addInitiativeModal, setAddInitiativeModal] = useState(null) // { keyResultId }
  const [newInitiative, setNewInitiative] = useState({ name: '', description: '', memberIds: [], startDate: '', endDate: '', category: '', hours: 0, progress: 0, trackerUrl: '' })
  const [addingInitiative, setAddingInitiative] = useState(false)
  const [deletingInitiative, setDeletingInitiative] = useState(null)
  const [editingProgress, setEditingProgress] = useState(null) // { id, progress }
  const [editingKRProgress, setEditingKRProgress] = useState(null) // { id, progress }
  const [editingInitiativeName, setEditingInitiativeName] = useState(null) // { id, name }

  // Move initiative state
  const [moveModal, setMoveModal] = useState(null) // { initiativeId, initiativeName, currentKrId }
  const [allGoals, setAllGoals] = useState([])
  const [movingInitiative, setMovingInitiative] = useState(false)

  // Link existing initiative state
  const [linkModal, setLinkModal] = useState(null) // { keyResultId }
  const [unassignedInitiatives, setUnassignedInitiatives] = useState([])
  const [loadingUnassigned, setLoadingUnassigned] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')

  // Events quarter filter
  const [eventsQuarterFilter, setEventsQuarterFilter] = useState('All')
  const [availableQuarters, setAvailableQuarters] = useState([])

  // Hours tracking state
  const [hoursModal, setHoursModal] = useState(null) // { initiativeId, initiativeName, totalHours }
  const [timeEntries, setTimeEntries] = useState([])
  const [loadingTimeEntries, setLoadingTimeEntries] = useState(false)
  const [newTimeEntry, setNewTimeEntry] = useState({ memberId: '', hours: 0, notes: '' })

  useEffect(() => {
    if (id) {
      fetchGoalDetails()
      fetchKeyResults()
      fetchTeamMembers()
    }
  }, [id])

  // Fetch available quarters for Events filter
  useEffect(() => {
    if (goal?.title === 'Events') {
      fetchAvailableQuarters()
    }
  }, [goal])

  const fetchAvailableQuarters = async () => {
    try {
      const res = await fetch('/api/dashboard/quarters', { headers: getAuthHeader() })
      const data = await res.json()
      // Filter out special quarters except keep 'All', remove 'Backlog', 'Ongoing'
      const quarters = ['All', ...data.filter(q => q !== 'All' && q !== 'Backlog' && q !== 'Ongoing')]
      setAvailableQuarters(quarters)
    } catch (error) {
      console.error('Failed to fetch quarters:', error)
    }
  }

  const fetchGoalDetails = async () => {
    try {
      const res = await fetch(`/api/goals/${id}`, { headers: getAuthHeader() })
      const data = await res.json()
      setGoal(data)
    } catch (error) {
      console.error('Failed to fetch goal details:', error)
    }
  }

  const fetchKeyResults = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/goals/${id}/key-results`, { headers: getAuthHeader() })
      const data = await res.json()
      setKeyResults(data)
    } catch (error) {
      console.error('Failed to fetch key results:', error)
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

  const fetchAllGoals = async () => {
    try {
      const res = await fetch('/api/goals', { headers: getAuthHeader() })
      const goalsData = await res.json()
      // For each goal, fetch its key results
      const goalsWithKRs = await Promise.all(goalsData.map(async (g) => {
        const krRes = await fetch(`/api/goals/${g.id}/key-results`, { headers: getAuthHeader() })
        const krs = await krRes.json()
        return { ...g, keyResults: krs }
      }))
      setAllGoals(goalsWithKRs)
    } catch (error) {
      console.error('Failed to fetch all goals:', error)
    }
  }

  const openMoveModal = (initiativeId, initiativeName, currentKrId) => {
    setMoveModal({ initiativeId, initiativeName, currentKrId })
    if (allGoals.length === 0) {
      fetchAllGoals()
    }
  }

  const moveInitiative = async (newKeyResultId) => {
    if (!moveModal || !newKeyResultId) return
    setMovingInitiative(true)
    try {
      const res = await fetch(`/api/initiatives/${moveModal.initiativeId}`, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_result_id: newKeyResultId })
      })
      if (res.ok) {
        fetchKeyResults()
        setMoveModal(null)
      }
    } catch (error) {
      console.error('Failed to move initiative:', error)
    } finally {
      setMovingInitiative(false)
    }
  }

  // Link existing initiative functions
  const openLinkModal = async (keyResultId) => {
    setLinkModal({ keyResultId })
    setLinkSearch('')
    setLoadingUnassigned(true)
    try {
      // Fetch BAU goal initiatives (unassigned/skipped during import)
      const bauRes = await fetch('/api/key-results?bau=true', { headers: getAuthHeader() })
      const bauKrs = await bauRes.json()
      if (bauKrs.length > 0) {
        const bauKrId = bauKrs[0].id
        const krDetailRes = await fetch(`/api/key-results/${bauKrId}`, { headers: getAuthHeader() })
        const krDetail = await krDetailRes.json()
        setUnassignedInitiatives(krDetail.initiatives || [])
      } else {
        // Fallback: fetch all initiatives without a key result or from BAU
        const allRes = await fetch('/api/initiatives?source=miro', { headers: getAuthHeader() })
        const allInits = await allRes.json()
        setUnassignedInitiatives(allInits.filter(i => !i.key_result_id))
      }
    } catch (error) {
      console.error('Failed to fetch unassigned initiatives:', error)
    } finally {
      setLoadingUnassigned(false)
    }
  }

  const linkInitiativeToKR = async (initiativeId) => {
    if (!linkModal) return
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}`, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_result_id: linkModal.keyResultId })
      })
      if (res.ok) {
        // Remove from unassigned list
        setUnassignedInitiatives(prev => prev.filter(i => i.id !== initiativeId))
        fetchKeyResults()
      }
    } catch (error) {
      console.error('Failed to link initiative:', error)
    }
  }

  // Assignee management functions
  const openAssigneeModal = (type, itemId, currentAssignees) => {
    setAssigneeModal({ type, id: itemId, currentAssignees: currentAssignees || [] })
    setAssigneeSearch('')
  }

  const closeAssigneeModal = () => {
    setAssigneeModal(null)
    setAssigneeSearch('')
  }

  const addAssignee = async (memberId) => {
    if (!assigneeModal) return

    try {
      let endpoint
      if (assigneeModal.type === 'goal') {
        endpoint = `/api/goals/${assigneeModal.id}/assignees`
      } else if (assigneeModal.type === 'kr') {
        endpoint = `/api/key-results/${assigneeModal.id}/assignees`
      } else {
        // Initiatives use 'assignments' endpoint
        endpoint = `/api/initiatives/${assigneeModal.id}/assignments`
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_member_id: memberId })
      })

      if (res.ok) {
        // Refresh data based on type
        if (assigneeModal.type === 'goal') {
          fetchGoalDetails()
        } else {
          fetchKeyResults()
        }
        closeAssigneeModal()
      }
    } catch (error) {
      console.error('Failed to add assignee:', error)
    }
  }

  const removeAssignee = async (type, itemId, memberId) => {
    try {
      let endpoint
      if (type === 'goal') {
        endpoint = `/api/goals/${itemId}/assignees/${memberId}`
      } else if (type === 'kr') {
        endpoint = `/api/key-results/${itemId}/assignees/${memberId}`
      } else {
        // Initiatives use 'assignments' endpoint
        endpoint = `/api/initiatives/${itemId}/assignments/${memberId}`
      }

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: getAuthHeader()
      })

      if (res.ok) {
        if (type === 'goal') {
          fetchGoalDetails()
        } else {
          fetchKeyResults()
        }
      }
    } catch (error) {
      console.error('Failed to remove assignee:', error)
    }
  }

  const fetchUpdateHistory = async (type, id) => {
    setLoadingHistory(true)
    try {
      const endpoint = type === 'initiative'
        ? `/api/initiatives/${id}/updates`
        : `/api/key-results/${id}/updates`
      const res = await fetch(endpoint, { headers: getAuthHeader() })
      const data = await res.json()
      setUpdateHistory(data)
    } catch (error) {
      console.error('Failed to fetch update history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  const openUpdateModal = (type, id, currentStatus, name, currentValue = 0, targetValue = 0) => {
    setUpdateModal({ type, id, currentStatus, name, currentValue, targetValue })
    setUpdateForm({ status: currentStatus, comment: '', link: '', currentValue: currentValue || 0, targetValue: targetValue || 0 })
    fetchUpdateHistory(type, id)
  }

  const closeUpdateModal = () => {
    setUpdateModal(null)
    setUpdateForm({ status: '', comment: '', link: '', currentValue: 0, targetValue: 0 })
    setUpdateHistory([])
  }

  const submitUpdate = async () => {
    if (!updateModal) return

    setUpdating(updateModal.type === 'initiative' ? updateModal.id : `kr-${updateModal.id}`)

    try {
      const endpoint = updateModal.type === 'initiative'
        ? `/api/initiatives/${updateModal.id}`
        : `/api/key-results/${updateModal.id}`

      const payload = {
        status: updateForm.status,
        comment: updateForm.comment || null,
        link: updateForm.link || null
      }

      // Add current_value for key results and initiatives with targets
      if (updateModal.type === 'kr' || (updateModal.type === 'initiative' && updateModal.targetValue > 0)) {
        payload.current_value = updateForm.currentValue
      }

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        if (updateModal.type === 'initiative') {
          setKeyResults(prev => prev.map(kr => ({
            ...kr,
            initiatives: kr.initiatives?.map(init =>
              init.id === updateModal.id ? { ...init, status: updateForm.status, current_value: updateForm.currentValue } : init
            )
          })))
        } else {
          setKeyResults(prev => prev.map(kr =>
            kr.id === updateModal.id ? { ...kr, status: updateForm.status, current_value: updateForm.currentValue } : kr
          ))
        }
        closeUpdateModal()
      }
    } catch (error) {
      console.error('Failed to update:', error)
    } finally {
      setUpdating(null)
    }
  }

  // All goals allow adding initiatives manually
  const isManualAddAllowed = true
  const isBAUGoal = goal?.title?.includes('Business as Usual')
  const isEventsGoal = goal?.title === 'Events'

  // Helper: derive quarter from a date string (e.g., "2024-06-15" -> "Q2 2024")
  const getQuarterFromDate = (dateStr) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    const month = date.getMonth() + 1 // 1-12
    const year = date.getFullYear()
    const quarter = Math.ceil(month / 3)
    return `Q${quarter} ${year}`
  }

  // Filter initiatives for Events goal based on selected quarter
  const filterInitiatives = (initiatives) => {
    if (!isEventsGoal || eventsQuarterFilter === 'All' || !initiatives) {
      return initiatives
    }
    return initiatives.filter(init => {
      const initQuarter = getQuarterFromDate(init.start_date)
      return initQuarter === eventsQuarterFilter
    })
  }

  const openAddInitiativeModal = (keyResultId) => {
    setAddInitiativeModal({ keyResultId })
    setNewInitiative({ name: '', description: '', memberIds: [], startDate: '', endDate: '', category: '', hours: 0, progress: 0 })
  }

  const closeAddInitiativeModal = () => {
    setAddInitiativeModal(null)
    setNewInitiative({ name: '', description: '', memberIds: [], startDate: '', endDate: '', category: '', hours: 0, progress: 0 })
  }

  const deleteInitiative = async (initiativeId, initiativeName) => {
    if (!confirm(`Delete "${initiativeName}"? This cannot be undone.`)) return

    setDeletingInitiative(initiativeId)
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      })

      if (res.ok) {
        fetchKeyResults()
      }
    } catch (error) {
      console.error('Failed to delete initiative:', error)
    } finally {
      setDeletingInitiative(null)
    }
  }

  const createInitiative = async () => {
    if (!newInitiative.name.trim() || !addInitiativeModal || newInitiative.memberIds.length === 0) return

    setAddingInitiative(true)
    try {
      // Use first member as owner
      const ownerId = newInitiative.memberIds[0]

      const res = await fetch('/api/initiatives', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newInitiative.name.trim(),
          description: newInitiative.description.trim() || null,
          key_result_id: addInitiativeModal.keyResultId,
          owner_id: ownerId,
          start_date: newInitiative.startDate || null,
          end_date: newInitiative.endDate || null,
          category: newInitiative.category || null,
          actual_hours: newInitiative.hours || 0,
          progress: newInitiative.progress || 0,
          tracker_url: newInitiative.trackerUrl.trim() || null,
          status: 'active',
          source: 'manual'
        })
      })

      if (res.ok) {
        const initiative = await res.json()

        // Create assignments for all selected members
        for (let i = 0; i < newInitiative.memberIds.length; i++) {
          const memberId = newInitiative.memberIds[i]
          await fetch(`/api/initiatives/${initiative.id}/assignments`, {
            method: 'POST',
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              team_member_id: parseInt(memberId),
              role: i === 0 ? 'Lead' : 'Contributor'
            })
          })
        }

        fetchKeyResults()
        closeAddInitiativeModal()
      }
    } catch (error) {
      console.error('Failed to create initiative:', error)
    } finally {
      setAddingInitiative(false)
    }
  }

  const updateInitiativeProgress = async (initiativeId, newProgress) => {
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/progress`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: newProgress })
      })

      if (res.ok) {
        fetchKeyResults()
        fetchGoalDetails() // Refresh goal progress too
      }
    } catch (error) {
      console.error('Failed to update progress:', error)
    } finally {
      setEditingProgress(null)
    }
  }

  const updateKRProgress = async (krId, newProgress) => {
    try {
      const res = await fetch(`/api/key-results/${krId}`, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: newProgress })
      })

      if (res.ok) {
        fetchKeyResults()
        fetchGoalDetails() // Refresh goal progress too
      }
    } catch (error) {
      console.error('Failed to update KR progress:', error)
    } finally {
      setEditingKRProgress(null)
    }
  }

  const updateInitiativeName = async (initiativeId, newName) => {
    if (!newName.trim()) {
      setEditingInitiativeName(null)
      return
    }
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}`, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      })

      if (res.ok) {
        fetchKeyResults()
      }
    } catch (error) {
      console.error('Failed to update initiative name:', error)
    } finally {
      setEditingInitiativeName(null)
    }
  }

  // Hours tracking functions - using centralized getWeekStart utility

  const openHoursModal = async (initiativeId, initiativeName, totalHours) => {
    setHoursModal({ initiativeId, initiativeName, totalHours })
    setNewTimeEntry({ memberId: '', hours: 0, notes: '', weekStart: getWeekStart() })
    setLoadingTimeEntries(true)
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/time-entries`, { headers: getAuthHeader() })
      const data = await res.json()
      setTimeEntries(data.entries || [])
    } catch (error) {
      console.error('Failed to fetch time entries:', error)
      setTimeEntries([])
    } finally {
      setLoadingTimeEntries(false)
    }
  }

  const closeHoursModal = () => {
    setHoursModal(null)
    setTimeEntries([])
    setNewTimeEntry({ memberId: '', hours: 0, notes: '', weekStart: getWeekStart() })
  }

  const addTimeEntry = async () => {
    if (!hoursModal || !newTimeEntry.memberId || newTimeEntry.hours <= 0) return

    try {
      const res = await fetch(`/api/initiatives/${hoursModal.initiativeId}/time-entries`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_member_id: parseInt(newTimeEntry.memberId),
          week_start: newTimeEntry.weekStart,
          hours_worked: parseFloat(newTimeEntry.hours),
          notes: newTimeEntry.notes || null
        })
      })

      if (res.ok) {
        const data = await res.json()
        setTimeEntries(data.entries || [])
        setHoursModal(prev => ({ ...prev, totalHours: data.total_hours }))
        setNewTimeEntry({ memberId: '', hours: 0, notes: '', weekStart: getWeekStart() })
        fetchKeyResults() // Refresh to show updated hours on cards
      }
    } catch (error) {
      console.error('Failed to add time entry:', error)
    }
  }

  const deleteTimeEntry = async (entryId) => {
    if (!confirm('Delete this time entry?')) return

    try {
      const res = await fetch(`/api/initiatives/time-entries/${entryId}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      })

      if (res.ok) {
        setTimeEntries(prev => prev.filter(e => e.id !== entryId))
        // Recalculate total
        const remaining = timeEntries.filter(e => e.id !== entryId)
        const newTotal = remaining.reduce((sum, e) => sum + e.hours_worked, 0)
        setHoursModal(prev => ({ ...prev, totalHours: newTotal }))
        fetchKeyResults()
      }
    } catch (error) {
      console.error('Failed to delete time entry:', error)
    }
  }

  const formatWeekDisplay = (weekStart) => {
    const date = new Date(weekStart)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Using centralized getStatusColorClass from constants
  const getStatusColor = getStatusColorClass

  // Wrapper for centralized progress color (converts target-based to percentage)
  const getProgressColor = (progress, target) => {
    const pct = target > 0 ? (progress / target) * 100 : 0
    return getProgressBgClass(pct)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading && !goal) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sw-gold font-orbitron animate-pulse">LOADING GOAL DATA...</div>
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="text-center py-12">
        <p className="text-sw-gray font-orbitron">Goal not found</p>
        <button onClick={() => navigate('/goals')} className="btn-secondary mt-4">
          Back to Goals
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/goals')}
          className="text-sw-gray hover:text-sw-gold transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="font-orbitron text-2xl text-sw-gold">{goal.title}</h1>
          <p className="text-sw-gray text-sm mt-1">{goal.description}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(goal.status)}`}>
          {goal.status}
        </span>
      </div>

      {/* Goal Stats */}
      <div className={`grid grid-cols-1 gap-4 ${isManualAddAllowed ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase tracking-wider">Lead</p>
          <p className="text-sw-light text-lg font-orbitron mt-1">{goal.owner_name || '-'}</p>
        </div>
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase tracking-wider">Key Results</p>
          <p className="text-sw-light text-lg font-orbitron mt-1">{keyResults.length}</p>
        </div>
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase tracking-wider">Progress</p>
          <p className="text-sw-gold text-lg font-orbitron mt-1">{goal.progress}%</p>
        </div>
        {/* Total Hours for BAU goals */}
        {isManualAddAllowed && (
          <div className="hologram-card p-4 bg-sw-gold/5 border-sw-gold/30">
            <p className="text-sw-gray text-xs uppercase tracking-wider flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Total Hours
            </p>
            <p className="text-sw-gold text-lg font-orbitron mt-1">{goal.total_hours || 0}h</p>
          </div>
        )}
      </div>

      {/* Assignees */}
      <div className="hologram-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-orbitron text-sw-blue text-sm">ASSIGNED TEAM</h3>
          <button
            onClick={() => openAssigneeModal('goal', goal.id, goal.assignees)}
            className="text-sw-gold hover:text-sw-light text-xs flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {goal.assignees?.length > 0 ? (
            goal.assignees.map(a => (
              <span key={a.id} className="px-3 py-1 bg-sw-blue/20 text-sw-blue text-sm rounded-full flex items-center gap-2 group">
                {a.name}
                <button
                  onClick={() => removeAssignee('goal', goal.id, a.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-sw-red transition-opacity"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))
          ) : (
            <span className="text-sw-gray text-sm">No assignees yet</span>
          )}
        </div>
      </div>

      {/* Key Results */}
      <div className="space-y-4">
        <h2 className="font-orbitron text-xl text-sw-gold">Key Results ({keyResults.length})</h2>

        {keyResults.length === 0 ? (
          <div className="hologram-card p-8 text-center">
            <p className="text-sw-gray">No key results found for this goal</p>
          </div>
        ) : (
          <div className="space-y-4">
            {keyResults.map(kr => (
              <div key={kr.id} className="hologram-card overflow-hidden">
                {/* KR Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-sw-darker/50 transition-colors"
                  onClick={() => setExpandedKR(expandedKR === kr.id ? null : kr.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          className={`w-4 h-4 text-sw-gray transition-transform ${expandedKR === kr.id ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openUpdateModal('kr', kr.id, kr.status || 'active', kr.title, kr.current_value, kr.target_value)
                          }}
                          className={`px-2 py-0.5 rounded text-xs font-medium border cursor-pointer hover:opacity-80 ${getStatusColor(kr.status)}`}
                        >
                          {kr.status || 'active'}
                        </button>
                        {kr.owner_name && (
                          <span className="text-sw-gray text-xs">Lead: {kr.owner_name}</span>
                        )}
                      </div>
                      <h3 className="text-sw-light font-medium">{kr.title}</h3>
                      {kr.description && (
                        <p className="text-sw-gray text-sm mt-1">{kr.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        {/* Total hours for BAU goals */}
                        {isManualAddAllowed && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-sw-gold/10 rounded border border-sw-gold/20">
                            <svg className="w-3 h-3 text-sw-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sw-gold font-orbitron text-sm">
                              {kr.initiatives?.reduce((sum, i) => sum + (i.actual_hours || 0), 0) || 0}h
                            </span>
                          </div>
                        )}
                        {/* Editable progress */}
                        {editingKRProgress?.id === kr.id ? (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={editingKRProgress.progress}
                            onChange={(e) => setEditingKRProgress({ id: kr.id, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                            onBlur={() => updateKRProgress(kr.id, editingKRProgress.progress)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') updateKRProgress(kr.id, editingKRProgress.progress)
                              if (e.key === 'Escape') setEditingKRProgress(null)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-16 px-2 py-1 bg-sw-darker border border-sw-gold rounded text-sw-gold text-lg font-orbitron text-center focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingKRProgress({ id: kr.id, progress: kr.progress || 0 }) }}
                            className="text-sw-gold font-orbitron text-lg hover:bg-sw-gold/20 px-2 py-1 rounded transition-colors"
                            title="Click to edit progress"
                          >
                            {kr.progress || 0}%
                          </button>
                        )}
                      </div>
                      <div className="w-32 h-2 bg-sw-darker rounded-full mt-2 overflow-hidden ml-auto">
                        <div
                          className={`h-full ${getProgressColor(kr.progress || 0, 100)} transition-all`}
                          style={{ width: `${kr.progress || 0}%` }}
                        />
                      </div>
                      {(kr.target_value > 0) && (
                        <p className="text-sw-gray text-xs mt-1">{kr.current_value || 0} / {kr.target_value}</p>
                      )}
                    </div>
                  </div>

                  {/* KR Assignees */}
                  <div className="flex flex-wrap items-center gap-1 mt-3">
                    {kr.assignees?.map(a => (
                      <span key={a.id} className="px-2 py-0.5 bg-sw-darker text-sw-gray text-xs rounded flex items-center gap-1 group">
                        {a.name.split(' ')[0]}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeAssignee('kr', kr.id, a.id) }}
                          className="opacity-0 group-hover:opacity-100 hover:text-sw-red transition-opacity"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={(e) => { e.stopPropagation(); openAssigneeModal('kr', kr.id, kr.assignees) }}
                      className="px-2 py-0.5 border border-dashed border-sw-gray/50 text-sw-gray text-xs rounded hover:border-sw-gold hover:text-sw-gold transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {/* Initiatives (expanded) */}
                {expandedKR === kr.id && filterInitiatives(kr.initiatives)?.length > 0 && (
                  <div className="border-t border-sw-gray/20 bg-sw-darker/30">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-orbitron text-sw-blue text-xs">
                          {isEventsGoal && eventsQuarterFilter !== 'All' ? (
                            <>EVENTS ({filterInitiatives(kr.initiatives).length} of {kr.initiatives.length})</>
                          ) : (
                            <>INITIATIVES ({kr.initiatives.length})</>
                          )}
                        </h4>
                        {isManualAddAllowed && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); openLinkModal(kr.id) }}
                              className="text-sw-purple hover:text-sw-light text-xs flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                              Link Existing
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); openAddInitiativeModal(kr.id) }}
                              className="text-sw-gold hover:text-sw-light text-xs flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              Add New
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Group initiatives by owner for BAU/Backlog goals */}
                      {isManualAddAllowed ? (
                        <div className="space-y-4">
                          {(() => {
                            // Filter and group initiatives by owner
                            const filteredInits = filterInitiatives(kr.initiatives)
                            const byOwner = filteredInits.reduce((acc, init) => {
                              const ownerName = init.owner_name || 'Unassigned'
                              if (!acc[ownerName]) acc[ownerName] = []
                              acc[ownerName].push(init)
                              return acc
                            }, {})

                            return Object.entries(byOwner).map(([ownerName, ownerInits]) => (
                              <div key={ownerName} className="space-y-2">
                                <div className="flex items-center gap-2 pb-1 border-b border-sw-gray/20">
                                  <div className="w-6 h-6 rounded-full bg-sw-gold/20 flex items-center justify-center">
                                    <span className="text-sw-gold text-xs font-medium">
                                      {ownerName === 'Unassigned' ? '?' : ownerName[0]}
                                    </span>
                                  </div>
                                  <span className="text-sw-light font-medium text-sm">{ownerName}</span>
                                  <span className="text-sw-gray text-xs">({ownerInits.length})</span>
                                </div>
                                <div className="space-y-2 pl-8">
                                  {ownerInits.map(init => (
                                    <div key={init.id} className="p-3 bg-sw-darker/50 rounded-lg">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-3">
                                            {editingInitiativeName?.id === init.id ? (
                                              <input
                                                type="text"
                                                value={editingInitiativeName.name}
                                                onChange={(e) => setEditingInitiativeName({ id: init.id, name: e.target.value })}
                                                onBlur={() => updateInitiativeName(init.id, editingInitiativeName.name)}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') updateInitiativeName(init.id, editingInitiativeName.name)
                                                  if (e.key === 'Escape') setEditingInitiativeName(null)
                                                }}
                                                className="flex-1 px-2 py-0.5 bg-sw-darker border border-sw-gold rounded text-sw-light text-sm focus:outline-none"
                                                autoFocus
                                              />
                                            ) : (
                                              <button
                                                onClick={() => setEditingInitiativeName({ id: init.id, name: init.name })}
                                                className="text-sw-light text-sm flex-1 text-left hover:text-sw-gold transition-colors"
                                                title="Click to edit name"
                                              >
                                                {init.name}
                                              </button>
                                            )}
                                            {init.tracker_url && (
                                              <a
                                                href={init.tracker_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sw-blue hover:text-sw-gold transition-colors flex-shrink-0"
                                                title={init.tracker_url}
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                              </a>
                                            )}
                                            <div className="flex items-center gap-2">
                                              {/* Hours badge */}
                                              <button
                                                onClick={() => openHoursModal(init.id, init.name, init.actual_hours || 0)}
                                                className="flex items-center gap-1 px-2 py-0.5 bg-sw-gold/20 text-sw-gold text-xs rounded hover:bg-sw-gold/30 transition-colors font-orbitron"
                                                title="Click to log hours"
                                              >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                {init.actual_hours || 0}h
                                              </button>
                                              {/* Progress bar and % */}
                                              <div className="w-16 h-1.5 bg-sw-darker rounded-full overflow-hidden">
                                                <div
                                                  className="h-full bg-sw-blue transition-all"
                                                  style={{ width: `${init.progress || 0}%` }}
                                                />
                                              </div>
                                              {editingProgress?.id === init.id ? (
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max="100"
                                                  value={editingProgress.progress}
                                                  onChange={(e) => setEditingProgress({ id: init.id, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                                                  onBlur={() => updateInitiativeProgress(init.id, editingProgress.progress)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') updateInitiativeProgress(init.id, editingProgress.progress)
                                                    if (e.key === 'Escape') setEditingProgress(null)
                                                  }}
                                                  className="w-14 px-1 py-0.5 bg-sw-darker border border-sw-blue rounded text-sw-blue text-xs font-orbitron text-center focus:outline-none"
                                                  autoFocus
                                                />
                                              ) : (
                                                <button
                                                  onClick={() => setEditingProgress({ id: init.id, progress: init.progress || 0 })}
                                                  className="text-sw-blue text-xs font-orbitron hover:bg-sw-blue/20 px-1 py-0.5 rounded transition-colors"
                                                  title="Click to edit progress"
                                                >
                                                  {init.progress || 0}%
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          {/* Category and dates indicator */}
                                          <div className="flex flex-wrap items-center gap-2 mt-1">
                                            {init.category && (
                                              <span className="px-1.5 py-0.5 bg-sw-purple/20 text-sw-purple text-xs rounded">{init.category}</span>
                                            )}
                                            {(init.start_date || init.end_date) && (
                                              <span className="text-sw-gray text-xs">
                                                {init.start_date && new Date(init.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                {init.start_date && init.end_date && ' - '}
                                                {init.end_date && new Date(init.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                              </span>
                                            )}
                                            {init.description?.includes('[Weekly Check-in]') && (
                                              <span className="text-sw-gray text-xs">via Check-in</span>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap items-center gap-1 mt-2">
                                            {init.assignees?.map(a => (
                                              <span key={a.id} className="px-1.5 py-0.5 bg-sw-blue/10 text-sw-blue text-xs rounded flex items-center gap-1 group">
                                                {a.name.split(' ')[0]}
                                                <button
                                                  onClick={() => removeAssignee('initiative', init.id, a.id)}
                                                  className="opacity-0 group-hover:opacity-100 hover:text-sw-red transition-opacity"
                                                >
                                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </span>
                                            ))}
                                            <button
                                              onClick={() => openAssigneeModal('initiative', init.id, init.assignees)}
                                              className="px-1.5 py-0.5 border border-dashed border-sw-blue/50 text-sw-blue text-xs rounded hover:border-sw-gold hover:text-sw-gold transition-colors"
                                            >
                                              + Add
                                            </button>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => openUpdateModal('initiative', init.id, init.status || 'active', init.name, init.current_value, init.target_value)}
                                            className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer hover:opacity-80 ${getStatusColor(init.status)}`}
                                          >
                                            {init.status || 'active'}
                                          </button>
                                          <button
                                            onClick={() => openMoveModal(init.id, init.name, init.key_result_id)}
                                            className="p-1 text-sw-gray hover:text-sw-purple transition-colors"
                                            title="Move to another goal/KR"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                            </svg>
                                          </button>
                                          <button
                                            onClick={() => deleteInitiative(init.id, init.name)}
                                            disabled={deletingInitiative === init.id}
                                            className="p-1 text-sw-gray hover:text-red-400 transition-colors disabled:opacity-50"
                                            title="Delete initiative"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          })()}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filterInitiatives(kr.initiatives).map(init => (
                            <div key={init.id} className="p-3 bg-sw-darker/50 rounded-lg">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    {editingInitiativeName?.id === init.id ? (
                                      <input
                                        type="text"
                                        value={editingInitiativeName.name}
                                        onChange={(e) => setEditingInitiativeName({ id: init.id, name: e.target.value })}
                                        onBlur={() => updateInitiativeName(init.id, editingInitiativeName.name)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') updateInitiativeName(init.id, editingInitiativeName.name)
                                          if (e.key === 'Escape') setEditingInitiativeName(null)
                                        }}
                                        className="flex-1 px-2 py-0.5 bg-sw-darker border border-sw-gold rounded text-sw-light text-sm focus:outline-none"
                                        autoFocus
                                      />
                                    ) : (
                                      <button
                                        onClick={() => setEditingInitiativeName({ id: init.id, name: init.name })}
                                        className="text-sw-light text-sm flex-1 text-left hover:text-sw-gold transition-colors"
                                        title="Click to edit name"
                                      >
                                        {init.name}
                                      </button>
                                    )}
                                    {init.tracker_url && (
                                      <a
                                        href={init.tracker_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sw-blue hover:text-sw-gold transition-colors flex-shrink-0"
                                        title={init.tracker_url}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                      </a>
                                    )}
                                    <div className="flex items-center gap-2">
                                      {init.target_value > 0 ? (
                                        <>
                                          <div className="w-20 h-1.5 bg-sw-darker rounded-full overflow-hidden">
                                            <div
                                              className={`h-full transition-all ${(init.current_value || 0) >= init.target_value ? 'bg-sw-green' : 'bg-sw-purple'}`}
                                              style={{ width: `${Math.min(((init.current_value || 0) / init.target_value) * 100, 100)}%` }}
                                            />
                                          </div>
                                          <span className={`text-xs font-orbitron ${(init.current_value || 0) >= init.target_value ? 'text-sw-green' : 'text-sw-purple'}`}>
                                            {init.current_value || 0}/{init.target_value}
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <div className="w-20 h-1.5 bg-sw-darker rounded-full overflow-hidden">
                                            <div
                                              className="h-full bg-sw-blue transition-all"
                                              style={{ width: `${init.progress || 0}%` }}
                                            />
                                          </div>
                                          {editingProgress?.id === init.id ? (
                                            <input
                                              type="number"
                                              min="0"
                                              max="100"
                                              value={editingProgress.progress}
                                              onChange={(e) => setEditingProgress({ id: init.id, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                                              onBlur={() => updateInitiativeProgress(init.id, editingProgress.progress)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') updateInitiativeProgress(init.id, editingProgress.progress)
                                                if (e.key === 'Escape') setEditingProgress(null)
                                              }}
                                              className="w-14 px-1 py-0.5 bg-sw-darker border border-sw-blue rounded text-sw-blue text-xs font-orbitron text-center focus:outline-none"
                                              autoFocus
                                            />
                                          ) : (
                                            <button
                                              onClick={() => setEditingProgress({ id: init.id, progress: init.progress || 0 })}
                                              className="text-sw-blue text-xs font-orbitron hover:bg-sw-blue/20 px-1 py-0.5 rounded transition-colors"
                                              title="Click to edit progress"
                                            >
                                              {init.progress || 0}%
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {init.owner_name && (
                                    <p className="text-sw-gray text-xs mt-1">Lead: {init.owner_name}</p>
                                  )}
                                  <div className="flex flex-wrap items-center gap-1 mt-2">
                                    {init.assignees?.map(a => (
                                      <span key={a.id} className="px-1.5 py-0.5 bg-sw-blue/10 text-sw-blue text-xs rounded flex items-center gap-1 group">
                                        {a.name.split(' ')[0]}
                                        <button
                                          onClick={() => removeAssignee('initiative', init.id, a.id)}
                                          className="opacity-0 group-hover:opacity-100 hover:text-sw-red transition-opacity"
                                        >
                                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </span>
                                    ))}
                                    <button
                                      onClick={() => openAssigneeModal('initiative', init.id, init.assignees)}
                                      className="px-1.5 py-0.5 border border-dashed border-sw-blue/50 text-sw-blue text-xs rounded hover:border-sw-gold hover:text-sw-gold transition-colors"
                                    >
                                      + Add
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => openUpdateModal('initiative', init.id, init.status || 'active', init.name, init.current_value, init.target_value)}
                                    className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer hover:opacity-80 ${getStatusColor(init.status)}`}
                                  >
                                    {init.status || 'active'}
                                  </button>
                                  <button
                                    onClick={() => deleteInitiative(init.id, init.name)}
                                    disabled={deletingInitiative === init.id}
                                    className="p-1 text-sw-gray hover:text-red-400 transition-colors disabled:opacity-50"
                                    title="Delete initiative"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* No initiatives message */}
                {expandedKR === kr.id && (!kr.initiatives || kr.initiatives.length === 0 || filterInitiatives(kr.initiatives)?.length === 0) && (
                  <div className="border-t border-sw-gray/20 bg-sw-darker/30 p-4">
                    <p className="text-sw-gray text-sm text-center mb-3">
                      {isEventsGoal && eventsQuarterFilter !== 'All' && kr.initiatives?.length > 0
                        ? `No events for ${eventsQuarterFilter}`
                        : 'No initiatives for this key result'}
                    </p>
                    {isManualAddAllowed && (
                      <div className="text-center flex items-center justify-center gap-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); openLinkModal(kr.id) }}
                          className="btn-secondary text-sm"
                        >
                          <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          Link Existing
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openAddInitiativeModal(kr.id) }}
                          className="btn-secondary text-sm"
                        >
                          <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Add New
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Update Modal */}
      {updateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="hologram-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-orbitron text-sw-gold text-lg">Update {updateModal.type === 'initiative' ? 'Initiative' : 'Key Result'}</h3>
                <p className="text-sw-gray text-sm mt-1 line-clamp-2">{updateModal.name}</p>
              </div>
              <button onClick={closeUpdateModal} className="text-sw-gray hover:text-sw-light">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Status Selection */}
            <div className="mb-4">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {['draft', 'active', 'in-progress', 'completed'].map(status => (
                  <button
                    key={status}
                    onClick={() => setUpdateForm(prev => ({ ...prev, status }))}
                    className={`px-3 py-2 rounded text-sm font-medium border transition-all ${
                      updateForm.status === status
                        ? getStatusColor(status) + ' ring-2 ring-offset-2 ring-offset-sw-dark'
                        : 'border-sw-gray/30 text-sw-gray hover:border-sw-gray'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Progress (Key Results and Initiatives with targets) */}
            {(updateModal.type === 'kr' || (updateModal.type === 'initiative' && updateModal.targetValue > 0)) && (
              <div className="mb-4">
                <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">Progress</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      max={updateForm.targetValue || 100}
                      value={updateForm.currentValue}
                      onChange={(e) => setUpdateForm(prev => ({ ...prev, currentValue: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light text-center text-lg font-orbitron focus:border-sw-gold focus:outline-none"
                    />
                    <p className="text-sw-gray text-xs text-center mt-1">Current</p>
                  </div>
                  <span className="text-sw-gray text-2xl">/</span>
                  <div className="flex-1">
                    <div className="w-full px-3 py-2 bg-sw-darker/50 border border-sw-gray/20 rounded text-sw-gray text-center text-lg font-orbitron">
                      {updateForm.targetValue || 100}
                    </div>
                    <p className="text-sw-gray text-xs text-center mt-1">Target</p>
                  </div>
                </div>
                {/* Quick adjust buttons */}
                <div className="flex gap-2 mt-2">
                  {[-1, +1, +2, +5].map(delta => (
                    <button
                      key={delta}
                      onClick={() => setUpdateForm(prev => ({
                        ...prev,
                        currentValue: Math.max(0, Math.min(prev.targetValue || 100, prev.currentValue + delta))
                      }))}
                      className="flex-1 px-2 py-1 text-xs font-medium rounded border border-sw-gray/30 text-sw-gray hover:border-sw-gold hover:text-sw-gold transition-colors"
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                  <button
                    onClick={() => setUpdateForm(prev => ({ ...prev, currentValue: prev.targetValue || 100 }))}
                    className="flex-1 px-2 py-1 text-xs font-medium rounded border border-green-400/30 text-green-400 hover:border-green-400 hover:bg-green-400/10 transition-colors"
                  >
                    Max
                  </button>
                </div>
                {/* Progress bar preview */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-sw-gray mb-1">
                    <span>Progress</span>
                    <span>{updateForm.targetValue > 0 ? Math.round((updateForm.currentValue / updateForm.targetValue) * 100) : 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-sw-darker rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${getProgressColor(updateForm.currentValue, updateForm.targetValue)}`}
                      style={{ width: `${updateForm.targetValue > 0 ? (updateForm.currentValue / updateForm.targetValue) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Comment */}
            <div className="mb-4">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                Comment / Note
              </label>
              <textarea
                value={updateForm.comment}
                onChange={(e) => setUpdateForm(prev => ({ ...prev, comment: e.target.value }))}
                placeholder="Add a comment about this update..."
                className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none resize-none"
                rows={3}
              />
            </div>

            {/* Link */}
            <div className="mb-6">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                Related Link (optional)
              </label>
              <input
                type="url"
                value={updateForm.link}
                onChange={(e) => setUpdateForm(prev => ({ ...prev, link: e.target.value }))}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none"
              />
            </div>

            {/* Update History */}
            <div className="mb-6">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                Update History
              </label>
              <div className="max-h-48 overflow-y-auto bg-sw-darker/50 rounded p-2">
                {loadingHistory ? (
                  <p className="text-sw-gray text-sm text-center py-4">Loading...</p>
                ) : updateHistory.length === 0 ? (
                  <p className="text-sw-gray text-sm text-center py-4">No previous updates</p>
                ) : (
                  <div className="space-y-2">
                    {updateHistory.map(update => (
                      <div key={update.id} className="p-2 bg-sw-darker rounded text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded ${getStatusColor(update.previous_status)}`}>
                            {update.previous_status}
                          </span>
                          <svg className="w-3 h-3 text-sw-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          <span className={`px-1.5 py-0.5 rounded ${getStatusColor(update.new_status)}`}>
                            {update.new_status}
                          </span>
                          <span className="text-sw-gray ml-auto">{formatDate(update.created_at)}</span>
                        </div>
                        {update.comment && (
                          <p className="text-sw-light mt-1">{update.comment}</p>
                        )}
                        {update.link && (
                          <a
                            href={update.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sw-blue hover:underline mt-1 block truncate"
                          >
                            {update.link}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button onClick={closeUpdateModal} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={submitUpdate}
                disabled={updating}
                className="btn-primary disabled:opacity-50"
              >
                {updating ? 'Saving...' : 'Save Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignee Modal */}
      {assigneeModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="hologram-card p-6 w-full max-w-md">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-orbitron text-sw-gold text-lg">
                  Add Assignee
                </h3>
                <p className="text-sw-gray text-sm mt-1">
                  {assigneeModal.type === 'goal' ? 'Goal' : assigneeModal.type === 'kr' ? 'Key Result' : 'Initiative'}
                </p>
              </div>
              <button onClick={closeAssigneeModal} className="text-sw-gray hover:text-sw-light">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                placeholder="Search team members..."
                className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none"
              />
            </div>

            {/* Team Members List */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {teamMembers
                .filter(m =>
                  m.name.toLowerCase().includes(assigneeSearch.toLowerCase()) &&
                  !assigneeModal.currentAssignees?.some(a => a.id === m.id)
                )
                .map(member => (
                  <button
                    key={member.id}
                    onClick={() => addAssignee(member.id)}
                    className="w-full p-3 bg-sw-darker/50 hover:bg-sw-darker rounded-lg text-left transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-sw-light font-medium">{member.name}</p>
                      <p className="text-sw-gray text-xs">{member.role} {member.team ? `• ${member.team}` : ''}</p>
                    </div>
                    <svg className="w-5 h-5 text-sw-gold opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </button>
                ))}
              {teamMembers.filter(m =>
                m.name.toLowerCase().includes(assigneeSearch.toLowerCase()) &&
                !assigneeModal.currentAssignees?.some(a => a.id === m.id)
              ).length === 0 && (
                <p className="text-sw-gray text-center py-4">
                  {assigneeSearch ? 'No matching team members' : 'All team members already assigned'}
                </p>
              )}
            </div>

            {/* Current Assignees */}
            {assigneeModal.currentAssignees?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-sw-gray/20">
                <p className="text-sw-gray text-xs uppercase tracking-wider mb-2">Current Assignees</p>
                <div className="flex flex-wrap gap-2">
                  {assigneeModal.currentAssignees.map(a => (
                    <span key={a.id} className="px-2 py-1 bg-sw-blue/20 text-sw-blue text-sm rounded">
                      {a.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Close Button */}
            <div className="mt-6 flex justify-end">
              <button onClick={closeAssigneeModal} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Initiative Modal */}
      {addInitiativeModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="hologram-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-orbitron text-sw-gold text-lg">
                  {isEventsGoal ? 'Add Event' : 'Add Initiative'}
                </h3>
                <p className="text-sw-gray text-sm mt-1">
                  {isEventsGoal ? 'Plan a new event with team and dates' : 'Add a new task to this goal'}
                </p>
              </div>
              <button onClick={closeAddInitiativeModal} className="text-sw-gray hover:text-sw-light">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Initiative/Event Name */}
            <div className="mb-4">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                {isEventsGoal ? 'Event Name *' : 'Initiative Name *'}
              </label>
              <input
                type="text"
                value={newInitiative.name}
                onChange={(e) => setNewInitiative(prev => ({ ...prev, name: e.target.value }))}
                placeholder={isEventsGoal ? 'Enter event name...' : 'Enter initiative name...'}
                className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none"
                autoFocus
              />
            </div>

            {/* Category - only for BAU goals */}
            {isBAUGoal && (
              <div className="mb-4">
                <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                  Category *
                </label>
                <select
                  value={newInitiative.category}
                  onChange={(e) => setNewInitiative(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light focus:border-sw-gold focus:outline-none"
                >
                  <option value="">Select category...</option>
                  {BAU_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Assigned Team Members (Multi-select) */}
            <div className="mb-4">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                Assigned Team Members * <span className="text-sw-gray/50">(first selected = Lead)</span>
              </label>
              <div className="max-h-40 overflow-y-auto bg-sw-darker/50 rounded border border-sw-gray/30 p-2 space-y-1">
                {teamMembers.map(member => {
                  const isSelected = newInitiative.memberIds.includes(member.id)
                  const selectionIndex = newInitiative.memberIds.indexOf(member.id)
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setNewInitiative(prev => ({
                            ...prev,
                            memberIds: prev.memberIds.filter(id => id !== member.id)
                          }))
                        } else {
                          setNewInitiative(prev => ({
                            ...prev,
                            memberIds: [...prev.memberIds, member.id]
                          }))
                        }
                      }}
                      className={`w-full p-2 rounded text-left text-sm transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-sw-gold/20 border border-sw-gold/50 text-sw-gold'
                          : 'hover:bg-sw-darker text-sw-light'
                      }`}
                    >
                      <span>{member.name} {member.role ? `(${member.role})` : ''}</span>
                      {isSelected && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-sw-gold/30">
                          {selectionIndex === 0 ? 'Lead' : `#${selectionIndex + 1}`}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {newInitiative.memberIds.length > 0 && (
                <p className="text-sw-gold text-xs mt-1">
                  {newInitiative.memberIds.length} member(s) selected
                </p>
              )}
            </div>

            {/* Tracker URL */}
            <div className="mb-4">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                Tracker URL (optional)
              </label>
              <input
                type="url"
                value={newInitiative.trackerUrl}
                onChange={(e) => setNewInitiative(prev => ({ ...prev, trackerUrl: e.target.value }))}
                placeholder="https://jira.example.com/browse/PROJ-123"
                className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none"
              />
            </div>

            {/* Date Range - only for Events */}
            {isEventsGoal && (
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={newInitiative.startDate}
                    onChange={(e) => setNewInitiative(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light focus:border-sw-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={newInitiative.endDate}
                    onChange={(e) => setNewInitiative(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light focus:border-sw-gold focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Hours and Progress - for Events */}
            {isEventsGoal && (
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                    Hours
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newInitiative.hours}
                    onChange={(e) => setNewInitiative(prev => ({ ...prev, hours: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light focus:border-sw-gold focus:outline-none"
                    placeholder="0"
                  />
                  <div className="flex gap-1 mt-1">
                    {[2, 4, 8, 16, 40].map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setNewInitiative(prev => ({ ...prev, hours: h }))}
                        className={`flex-1 px-1 py-0.5 text-xs rounded border transition-colors ${
                          newInitiative.hours === h
                            ? 'border-sw-gold bg-sw-gold/20 text-sw-gold'
                            : 'border-sw-gray/30 text-sw-gray hover:border-sw-gold'
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                    Progress %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newInitiative.progress}
                    onChange={(e) => setNewInitiative(prev => ({ ...prev, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                    className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light focus:border-sw-gold focus:outline-none"
                    placeholder="0"
                  />
                  <div className="flex gap-1 mt-1">
                    {[0, 25, 50, 75, 100].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewInitiative(prev => ({ ...prev, progress: p }))}
                        className={`flex-1 px-1 py-0.5 text-xs rounded border transition-colors ${
                          newInitiative.progress === p
                            ? 'border-sw-gold bg-sw-gold/20 text-sw-gold'
                            : 'border-sw-gray/30 text-sw-gray hover:border-sw-gold'
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">
                Description (optional)
              </label>
              <textarea
                value={newInitiative.description}
                onChange={(e) => setNewInitiative(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description..."
                className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none resize-none"
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button onClick={closeAddInitiativeModal} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={createInitiative}
                disabled={!newInitiative.name.trim() || (isBAUGoal && !newInitiative.category) || newInitiative.memberIds.length === 0 || addingInitiative}
                className="btn-primary disabled:opacity-50"
              >
                {addingInitiative ? 'Adding...' : isEventsGoal ? 'Add Event' : 'Add Initiative'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hours Tracking Modal */}
      {hoursModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="hologram-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-orbitron text-sw-gold text-lg">Time Tracking</h3>
                <p className="text-sw-gray text-sm mt-1 line-clamp-2">{hoursModal.initiativeName}</p>
              </div>
              <button onClick={closeHoursModal} className="text-sw-gray hover:text-sw-light">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Total Hours Summary */}
            <div className="bg-sw-gold/10 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sw-gray text-sm">Total Hours Logged</span>
                <span className="text-sw-gold font-orbitron text-2xl">{hoursModal.totalHours}h</span>
              </div>
            </div>

            {/* Add New Time Entry */}
            <div className="mb-6 p-4 bg-sw-darker/50 rounded-lg">
              <h4 className="text-sw-light text-sm font-medium mb-3">Log Hours</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sw-gray text-xs uppercase tracking-wider mb-1">Team Member</label>
                  <select
                    value={newTimeEntry.memberId}
                    onChange={(e) => setNewTimeEntry(prev => ({ ...prev, memberId: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-sw-darker border border-sw-gray/30 rounded text-sw-light text-sm focus:border-sw-gold focus:outline-none"
                  >
                    <option value="">Select...</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sw-gray text-xs uppercase tracking-wider mb-1">Week Of</label>
                  <input
                    type="date"
                    value={newTimeEntry.weekStart}
                    onChange={(e) => setNewTimeEntry(prev => ({ ...prev, weekStart: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-sw-darker border border-sw-gray/30 rounded text-sw-light text-sm focus:border-sw-gold focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-1">
                  <label className="block text-sw-gray text-xs uppercase tracking-wider mb-1">Hours</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newTimeEntry.hours}
                    onChange={(e) => setNewTimeEntry(prev => ({ ...prev, hours: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 bg-sw-darker border border-sw-gray/30 rounded text-sw-light text-sm focus:border-sw-gold focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sw-gray text-xs uppercase tracking-wider mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={newTimeEntry.notes}
                    onChange={(e) => setNewTimeEntry(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="What did you work on?"
                    className="w-full px-2 py-1.5 bg-sw-darker border border-sw-gray/30 rounded text-sw-light text-sm placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none"
                  />
                </div>
              </div>
              {/* Quick hour buttons */}
              <div className="flex gap-2 mb-3">
                {[1, 2, 4, 8, 16, 24, 40].map(h => (
                  <button
                    key={h}
                    onClick={() => setNewTimeEntry(prev => ({ ...prev, hours: h }))}
                    className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                      newTimeEntry.hours === h
                        ? 'border-sw-gold bg-sw-gold/20 text-sw-gold'
                        : 'border-sw-gray/30 text-sw-gray hover:border-sw-gold hover:text-sw-gold'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              <button
                onClick={addTimeEntry}
                disabled={!newTimeEntry.memberId || newTimeEntry.hours <= 0}
                className="w-full btn-primary text-sm disabled:opacity-50"
              >
                Add Time Entry
              </button>
            </div>

            {/* Time Entry History */}
            <div>
              <h4 className="text-sw-light text-sm font-medium mb-3">Time Entry History</h4>
              {loadingTimeEntries ? (
                <p className="text-sw-gray text-sm text-center py-4">Loading...</p>
              ) : timeEntries.length === 0 ? (
                <p className="text-sw-gray text-sm text-center py-4">No time entries yet</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {timeEntries.map(entry => (
                    <div key={entry.id} className="p-3 bg-sw-darker/50 rounded-lg flex items-center justify-between group">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sw-light text-sm font-medium">{entry.member_name}</span>
                          <span className="text-sw-gold font-orbitron text-sm">{entry.hours_worked}h</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-sw-gray mt-0.5">
                          <span>Week of {formatWeekDisplay(entry.week_start)}</span>
                          {entry.notes && <span>• {entry.notes}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTimeEntry(entry.id)}
                        className="p-1 text-sw-gray opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                        title="Delete entry"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="mt-6 flex justify-end">
              <button onClick={closeHoursModal} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Initiative Modal */}
      {moveModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="hologram-card p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-orbitron text-sw-gold text-lg">Move Initiative</h3>
                <p className="text-sw-gray text-sm mt-1 line-clamp-2">{moveModal.initiativeName}</p>
              </div>
              <button onClick={() => setMoveModal(null)} className="text-sw-gray hover:text-sw-light">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sw-gray text-sm mb-4">Select a goal and key result to move this initiative to:</p>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {allGoals.length === 0 ? (
                <p className="text-sw-gray text-center py-4">Loading goals...</p>
              ) : (
                allGoals
                  .filter(g => g.title !== 'Business as Usual / Others') // Exclude BAU goal
                  .map(g => (
                    <div key={g.id} className="border border-sw-gray/30 rounded-lg overflow-hidden">
                      <div className="p-3 bg-sw-darker/50">
                        <p className="text-sw-gold font-orbitron text-sm">{g.title}</p>
                        <p className="text-sw-gray text-xs">{g.quarter}</p>
                      </div>
                      <div className="p-2 space-y-1">
                        {g.keyResults?.length > 0 ? (
                          g.keyResults.map(kr => (
                            <button
                              key={kr.id}
                              onClick={() => moveInitiative(kr.id)}
                              disabled={movingInitiative || kr.id === moveModal.currentKrId}
                              className={`w-full p-2 text-left rounded text-sm transition-colors ${
                                kr.id === moveModal.currentKrId
                                  ? 'bg-sw-gray/20 text-sw-gray cursor-not-allowed'
                                  : 'hover:bg-sw-purple/20 text-sw-light hover:text-sw-purple'
                              }`}
                            >
                              <span className="text-sw-purple text-xs mr-2">KR</span>
                              {kr.title}
                              {kr.id === moveModal.currentKrId && (
                                <span className="ml-2 text-xs text-sw-gray">(current)</span>
                              )}
                            </button>
                          ))
                        ) : (
                          <p className="text-sw-gray text-xs p-2">No key results</p>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>

            {movingInitiative && (
              <p className="text-sw-gold text-center mt-4 animate-pulse">Moving...</p>
            )}

            <div className="mt-6 flex justify-end">
              <button onClick={() => setMoveModal(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Existing Initiative Modal */}
      {linkModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="hologram-card p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-orbitron text-sw-gold text-lg">Link Existing Initiative</h3>
                <p className="text-sw-gray text-sm mt-1">
                  Associate an unassigned initiative from BAU to this key result
                </p>
              </div>
              <button onClick={() => setLinkModal(null)} className="text-sw-gray hover:text-sw-light">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Search initiatives..."
                className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none"
                autoFocus
              />
            </div>

            {loadingUnassigned ? (
              <p className="text-sw-gold text-center py-8 animate-pulse">Loading initiatives...</p>
            ) : unassignedInitiatives.length === 0 ? (
              <p className="text-sw-gray text-center py-8">No unassigned initiatives found in BAU</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {unassignedInitiatives
                  .filter(i => !linkSearch || i.name.toLowerCase().includes(linkSearch.toLowerCase()))
                  .map(init => (
                    <div
                      key={init.id}
                      className="flex items-center justify-between p-3 rounded border border-sw-gray/20 hover:border-sw-purple/50 transition-colors bg-sw-darker/30"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sw-light text-sm truncate">{init.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {init.owner_name && (
                            <span className="text-sw-gray text-xs">{init.owner_name}</span>
                          )}
                          {init.category && (
                            <span className="text-sw-gold text-xs px-1.5 py-0.5 rounded bg-sw-gold/10">{init.category}</span>
                          )}
                          {init.status && (
                            <span className="text-sw-blue text-xs">{init.status}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => linkInitiativeToKR(init.id)}
                        className="btn-primary text-xs px-3 py-1 flex-shrink-0"
                      >
                        Link
                      </button>
                    </div>
                  ))}
                {unassignedInitiatives.filter(i => !linkSearch || i.name.toLowerCase().includes(linkSearch.toLowerCase())).length === 0 && (
                  <p className="text-sw-gray text-center py-4">No matching initiatives</p>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button onClick={() => setLinkModal(null)} className="btn-secondary">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
