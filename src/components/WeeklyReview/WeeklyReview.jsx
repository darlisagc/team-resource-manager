import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

const STATUS_COLUMNS = [
  { id: 'active', label: 'Active', color: 'blue' },
  { id: 'in-progress', label: 'In Progress', color: 'gold' },
  { id: 'completed', label: 'Completed', color: 'green' },
  { id: 'on-hold', label: 'On Hold', color: 'red' }
]

export default function WeeklyReview() {
  const { getAuthHeader } = useAuth()
  const [keyResults, setKeyResults] = useState([])
  const [initiatives, setInitiatives] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [viewMode, setViewMode] = useState('all') // 'all', 'kr', 'initiatives'
  const [updateHistory, setUpdateHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [krRes, initRes, membersRes] = await Promise.all([
        fetch('/api/key-results', { headers: getAuthHeader() }),
        fetch('/api/initiatives', { headers: getAuthHeader() }),
        fetch('/api/members', { headers: getAuthHeader() })
      ])

      if (!krRes.ok || !initRes.ok || !membersRes.ok) {
        console.error('API error')
        return
      }

      setKeyResults(await krRes.json())
      setInitiatives(await initRes.json())
      setMembers(await membersRes.json())
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (type, id, newStatus, comment, link) => {
    try {
      const endpoint = type === 'kr' ? `/api/key-results/${id}` : `/api/initiatives/${id}`
      await fetch(endpoint, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, comment, link })
      })

      if (type === 'kr') {
        setKeyResults(prev => prev.map(kr => kr.id === id ? { ...kr, status: newStatus } : kr))
      } else {
        setInitiatives(prev => prev.map(init => init.id === id ? { ...init, status: newStatus } : init))
      }

      setShowModal(false)
      setSelectedItem(null)
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const handleDragStart = (e, type, id) => {
    e.dataTransfer.setData('type', type)
    e.dataTransfer.setData('id', id.toString())
  }

  const handleDrop = (e, newStatus) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('type')
    const id = parseInt(e.dataTransfer.getData('id'))
    updateStatus(type, id, newStatus)
  }

  const openModal = async (type, item) => {
    setSelectedItem({ type, data: item })
    setShowModal(true)
    setUpdateHistory([])
    setLoadingHistory(true)

    try {
      const endpoint = type === 'kr'
        ? `/api/key-results/${item.id}/updates`
        : `/api/initiatives/${item.id}/updates`
      const res = await fetch(endpoint, { headers: getAuthHeader() })
      if (res.ok) {
        const data = await res.json()
        setUpdateHistory(data)
      }
    } catch (error) {
      console.error('Failed to fetch update history:', error)
    } finally {
      setLoadingHistory(false)
    }
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

  const getItemsByStatus = (status) => {
    const items = []

    if (viewMode === 'all' || viewMode === 'kr') {
      keyResults.filter(kr => kr.status === status).forEach(kr => {
        items.push({ type: 'kr', data: kr })
      })
    }

    if (viewMode === 'all' || viewMode === 'initiatives') {
      initiatives.filter(init => init.status === status).forEach(init => {
        items.push({ type: 'initiative', data: init })
      })
    }

    return items
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-400/20 border-green-400/30'
      case 'active': return 'text-blue-400 bg-blue-400/20 border-blue-400/30'
      case 'in-progress': return 'text-yellow-400 bg-yellow-400/20 border-yellow-400/30'
      case 'on-hold': return 'text-red-400 bg-red-400/20 border-red-400/30'
      default: return 'text-gray-400 bg-gray-400/20 border-gray-400/30'
    }
  }

  // Stats
  const totalKRs = keyResults.length
  const completedKRs = keyResults.filter(kr => kr.status === 'completed').length
  const krProgress = totalKRs > 0
    ? Math.round(keyResults.reduce((sum, kr) => {
        if (kr.target_value > 0) {
          return sum + (kr.current_value / kr.target_value) * 100
        }
        return sum + (kr.status === 'completed' ? 100 : 0)
      }, 0) / totalKRs)
    : 0

  const totalInits = initiatives.length
  const completedInits = initiatives.filter(i => i.status === 'completed').length
  const initProgress = totalInits > 0 ? Math.round((completedInits / totalInits) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sw-gold font-orbitron animate-pulse">LOADING BRIEFING DATA...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Goal Overview</h1>
          <p className="text-sw-gray text-sm">Review and manage Key Results & Initiatives</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="hologram-card px-4 py-3 min-w-[180px]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sw-gray">Key Results</span>
              <span className="text-sw-gold font-orbitron">{krProgress}%</span>
            </div>
            <div className="w-full h-2 bg-sw-darker rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${krProgress >= 80 ? 'bg-green-500' : krProgress >= 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                style={{ width: `${krProgress}%` }}
              />
            </div>
            <div className="text-xs text-sw-gray mt-1">{completedKRs}/{totalKRs} completed</div>
          </div>
          <div className="hologram-card px-4 py-3 min-w-[180px]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sw-gray">Initiatives</span>
              <span className="text-sw-gold font-orbitron">{initProgress}%</span>
            </div>
            <div className="w-full h-2 bg-sw-darker rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${initProgress >= 80 ? 'bg-green-500' : initProgress >= 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                style={{ width: `${initProgress}%` }}
              />
            </div>
            <div className="text-xs text-sw-gray mt-1">{completedInits}/{totalInits} completed</div>
          </div>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'All' },
          { id: 'kr', label: 'Key Results' },
          { id: 'initiatives', label: 'Initiatives' }
        ].map(mode => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            className={`px-4 py-2 rounded font-orbitron text-sm transition-all ${
              viewMode === mode.id
                ? 'bg-sw-gold/20 text-sw-gold border border-sw-gold'
                : 'bg-sw-darker text-sw-gray hover:text-sw-light'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-4 gap-4">
        {STATUS_COLUMNS.map(column => (
          <div
            key={column.id}
            className="hologram-card p-4 min-h-[400px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-3 h-3 rounded-full bg-sw-${column.color}`}></span>
              <h3 className="font-orbitron text-sw-light text-sm">{column.label}</h3>
              <span className="ml-auto text-sw-gray text-sm">
                {getItemsByStatus(column.id).length}
              </span>
            </div>

            <div className="space-y-3">
              {getItemsByStatus(column.id).map(item => (
                <ItemCard
                  key={`${item.type}-${item.data.id}`}
                  type={item.type}
                  item={item.data}
                  onDragStart={(e) => handleDragStart(e, item.type, item.data.id)}
                  onClick={() => openModal(item.type, item.data)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Stats by Goal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="hologram-card p-4">
          <h4 className="font-orbitron text-sw-gold text-sm mb-3">KEY RESULTS BY GOAL</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {[...new Set(keyResults.map(kr => kr.goal_title).filter(Boolean))].map(goal => {
              const count = keyResults.filter(kr => kr.goal_title === goal && kr.status !== 'completed').length
              return (
                <div key={goal} className="flex justify-between items-center">
                  <span className="text-sw-blue text-sm truncate max-w-[200px]">{goal}</span>
                  <span className="text-sw-light font-orbitron">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="hologram-card p-4">
          <h4 className="font-orbitron text-sw-gold text-sm mb-3">INITIATIVES BY PRIORITY</h4>
          <div className="space-y-2">
            {['P1', 'P2', 'P3', 'P4'].map(priority => {
              const count = initiatives.filter(i => i.project_priority === priority && i.status !== 'completed').length
              return (
                <div key={priority} className="flex justify-between items-center">
                  <span className={`badge ${priority === 'P1' ? 'badge-danger' : priority === 'P2' ? 'badge-warning' : 'badge-info'}`}>
                    {priority}
                  </span>
                  <span className="text-sw-light font-orbitron">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Initiatives by Category */}
      <div className="hologram-card p-4">
        <h4 className="font-orbitron text-sw-gold text-sm mb-3">INITIATIVES BY CATEGORY</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[...new Set(initiatives.map(i => i.category).filter(Boolean))].map(category => {
            const count = initiatives.filter(i => i.category === category && i.status !== 'completed').length
            return (
              <div key={category} className="p-2 bg-sw-darker/50 rounded-lg">
                <p className="text-sw-purple text-xs truncate">{category}</p>
                <p className="text-sw-light font-orbitron text-lg">{count}</p>
              </div>
            )
          })}
          {initiatives.filter(i => !i.category && i.status !== 'completed').length > 0 && (
            <div className="p-2 bg-sw-darker/50 rounded-lg">
              <p className="text-sw-gray text-xs">Uncategorized</p>
              <p className="text-sw-light font-orbitron text-lg">
                {initiatives.filter(i => !i.category && i.status !== 'completed').length}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Update Modal */}
      {showModal && selectedItem && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="hologram-card p-6 w-full max-w-lg">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className={`text-xs px-2 py-1 rounded ${selectedItem.type === 'kr' ? 'bg-sw-purple/20 text-sw-purple' : 'bg-sw-blue/20 text-sw-blue'}`}>
                  {selectedItem.type === 'kr' ? 'Key Result' : 'Initiative'}
                </span>
                <h3 className="font-orbitron text-sw-gold text-lg mt-2">
                  {selectedItem.data.title || selectedItem.data.name}
                </h3>
                {selectedItem.data.goal_title && (
                  <p className="text-sw-gray text-sm mt-1">Goal: {selectedItem.data.goal_title}</p>
                )}
              </div>
              <button onClick={() => setShowModal(false)} className="text-sw-gray hover:text-sw-light">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Description */}
            {selectedItem.data.description && (
              <p className="text-sw-gray text-sm mb-4">{selectedItem.data.description}</p>
            )}

            {/* Progress (for KRs) */}
            {selectedItem.type === 'kr' && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-sw-gray">Progress</span>
                  <span className="text-sw-gold font-orbitron">
                    {selectedItem.data.current_value || 0} / {selectedItem.data.target_value || 100}
                  </span>
                </div>
                <div className="w-full h-2 bg-sw-darker rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sw-gold transition-all"
                    style={{ width: `${selectedItem.data.target_value > 0 ? (selectedItem.data.current_value / selectedItem.data.target_value) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Current Status */}
            <div className="mb-4">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">Status</label>
              <span className={`inline-block px-3 py-1.5 rounded text-sm font-medium border ${getStatusColor(selectedItem.data.status || 'active')}`}>
                {STATUS_COLUMNS.find(s => s.id === selectedItem.data.status)?.label || 'Active'}
              </span>
            </div>

            {/* Lead */}
            {selectedItem.data.owner_name && (
              <div className="mb-4">
                <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">Lead</label>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-sw-gold/20 flex items-center justify-center">
                    <span className="text-sw-gold font-medium">{selectedItem.data.owner_name[0]}</span>
                  </div>
                  <span className="text-sw-light">{selectedItem.data.owner_name}</span>
                </div>
              </div>
            )}

            {/* Update History */}
            <div className="mb-6">
              <label className="block text-sw-gray text-xs uppercase tracking-wider mb-2">Update History</label>
              <div className="max-h-64 overflow-y-auto bg-sw-darker/50 rounded p-3">
                {loadingHistory ? (
                  <p className="text-sw-gray text-sm text-center py-4">Loading...</p>
                ) : updateHistory.length === 0 ? (
                  <p className="text-sw-gray text-sm text-center py-4">No updates recorded yet</p>
                ) : (
                  <div className="space-y-3">
                    {updateHistory.map(update => (
                      <div key={update.id} className="p-3 bg-sw-darker rounded-lg border border-sw-gray/20">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(update.previous_status)}`}>
                            {update.previous_status}
                          </span>
                          <svg className="w-4 h-4 text-sw-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(update.new_status)}`}>
                            {update.new_status}
                          </span>
                          <span className="text-sw-gray text-xs ml-auto">{formatDate(update.created_at)}</span>
                        </div>
                        {update.comment && (
                          <p className="text-sw-light text-sm mt-2">{update.comment}</p>
                        )}
                        {update.link && (
                          <a
                            href={update.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sw-blue text-sm hover:underline mt-1 block truncate"
                          >
                            {update.link}
                          </a>
                        )}
                        {update.updated_by_name && (
                          <p className="text-sw-gray text-xs mt-2">By: {update.updated_by_name}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Close Button */}
            <div className="flex justify-end">
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemCard({ type, item, onDragStart, onClick }) {
  const isKR = type === 'kr'
  const title = item.title || item.name
  const progress = isKR && item.target_value > 0
    ? Math.round((item.current_value / item.target_value) * 100)
    : null

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="p-3 bg-sw-darker/50 rounded-lg border border-sw-gray/20 cursor-pointer hover:border-sw-gold/50 transition-all"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded ${isKR ? 'bg-sw-purple/20 text-sw-purple' : 'bg-sw-blue/20 text-sw-blue'}`}>
            {isKR ? 'KR' : 'Init'}
          </span>
          {item.category && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-sw-purple/20 text-sw-purple">
              {item.category}
            </span>
          )}
        </div>
        {item.project_priority && (
          <span className={`badge text-xs ${
            item.project_priority === 'P1' ? 'badge-danger' :
            item.project_priority === 'P2' ? 'badge-warning' : 'badge-info'
          }`}>
            {item.project_priority}
          </span>
        )}
      </div>

      <p className="text-sw-light text-sm font-medium line-clamp-2 mb-2">{title}</p>

      {item.goal_title && (
        <p className="text-sw-gray text-xs mb-2 truncate">{item.goal_title}</p>
      )}

      {progress !== null && (
        <div className="mt-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-sw-gray">{item.current_value}/{item.target_value}</span>
            <span className="text-sw-gold">{progress}%</span>
          </div>
          <div className="w-full h-1 bg-sw-darker rounded-full overflow-hidden">
            <div
              className={`h-full ${progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Dates and Hours row */}
      {(!isKR && (item.start_date || item.end_date || item.actual_hours > 0)) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-sw-gray">
          {(item.start_date || item.end_date) && (
            <span>
              {item.start_date && new Date(item.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {item.start_date && item.end_date && ' - '}
              {item.end_date && new Date(item.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {item.actual_hours > 0 && (
            <span className="flex items-center gap-0.5 text-sw-gold">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {item.actual_hours}h
            </span>
          )}
        </div>
      )}

      {item.owner_name && (
        <div className="mt-2 flex items-center gap-1">
          <div className="w-5 h-5 rounded-full bg-sw-gold/20 flex items-center justify-center">
            <span className="text-sw-gold text-xs">{item.owner_name[0]}</span>
          </div>
          <span className="text-sw-gray text-xs">{item.owner_name}</span>
        </div>
      )}
    </div>
  )
}
