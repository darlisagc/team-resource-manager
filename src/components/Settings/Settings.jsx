import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

const IMPORT_TYPES = [
  {
    id: 'leapsome-goals-xlsx',
    label: 'Goals (Leapsome Excel)',
    endpoint: '/api/imports/leapsome/goals-xlsx',
    description: 'Import OKRs and goals from Leapsome Excel export (.xlsx)',
    expectedColumns: 'Uses Leapsome native export format',
    accept: '.xlsx'
  },
  {
    id: 'miro-tasks-extract',
    label: 'Tasks (Miro)',
    endpoint: '/api/imports/miro/tasks',
    description: 'Upload Miro CSV export - edit in table before import',
    expectedColumns: 'title, status, priority, assignees',
    accept: '.csv,.pdf,.jpg,.jpeg,.png',
    isImageImport: true
  },
  {
    id: 'personio-members',
    label: 'Team Members (CSV)',
    endpoint: '/api/imports/personio/members',
    description: 'Import employee data from CSV',
    expectedColumns: 'name, email, role, team, weekly_hours',
    accept: '.csv'
  }
]

const BAU_CATEGORIES = [
  'Marketing', 'Business operation', 'BD - Enterprise Adoption', 'BD - Web3 Adoption',
  'BD - Account management', 'Legal', 'Venture Hub', 'Academy', 'Ecosystem Support', 'Finances'
]

export default function Settings() {
  const { getAuthHeader, user } = useAuth()
  const [selectedImport, setSelectedImport] = useState(null)
  const [file, setFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  // Image import state
  const [imagePreview, setImagePreview] = useState(null)
  const [csvData, setCsvData] = useState('')
  const [showCsvEditor, setShowCsvEditor] = useState(false)
  const [tableData, setTableData] = useState([])
  const [showTableModal, setShowTableModal] = useState(false)
  const [teamMembers, setTeamMembers] = useState([])
  const [activeAssigneeRow, setActiveAssigneeRow] = useState(null)
  const [duplicateCheck, setDuplicateCheck] = useState(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [duplicateTitles, setDuplicateTitles] = useState(new Set()) // Track duplicates during editing
  const [importGoals, setImportGoals] = useState([]) // Goals for associating imported tasks

  // Fetch team members and goals
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch('/api/members', { headers: getAuthHeader() })
        if (res.ok) {
          const data = await res.json()
          setTeamMembers(data)
        }
      } catch (e) {
        console.error('Failed to fetch team members:', e)
      }
    }
    const fetchGoals = async () => {
      try {
        const res = await fetch('/api/goals', { headers: getAuthHeader() })
        if (res.ok) {
          const data = await res.json()
          // Exclude BAU and Events goals, group by quarter
          setImportGoals(data.filter(g =>
            !g.title.includes('Business as Usual') && g.title !== 'Events'
          ))
        }
      } catch (e) {
        console.error('Failed to fetch goals:', e)
      }
    }
    fetchMembers()
    fetchGoals()
  }, [])

  // User management state
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [resetUserId, setResetUserId] = useState(null)
  const [tempPassword, setTempPassword] = useState('')
  const [resetResult, setResetResult] = useState(null)
  const [showUserManagement, setShowUserManagement] = useState(false)

  // Fetch users for admin management
  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true)
      try {
        const res = await fetch('/api/auth/users', { headers: getAuthHeader() })
        if (res.ok) {
          const data = await res.json()
          setUsers(data)
        }
      } catch (e) {
        console.error('Failed to fetch users:', e)
      } finally {
        setLoadingUsers(false)
      }
    }
    fetchUsers()
  }, [])

  const handleResetPassword = async () => {
    if (!resetUserId || !tempPassword) return
    setResetResult(null)

    try {
      const res = await fetch('/api/auth/admin/reset-password', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetUserId, temporaryPassword: tempPassword })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message)

      setResetResult({ success: true, message: data.message })
      setResetUserId(null)
      setTempPassword('')

      // Refresh users list
      const usersRes = await fetch('/api/auth/users', { headers: getAuthHeader() })
      if (usersRes.ok) setUsers(await usersRes.json())
    } catch (error) {
      setResetResult({ success: false, message: error.message })
    }
  }

  // Calendar sync state - supports multiple feeds (loaded from DB)
  const [calendarFeeds, setCalendarFeeds] = useState([])
  const [loadingFeeds, setLoadingFeeds] = useState(true)

  // Load calendar feeds from DB on mount
  useEffect(() => {
    const fetchFeeds = async () => {
      try {
        const res = await fetch('/api/calendar/feeds', { headers: getAuthHeader() })
        if (res.ok) {
          const data = await res.json()
          setCalendarFeeds(data)
        }
      } catch (e) {
        console.error('Failed to fetch calendar feeds:', e)
      } finally {
        setLoadingFeeds(false)
      }
    }
    fetchFeeds()
  }, [])

  const handleAddFeed = async () => {
    try {
      const res = await fetch('/api/calendar/feeds', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', url: '' })
      })
      if (res.ok) {
        const newFeed = await res.json()
        setCalendarFeeds(prev => [...prev, newFeed])
      }
    } catch (e) {
      console.error('Failed to add feed:', e)
    }
  }

  const handleSaveFeed = (feed) => {
    fetch(`/api/calendar/feeds/${feed.id}`, {
      method: 'PUT',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: feed.name, url: feed.url })
    }).catch(e => console.error('Failed to save feed:', e))
  }

  const handleRemoveFeed = async (feedId) => {
    try {
      await fetch(`/api/calendar/feeds/${feedId}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      })
      setCalendarFeeds(prev => prev.filter(f => f.id !== feedId))
    } catch (e) {
      console.error('Failed to delete feed:', e)
    }
  }
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [unmatchedNames, setUnmatchedNames] = useState([])
  const [nameMappings, setNameMappings] = useState({})
  const [showMappingModal, setShowMappingModal] = useState(false)

  const handleImport = async () => {
    if (!file || !selectedImport) return

    setImporting(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(selectedImport.endpoint, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.message || 'Import failed')
      }

      setImportResult(result)
    } catch (error) {
      setImportResult({ success: false, message: error.message })
    } finally {
      setImporting(false)
    }
  }

  const resetImport = () => {
    setFile(null)
    setImportResult(null)
    setImagePreview(null)
    setCsvData('')
    setShowCsvEditor(false)
    setTableData([])
    setShowTableModal(false)
    setDuplicateTitles(new Set())
    setSimilarMatches(new Map())
    setLeapsomeMatches(new Map())
    setDuplicateCheck(null)
    setShowDuplicateModal(false)
  }

  const [extracting, setExtracting] = useState(false)

  // Parse CSV string to table data array
  const parseCsvToTable = (csv) => {
    const lines = csv.split('\n').filter(line => !line.startsWith('#') && line.trim())
    if (lines.length < 2) return []

    return lines.slice(1).map(line => {
      const cols = line.split(',')
      return {
        title: cols[0] || '',
        status: cols[1] || 'todo',
        priority: cols[2] || 'medium',
        assignees: cols[3] || '',
        effort: cols[4] || ''
      }
    })
  }

  // Escape a CSV field (wrap in quotes if contains comma, quote, or newline)
  const escapeCSVField = (field) => {
    if (!field) return ''
    const str = String(field)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  // Convert table data back to CSV
  const tableToCSv = (data) => {
    const header = 'title,status,priority,assignees,effort,goal_id,bau_category'
    const rows = data.map(row =>
      [row.title, row.status, row.priority, row.assignees, row.effort || '', row.goal_id || '', row.bau_category || '']
        .map(escapeCSVField)
        .join(',')
    )
    return header + '\n' + rows.join('\n')
  }

  const handleImageSelect = async (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setFile(selectedFile)
      setImportResult(null)

      const fileName = selectedFile.name.toLowerCase()
      const isCsv = fileName.endsWith('.csv')
      const isPdf = fileName.endsWith('.pdf')
      const isImage = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png')

      // Create preview URL (for images only)
      if (isImage) {
        const reader = new FileReader()
        reader.onload = (e) => {
          setImagePreview(e.target.result)
        }
        reader.readAsDataURL(selectedFile)
      } else {
        setImagePreview(null)
      }

      // Extract text from file
      setExtracting(true)
      setShowTableModal(true)
      setTableData([])

      try {
        const formData = new FormData()
        formData.append('file', selectedFile)

        // Choose endpoint based on file type
        let endpoint = '/api/imports/miro/extract-image'
        if (isCsv) {
          endpoint = '/api/imports/miro/extract-csv'
        } else if (isPdf) {
          endpoint = '/api/imports/miro/extract-pdf'
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: getAuthHeader(),
          body: formData
        })

        const result = await res.json()

        if (result.success) {
          setCsvData(result.csv)
          const parsedData = parseCsvToTable(result.csv)
          setTableData(parsedData)
          // Check for duplicates
          checkDuplicatesInTable(parsedData)
        } else {
          const defaultCsv = `title,status,priority,assignees,effort\nTask 1,todo,medium,,8`
          setCsvData(defaultCsv)
          setTableData(parseCsvToTable(defaultCsv))
          setDuplicateTitles(new Set())
        }
      } catch (error) {
        const defaultCsv = `title,status,priority,assignees,effort\nTask 1,todo,medium,,8`
        setCsvData(defaultCsv)
        setTableData(parseCsvToTable(defaultCsv))
        setDuplicateTitles(new Set())
      } finally {
        setExtracting(false)
      }
    }
  }

  const updateTableRow = (index, field, value) => {
    const newData = [...tableData]
    newData[index][field] = value
    setTableData(newData)
    setCsvData(tableToCSv(newData))

    // Recheck duplicates when title changes
    if (field === 'title') {
      // Debounce the check
      clearTimeout(window.duplicateCheckTimeout)
      window.duplicateCheckTimeout = setTimeout(() => {
        checkDuplicatesInTable(newData)
      }, 500)
    }
  }

  const addTableRow = () => {
    setTableData([...tableData, { title: '', status: 'active', priority: '', assignees: '', effort: '', goal_id: '', bau_category: '' }])
  }

  const removeTableRow = (index) => {
    const newData = tableData.filter((_, i) => i !== index)
    setTableData(newData)
    setCsvData(tableToCSv(newData))
  }

  const addAssigneeToRow = (index, memberName) => {
    const currentAssignees = tableData[index].assignees
    const existingNames = currentAssignees ? currentAssignees.split(';').map(n => n.trim()) : []
    if (!existingNames.includes(memberName)) {
      existingNames.push(memberName)
      updateTableRow(index, 'assignees', existingNames.join(';'))
    }
    setActiveAssigneeRow(null)
  }

  const removeAssigneeFromRow = (index, memberName) => {
    const currentAssignees = tableData[index].assignees
    const existingNames = currentAssignees ? currentAssignees.split(';').map(n => n.trim()).filter(n => n !== memberName) : []
    updateTableRow(index, 'assignees', existingNames.join(';'))
  }

  // Get first name for display
  const getFirstName = (fullName) => fullName.split(' ')[0]

  // Check which tasks are duplicates or similar
  const checkDuplicatesInTable = async (tasks) => {
    if (!tasks || tasks.length === 0) {
      setDuplicateTitles(new Set())
      setSimilarMatches(new Map())
      setLeapsomeMatches(new Map())
      return
    }

    try {
      const csv = tableToCSv(tasks)
      const csvBlob = new Blob([csv], { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', csvBlob, 'check.csv')

      const res = await fetch('/api/imports/miro/check-duplicates', {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      })

      if (res.ok) {
        const result = await res.json()
        // Exact duplicates
        const dupSet = new Set(result.duplicates.map(d => d.title.toLowerCase().trim()))
        setDuplicateTitles(dupSet)

        // Similar matches (store with details)
        const simMap = new Map()
        result.similar?.forEach(s => {
          simMap.set(s.title.toLowerCase().trim(), {
            existingTitle: s.existingTitle,
            similarity: s.similarity,
            goalTitle: s.goalTitle,
            existingSource: s.existingSource,
            existingType: s.existingType
          })
        })
        setSimilarMatches(simMap)

        // Leapsome matches (store separately for highlighting)
        const leapMap = new Map()
        result.leapsomeMatches?.forEach(m => {
          leapMap.set(m.title.toLowerCase().trim(), {
            existingTitle: m.existingTitle,
            similarity: m.similarity,
            goalTitle: m.goalTitle,
            existingType: m.existingType,
            quarter: m.quarter
          })
        })
        setLeapsomeMatches(leapMap)

        // Update duplicate check state for modal
        setDuplicateCheck(result)
      }
    } catch (e) {
      console.error('Failed to check duplicates:', e)
    }
  }

  // Get similar match info for a title
  const getSimilarMatch = (title) => {
    if (!title) return null
    return similarMatches.get(title.toLowerCase().trim())
  }

  // Check if a title is a duplicate or similar
  const isDuplicate = (title) => {
    if (!title) return false
    return duplicateTitles.has(title.toLowerCase().trim())
  }

  // Store similar matches info
  const [similarMatches, setSimilarMatches] = useState(new Map())
  // Store Leapsome matches info
  const [leapsomeMatches, setLeapsomeMatches] = useState(new Map())

  const handleTableImport = async () => {
    const csv = tableToCSv(tableData.filter(row => row.title.trim()))
    setCsvData(csv)

    // First check for duplicates
    setImporting(true)
    setImportResult(null)

    try {
      const csvBlob = new Blob([csv], { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', csvBlob, 'miro-tasks.csv')

      const checkRes = await fetch('/api/imports/miro/check-duplicates', {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      })

      const checkResult = await checkRes.json()

      if (checkResult.duplicateCount > 0) {
        // Show duplicate modal
        setDuplicateCheck(checkResult)
        setShowDuplicateModal(true)
        setImporting(false)
        return
      }

      // No duplicates, proceed with import
      await executeImport(csv, 'keep')
    } catch (error) {
      setImportResult({ success: false, message: error.message })
      setImporting(false)
    }
  }

  const executeImport = async (csv, duplicateAction) => {
    setShowTableModal(false)
    setShowDuplicateModal(false)
    setImporting(true)
    setImportResult(null)

    try {
      const csvBlob = new Blob([csv], { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', csvBlob, 'miro-tasks.csv')

      const res = await fetch(`/api/imports/miro/tasks?duplicateAction=${duplicateAction}`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.message || 'Import failed')
      }

      setImportResult(result)
      setDuplicateCheck(null)
    } catch (error) {
      setImportResult({ success: false, message: error.message })
    } finally {
      setImporting(false)
    }
  }

  const handleCsvImport = async () => {
    if (!csvData.trim()) return

    setImporting(true)
    setImportResult(null)

    try {
      // Convert CSV string to blob
      const csvBlob = new Blob([csvData], { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', csvBlob, 'miro-tasks.csv')

      const res = await fetch('/api/imports/miro/tasks', {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.message || 'Import failed')
      }

      setImportResult(result)
      setShowCsvEditor(false)
    } catch (error) {
      setImportResult({ success: false, message: error.message })
    } finally {
      setImporting(false)
    }
  }

  const handlePreviewCalendar = async () => {
    const activeFeeds = calendarFeeds.filter(f => f.url.trim())
    if (activeFeeds.length === 0) return

    setPreviewing(true)
    setPreviewData(null)

    try {
      // Preview all feeds and merge results
      const allEvents = []
      const personSet = new Set()

      for (const feed of activeFeeds) {
        const res = await fetch('/api/calendar/preview', {
          method: 'POST',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: feed.url })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message)
        if (data.events) {
          data.events.forEach(e => {
            allEvents.push({ ...e, feedName: feed.name })
            if (e.person) personSet.add(e.person)
          })
        }
      }

      setPreviewData({
        totalEvents: allEvents.length,
        uniquePersons: personSet.size,
        events: allEvents
      })
    } catch (error) {
      setSyncResult({ success: false, message: error.message })
    } finally {
      setPreviewing(false)
    }
  }

  const handleSyncCalendar = async (providedMappings = null) => {
    setSyncing(true)
    setSyncResult(null)

    try {
      const activeUrls = calendarFeeds.filter(f => f.url.trim()).map(f => f.url)
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedUrls: activeUrls,
          nameMappings: providedMappings || nameMappings
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message)

      // Check if there are unmatched names that need mapping
      if (data.unmatchedNames && data.unmatchedNames.length > 0) {
        setUnmatchedNames(data.unmatchedNames)
        setShowMappingModal(true)
        // Reset mappings for new unmatched names
        const initialMappings = {}
        data.unmatchedNames.forEach(u => {
          if (u.suggestions.length > 0) {
            initialMappings[u.calendarName] = u.suggestions[0].id // Pre-select best match
          }
        })
        setNameMappings(initialMappings)
      } else {
        setShowMappingModal(false)
        setUnmatchedNames([])
      }

      setSyncResult(data)
      setPreviewData(null)
    } catch (error) {
      setSyncResult({ success: false, message: error.message })
    } finally {
      setSyncing(false)
    }
  }

  const handleRetryWithMappings = async () => {
    setShowMappingModal(false)
    await handleSyncCalendar(nameMappings)
  }

  const updateNameMapping = (calendarName, memberId) => {
    setNameMappings(prev => ({
      ...prev,
      [calendarName]: memberId
    }))
  }

  const handleClearCalendarData = async () => {
    if (!confirm('This will remove all time-off records imported from iCal. Continue?')) return

    try {
      const res = await fetch('/api/calendar/clear', {
        method: 'DELETE',
        headers: getAuthHeader()
      })
      const data = await res.json()
      setSyncResult({ success: true, message: data.message })
    } catch (error) {
      setSyncResult({ success: false, message: error.message })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-orbitron text-2xl text-sw-gold">Control Panel</h1>
        <p className="text-sw-gray text-sm">System settings and data imports</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Section */}
        <div className="lg:col-span-2 space-y-6">

          {/* Calendar Sync Section - NEW */}
          <div className="hologram-card p-6 border-sw-blue/30">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">📅</span>
              <h2 className="font-orbitron text-sw-blue text-lg">PERSONIO CALENDAR SYNC</h2>
            </div>
            <p className="text-sw-gray text-sm mb-4">
              Sync time-off data directly from Personio iCal calendar feed
            </p>

            <div className="space-y-4">
              {/* Calendar Feeds List */}
              <div className="space-y-3">
                <label className="block text-sw-gray text-xs uppercase">iCal Feed URLs</label>
                {calendarFeeds.map((feed) => (
                  <div key={feed.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={feed.name}
                      onChange={(e) => setCalendarFeeds(prev => prev.map(f =>
                        f.id === feed.id ? { ...f, name: e.target.value } : f
                      ))}
                      onBlur={() => handleSaveFeed(feed)}
                      className="w-40 px-2 py-2 bg-sw-darker border border-sw-gray/30 rounded text-sw-light text-sm focus:border-sw-gold focus:outline-none"
                      placeholder="Feed name"
                    />
                    <input
                      type="text"
                      value={feed.url}
                      onChange={(e) => setCalendarFeeds(prev => prev.map(f =>
                        f.id === feed.id ? { ...f, url: e.target.value } : f
                      ))}
                      onBlur={() => handleSaveFeed(feed)}
                      className="flex-1 input-field text-sm"
                      placeholder="https://...personio.de/calendar/ical-links/..."
                    />
                    {calendarFeeds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFeed(feed.id)}
                        className="text-sw-gray hover:text-red-400 transition-colors px-2"
                        title="Remove feed"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddFeed}
                  className="text-sw-blue text-sm hover:text-sw-gold transition-colors flex items-center gap-1"
                >
                  <span>+</span> Add another calendar
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handlePreviewCalendar}
                  disabled={!calendarFeeds.some(f => f.url.trim()) || previewing}
                  className="btn-secondary flex-1 disabled:opacity-50"
                >
                  {previewing ? 'LOADING...' : 'PREVIEW'}
                </button>
                <button
                  onClick={() => handleSyncCalendar()}
                  disabled={!calendarFeeds.some(f => f.url.trim()) || syncing}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {syncing ? 'SYNCING...' : 'SYNC NOW'}
                </button>
                <button
                  onClick={handleClearCalendarData}
                  className="btn-danger"
                  title="Clear all iCal imports"
                >
                  Clear
                </button>
              </div>

              {/* Preview Results */}
              {previewData && (
                <div className="p-4 bg-sw-darker/50 rounded-lg">
                  <h4 className="font-orbitron text-sw-blue text-xs mb-3">PREVIEW</h4>
                  <div className="flex gap-4 mb-3 text-sm">
                    <span className="text-sw-gray">Events: <span className="text-sw-gold">{previewData.totalEvents}</span></span>
                    <span className="text-sw-gray">People: <span className="text-sw-gold">{previewData.uniquePersons}</span></span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {previewData.events?.slice(0, 20).map((event, i) => {
                      const days = event.endDate && event.startDate
                        ? Math.ceil((new Date(event.endDate) - new Date(event.startDate)) / (1000 * 60 * 60 * 24))
                        : 1;
                      return (
                        <div key={i} className="flex items-center justify-between text-xs p-2 bg-sw-dark/50 rounded">
                          <div className="flex items-center gap-2">
                            <span className={`badge ${event.type.toLowerCase().includes('sick') ? 'badge-danger' : 'badge-info'}`}>
                              {event.type}
                            </span>
                            <span className="text-sw-light">{event.person}</span>
                            {!event.memberExists && (
                              <span className="text-sw-gold text-xs">(new)</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-sw-gray">{event.startDate}</span>
                            {days > 1 && (
                              <span className="text-sw-blue ml-2">({days} days)</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {previewData.events?.length > 20 && (
                      <p className="text-sw-gray text-xs text-center py-2">
                        ... and {previewData.events.length - 20} more events
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Sync Results */}
              {syncResult && (
                <div className={`p-4 rounded-lg ${
                  syncResult.success
                    ? syncResult.unmatchedNames?.length > 0
                      ? 'bg-sw-gold/10 border border-sw-gold/30'
                      : 'bg-sw-green/10 border border-sw-green/30'
                    : 'bg-sw-red/10 border border-sw-red/30'
                }`}>
                  <h4 className={`font-orbitron text-sm mb-2 ${
                    syncResult.success
                      ? syncResult.unmatchedNames?.length > 0 ? 'text-sw-gold' : 'text-sw-green'
                      : 'text-sw-red'
                  }`}>
                    {syncResult.success
                      ? syncResult.unmatchedNames?.length > 0 ? 'SYNC PARTIAL - NEEDS MAPPING' : 'SYNC COMPLETE'
                      : 'SYNC FAILED'}
                  </h4>
                  {syncResult.success && syncResult.totalImported !== undefined ? (
                    <div className="text-sm space-y-1">
                      <p className="text-sw-light">Imported: {syncResult.totalImported} records</p>
                      <p className="text-sw-gray">Skipped: {syncResult.totalSkipped} (duplicates/unmatched)</p>
                      {syncResult.unmatchedNames?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sw-gold">
                            ⚠ {syncResult.unmatchedNames.length} name{syncResult.unmatchedNames.length > 1 ? 's' : ''} couldn't be matched
                          </p>
                          <button
                            onClick={() => setShowMappingModal(true)}
                            className="mt-2 btn-secondary text-xs"
                          >
                            Map Names to Team Members
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm">{syncResult.message}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* CSV Import Section */}
          <div className="hologram-card p-6">
            <h2 className="font-orbitron text-sw-gold text-lg mb-4">CSV DATA IMPORTS</h2>
            <p className="text-sw-gray text-sm mb-6">
              Import goals and tasks from external systems via CSV files
            </p>

            {/* Import Type Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {IMPORT_TYPES.map(type => (
                <div
                  key={type.id}
                  onClick={() => {
                    setSelectedImport(type)
                    resetImport()
                  }}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedImport?.id === type.id
                      ? 'border-sw-gold bg-sw-gold/10'
                      : 'border-sw-gray/30 hover:border-sw-gold/50'
                  }`}
                >
                  <h3 className="font-orbitron text-sw-light text-sm mb-1">{type.label}</h3>
                  <p className="text-sw-gray text-xs">{type.description}</p>
                </div>
              ))}
            </div>

            {/* File Upload */}
            {selectedImport && (
              <div className="space-y-4">
                <div className="p-4 bg-sw-darker/50 rounded-lg">
                  <h4 className="font-orbitron text-sw-blue text-xs mb-2">EXPECTED COLUMNS</h4>
                  <p className="text-sw-gray text-sm font-mono">{selectedImport.expectedColumns}</p>
                </div>

                {/* Image Import - Opens Modal */}
                {selectedImport.isImageImport ? (
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-sw-gray/30 rounded-lg p-8 text-center">
                      <input
                        type="file"
                        accept={selectedImport.accept}
                        onChange={handleImageSelect}
                        className="hidden"
                        id="image-upload"
                      />
                      <label htmlFor="image-upload" className="cursor-pointer">
                        {file && !showTableModal ? (
                          <div>
                            <p className="text-sw-gold font-orbitron">{file.name}</p>
                            <p className="text-sw-gray text-sm mt-1">Click to upload a new file</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sw-light">Upload Miro CSV export</p>
                            <p className="text-sw-gray text-sm mt-1">CSV recommended - edit tasks in table before importing</p>
                          </div>
                        )}
                      </label>
                    </div>

                    {importResult && (
                      <div className={`p-4 rounded-lg ${
                        importResult.success
                          ? 'bg-sw-green/10 border border-sw-green/30'
                          : 'bg-sw-red/10 border border-sw-red/30'
                      }`}>
                        <h4 className={`font-orbitron text-sm mb-2 ${
                          importResult.success ? 'text-sw-green' : 'text-sw-red'
                        }`}>
                          {importResult.success ? 'IMPORT SUCCESSFUL' : 'IMPORT FAILED'}
                        </h4>
                        {importResult.success ? (
                          <div className="text-sm space-y-1">
                            <p className="text-sw-light">Imported: {importResult.imported} tasks</p>
                            {importResult.skipped > 0 && (
                              <p className="text-sw-blue">Skipped: {importResult.skipped} duplicates</p>
                            )}
                            {importResult.replaced > 0 && (
                              <p className="text-sw-gold">Replaced: {importResult.replaced} existing tasks</p>
                            )}
                            {importResult.unmatchedAssignees?.length > 0 && (
                              <p className="text-sw-gold">
                                Unmatched assignees: {importResult.unmatchedAssignees.join(', ')}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sw-red text-sm">{importResult.message}</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Regular File Upload */
                  <>
                    <div className="border-2 border-dashed border-sw-gray/30 rounded-lg p-8 text-center">
                      <input
                        type="file"
                        accept={selectedImport?.accept || '.csv,.xlsx'}
                        onChange={(e) => {
                          setFile(e.target.files[0])
                          setImportResult(null)
                        }}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="cursor-pointer">
                        {file ? (
                          <div>
                            <p className="text-sw-gold font-orbitron">{file.name}</p>
                            <p className="text-sw-gray text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sw-light">Drop file here or click to browse</p>
                            <p className="text-sw-gray text-sm mt-1">Maximum file size: 5MB</p>
                          </div>
                        )}
                      </label>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={handleImport}
                        disabled={!file || importing}
                        className="btn-primary flex-1 disabled:opacity-50"
                      >
                        {importing ? 'IMPORTING...' : 'START IMPORT'}
                      </button>
                      <button onClick={resetImport} className="btn-secondary">
                        Clear
                      </button>
                    </div>
                  </>
                )}

                {/* Import Results */}
                {importResult && (
                  <div className={`p-4 rounded-lg ${
                    importResult.success
                      ? 'bg-sw-green/10 border border-sw-green/30'
                      : 'bg-sw-red/10 border border-sw-red/30'
                  }`}>
                    <h4 className={`font-orbitron text-sm mb-2 ${
                      importResult.success ? 'text-sw-green' : 'text-sw-red'
                    }`}>
                      {importResult.success ? 'IMPORT SUCCESSFUL' : 'IMPORT FAILED'}
                    </h4>
                    {importResult.success ? (
                      <div className="text-sm">
                        <p className="text-sw-light">Imported: {importResult.imported} records</p>
                        {importResult.goals !== undefined && (
                          <p className="text-sw-blue">Goals: {importResult.goals} | Key Results: {importResult.keyResults}</p>
                        )}
                        {importResult.errors > 0 && (
                          <p className="text-sw-gold">Errors: {importResult.errors}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sw-red text-sm">{importResult.message}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* User Info */}
          <div className="hologram-card p-6">
            <h2 className="font-orbitron text-sw-gold text-sm mb-4">CURRENT OPERATOR</h2>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-sw-gold/20 border-2 border-sw-gold flex items-center justify-center">
                <span className="text-sw-gold font-orbitron text-lg">
                  {user?.username?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sw-light font-medium">{user?.username}</p>
                <p className="text-sw-gray text-sm">Commander</p>
              </div>
            </div>
          </div>

          {/* User Management - Expandable */}
          <div className="hologram-card overflow-hidden">
            <button
              onClick={() => setShowUserManagement(!showUserManagement)}
              className="w-full p-4 flex items-center justify-between hover:bg-sw-darker/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span>👥</span>
                <h2 className="font-orbitron text-sw-gold text-sm">USER MANAGEMENT</h2>
              </div>
              <span className={`text-sw-gold transition-transform ${showUserManagement ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>

            {showUserManagement && (
              <div className="p-4 pt-0 border-t border-sw-gray/20">
                <p className="text-sw-gray text-xs mb-3">
                  Reset passwords for users who forgot their credentials
                </p>

                {loadingUsers ? (
                  <div className="text-sw-gold text-xs animate-pulse">Loading...</div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {users.map(u => (
                      <div key={u.id} className="flex items-center justify-between p-2 bg-sw-darker/30 rounded text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-sw-light">{u.username}</span>
                          {u.forcePasswordChange && (
                            <span className="text-sw-gold text-[10px]">⚠</span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setResetUserId(u.id)
                            setTempPassword('')
                            setResetResult(null)
                          }}
                          className="text-sw-blue hover:text-sw-gold"
                        >
                          Reset
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reset Password Form */}
                {resetUserId && (
                  <div className="mt-3 p-3 bg-sw-darker/50 rounded border border-sw-gold/30">
                    <p className="text-sw-gold text-xs font-orbitron mb-2">
                      Reset: {users.find(u => u.id === resetUserId)?.username}
                    </p>
                    <input
                      type="text"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      className="input-field w-full text-xs mb-2"
                      placeholder="Temporary password (min 6 chars)"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleResetPassword}
                        disabled={tempPassword.length < 6}
                        className="btn-primary text-xs py-1 flex-1 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => {
                          setResetUserId(null)
                          setTempPassword('')
                        }}
                        className="btn-secondary text-xs py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Reset Result */}
                {resetResult && (
                  <div className={`mt-2 p-2 rounded text-xs ${
                    resetResult.success
                      ? 'bg-sw-green/10 border border-sw-green/30 text-sw-green'
                      : 'bg-sw-red/10 border border-sw-red/30 text-sw-red'
                  }`}>
                    {resetResult.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* System Info */}
          <div className="hologram-card p-6">
            <h2 className="font-orbitron text-sw-gold text-sm mb-4">SYSTEM STATUS</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="status-dot status-active"></span>
                <span className="text-sw-green text-sm">All systems operational</span>
              </div>
              <div className="text-sw-gray text-xs space-y-1">
                <p>Version: 1.0.0 (POC)</p>
                <p>Database: SQLite</p>
                <p>Server Port: 3011</p>
                <p>Client Port: 3010</p>
              </div>
            </div>
          </div>

          {/* Calendar Feeds Info */}
          <div className="hologram-card p-6">
            <h2 className="font-orbitron text-sw-gold text-sm mb-4">CALENDAR FEEDS</h2>
            <div className="space-y-2 text-sm text-sw-gray">
              <p>The Personio calendar sync supports:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Time off / Vacation</li>
                <li>Sick days</li>
                <li>Parental leave</li>
                <li>Public holidays</li>
              </ul>
              <p className="text-xs mt-2 text-sw-gold">
                Unmatched names will show suggested matches for manual mapping
              </p>
            </div>
          </div>

          {/* FTE Settings */}
          <div className="hologram-card p-6">
            <h2 className="font-orbitron text-sw-gold text-sm mb-4">FTE CONFIGURATION</h2>
            <div className="space-y-2 text-sm text-sw-gray">
              <div className="flex justify-between">
                <span>Baseline FTE</span>
                <span className="text-sw-gold">40h/week</span>
              </div>
              <div className="flex justify-between">
                <span>Weeks/Quarter</span>
                <span className="text-sw-gold">13 weeks</span>
              </div>
              <div className="flex justify-between">
                <span>Optimal Utilization</span>
                <span className="text-sw-gold">80-100%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table Editor Modal */}
      {showTableModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-sw-dark border border-sw-gold/30 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-sw-gray/30 flex items-center justify-between">
              <div>
                <h2 className="font-orbitron text-sw-gold text-lg">MIRO TASK EDITOR</h2>
                <p className="text-sw-gray text-sm">
                  {extracting ? 'Extracting tasks from image...' : `${tableData.length} tasks extracted - Review and edit below`}
                </p>
              </div>
              <button
                onClick={() => setShowTableModal(false)}
                className="text-sw-gray hover:text-sw-light text-2xl"
              >
                &times;
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-hidden flex">
              {/* Image Preview (only for images, not PDFs) */}
              {imagePreview && (
                <div className="w-1/3 border-r border-sw-gray/30 p-4 overflow-auto">
                  <h3 className="font-orbitron text-sw-blue text-xs mb-2">MIRO BOARD REFERENCE</h3>
                  <img src={imagePreview} alt="Miro board" className="w-full rounded border border-sw-gray/30" />
                </div>
              )}

              {/* Table Editor */}
              <div className={`${imagePreview ? 'w-2/3' : 'w-full'} p-4 overflow-auto`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h3 className="font-orbitron text-sw-blue text-xs">TASK TABLE</h3>
                    {leapsomeMatches.size > 0 && (
                      <span className="text-purple-400 text-xs">
                        🎯 {leapsomeMatches.size} Leapsome match{leapsomeMatches.size > 1 ? 'es' : ''}
                      </span>
                    )}
                    {duplicateTitles.size > 0 && (
                      <span className="text-sw-gold text-xs">
                        ⚠ {duplicateTitles.size} exact duplicate{duplicateTitles.size > 1 ? 's' : ''}
                      </span>
                    )}
                    {similarMatches.size > 0 && (
                      <span className="text-sw-blue text-xs">
                        ~ {similarMatches.size} similar match{similarMatches.size > 1 ? 'es' : ''}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={addTableRow}
                    className="btn-secondary text-xs py-1 px-3"
                  >
                    + Add Row
                  </button>
                </div>

                {extracting ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-sw-gold font-orbitron animate-pulse">EXTRACTING TASKS...</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-sw-gray/30">
                          <th className="text-left p-2 text-sw-gray font-orbitron text-xs">TITLE</th>
                          <th className="text-left p-2 text-sw-gray font-orbitron text-xs w-32">STATUS</th>
                          <th className="text-left p-2 text-sw-gray font-orbitron text-xs w-24">PRIORITY</th>
                          <th className="text-left p-2 text-sw-gray font-orbitron text-xs w-32">ASSIGNEES</th>
                          <th className="text-left p-2 text-sw-gray font-orbitron text-xs w-44">GOAL</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.map((row, index) => {
                          const similarMatch = getSimilarMatch(row.title)
                          const isExactDup = isDuplicate(row.title)
                          const hasSimilar = !isExactDup && similarMatch
                          const leapsomeMatch = row.title ? leapsomeMatches.get(row.title.toLowerCase().trim()) : null
                          const hasLeapsome = !!leapsomeMatch

                          return (
                          <tr key={index} className={`border-b border-sw-gray/20 hover:bg-sw-darker/50 ${hasLeapsome ? 'bg-purple-500/5' : isExactDup ? 'bg-sw-gold/5' : hasSimilar ? 'bg-sw-blue/5' : ''}`}>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={row.title}
                                  onChange={(e) => updateTableRow(index, 'title', e.target.value)}
                                  className={`flex-1 bg-sw-darker border rounded px-2 py-1 text-sw-light text-sm focus:border-sw-gold focus:outline-none ${hasLeapsome ? 'border-purple-500/50' : isExactDup ? 'border-sw-gold/50' : hasSimilar ? 'border-sw-blue/50' : 'border-sw-gray/30'}`}
                                  placeholder="Task title"
                                />
                                {hasLeapsome && (
                                  <span
                                    className="text-purple-400 text-xs font-orbitron whitespace-nowrap cursor-help"
                                    title={`Matches Leapsome ${leapsomeMatch.existingType}: "${leapsomeMatch.existingTitle}"${leapsomeMatch.quarter ? ` (${leapsomeMatch.quarter})` : ''}`}
                                  >
                                    🎯 LEAP
                                  </span>
                                )}
                                {isExactDup && !hasLeapsome && (
                                  <span className="text-sw-gold text-xs font-orbitron whitespace-nowrap" title="This task already exists in database">
                                    ⚠ DUP
                                  </span>
                                )}
                                {hasSimilar && !hasLeapsome && (
                                  <span
                                    className="text-sw-blue text-xs font-orbitron whitespace-nowrap cursor-help"
                                    title={`${similarMatch.similarity}% similar to: "${similarMatch.existingTitle}"${similarMatch.goalTitle ? ` (Goal: ${similarMatch.goalTitle})` : ''}`}
                                  >
                                    ~{similarMatch.similarity}%
                                  </span>
                                )}
                              </div>
                              {hasLeapsome && (
                                <div className="text-xs text-purple-400/80 mt-1 truncate" title={leapsomeMatch.existingTitle}>
                                  🎯 Leapsome {leapsomeMatch.existingType}: {leapsomeMatch.existingTitle.substring(0, 40)}{leapsomeMatch.existingTitle.length > 40 ? '...' : ''}
                                  {leapsomeMatch.quarter && <span className="text-sw-gold ml-2">({leapsomeMatch.quarter})</span>}
                                </div>
                              )}
                              {hasSimilar && !hasLeapsome && (
                                <div className="text-xs text-sw-blue/70 mt-1 truncate" title={similarMatch.existingTitle}>
                                  Similar to: {similarMatch.existingTitle.substring(0, 50)}...
                                </div>
                              )}
                            </td>
                            <td className="p-2">
                              <select
                                value={row.status}
                                onChange={(e) => updateTableRow(index, 'status', e.target.value)}
                                className="w-full bg-sw-darker border border-sw-gray/30 rounded px-2 py-1 text-sw-light text-sm focus:border-sw-gold focus:outline-none"
                              >
                                <option value="draft">Draft</option>
                                <option value="active">Active</option>
                                <option value="in-progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="on-hold">On Hold</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <select
                                value={row.priority}
                                onChange={(e) => updateTableRow(index, 'priority', e.target.value)}
                                className="w-full bg-sw-darker border border-sw-gray/30 rounded px-2 py-1 text-sw-light text-sm focus:border-sw-gold focus:outline-none"
                              >
                                <option value="">None</option>
                                <option value="P1">P1</option>
                                <option value="P2">P2</option>
                                <option value="P3">P3</option>
                                <option value="P4">P4</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <div className="relative">
                                {/* Show assigned members as chips */}
                                <div className="flex flex-wrap gap-1 mb-1">
                                  {row.assignees && row.assignees.split(';').filter(n => n.trim()).map((name, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 bg-sw-gold/20 text-sw-gold text-xs px-2 py-0.5 rounded"
                                    >
                                      {getFirstName(name)}
                                      <button
                                        onClick={() => removeAssigneeFromRow(index, name)}
                                        className="hover:text-sw-red"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                </div>
                                {/* Add assignee button/dropdown */}
                                <div className="relative">
                                  <button
                                    onClick={() => setActiveAssigneeRow(activeAssigneeRow === index ? null : index)}
                                    className="text-xs text-sw-blue hover:text-sw-gold"
                                  >
                                    + Add
                                  </button>
                                  {activeAssigneeRow === index && (
                                    <div className="absolute z-10 left-0 top-full mt-1 bg-sw-darker border border-sw-gray/50 rounded shadow-lg max-h-32 overflow-auto">
                                      {teamMembers.map(member => (
                                        <button
                                          key={member.id}
                                          onClick={() => addAssigneeToRow(index, getFirstName(member.name))}
                                          className="block w-full text-left px-3 py-1 text-sm text-sw-light hover:bg-sw-gold/20 hover:text-sw-gold"
                                        >
                                          {member.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-2">
                              <div className="space-y-1">
                                <select
                                  value={row.goal_id || ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    if (val.startsWith('bau:')) {
                                      updateTableRow(index, 'goal_id', 'bau')
                                      updateTableRow(index, 'bau_category', val.replace('bau:', ''))
                                    } else {
                                      updateTableRow(index, 'goal_id', val)
                                      updateTableRow(index, 'bau_category', '')
                                    }
                                  }}
                                  className="w-full bg-sw-darker border border-sw-gray/30 rounded px-2 py-1 text-sw-light text-xs focus:border-sw-gold focus:outline-none"
                                >
                                  <option value="">-- Skip (BAU) --</option>
                                  <optgroup label="Goals">
                                    {importGoals.map(g => (
                                      <option key={g.id} value={g.id}>
                                        {g.title.length > 45 ? g.title.substring(0, 42) + '...' : g.title}
                                      </option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="BAU Category">
                                    {BAU_CATEGORIES.map(cat => (
                                      <option key={cat} value={`bau:${cat}`}>{cat}</option>
                                    ))}
                                  </optgroup>
                                </select>
                                {row.goal_id === 'bau' && row.bau_category && (
                                  <span className="text-sw-gold text-xs">BAU: {row.bau_category}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <button
                                onClick={() => removeTableRow(index)}
                                className="text-sw-red/70 hover:text-sw-red"
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>

                    {tableData.length === 0 && (
                      <div className="text-center py-8 text-sw-gray">
                        <p>No tasks extracted. Click "+ Add Row" to add tasks manually.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-sw-gray/30 flex justify-end gap-3">
              <button
                onClick={resetImport}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleTableImport}
                disabled={tableData.filter(r => r.title.trim()).length === 0 || importing}
                className="btn-primary disabled:opacity-50"
              >
                {importing ? 'CHECKING...' : `IMPORT ${tableData.filter(r => r.title.trim()).length} TASKS`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Name Mapping Modal */}
      {showMappingModal && unmatchedNames.length > 0 && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-sw-dark border border-sw-gold/30 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-sw-gray/30">
              <h2 className="font-orbitron text-sw-gold text-lg">MAP CALENDAR NAMES</h2>
              <p className="text-sw-gray text-sm mt-1">
                {unmatchedNames.length} name{unmatchedNames.length > 1 ? 's' : ''} from the calendar couldn't be automatically matched to team members.
                Please map them below or skip to ignore.
              </p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {unmatchedNames.map((item, index) => (
                <div key={index} className="p-4 bg-sw-darker/50 rounded-lg border border-sw-gray/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sw-light font-medium">{item.calendarName}</p>
                      <p className="text-sw-gray text-xs mt-1">From Personio Calendar</p>
                    </div>
                    <div className="flex-1">
                      <label className="text-sw-gray text-xs uppercase mb-1 block">Map to Team Member</label>
                      <select
                        value={nameMappings[item.calendarName] || ''}
                        onChange={(e) => updateNameMapping(item.calendarName, e.target.value ? parseInt(e.target.value) : null)}
                        className="input-field text-sm w-full"
                      >
                        <option value="">-- Skip (don't import) --</option>
                        {item.suggestions.length > 0 && (
                          <optgroup label="Suggested matches">
                            {item.suggestions.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.similarity}% match)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="All team members">
                          {teamMembers
                            .filter(m => !item.suggestions.some(s => s.id === m.id))
                            .map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                  {item.suggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.suggestions.map(s => (
                        <button
                          key={s.id}
                          onClick={() => updateNameMapping(item.calendarName, s.id)}
                          className={`px-2 py-1 text-xs rounded border transition-all ${
                            nameMappings[item.calendarName] === s.id
                              ? 'border-sw-gold bg-sw-gold/20 text-sw-gold'
                              : 'border-sw-gray/30 text-sw-gray hover:border-sw-blue hover:text-sw-blue'
                          }`}
                        >
                          {s.name} <span className="opacity-70">({s.similarity}%)</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="p-4 border-t border-sw-gray/30 flex justify-between gap-3">
              <button
                onClick={() => {
                  setShowMappingModal(false)
                  setUnmatchedNames([])
                }}
                className="btn-secondary"
              >
                Close Without Syncing
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Clear all mappings (skip all)
                    setNameMappings({})
                    setShowMappingModal(false)
                  }}
                  className="btn-secondary"
                >
                  Skip All Unmatched
                </button>
                <button
                  onClick={handleRetryWithMappings}
                  disabled={syncing}
                  className="btn-primary disabled:opacity-50"
                >
                  {syncing ? 'SYNCING...' : 'SYNC WITH MAPPINGS'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Warning Modal */}
      {showDuplicateModal && duplicateCheck && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-sw-dark border border-sw-gold/30 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-sw-gray/30">
              <h2 className="font-orbitron text-sw-gold text-lg">DUPLICATE & SIMILAR TASKS DETECTED</h2>
              <p className="text-sw-gray text-sm mt-1">
                {duplicateCheck.duplicateCount} exact duplicates, {duplicateCheck.similarCount || 0} similar matches out of {duplicateCheck.total} tasks
                {duplicateCheck.leapsomeMatchCount > 0 && (
                  <span className="text-purple-400 ml-2">
                    ({duplicateCheck.leapsomeMatchCount} match Leapsome goals)
                  </span>
                )}
              </p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Leapsome Matches - Show First */}
              {duplicateCheck.leapsomeMatchCount > 0 && (
                <div>
                  <h3 className="font-orbitron text-purple-400 text-xs mb-2">
                    🎯 LEAPSOME GOAL MATCHES ({duplicateCheck.leapsomeMatchCount}):
                  </h3>
                  <p className="text-sw-gray text-xs mb-2">
                    These Miro tasks match existing Leapsome goals/key results. Consider linking them instead of creating duplicates.
                  </p>
                  <div className="space-y-2">
                    {duplicateCheck.leapsomeMatches.slice(0, 15).map((match, i) => (
                      <div key={i} className="p-3 bg-purple-500/10 border border-purple-500/30 rounded text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="text-sw-light font-medium">{match.title}</div>
                            <div className="text-purple-400 text-xs mt-1 flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-purple-500/20 rounded text-[10px] uppercase">
                                {match.existingType === 'goal' ? 'Goal' : match.existingType === 'key_result' ? 'Key Result' : match.existingType}
                              </span>
                              <span>↳ {match.similarity}% similar to: "{match.existingTitle}"</span>
                            </div>
                          </div>
                          <span className="text-purple-400 font-orbitron text-sm">{match.similarity}%</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          {match.quarter && (
                            <span className="text-sw-gold">{match.quarter}</span>
                          )}
                          {match.goalTitle && match.existingType !== 'goal' && (
                            <span className="text-sw-gray">Goal: {match.goalTitle}</span>
                          )}
                          <span className={`badge ${match.existingStatus === 'active' ? 'badge-info' : match.existingStatus === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                            {match.existingStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                    {duplicateCheck.leapsomeMatches.length > 15 && (
                      <p className="text-sw-gray text-xs text-center py-1">
                        ... and {duplicateCheck.leapsomeMatches.length - 15} more Leapsome matches
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Exact Duplicates (non-Leapsome) */}
              {duplicateCheck.duplicateCount > 0 && (
                <div>
                  <h3 className="font-orbitron text-sw-gold text-xs mb-2">⚠ EXACT DUPLICATES ({duplicateCheck.duplicateCount}):</h3>
                  <div className="space-y-1">
                    {duplicateCheck.duplicates.filter(d => d.existingSource !== 'leapsome').slice(0, 10).map((dup, i) => (
                      <div key={i} className="p-2 bg-sw-gold/10 border border-sw-gold/20 rounded text-sm">
                        <div className="text-sw-light">{dup.title}</div>
                        <div className="text-sw-gray text-xs mt-1">
                          Existing: {dup.existingStatus} · {dup.existingSource}
                          {dup.goalTitle && <span className="text-sw-blue"> · Goal: {dup.goalTitle}</span>}
                        </div>
                      </div>
                    ))}
                    {duplicateCheck.duplicates.filter(d => d.existingSource !== 'leapsome').length > 10 && (
                      <p className="text-sw-gray text-xs text-center py-1">
                        ... and {duplicateCheck.duplicates.filter(d => d.existingSource !== 'leapsome').length - 10} more exact duplicates
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Similar Matches (non-Leapsome) */}
              {duplicateCheck.similarCount > 0 && duplicateCheck.similar.filter(s => s.existingSource !== 'leapsome').length > 0 && (
                <div>
                  <h3 className="font-orbitron text-sw-blue text-xs mb-2">~ SIMILAR MATCHES ({duplicateCheck.similar.filter(s => s.existingSource !== 'leapsome').length}):</h3>
                  <div className="space-y-1">
                    {duplicateCheck.similar.filter(s => s.existingSource !== 'leapsome').slice(0, 10).map((sim, i) => (
                      <div key={i} className="p-2 bg-sw-blue/10 border border-sw-blue/20 rounded text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="text-sw-light">{sim.title}</div>
                            <div className="text-sw-blue text-xs mt-1">
                              ↳ {sim.similarity}% similar to: "{sim.existingTitle}"
                              <span className="ml-2 text-sw-gray">({sim.existingType})</span>
                            </div>
                          </div>
                          <span className="text-sw-blue font-orbitron text-xs">{sim.similarity}%</span>
                        </div>
                        {sim.goalTitle && (
                          <div className="text-sw-gray text-xs mt-1">Goal: {sim.goalTitle}</div>
                        )}
                      </div>
                    ))}
                    {duplicateCheck.similar.filter(s => s.existingSource !== 'leapsome').length > 10 && (
                      <p className="text-sw-gray text-xs text-center py-1">
                        ... and {duplicateCheck.similar.filter(s => s.existingSource !== 'leapsome').length - 10} more similar matches
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* New Tasks */}
              {duplicateCheck.newCount > 0 && (
                <div>
                  <h3 className="font-orbitron text-sw-green text-xs mb-2">✓ NEW TASKS ({duplicateCheck.newCount}):</h3>
                  <p className="text-sw-gray text-sm">
                    {duplicateCheck.newCount} task{duplicateCheck.newCount > 1 ? 's' : ''} will be imported as new
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="p-4 border-t border-sw-gray/30">
              <p className="text-sw-light text-sm mb-4">How would you like to handle duplicates and similar tasks?</p>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => executeImport(csvData, 'skip')}
                  className="p-3 rounded border border-sw-blue/50 hover:border-sw-blue hover:bg-sw-blue/10 transition-all"
                >
                  <div className="font-orbitron text-sw-blue text-sm">SKIP ALL</div>
                  <div className="text-sw-gray text-xs mt-1">Skip duplicates & similar</div>
                </button>
                <button
                  onClick={() => executeImport(csvData, 'replace')}
                  className="p-3 rounded border border-sw-gold/50 hover:border-sw-gold hover:bg-sw-gold/10 transition-all"
                >
                  <div className="font-orbitron text-sw-gold text-sm">REPLACE</div>
                  <div className="text-sw-gray text-xs mt-1">Replace exact duplicates only</div>
                </button>
                <button
                  onClick={() => executeImport(csvData, 'keep')}
                  className="p-3 rounded border border-sw-green/50 hover:border-sw-green hover:bg-sw-green/10 transition-all"
                >
                  <div className="font-orbitron text-sw-green text-sm">IMPORT ALL</div>
                  <div className="text-sw-gray text-xs mt-1">Import everything as new</div>
                </button>
              </div>
              <button
                onClick={() => {
                  setShowDuplicateModal(false)
                  setDuplicateCheck(null)
                }}
                className="w-full mt-3 btn-secondary text-sm"
              >
                Cancel - Return to Editor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
