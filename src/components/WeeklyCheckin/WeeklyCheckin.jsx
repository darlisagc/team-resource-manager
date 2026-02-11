import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts'
import {
  getWeekStart,
  formatWeekDisplay,
  getProgressColorClass,
  getProgressBgClass,
  percentageToHours,
  hoursToPercentage,
  BASELINE_FTE_HOURS,
  handleApiError,
  getCurrentQuarter
} from '../../constants'

// Mood emojis with descriptions
const MOOD_OPTIONS = [
  { emoji: '🔥', label: 'On Fire', description: 'Crushing it! High energy and productivity' },
  { emoji: '😊', label: 'Good', description: 'Feeling positive and productive' },
  { emoji: '😐', label: 'Neutral', description: 'Normal week, nothing special' },
  { emoji: '🤔', label: 'Blocked', description: 'Waiting on dependencies or decisions' },
]

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

// Mood score mapping for analytics
const MOOD_SCORES = {
  '🔥': 4, '😊': 3, '😐': 2, '🤔': 1
}

// Star Wars themed force levels for mood scores
const FORCE_LEVELS = [
  { min: 3.5, label: 'FORCE MASTER', color: 'text-green-400', bg: 'bg-green-500', quote: 'Do. Or do not. There is no try.', icon: '⚡' },
  { min: 2.5, label: 'JEDI KNIGHT', color: 'text-sw-blue', bg: 'bg-blue-500', quote: 'The Force will be with you. Always.', icon: '🗡' },
  { min: 1.5, label: 'PADAWAN', color: 'text-yellow-400', bg: 'bg-yellow-500', quote: 'Much to learn, you still have.', icon: '📚' },
  { min: 0, label: 'DARK SIDE', color: 'text-red-400', bg: 'bg-red-500', quote: 'I find your lack of faith disturbing.', icon: '💀' },
]

const MOOD_RANKS = {
  '🔥': { rank: 'Force Master', desc: 'Wielding unlimited power', color: 'from-green-500/20 to-green-500/5', border: 'border-green-500/50' },
  '😊': { rank: 'Jedi Knight', desc: 'One with the Force', color: 'from-blue-500/20 to-blue-500/5', border: 'border-blue-500/50' },
  '😐': { rank: 'Padawan', desc: 'Training in progress', color: 'from-yellow-500/20 to-yellow-500/5', border: 'border-yellow-500/50' },
  '🤔': { rank: 'Youngling', desc: 'Disturbance in the Force', color: 'from-red-500/20 to-red-500/5', border: 'border-red-500/50' },
}

function getForceLevel(score) {
  return FORCE_LEVELS.find(f => score >= f.min) || FORCE_LEVELS[FORCE_LEVELS.length - 1]
}

// Using centralized getWeekStart and formatWeekDisplay from constants

export default function WeeklyCheckin() {
  const { getAuthHeader, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(getWeekStart())

  // Member selection
  const [members, setMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)

  // Assignments
  const [initiatives, setInitiatives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [bauKeyResult, setBauKeyResult] = useState(null) // BAU/Miscellaneous key result

  // Worked items (dragged to "this week" area)
  const [workedItems, setWorkedItems] = useState([]) // { type, id, name, time: 0, progress: 0 }

  const [globalNotes, setGlobalNotes] = useState('')
  const [checkinStatus, setCheckinStatus] = useState('draft')
  const [selectedMood, setSelectedMood] = useState(null)

  // View mode: 'individual' for single member, 'team' for team overview
  const [viewMode, setViewMode] = useState('individual')
  const [teamCheckins, setTeamCheckins] = useState([])

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsQuarter, setAnalyticsQuarter] = useState(getCurrentQuarter())
  const [availableQuarters, setAvailableQuarters] = useState([])

  // BAU task counter for unique IDs
  const [bauTaskCounter, setBauTaskCounter] = useState(0)
  // Event task counter for generic events
  const [eventTaskCounter, setEventTaskCounter] = useState(0)
  const [eventKeyResult, setEventKeyResult] = useState(null) // Events KR to link generic events

  useEffect(() => {
    fetchMembers()
  }, [])

  useEffect(() => {
    if (selectedMember) {
      fetchMemberAssignments()
    }
  }, [selectedMember])

  useEffect(() => {
    if (selectedMember && initiatives.length >= 0) {
      fetchCheckin()
    }
  }, [selectedWeek, selectedMember, initiatives])

  // Helper to check if initiative is BAU (Business as Usual only, not Events)
  const isBauInitiative = (init) => {
    return init.goal_title?.includes('Business as Usual')
  }

  // Helper to check if initiative is an Event
  const isEventInitiative = (init) => {
    return init.goal_title === 'Events'
  }

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/members', { headers: getAuthHeader() })
      if (res.ok) {
        const data = await res.json()
        setMembers(data)
      }
    } catch (error) {
      console.error('Failed to fetch members:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMemberAssignments = async () => {
    setLoading(true)
    try {
      // Fetch initiatives assigned to this member
      const initRes = await fetch(`/api/initiatives/member/${selectedMember.id}`, { headers: getAuthHeader() })
      if (initRes.ok) {
        setInitiatives(await initRes.json())
      }

      // Fetch key results assigned to this member
      const krRes = await fetch(`/api/key-results?assignee_id=${selectedMember.id}`, { headers: getAuthHeader() })
      if (krRes.ok) {
        const krData = await krRes.json()
        setKeyResults(krData)
      }

      // Fetch the BAU/Miscellaneous key result (from "Business as Usual / Others" goal)
      const bauRes = await fetch('/api/key-results?bau=true', { headers: getAuthHeader() })
      if (bauRes.ok) {
        const bauData = await bauRes.json()
        if (bauData.length > 0) {
          setBauKeyResult(bauData[0])
        }
      }

      // Fetch the Events key result (to link generic event entries)
      const eventsKrRes = await fetch('/api/key-results?goal_id=33', { headers: getAuthHeader() })
      if (eventsKrRes.ok) {
        const eventsKrData = await eventsKrRes.json()
        if (eventsKrData.length > 0) {
          setEventKeyResult(eventsKrData[0])
        }
      }
    } catch (error) {
      console.error('Failed to fetch assignments:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCheckin = async () => {
    try {
      const res = await fetch(`/api/weekly-checkins/member/${selectedMember.id}/week/${selectedWeek}`, { headers: getAuthHeader() })
      if (res.ok) {
        const data = await res.json()
        if (data.checkin) {
          setCheckinStatus(data.checkin.status)
          setGlobalNotes(data.checkin.notes || '')
          setSelectedMood(data.checkin.mood || null)

          // Restore worked items from saved check-in
          const restored = data.items.map((item, index) => {
            // Check if it's a miscellaneous item (both IDs are null)
            const isMisc = !item.initiative_id && !item.key_result_id && !item.is_event
            // Check if it's a BAU item (key_result_id matches bauKeyResult and no initiative_id)
            const isBau = bauKeyResult && item.key_result_id === bauKeyResult.id && !item.initiative_id && !item.is_event
            // Check if it's a generic event item
            const isEvent = item.is_event || (eventKeyResult && item.key_result_id === eventKeyResult.id && !item.initiative_id && !isBau)
            // Check ownership - look up from loaded initiatives/keyResults
            let isOwner = false
            if (item.initiative_id) {
              const init = initiatives.find(i => i.id === item.initiative_id)
              isOwner = init?.owner_id === selectedMember?.id
            } else if (item.key_result_id && !isBau && !isEvent) {
              const kr = keyResults.find(k => k.id === item.key_result_id)
              isOwner = kr?.owner_id === selectedMember?.id
            }

            // Determine type
            let type = 'kr'
            if (isMisc) type = 'misc'
            else if (isEvent) type = 'event'
            else if (isBau) type = 'bau'
            else if (item.initiative_id) type = 'initiative'

            // Use unique ID: database item.id for saved items, or generate unique for BAU/misc/event
            let uniqueId
            if (isMisc) {
              uniqueId = `misc-${item.id || index}`
            } else if (isBau) {
              uniqueId = `bau-restored-${item.id || index}`
            } else if (isEvent) {
              uniqueId = `event-restored-${item.id || index}`
            } else {
              uniqueId = item.initiative_id || item.key_result_id
            }

            // Look up target info from initiatives for target-based progress
            const init = item.initiative_id ? initiatives.find(i => i.id === item.initiative_id) : null

            return {
              type,
              id: uniqueId,
              name: (isMisc || isBau || isEvent) ? (item.notes || '') : (item.initiative_name || item.key_result_title),
              goalTitle: isEvent ? 'Events' : item.goal_title,
              isOwner: isMisc || isBau || isEvent ? true : isOwner,
              time: item.time_allocation_pct || 0,
              progress: item.progress_contribution_pct || 0,
              targetValue: init?.target_value || item.target_value || null,
              currentValue: init?.current_value || item.current_value || 0,
              currentValueIncrement: item.current_value_increment || 0,
            }
          })

          // Auto-add assigned events that overlap this week (if not already in restored items)
          const weekStart = new Date(selectedWeek + 'T00:00:00')
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 6)
          const overlappingEvents = initiatives.filter(i => {
            if (!isEventInitiative(i)) return false
            if (!i.start_date && !i.end_date) return false
            const eventStart = i.start_date ? new Date(i.start_date + 'T00:00:00') : null
            const eventEnd = i.end_date ? new Date(i.end_date + 'T00:00:00') : eventStart
            if (!eventStart) return false
            return eventStart <= weekEnd && eventEnd >= weekStart
          })

          const eventsToAdd = overlappingEvents
            .filter(ev => !restored.some(r => r.type === 'initiative' && r.id === ev.id))
            .map(ev => ({
              type: 'initiative',
              id: ev.id,
              name: ev.name,
              goalTitle: 'Events',
              isOwner: ev.owner_id === selectedMember?.id,
              time: ev.actual_hours ? hoursToPercentage(ev.actual_hours) : 0,
              progress: ev.progress || 0,
              targetValue: ev.target_value || null,
              currentValue: ev.current_value || 0,
            }))

          setWorkedItems([...restored, ...eventsToAdd])
        } else {
          // New week - auto-add assigned events that overlap this week
          setCheckinStatus('draft')
          setGlobalNotes('')
          setSelectedMood(null)

          const weekStart = new Date(selectedWeek + 'T00:00:00')
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 6)
          const overlappingEvents = initiatives.filter(i => {
            if (!isEventInitiative(i)) return false
            if (!i.start_date && !i.end_date) return false
            const eventStart = i.start_date ? new Date(i.start_date + 'T00:00:00') : null
            const eventEnd = i.end_date ? new Date(i.end_date + 'T00:00:00') : eventStart
            if (!eventStart) return false
            return eventStart <= weekEnd && eventEnd >= weekStart
          })

          setWorkedItems(overlappingEvents.map(ev => ({
            type: 'initiative',
            id: ev.id,
            name: ev.name,
            goalTitle: 'Events',
            isOwner: ev.owner_id === selectedMember?.id,
            time: ev.actual_hours ? hoursToPercentage(ev.actual_hours) : 0,
            progress: ev.progress || 0,
            targetValue: ev.target_value || null,
            currentValue: ev.current_value || 0,
          })))
        }
      }
    } catch (error) {
      console.error('Failed to fetch checkin:', error)
    }
  }

  // Fetch team check-ins for team overview
  const fetchTeamCheckins = async () => {
    try {
      const res = await fetch(`/api/weekly-checkins/team/${selectedWeek}`, { headers: getAuthHeader() })
      if (res.ok) {
        const data = await res.json()
        setTeamCheckins(data)
      }
    } catch (error) {
      console.error('Failed to fetch team checkins:', error)
    }
  }

  // Copy items from previous week
  const copyFromPreviousWeek = async () => {
    const prevWeek = new Date(selectedWeek + 'T00:00:00')
    prevWeek.setDate(prevWeek.getDate() - 7)
    const prevWeekStr = prevWeek.toISOString().split('T')[0]

    try {
      const res = await fetch(`/api/weekly-checkins/member/${selectedMember.id}/week/${prevWeekStr}`, { headers: getAuthHeader() })
      if (res.ok) {
        const data = await res.json()
        if (data.checkin && data.items.length > 0) {
          // Copy items but reset time to 0 (keep progress for continuity)
          const copiedItems = data.items.map((item, index) => {
            const isMisc = !item.initiative_id && !item.key_result_id
            const isBau = bauKeyResult && item.key_result_id === bauKeyResult.id && !item.initiative_id

            let type = 'kr'
            if (isMisc) type = 'misc'
            else if (isBau) type = 'bau'
            else if (item.initiative_id) type = 'initiative'

            let uniqueId
            if (isMisc) uniqueId = `misc-copy-${Date.now()}-${index}`
            else if (isBau) uniqueId = `bau-copy-${Date.now()}-${index}`
            else uniqueId = item.initiative_id || item.key_result_id

            // For initiatives, get current progress from initiatives list
            let currentProgress = 0
            if (item.initiative_id) {
              const init = initiatives.find(i => i.id === item.initiative_id)
              currentProgress = init?.progress || 0
            }

            // Look up target info from initiatives
            const initData = item.initiative_id ? initiatives.find(i => i.id === item.initiative_id) : null

            return {
              type,
              id: uniqueId,
              name: (isMisc || isBau) ? (item.notes || '') : (item.initiative_name || item.key_result_title),
              goalTitle: item.goal_title,
              isOwner: isMisc || isBau ? true : (item.initiative_id ? initData?.owner_id === selectedMember?.id : false),
              time: 0, // Reset time for new week
              progress: currentProgress,
              isBauInitiative: type === 'initiative' && initData?.goal_title?.includes('Business as Usual'),
              targetValue: initData?.target_value || null,
              currentValue: initData?.current_value || 0,
            }
          })

          // Filter out duplicates and completed items
          const filteredItems = copiedItems.filter(item => {
            if (item.type === 'initiative') {
              const init = initiatives.find(i => i.id === item.id)
              return init && (init.progress || 0) < 100
            }
            return true
          })

          setWorkedItems(filteredItems)
          setSelectedMood(data.checkin.mood || null)
          alert(`Copied ${filteredItems.length} items from previous week. Time reset to 0%.`)
        } else {
          alert('No check-in found for previous week.')
        }
      }
    } catch (error) {
      console.error('Failed to copy from previous week:', error)
      alert('Failed to copy from previous week.')
    }
  }

  // Effect to fetch team checkins when in team view mode
  useEffect(() => {
    if (viewMode === 'team') {
      fetchTeamCheckins()
    }
  }, [viewMode, selectedWeek])

  // Effect to fetch analytics data when in analytics view
  useEffect(() => {
    if (viewMode === 'analytics') {
      fetchAnalyticsData()
      if (availableQuarters.length === 0) {
        fetchQuarters()
      }
    }
  }, [viewMode, analyticsQuarter])

  const fetchAnalyticsData = async () => {
    try {
      const res = await fetch(`/api/weekly-checkins/analytics?quarter=${encodeURIComponent(analyticsQuarter)}`, { headers: getAuthHeader() })
      if (res.ok) {
        setAnalyticsData(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    }
  }

  const fetchQuarters = async () => {
    try {
      const res = await fetch('/api/dashboard/quarters', { headers: getAuthHeader() })
      if (res.ok) {
        const data = await res.json()
        setAvailableQuarters(data)
      }
    } catch (error) {
      console.error('Failed to fetch quarters:', error)
    }
  }

  const totalTime = useMemo(() => {
    return workedItems.reduce((sum, item) => sum + (item.time || 0), 0)
  }, [workedItems])

  const remainingTime = 100 - totalTime

  // Drag handlers
  const handleDragStart = (e, type, item) => {
    e.dataTransfer.setData('type', type)
    e.dataTransfer.setData('item', JSON.stringify(item))
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.currentTarget.classList.add('border-sw-gold')
  }

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('border-sw-gold')
  }

  const handleDropToWorked = (e) => {
    e.preventDefault()
    e.currentTarget.classList.remove('border-sw-gold')

    const type = e.dataTransfer.getData('type')
    const item = JSON.parse(e.dataTransfer.getData('item'))

    // BAU and event items always get added (they have unique IDs), others check for duplicates
    const exists = type !== 'bau' && type !== 'event' && workedItems.some(w => w.type === type && w.id === item.id)
    if (!exists) {
      // Check if current member is the owner
      const isOwner = item.owner_id === selectedMember?.id
      // BAU, event and misc items start with empty name so user can customize
      const initialName = (type === 'bau' || type === 'misc' || type === 'event') ? '' : (item.name || item.title)
      // Use existing progress for initiatives, 0 for new BAU/event tasks
      const initialProgress = (type === 'initiative' || type === 'kr') ? (item.progress || 0) : 0
      // Check if this is a BAU initiative (from Business as Usual goal)
      const isBauInit = type === 'initiative' && item.goal_title?.includes('Business as Usual')
      setWorkedItems([...workedItems, {
        type,
        id: item.id,
        name: initialName,
        goalTitle: item.goal_title,
        isOwner: (type === 'bau' || type === 'event') ? true : isOwner,
        time: 0,
        progress: initialProgress,
        category: type === 'bau' ? '' : undefined,
        isBauInitiative: isBauInit,
        targetValue: (type === 'initiative') ? (item.target_value || null) : null,
        currentValue: (type === 'initiative') ? (item.current_value || 0) : null,
      }])
    }
  }

  const removeWorkedItem = (type, id) => {
    setWorkedItems(workedItems.filter(w => !(w.type === type && w.id === id)))
  }

  const updateWorkedItem = async (type, id, field, value) => {
    // Update local state
    const updatedItems = workedItems.map(w => {
      if (w.type === type && w.id === id) {
        const updated = { ...w, [field]: value }
        // If changing time on a BAU initiative, also update actualHours
        if (field === 'time' && w.isBauInitiative) {
          updated.actualHours = percentageToHours(value) // Using BASELINE_FTE_HOURS constant
        }
        return updated
      }
      return w
    })
    setWorkedItems(updatedItems)

    // Sync changes to the initiative
    const item = workedItems.find(w => w.type === type && w.id === id)

    // For BAU initiatives, sync time entries
    if (item?.isBauInitiative && field === 'time') {
      try {
        const hours = percentageToHours(value) // Convert % to hours (40h week)
        await fetch(`/api/initiatives/${id}/time-entries`, {
          method: 'POST',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            team_member_id: selectedMember.id,
            week_start: selectedWeek,
            hours_worked: hours,
            notes: `Weekly check-in: ${value}%`
          })
        })
      } catch (error) {
        console.error('Failed to sync time to initiative:', error)
      }
    }

    // For target-based initiatives, sync progress from increment
    if (type === 'initiative' && field === 'currentValueIncrement' && item?.isOwner && item?.targetValue) {
      try {
        const newCurrentValue = Math.min(item.targetValue, (item.currentValue || 0) + value)
        const newProgress = Math.min(100, Math.round((newCurrentValue / item.targetValue) * 100))
        await fetch(`/api/initiatives/${id}/progress`, {
          method: 'PATCH',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ progress: newProgress, current_value: newCurrentValue })
        })
      } catch (error) {
        console.error('Failed to sync target-based progress to initiative:', error)
      }
    }

    // For non-target initiatives, sync progress when owner changes it
    if (type === 'initiative' && field === 'progress' && item?.isOwner && !item?.targetValue) {
      try {
        await fetch(`/api/initiatives/${id}/progress`, {
          method: 'PATCH',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ progress: value })
        })
      } catch (error) {
        console.error('Failed to sync progress to initiative:', error)
      }
    }
  }

  // Add a new BAU task directly
  const addBauTask = () => {
    const newId = `bau-${Date.now()}-${bauTaskCounter}`
    setBauTaskCounter(prev => prev + 1)
    setWorkedItems([...workedItems, {
      type: 'bau',
      id: newId,
      name: '',
      goalTitle: 'Business as Usual / Others',
      isOwner: true,
      time: 0,
      progress: 0,
      category: '', // BAU category
      isNew: true // Flag to indicate this is a new BAU task
    }])
  }

  const saveCheckin = async (submit = false) => {
    if (submit && (totalTime < 100 || totalTime > 120)) {
      alert('Total time allocation must be between 100% and 120% to submit')
      return
    }

    setSaving(true)
    try {
      const items = workedItems.map(w => ({
        initiative_id: w.type === 'initiative' ? w.id : null,
        // For BAU items, use the actual bauKeyResult.id; for event items, use eventKeyResult.id
        key_result_id: w.type === 'kr' ? w.id : (w.type === 'bau' && bauKeyResult ? bauKeyResult.id : (w.type === 'event' && eventKeyResult ? eventKeyResult.id : null)),
        is_misc: w.type === 'misc',
        is_bau: w.type === 'bau',
        is_event: w.type === 'event',
        time_allocation_pct: w.time,
        progress_contribution_pct: w.targetValue ? 0 : w.progress,
        current_value_increment: w.targetValue ? (w.currentValueIncrement || 0) : null,
        notes: (w.type === 'misc' || w.type === 'bau' || w.type === 'event') ? w.name : null,
        category: w.type === 'bau' ? w.category : null
      }))

      const res = await fetch('/api/weekly-checkins', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: selectedMember.id,
          week_start: selectedWeek,
          items,
          notes: globalNotes,
          mood: selectedMood,
          submit
        })
      })

      if (res.ok) {
        const data = await res.json()
        setCheckinStatus(data.checkin.status)
        if (submit) {
          alert('Check-in submitted successfully!')
        }
      } else {
        const error = await res.json()
        alert(error.message || 'Failed to save')
      }
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(false)
    }
  }

  const navigateWeek = (direction) => {
    const current = new Date(selectedWeek + 'T00:00:00')
    current.setDate(current.getDate() + direction * 7)
    setSelectedWeek(current.toISOString().split('T')[0])
  }

  // Items not yet added to "worked" list
  // Exclude completed initiatives (progress >= 100) - they shouldn't appear anymore
  const availableInitiatives = initiatives.filter(i =>
    !workedItems.some(w => w.type === 'initiative' && w.id === i.id) &&
    (i.progress || 0) < 100 &&
    !isEventInitiative(i)
  )
  // Assigned events - only events from the member's own initiatives
  // Assigned events - hide completed ones from sidebar (they get auto-added to the right week)
  const assignedEvents = initiatives.filter(i =>
    !workedItems.some(w => w.type === 'initiative' && w.id === i.id) &&
    isEventInitiative(i) &&
    (i.progress || 0) < 100
  )
  // Filter out BAU and Events key results
  const availableKRs = keyResults.filter(kr =>
    !workedItems.some(w => w.type === 'kr' && w.id === kr.id) &&
    !kr.goal_title?.includes('Business as Usual') &&
    kr.goal_title !== 'Events'
  )

  // Count BAU tasks (multiple allowed now)
  const bauTaskCount = workedItems.filter(w => w.type === 'bau').length

  if (loading && members.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sw-gold font-orbitron animate-pulse">LOADING...</div>
      </div>
    )
  }

  // Step 1: Select member or view team overview
  if (!selectedMember) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Weekly Check-in</h1>
          <p className="text-sw-gray text-sm">View team progress or select yourself to report</p>
        </div>

        {/* View Mode Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('individual')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'individual'
                ? 'bg-sw-gold text-sw-dark'
                : 'bg-sw-darker border border-sw-gray/30 text-sw-gray hover:border-sw-gold hover:text-sw-gold'
            }`}
          >
            My Check-in
          </button>
          <button
            onClick={() => setViewMode('team')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'team'
                ? 'bg-sw-gold text-sw-dark'
                : 'bg-sw-darker border border-sw-gray/30 text-sw-gray hover:border-sw-gold hover:text-sw-gold'
            }`}
          >
            Team Overview
          </button>
          <button
            onClick={() => setViewMode('analytics')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'analytics'
                ? 'bg-sw-gold text-sw-dark'
                : 'bg-sw-darker border border-sw-gray/30 text-sw-gray hover:border-sw-gold hover:text-sw-gold'
            }`}
          >
            Analytics
          </button>
        </div>

        {/* Week Selector (only for team view) */}
        {viewMode === 'team' && <div className="hologram-card p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const prev = new Date(selectedWeek + 'T00:00:00')
                prev.setDate(prev.getDate() - 7)
                setSelectedWeek(prev.toISOString().split('T')[0])
              }}
              className="px-4 py-2 text-sw-gold hover:bg-sw-gold/20 rounded transition-colors"
            >
              &#9664; Previous
            </button>
            <div className="text-center">
              <p className="text-sw-gray text-xs uppercase tracking-wider">Week of</p>
              <p className="text-sw-light text-lg font-orbitron">{formatWeekDisplay(selectedWeek)}</p>
            </div>
            <button
              onClick={() => {
                const next = new Date(selectedWeek + 'T00:00:00')
                next.setDate(next.getDate() + 7)
                setSelectedWeek(next.toISOString().split('T')[0])
              }}
              className="px-4 py-2 text-sw-gold hover:bg-sw-gold/20 rounded transition-colors"
            >
              Next &#9654;
            </button>
          </div>
        </div>}

        {/* Team Overview View */}
        {viewMode === 'team' && (
          <div className="hologram-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-orbitron text-sw-gold text-lg">Team Check-ins for {formatWeekDisplay(selectedWeek)}</h2>
              <span className="px-2 py-1 bg-sw-blue/20 text-sw-blue text-xs rounded flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Only
              </span>
            </div>

            {teamCheckins.length === 0 ? (
              <p className="text-sw-gray text-center py-8">No check-ins submitted for this week yet.</p>
            ) : (
              <div className="space-y-4">
                {teamCheckins.map(checkin => (
                  <div key={checkin.id} className="p-4 bg-sw-darker/50 rounded-lg border border-sw-gray/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-sw-gold/20 flex items-center justify-center">
                          <span className="text-sw-gold font-orbitron">{checkin.member_name?.[0]}</span>
                        </div>
                        <div>
                          <p className="text-sw-light font-medium">{checkin.member_name}</p>
                          <p className="text-sw-gray text-xs">{checkin.member_role}</p>
                        </div>
                        {checkin.mood && (
                          <span className="text-2xl" title={MOOD_OPTIONS.find(m => m.emoji === checkin.mood)?.label}>
                            {checkin.mood}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-1 rounded text-xs ${
                          checkin.status === 'submitted' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {checkin.status}
                        </span>
                        <p className="text-sw-gold font-orbitron mt-1">{checkin.total_allocation_pct}%</p>
                      </div>
                    </div>

                    {checkin.items && checkin.items.length > 0 && (
                      <div className="space-y-1 mt-3 pt-3 border-t border-sw-gray/20">
                        {checkin.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-sw-light">{item.initiative_name || item.key_result_title || item.notes || 'Unknown'}</span>
                            <span className="text-sw-gold font-orbitron">{item.time_allocation_pct}%</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {checkin.notes && (
                      <p className="text-sw-gray text-sm mt-3 pt-3 border-t border-sw-gray/20 italic">"{checkin.notes}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Summary Stats */}
            <div className="mt-6 pt-4 border-t border-sw-gray/20 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sw-gray text-xs uppercase">Submitted</p>
                <p className="text-green-400 font-orbitron text-xl">{teamCheckins.filter(c => c.status === 'submitted').length}</p>
              </div>
              <div>
                <p className="text-sw-gray text-xs uppercase">Draft</p>
                <p className="text-yellow-400 font-orbitron text-xl">{teamCheckins.filter(c => c.status === 'draft').length}</p>
              </div>
              <div>
                <p className="text-sw-gray text-xs uppercase">Not Started</p>
                <p className="text-sw-gray font-orbitron text-xl">{members.length - teamCheckins.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* Analytics View */}
        {viewMode === 'analytics' && (
          <div className="space-y-6">
            {/* Quarter Selector */}
            <div className="hologram-card p-4">
              <div className="flex items-center justify-between">
                <label className="text-sw-gray text-sm uppercase tracking-wider">Quarter</label>
                <select
                  value={analyticsQuarter}
                  onChange={(e) => setAnalyticsQuarter(e.target.value)}
                  className="px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded-lg text-sw-light font-orbitron focus:border-sw-gold focus:outline-none"
                >
                  {availableQuarters.length > 0 ? (
                    availableQuarters.map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))
                  ) : (
                    <option value={analyticsQuarter}>{analyticsQuarter}</option>
                  )}
                </select>
              </div>
            </div>

            {/* Goal Progress Chart */}
            <div className="hologram-card p-6">
              <h2 className="font-orbitron text-sw-gold text-lg mb-4">Goal Progress</h2>
              {analyticsData?.goalProgress?.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(300, analyticsData.goalProgress.length * 50)}>
                  <BarChart
                    data={analyticsData.goalProgress.map(g => ({
                      ...g,
                      name: g.title.length > 40 ? g.title.substring(0, 37) + '...' : g.title
                    }))}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af' }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={200}
                      tick={{ fill: '#e5e7eb', fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #FF6B35', borderRadius: '8px' }}
                      labelStyle={{ color: '#FF6B35', fontFamily: 'Orbitron' }}
                      itemStyle={{ color: '#e5e7eb' }}
                      formatter={(value) => [`${value}%`, 'Progress']}
                    />
                    <Bar dataKey="progress" fill="#FF6B35" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sw-gray text-center py-8">No goals found for {analyticsQuarter}</p>
              )}
            </div>

            {/* Galactic Morale Index */}
            <div className="hologram-card p-6">
              <h2 className="font-orbitron text-sw-gold text-lg mb-2">Galactic Morale Index</h2>
              <p className="text-sw-gray text-xs mb-6">Measuring the Force within the team</p>

              {analyticsData?.moodTrends?.length > 0 ? (
                <>
                  {/* Current Force Level - Big Gauge */}
                  {(() => {
                    const latest = analyticsData.moodTrends[analyticsData.moodTrends.length - 1]
                    const level = getForceLevel(latest.avgScore)
                    const pct = (latest.avgScore / 4) * 100
                    return (
                      <div className="flex flex-col items-center mb-8">
                        {/* Circular gauge */}
                        <div className="relative w-48 h-48 mb-4">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="42" fill="none" stroke="#1a1a2e" strokeWidth="8" />
                            <circle
                              cx="50" cy="50" r="42" fill="none"
                              stroke={level.label === 'FORCE MASTER' ? '#4ade80' : level.label === 'JEDI KNIGHT' ? '#4BD5EE' : level.label === 'PADAWAN' ? '#facc15' : '#f87171'}
                              strokeWidth="8"
                              strokeLinecap="round"
                              strokeDasharray={`${pct * 2.64} 264`}
                              className="transition-all duration-1000"
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-4xl mb-1">{level.icon}</span>
                            <span className={`font-orbitron text-2xl font-bold ${level.color}`}>{latest.avgScore}</span>
                            <span className="text-sw-gray text-xs">/ 4.0</span>
                          </div>
                        </div>
                        <span className={`font-orbitron text-sm tracking-widest ${level.color}`}>{level.label}</span>
                        <p className="text-sw-gray text-xs italic mt-2 max-w-xs text-center">"{level.quote}"</p>
                        <p className="text-sw-gray/50 text-xs mt-1">
                          Week of {new Date(latest.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {latest.totalCheckins} check-in{latest.totalCheckins !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )
                  })()}

                  {/* Mood Power Cards */}
                  <div className="grid grid-cols-4 gap-3 mb-8">
                    {MOOD_OPTIONS.map(mood => {
                      const totalMood = analyticsData.moodTrends.reduce((sum, t) => sum + (t.moodCounts[mood.emoji] || 0), 0)
                      const totalAll = analyticsData.moodTrends.reduce((sum, t) => sum + t.totalCheckins, 0)
                      const pct = totalAll > 0 ? Math.round((totalMood / totalAll) * 100) : 0
                      const rank = MOOD_RANKS[mood.emoji]
                      return (
                        <div key={mood.emoji} className={`p-3 rounded-lg border ${rank.border} bg-gradient-to-b ${rank.color} text-center`}>
                          <span className="text-3xl block mb-1">{mood.emoji}</span>
                          <span className="font-orbitron text-sw-light text-lg block">{totalMood}</span>
                          <span className="text-sw-gray text-xs block">{pct}% of votes</span>
                          <span className="font-orbitron text-xs block mt-2 text-sw-light/80">{rank.rank}</span>
                          <span className="text-sw-gray text-[10px] block italic">{rank.desc}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Force Level Timeline */}
                  <div className="mb-6">
                    <h3 className="text-sw-gray text-xs uppercase tracking-wider mb-4">Force Level Timeline</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart
                        data={analyticsData.moodTrends.map(t => ({
                          ...t,
                          weekLabel: new Date(t.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        }))}
                        margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                        <XAxis dataKey="weekLabel" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                        <YAxis
                          domain={[0, 4]}
                          ticks={[1, 2, 3, 4]}
                          tick={{ fill: '#9ca3af', fontSize: 10 }}
                          tickFormatter={(v) => {
                            if (v === 4) return '⚡ Master'
                            if (v === 3) return '🗡 Knight'
                            if (v === 2) return '📚 Padawan'
                            if (v === 1) return '💀 Dark Side'
                            return ''
                          }}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #FF6B35', borderRadius: '8px' }}
                          labelStyle={{ color: '#FF6B35', fontFamily: 'Orbitron', fontSize: 12 }}
                          formatter={(value, name) => {
                            if (name === 'Force Level') {
                              const level = getForceLevel(value)
                              return [`${value} — ${level.label}`, 'Force Level']
                            }
                            return [`${value}`, name]
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="avgScore"
                          stroke="#FF6B35"
                          strokeWidth={3}
                          dot={(props) => {
                            const level = getForceLevel(props.payload.avgScore)
                            const fill = level.label === 'FORCE MASTER' ? '#4ade80' : level.label === 'JEDI KNIGHT' ? '#4BD5EE' : level.label === 'PADAWAN' ? '#facc15' : '#f87171'
                            return <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={6} fill={fill} stroke="#1a1a2e" strokeWidth={2} />
                          }}
                          activeDot={{ r: 8, stroke: '#FF6B35', strokeWidth: 2 }}
                          name="Force Level"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Weekly Morale Breakdown - Visual Bars */}
                  <div className="pt-4 border-t border-sw-gray/20">
                    <h3 className="text-sw-gray text-xs uppercase tracking-wider mb-4">Weekly Morale Breakdown</h3>
                    <div className="space-y-3">
                      {analyticsData.moodTrends.map(trend => {
                        const level = getForceLevel(trend.avgScore)
                        return (
                          <div key={trend.week} className="flex items-center gap-3">
                            <span className="text-sw-light font-orbitron w-20 text-xs shrink-0">
                              {new Date(trend.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                            {/* Stacked emoji bar */}
                            <div className="flex-1 flex h-8 rounded-lg overflow-hidden bg-sw-darker/50">
                              {Object.entries(trend.moodCounts).map(([emoji, count]) => {
                                const width = (count / trend.totalCheckins) * 100
                                const bgColor = emoji === '🔥' ? 'bg-green-500/40' : emoji === '😊' ? 'bg-blue-500/40' : emoji === '😐' ? 'bg-yellow-500/40' : 'bg-red-500/40'
                                return (
                                  <div
                                    key={emoji}
                                    className={`${bgColor} flex items-center justify-center text-sm transition-all`}
                                    style={{ width: `${width}%` }}
                                    title={`${emoji} ${MOOD_OPTIONS.find(m => m.emoji === emoji)?.label}: ${count}`}
                                  >
                                    {width > 15 && <span>{emoji}</span>}
                                    {width > 25 && <span className="text-xs text-sw-light/80 ml-1">{count}</span>}
                                  </div>
                                )
                              })}
                            </div>
                            <span className={`font-orbitron text-xs w-16 text-right ${level.color}`}>
                              {level.icon} {trend.avgScore}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <span className="text-6xl block mb-4">🔮</span>
                  <p className="text-sw-gray font-orbitron text-sm">The Force is silent...</p>
                  <p className="text-sw-gray/50 text-xs mt-2">No mood data available for {analyticsQuarter}.</p>
                  <p className="text-sw-gray/50 text-xs">Submit weekly check-ins with moods to awaken the Galactic Morale Index.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Individual Check-in - Member Selection */}
        {viewMode === 'individual' && (
          <div className="hologram-card p-6">
            <h2 className="font-orbitron text-sw-gold text-lg mb-4">Select Team Member</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {members.map(member => {
                // Check if this member matches the logged-in user (by first name)
                const memberFirstName = member.name.split(' ')[0].toLowerCase()
                const isCurrentUser = true

                return (
                  <button
                    key={member.id}
                    onClick={() => isCurrentUser && setSelectedMember(member)}
                    disabled={!isCurrentUser}
                    className={`p-4 rounded-lg border transition-all text-left ${
                      isCurrentUser
                        ? 'bg-sw-darker/50 border-sw-gold/50 hover:border-sw-gold cursor-pointer'
                        : 'bg-sw-darker/20 border-sw-gray/20 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isCurrentUser ? 'bg-sw-gold/20' : 'bg-sw-gray/20'
                      }`}>
                        <span className={`font-orbitron ${isCurrentUser ? 'text-sw-gold' : 'text-sw-gray'}`}>
                          {member.name[0]}
                        </span>
                      </div>
                      <div>
                        <p className={`font-medium ${isCurrentUser ? 'text-sw-light' : 'text-sw-gray'}`}>
                          {member.name}
                          {false && (
                            <span className="ml-2 text-xs text-sw-gold">(You)</span>
                          )}
                        </p>
                        <p className="text-sw-gray text-xs">{member.role || member.team}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Weekly Check-in</h1>
          <p className="text-sw-gray text-sm">Report your time allocation and progress</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedMember(null)}
            className="px-3 py-2 bg-sw-darker border border-sw-gray/30 text-sw-gray hover:border-sw-gold hover:text-sw-gold rounded-lg transition-all text-sm flex items-center gap-2"
          >
            <span>&#9664;</span> Back
          </button>
          <div className="hologram-card px-4 py-2">
            <span className="text-sw-gray text-sm">Reporting as: </span>
            <span className="text-sw-gold font-orbitron">{selectedMember.name}</span>
          </div>
        </div>
      </div>

      {/* Week Selector */}
      <div className="hologram-card p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigateWeek(-1)}
            className="px-4 py-2 text-sw-gold hover:bg-sw-gold/20 rounded transition-colors"
          >
            &#9664; Previous
          </button>
          <div className="text-center">
            <p className="text-sw-gray text-xs uppercase tracking-wider">Week of</p>
            <p className="text-sw-light text-lg font-orbitron">{formatWeekDisplay(selectedWeek)}</p>
            {checkinStatus === 'submitted' && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                Submitted
              </span>
            )}
          </div>
          <button
            onClick={() => navigateWeek(1)}
            className="px-4 py-2 text-sw-gold hover:bg-sw-gold/20 rounded transition-colors"
          >
            Next &#9654;
          </button>
        </div>

        {/* Copy from previous week button */}
        {checkinStatus !== 'submitted' && workedItems.length === 0 && (
          <div className="mt-4 pt-4 border-t border-sw-gray/20 text-center">
            <button
              onClick={copyFromPreviousWeek}
              className="px-4 py-2 bg-sw-purple/20 text-sw-purple border border-sw-purple/30 rounded-lg hover:bg-sw-purple/30 transition-colors text-sm flex items-center gap-2 mx-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy from Previous Week
            </button>
            <p className="text-sw-gray text-xs mt-2">Start with last week's items (time will be reset to 0%)</p>
          </div>
        )}
      </div>

      {/* Submitted Summary View */}
      {checkinStatus === 'submitted' ? (
        <div className="hologram-card p-6 border-green-500/30">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <h2 className="text-green-400 font-orbitron text-lg">Check-in Submitted</h2>
              {selectedMood && (
                <span className="text-2xl" title={MOOD_OPTIONS.find(m => m.emoji === selectedMood)?.label}>
                  {selectedMood}
                </span>
              )}
            </div>
            <button
              onClick={() => setCheckinStatus('draft')}
              className="btn-secondary text-sm"
            >
              Edit Check-in
            </button>
          </div>

          {/* Summary Table - Grouped by Type and Category */}
          <div className="space-y-6">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 text-sw-gray text-xs uppercase tracking-wider pb-2 border-b border-sw-gray/20">
              <div className="col-span-6">Item</div>
              <div className="col-span-3 text-right">Time Spent</div>
              <div className="col-span-3 text-right">Progress</div>
            </div>

            {/* Initiatives Section */}
            {workedItems.filter(i => i.type === 'initiative').length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sw-blue text-xs uppercase tracking-wider font-medium">Initiatives</h3>
                {workedItems.filter(i => i.type === 'initiative').map((item, index) => (
                  <div key={`summary-init-${item.id}-${index}`} className="grid grid-cols-12 gap-4 items-center py-2 border-b border-sw-gray/10">
                    <div className="col-span-6 flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-xs rounded bg-sw-blue/20 text-sw-blue">Init</span>
                      <span className="text-sw-light text-sm">{item.name}</span>
                      {item.isOwner && <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">Lead</span>}
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="text-sw-gold font-orbitron">{item.time}%</span>
                      <span className="text-sw-gray text-xs ml-1">({percentageToHours(item.time)}h)</span>
                    </div>
                    <div className="col-span-3 text-right">
                      {item.isOwner ? (
                        item.targetValue ? (
                          <span className="text-green-400 font-orbitron">
                            {(item.currentValue || 0) + (item.currentValueIncrement || 0)}/{item.targetValue}
                          </span>
                        ) : (
                          <span className="text-green-400 font-orbitron">{item.progress}%</span>
                        )
                      ) : <span className="text-sw-gray text-xs">-</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Key Results Section */}
            {workedItems.filter(i => i.type === 'kr').length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sw-purple text-xs uppercase tracking-wider font-medium">Key Results</h3>
                {workedItems.filter(i => i.type === 'kr').map((item, index) => (
                  <div key={`summary-kr-${item.id}-${index}`} className="grid grid-cols-12 gap-4 items-center py-2 border-b border-sw-gray/10">
                    <div className="col-span-6 flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-xs rounded bg-sw-purple/20 text-sw-purple">KR</span>
                      <span className="text-sw-light text-sm">{item.name}</span>
                      {item.isOwner && <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">Lead</span>}
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="text-sw-gold font-orbitron">{item.time}%</span>
                      <span className="text-sw-gray text-xs ml-1">({percentageToHours(item.time)}h)</span>
                    </div>
                    <div className="col-span-3 text-right">
                      {item.isOwner ? <span className="text-green-400 font-orbitron">{item.progress}%</span> : <span className="text-sw-gray text-xs">-</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Events Section */}
            {workedItems.filter(i => i.type === 'event' || (i.type === 'initiative' && i.goalTitle === 'Events')).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sw-purple text-xs uppercase tracking-wider font-medium">Events</h3>
                {workedItems.filter(i => i.type === 'event' || (i.type === 'initiative' && i.goalTitle === 'Events')).map((item, index) => (
                  <div key={`summary-event-${item.id}-${index}`} className="grid grid-cols-12 gap-4 items-center py-2 border-b border-sw-gray/10">
                    <div className="col-span-6 flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-xs rounded bg-sw-purple/20 text-sw-purple">Event</span>
                      <span className="text-sw-light text-sm">{item.name || '(No description)'}</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="text-sw-gold font-orbitron">{item.time}%</span>
                      <span className="text-sw-gray text-xs ml-1">({percentageToHours(item.time)}h)</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="text-green-400 font-orbitron">{item.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* BAU Section - Grouped by Category */}
            {workedItems.filter(i => i.type === 'bau').length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sw-gold text-xs uppercase tracking-wider font-medium">Business as Usual</h3>
                {/* Group BAU items by category */}
                {BAU_CATEGORIES.filter(cat => workedItems.some(i => i.type === 'bau' && i.category === cat)).map(category => (
                  <div key={`bau-cat-${category}`} className="space-y-2 pl-4 border-l-2 border-sw-gold/30">
                    <h4 className="text-sw-gold/80 text-xs font-medium">{category}</h4>
                    {workedItems.filter(i => i.type === 'bau' && i.category === category).map((item, index) => (
                      <div key={`summary-bau-${item.id}-${index}`} className="grid grid-cols-12 gap-4 items-center py-2 border-b border-sw-gray/10">
                        <div className="col-span-6 flex items-center gap-2 flex-wrap">
                          <span className="text-sw-light text-sm">{item.name || '(No description)'}</span>
                        </div>
                        <div className="col-span-3 text-right">
                          <span className="text-sw-gold font-orbitron">{item.time}%</span>
                          <span className="text-sw-gray text-xs ml-1">({percentageToHours(item.time)}h)</span>
                        </div>
                        <div className="col-span-3 text-right">
                          <span className="text-green-400 font-orbitron">{item.progress}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {/* Uncategorized BAU items */}
                {workedItems.filter(i => i.type === 'bau' && !i.category).length > 0 && (
                  <div className="space-y-2 pl-4 border-l-2 border-sw-gray/30">
                    <h4 className="text-sw-gray text-xs font-medium">Uncategorized</h4>
                    {workedItems.filter(i => i.type === 'bau' && !i.category).map((item, index) => (
                      <div key={`summary-bau-uncat-${item.id}-${index}`} className="grid grid-cols-12 gap-4 items-center py-2 border-b border-sw-gray/10">
                        <div className="col-span-6 flex items-center gap-2 flex-wrap">
                          <span className="text-sw-light text-sm">{item.name || '(No description)'}</span>
                        </div>
                        <div className="col-span-3 text-right">
                          <span className="text-sw-gold font-orbitron">{item.time}%</span>
                          <span className="text-sw-gray text-xs ml-1">({percentageToHours(item.time)}h)</span>
                        </div>
                        <div className="col-span-3 text-right">
                          <span className="text-green-400 font-orbitron">{item.progress}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Misc Section */}
            {workedItems.filter(i => i.type === 'misc').length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sw-gray text-xs uppercase tracking-wider font-medium">Miscellaneous</h3>
                {workedItems.filter(i => i.type === 'misc').map((item, index) => (
                  <div key={`summary-misc-${item.id}-${index}`} className="grid grid-cols-12 gap-4 items-center py-2 border-b border-sw-gray/10">
                    <div className="col-span-6 flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-xs rounded bg-sw-gray/20 text-sw-gray">Misc</span>
                      <span className="text-sw-light text-sm">{item.name}</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="text-sw-gold font-orbitron">{item.time}%</span>
                      <span className="text-sw-gray text-xs ml-1">({percentageToHours(item.time)}h)</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="text-green-400 font-orbitron">{item.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            <div className="grid grid-cols-12 gap-4 items-center pt-4 border-t border-sw-gray/30">
              <div className="col-span-6 text-sw-light font-medium">Total</div>
              <div className="col-span-3 text-right">
                <span className="text-sw-gold font-orbitron text-lg">{totalTime}%</span>
                <span className="text-sw-gray text-xs ml-1">({percentageToHours(totalTime)}h)</span>
              </div>
              <div className="col-span-3"></div>
            </div>
          </div>

          {globalNotes && (
            <div className="mt-6 pt-4 border-t border-sw-gray/20">
              <p className="text-sw-gray text-xs uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sw-light text-sm">{globalNotes}</p>
            </div>
          )}
        </div>
      ) : (
      /* Main Layout: Available Items | Worked This Week */
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: Available Items */}
        <div className="space-y-4">
          <h2 className="font-orbitron text-sw-blue text-lg">Your Assignments</h2>
          <p className="text-sw-gray text-sm">Drag items you worked on this week to the right panel</p>

          {loading ? (
            <div className="hologram-card p-8 text-center">
              <p className="text-sw-gray animate-pulse">Loading assignments...</p>
            </div>
          ) : (
            <>
              {/* Initiatives */}
              {availableInitiatives.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sw-gray text-xs uppercase tracking-wider">Initiatives</h3>
                  {availableInitiatives.map(init => (
                    <div
                      key={init.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'initiative', init)}
                      className="p-3 bg-sw-darker/50 rounded-lg border border-sw-gray/30 cursor-grab hover:border-sw-blue transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-sw-blue/20 text-sw-blue text-xs rounded">Init</span>
                        <span className="text-sw-light text-sm flex-1">{init.name}</span>
                        {init.project_priority && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            init.project_priority === 'P1' ? 'bg-red-500/20 text-red-400' :
                            init.project_priority === 'P2' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>{init.project_priority}</span>
                        )}
                      </div>
                      {init.goal_title && (
                        <p className="text-sw-gray text-xs mt-1 ml-12">{init.goal_title}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Key Results */}
              {availableKRs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sw-gray text-xs uppercase tracking-wider">Key Results</h3>
                  {availableKRs.map(kr => (
                    <div
                      key={kr.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'kr', kr)}
                      className="p-3 bg-sw-darker/50 rounded-lg border border-sw-gray/30 cursor-grab hover:border-sw-purple transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-sw-purple/20 text-sw-purple text-xs rounded">KR</span>
                        <span className="text-sw-light text-sm flex-1">{kr.title}</span>
                      </div>
                      {kr.goal_title && (
                        <p className="text-sw-gray text-xs mt-1 ml-12">{kr.goal_title}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {availableInitiatives.length === 0 && availableKRs.length === 0 && assignedEvents.length === 0 && workedItems.length === 0 && (
                <div className="hologram-card p-8 text-center">
                  <p className="text-sw-gray">No assignments found for this member.</p>
                  <p className="text-sw-gray text-sm mt-2">Assignments come from initiative_assignments and key_result_assignees tables.</p>
                </div>
              )}

              {/* Planned Events */}
              <div className="space-y-2 mt-4 pt-4 border-t border-sw-gray/20">
                <h3 className="text-sw-gray text-xs uppercase tracking-wider">Events</h3>

                {/* Assigned events - specific to this member */}
                {assignedEvents.map(event => (
                  <div
                    key={event.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'initiative', { ...event, goal_title: 'Events' })}
                    className="p-3 bg-sw-darker/50 rounded-lg border border-sw-purple/30 cursor-grab hover:border-sw-purple transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-sw-purple/20 text-sw-purple text-xs rounded">Event</span>
                      <span className="text-sw-light text-sm flex-1">{event.name}</span>
                    </div>
                    {(event.start_date || event.end_date) && (
                      <p className="text-sw-gray text-xs mt-1 ml-12">
                        {event.start_date && new Date(event.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {event.start_date && event.end_date && ' - '}
                        {event.end_date && new Date(event.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                ))}

                {/* Generic Event drag card - available for all members */}
                <div
                  draggable
                  onDragStart={(e) => {
                    const newId = `event-${Date.now()}-${eventTaskCounter}`
                    setEventTaskCounter(prev => prev + 1)
                    handleDragStart(e, 'event', {
                      id: newId,
                      name: '',
                      title: 'Event',
                      goal_title: 'Events',
                      owner_id: selectedMember?.id
                    })
                  }}
                  className="p-3 bg-sw-darker/50 rounded-lg border border-sw-purple/30 cursor-grab hover:border-sw-purple transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-sw-purple/20 text-sw-purple text-xs rounded">Event</span>
                    <span className="text-sw-light text-sm">Other Event / Conference</span>
                  </div>
                  <p className="text-sw-gray text-xs mt-1 ml-12">Drag to add an event not listed above</p>
                </div>

                {workedItems.filter(w => w.goalTitle === 'Events' || w.type === 'event').length > 0 && (
                  <div className="p-2 bg-sw-purple/10 rounded border border-sw-purple/20">
                    <span className="text-sw-purple text-xs">
                      {workedItems.filter(w => w.goalTitle === 'Events' || w.type === 'event').length} event(s) added to your check-in
                    </span>
                  </div>
                )}
              </div>

              {/* BAU / Miscellaneous - Drag Multiple Times */}
              <div className="space-y-2 mt-4 pt-4 border-t border-sw-gray/20">
                <h3 className="text-sw-gray text-xs uppercase tracking-wider">BAU / Other Work</h3>

                {/* Draggable BAU card - always available */}
                <div
                  draggable
                  onDragStart={(e) => {
                    const newId = `bau-${Date.now()}-${bauTaskCounter}`
                    setBauTaskCounter(prev => prev + 1)
                    handleDragStart(e, 'bau', {
                      id: newId,
                      name: '',
                      title: 'Business as Usual',
                      goal_title: 'Business as Usual / Others',
                      owner_id: selectedMember?.id,
                      category: ''
                    })
                  }}
                  className="p-3 bg-sw-darker/50 rounded-lg border border-sw-gold/30 cursor-grab hover:border-sw-gold transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-sw-gold/20 text-sw-gold text-xs rounded">BAU</span>
                    <span className="text-sw-light text-sm">Business as Usual / Others</span>
                  </div>
                  <p className="text-sw-gray text-xs mt-1 ml-12">Drag multiple times for different BAU tasks</p>
                </div>

                {/* Show count of BAU tasks added */}
                {bauTaskCount > 0 && (
                  <div className="p-2 bg-sw-gold/10 rounded border border-sw-gold/20">
                    <span className="text-sw-gold text-xs">
                      {bauTaskCount} BAU task(s) added to your check-in
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: Worked This Week */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-orbitron text-sw-gold text-lg">Worked This Week</h2>
            <div className="flex items-center gap-2">
              <span className={`font-orbitron text-lg ${
                (totalTime >= 100 && totalTime <= 120) ? 'text-green-400' :
                totalTime > 120 ? 'text-red-400' : 'text-sw-gold'
              }`}>
                {totalTime}%
              </span>
              <span className="text-sw-gray">/ 100-120%</span>
            </div>
          </div>

          {/* Allocation Bar */}
          <div className="w-full h-6 bg-sw-darker rounded-lg overflow-hidden flex">
            {workedItems.map((item, index) => {
              const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500']
              return item.time > 0 ? (
                <div
                  key={`bar-${item.type}-${item.id}-${index}`}
                  className={`${colors[index % colors.length]} h-full flex items-center justify-center text-xs text-white font-medium transition-all`}
                  style={{ width: `${Math.min(item.time, 100)}%` }}
                  title={`${item.name}: ${item.time}%`}
                >
                  {item.time >= 8 && `${item.time}%`}
                </div>
              ) : null
            })}
            {remainingTime > 0 && (
              <div
                className="bg-sw-gray/30 h-full flex items-center justify-center text-xs text-sw-gray"
                style={{ width: `${remainingTime}%` }}
              >
                {remainingTime >= 15 && `${remainingTime}%`}
              </div>
            )}
          </div>

          {totalTime > 120 && (
            <p className="text-red-400 text-sm">Over by {totalTime - 120}%! Max is 120%.</p>
          )}

          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDropToWorked}
            className="min-h-[300px] border-2 border-dashed border-sw-gray/30 rounded-lg p-4 transition-colors"
          >
            {workedItems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sw-gray">
                <p>Drop items here that you worked on this week</p>
              </div>
            ) : (
              <div className="space-y-4">
                {workedItems.map((item, index) => {
                  const colors = ['border-l-blue-500', 'border-l-green-500', 'border-l-yellow-500', 'border-l-purple-500', 'border-l-pink-500']
                  return (
                    <div
                      key={`card-${item.type}-${item.id}-${index}`}
                      className={`p-4 bg-sw-darker/50 rounded-lg border-l-4 ${colors[index % colors.length]}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              item.type === 'initiative' ? 'bg-sw-blue/20 text-sw-blue' :
                              item.type === 'kr' ? 'bg-sw-purple/20 text-sw-purple' :
                              item.type === 'bau' ? 'bg-sw-gold/20 text-sw-gold' :
                              item.type === 'event' ? 'bg-sw-purple/20 text-sw-purple' :
                              'bg-sw-gray/20 text-sw-gray'
                            }`}>
                              {item.type === 'initiative' ? 'Init' : item.type === 'kr' ? 'KR' : item.type === 'bau' ? 'BAU' : item.type === 'event' ? 'Event' : 'Misc'}
                            </span>
                            {(item.type === 'misc' || item.type === 'bau' || item.type === 'event') ? (
                              <div className="flex-1 flex items-center gap-2">
                                {item.type === 'bau' && (
                                  <select
                                    value={item.category || ''}
                                    onChange={(e) => updateWorkedItem(item.type, item.id, 'category', e.target.value)}
                                    className="px-2 py-1 bg-sw-darker border border-sw-gray/30 rounded text-sw-light text-sm focus:border-sw-gold focus:outline-none"
                                    disabled={checkinStatus === 'submitted'}
                                  >
                                    <option value="">Select Category</option>
                                    {BAU_CATEGORIES.map(cat => (
                                      <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                  </select>
                                )}
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => updateWorkedItem(item.type, item.id, 'name', e.target.value)}
                                  placeholder={item.type === 'bau' ? "Task description..." : "Enter task name..."}
                                  className="flex-1 px-2 py-1 bg-sw-darker border border-sw-gray/30 rounded text-sw-light font-medium placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none"
                                  disabled={checkinStatus === 'submitted'}
                                />
                              </div>
                            ) : (
                              <>
                                <span className="text-sw-light font-medium">{item.name}</span>
                                {item.isOwner && (
                                  <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">Lead</span>
                                )}
                                {/* Show total hours and progress for BAU initiatives */}
                                {item.isBauInitiative && (
                                  <>
                                    <span className="px-1.5 py-0.5 bg-sw-gold/20 text-sw-gold text-xs rounded font-orbitron">
                                      {item.progress || 0}%
                                    </span>
                                    <span className="px-1.5 py-0.5 bg-sw-blue/20 text-sw-blue text-xs rounded font-orbitron">
                                      {percentageToHours(item.time)}h
                                    </span>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                          {item.goalTitle && (
                            <p className="text-sw-gray text-xs mt-1">{item.goalTitle}</p>
                          )}
                        </div>
                        <button
                          onClick={() => removeWorkedItem(item.type, item.id)}
                          className="text-sw-gray hover:text-red-400 transition-colors"
                          disabled={checkinStatus === 'submitted'}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className={`grid ${item.isOwner ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                        {/* Time */}
                        <div>
                          <label className="block text-sw-gray text-xs mb-1">Time Spent</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={item.time}
                              onChange={(e) => updateWorkedItem(item.type, item.id, 'time', parseInt(e.target.value))}
                              className="flex-1 h-2 bg-sw-darker rounded-lg appearance-none cursor-pointer accent-sw-gold"
                              disabled={checkinStatus === 'submitted'}
                            />
                            <span className="text-sw-gold font-orbitron w-12 text-right">{item.time}%</span>
                          </div>
                          <p className="text-sw-gray text-xs mt-0.5">= {percentageToHours(item.time)}h</p>
                        </div>

                        {/* Progress - Only shown if user is the owner */}
                        {item.isOwner && (
                          <div>
                            {item.targetValue ? (
                              <>
                                <label className="block text-sw-gray text-xs mb-1">Units Completed This Week</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="0"
                                    max={Math.max(0, item.targetValue - (item.currentValue || 0))}
                                    value={item.currentValueIncrement || 0}
                                    onChange={(e) => updateWorkedItem(item.type, item.id, 'currentValueIncrement', Math.max(0, parseInt(e.target.value) || 0))}
                                    className="w-20 px-2 py-1 bg-sw-darker border border-sw-gray/30 rounded text-sw-light font-orbitron text-center focus:border-green-500 focus:outline-none"
                                    disabled={checkinStatus === 'submitted'}
                                  />
                                  <span className="text-green-400 font-orbitron text-sm">
                                    {(item.currentValue || 0)} + {item.currentValueIncrement || 0} / {item.targetValue}
                                  </span>
                                </div>
                                <div className="mt-1">
                                  <div className="w-full h-1.5 bg-sw-darker rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-green-500 transition-all"
                                      style={{ width: `${Math.min(100, (((item.currentValue || 0) + (item.currentValueIncrement || 0)) / item.targetValue) * 100)}%` }}
                                    />
                                  </div>
                                  <p className="text-sw-gray text-xs mt-0.5">
                                    {Math.min(100, Math.round((((item.currentValue || 0) + (item.currentValueIncrement || 0)) / item.targetValue) * 100))}% of target
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                <label className="block text-sw-gray text-xs mb-1">Progress Made</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="5"
                                    value={item.progress}
                                    onChange={(e) => updateWorkedItem(item.type, item.id, 'progress', parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-sw-darker rounded-lg appearance-none cursor-pointer accent-green-500"
                                    disabled={checkinStatus === 'submitted'}
                                  />
                                  <span className="text-green-400 font-orbitron w-12 text-right">{item.progress}%</span>
                                </div>
                                <p className="text-sw-gray text-xs mt-0.5">of total deliverable</p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Mood Selector */}
          <div>
            <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">How was your week?</label>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map(mood => (
                <button
                  key={mood.emoji}
                  onClick={() => setSelectedMood(selectedMood === mood.emoji ? null : mood.emoji)}
                  disabled={checkinStatus === 'submitted'}
                  className={`p-2 rounded-lg border transition-all flex items-center gap-2 ${
                    selectedMood === mood.emoji
                      ? 'border-sw-gold bg-sw-gold/20'
                      : 'border-sw-gray/30 hover:border-sw-gold/50'
                  } ${checkinStatus === 'submitted' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={mood.description}
                >
                  <span className="text-xl">{mood.emoji}</span>
                  <span className="text-sw-light text-xs hidden sm:inline">{mood.label}</span>
                </button>
              ))}
            </div>
            {selectedMood && (
              <p className="text-sw-gray text-xs mt-2 italic">
                {MOOD_OPTIONS.find(m => m.emoji === selectedMood)?.description}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">Notes (Optional)</label>
            <textarea
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
              placeholder="Any additional notes about your week..."
              className="w-full px-3 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light placeholder-sw-gray/50 focus:border-sw-gold focus:outline-none resize-none"
              rows={2}
              disabled={checkinStatus === 'submitted'}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <button
              onClick={() => saveCheckin(false)}
              disabled={saving || checkinStatus === 'submitted'}
              className="btn-secondary disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => saveCheckin(true)}
              disabled={saving || checkinStatus === 'submitted' || totalTime < 100 || totalTime > 120}
              className="btn-primary disabled:opacity-50"
            >
              Submit ({totalTime}%)
            </button>
          </div>

        </div>
      </div>
      )}
    </div>
  )
}
