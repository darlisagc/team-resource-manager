import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

export default function Tasks() {
  const { getAuthHeader } = useAuth()
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', hasConflict: false })
  const [selectedTask, setSelectedTask] = useState(null)
  const [showConflictPanel, setShowConflictPanel] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [showAddAssignee, setShowAddAssignee] = useState(false)

  useEffect(() => {
    fetchTasks()
    fetchMembers()
  }, [filter])

  const fetchTasks = async () => {
    setLoading(true)
    try {
      let url = '/api/tasks?'
      if (filter.status) url += `status=${filter.status}&`
      if (filter.hasConflict) url += 'has_conflict=true&'

      const res = await fetch(url, { headers: getAuthHeader() })
      const data = await res.json()
      setTasks(data)
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/members', { headers: getAuthHeader() })
      const data = await res.json()
      setMembers(data)
    } catch (error) {
      console.error('Failed to fetch members:', error)
    }
  }

  const updateTaskStatus = async (taskId, status) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      fetchTasks()
    } catch (error) {
      console.error('Failed to update task:', error)
    }
  }

  const resolveConflict = async (taskId, assigneeIds, source) => {
    try {
      await fetch(`/api/tasks/${taskId}/resolve`, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee_ids: assigneeIds, resolution_source: source })
      })
      fetchTasks()
      setShowConflictPanel(false)
      setSelectedTask(null)
    } catch (error) {
      console.error('Failed to resolve conflict:', error)
    }
  }

  const addAssignee = async (taskId, memberId) => {
    try {
      console.log('Adding assignee:', taskId, memberId)
      const res = await fetch(`/api/tasks/${taskId}/assignees`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_member_id: memberId })
      })
      const data = await res.json()
      console.log('Response:', data)
      if (res.ok) {
        await fetchTasks()
      }
    } catch (error) {
      console.error('Failed to add assignee:', error)
    }
  }

  const removeAssignee = async (taskId, memberId) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/assignees/${memberId}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      })
      if (res.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error('Failed to remove assignee:', error)
    }
  }

  // Get members not already assigned to a task
  const getAvailableMembers = (task) => {
    const assignedIds = new Set([
      ...(task.miroAssignees || []).map(a => a.id),
      ...(task.resolvedAssignees || []).map(a => a.id)
    ])
    return members.filter(m => !assignedIds.has(m.id))
  }

  const conflictTasks = tasks.filter(t => t.hasConflict && !t.isResolved)
  const statusCounts = {
    todo: tasks.filter(t => t.status === 'todo').length,
    'in-progress': tasks.filter(t => t.status === 'in-progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    blocked: tasks.filter(t => t.status === 'blocked').length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sw-gold font-orbitron animate-pulse">LOADING OPERATIONS DATA...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Quarter Estimation</h1>
          <p className="text-sw-gray text-sm">Tasks from Miro Board</p>
        </div>
        <div className="flex gap-3">
          {conflictTasks.length > 0 && (
            <button
              onClick={() => setFilter(f => ({ ...f, hasConflict: !f.hasConflict }))}
              className={`btn-danger ${filter.hasConflict ? 'bg-sw-red/30' : ''}`}
            >
              Conflicts ({conflictTasks.length})
            </button>
          )}
          <select
            value={filter.status}
            onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))}
            className="input-field w-40"
          >
            <option value="">All Status</option>
            <option value="todo">To Do ({statusCounts.todo})</option>
            <option value="in-progress">In Progress ({statusCounts['in-progress']})</option>
            <option value="done">Done ({statusCounts.done})</option>
            <option value="blocked">Blocked ({statusCounts.blocked})</option>
          </select>
        </div>
      </div>

      {/* Conflict Alert */}
      {conflictTasks.length > 0 && !filter.hasConflict && (
        <div className="hologram-card p-4 border-sw-red/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="status-dot status-danger"></span>
              <span className="text-sw-red">
                <strong>{conflictTasks.length}</strong> assignment conflict(s) require resolution
              </span>
            </div>
            <button
              onClick={() => setFilter(f => ({ ...f, hasConflict: true }))}
              className="btn-danger text-sm"
            >
              View Conflicts
            </button>
          </div>
        </div>
      )}

      {/* Tasks Table - Grouped by Goal */}
      <div className="hologram-card p-6">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Goal / Task</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignees</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Group tasks by goal
                const grouped = {}
                const unlinked = []
                tasks.forEach(task => {
                  if (task.parent_goal_id && task.goal_title) {
                    if (!grouped[task.parent_goal_id]) {
                      grouped[task.parent_goal_id] = {
                        id: task.parent_goal_id,
                        title: task.goal_title,
                        tasks: []
                      }
                    }
                    grouped[task.parent_goal_id].tasks.push(task)
                  } else {
                    unlinked.push(task)
                  }
                })

                const rows = []

                // Render grouped tasks
                Object.values(grouped).forEach(goal => {
                  // Goal header row
                  rows.push(
                    <tr key={`goal-${goal.id}`} className="bg-sw-gold/10 border-t-2 border-sw-gold/30">
                      <td colSpan="6">
                        <div className="flex items-center gap-2 py-1">
                          <span className="text-sw-gold font-orbitron text-sm">⬢</span>
                          <span className="text-sw-gold font-medium">{goal.title}</span>
                          <span className="text-sw-gray text-xs">({goal.tasks.length} tasks)</span>
                        </div>
                      </td>
                    </tr>
                  )

                  // Task rows under this goal
                  goal.tasks.forEach(task => {
                    rows.push(
                      <TaskRow
                        key={task.id}
                        task={task}
                        isNested={true}
                        onStatusChange={updateTaskStatus}
                        onAddAssignee={addAssignee}
                        onRemoveAssignee={removeAssignee}
                        editingTask={editingTask}
                        setEditingTask={setEditingTask}
                        showAddAssignee={showAddAssignee}
                        setShowAddAssignee={setShowAddAssignee}
                        getAvailableMembers={getAvailableMembers}
                        onResolve={(task) => {
                          setSelectedTask(task)
                          setShowConflictPanel(true)
                        }}
                      />
                    )
                  })
                })

                // Unlinked tasks section
                if (unlinked.length > 0) {
                  rows.push(
                    <tr key="unlinked-header" className="bg-sw-gray/10 border-t-2 border-sw-gray/30">
                      <td colSpan="6">
                        <div className="flex items-center gap-2 py-1">
                          <span className="text-sw-gray font-orbitron text-sm">○</span>
                          <span className="text-sw-gray font-medium">Unlinked Tasks</span>
                          <span className="text-sw-gray text-xs">({unlinked.length} tasks)</span>
                        </div>
                      </td>
                    </tr>
                  )

                  unlinked.forEach(task => {
                    rows.push(
                      <TaskRow
                        key={task.id}
                        task={task}
                        isNested={true}
                        onStatusChange={updateTaskStatus}
                        onAddAssignee={addAssignee}
                        onRemoveAssignee={removeAssignee}
                        editingTask={editingTask}
                        setEditingTask={setEditingTask}
                        showAddAssignee={showAddAssignee}
                        setShowAddAssignee={setShowAddAssignee}
                        getAvailableMembers={getAvailableMembers}
                        onResolve={(task) => {
                          setSelectedTask(task)
                          setShowConflictPanel(true)
                        }}
                      />
                    )
                  })
                }

                return rows
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conflict Resolution Panel */}
      {showConflictPanel && selectedTask && (
        <ConflictResolutionPanel
          task={selectedTask}
          members={members}
          onResolve={resolveConflict}
          onClose={() => {
            setShowConflictPanel(false)
            setSelectedTask(null)
          }}
        />
      )}
    </div>
  )
}

function TaskRow({
  task,
  isNested,
  onStatusChange,
  onAddAssignee,
  onRemoveAssignee,
  editingTask,
  setEditingTask,
  showAddAssignee,
  setShowAddAssignee,
  getAvailableMembers,
  onResolve
}) {
  const assignees = task.isResolved ? task.resolvedAssignees : task.miroAssignees || []

  return (
    <tr className={task.hasConflict && !task.isResolved ? 'bg-sw-red/5' : ''}>
      <td>
        <div className={isNested ? 'pl-6' : ''}>
          <p className="text-sw-light font-medium">{task.title}</p>
          <p className="text-sw-gray text-xs">{task.external_id}</p>
        </div>
      </td>
      <td>
        <select
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value)}
          className="input-field text-sm py-1"
        >
          <option value="todo">To Do</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
          <option value="blocked">Blocked</option>
        </select>
      </td>
      <td>
        <span className={`badge badge-${
          task.priority === 'critical' ? 'danger' :
          task.priority === 'high' ? 'warning' :
          task.priority === 'low' ? 'info' : 'info'
        }`}>
          {task.priority}
        </span>
      </td>
      <td>
        {task.hasConflict && !task.isResolved ? (
          <div className="flex items-center gap-2">
            <span className="status-dot status-danger"></span>
            <span className="text-sw-red text-sm">Conflict</span>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap gap-1 mb-1">
              {assignees.map(a => (
                <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-sw-blue/20 text-sw-blue text-xs rounded group">
                  {a.name.split(' ')[0]}
                  <button
                    onClick={() => onRemoveAssignee(task.id, a.id)}
                    className="text-sw-blue/50 hover:text-sw-red ml-1"
                    title="Remove assignee"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {editingTask === task.id && showAddAssignee ? (
              <div className="flex items-center gap-1">
                <select
                  className="input-field text-xs py-1 flex-1"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      onAddAssignee(task.id, parseInt(e.target.value))
                      setShowAddAssignee(false)
                      setEditingTask(null)
                    }
                  }}
                >
                  <option value="">Select...</option>
                  {getAvailableMembers(task).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setShowAddAssignee(false)
                    setEditingTask(null)
                  }}
                  className="text-sw-gray hover:text-sw-red text-sm"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditingTask(task.id)
                  setShowAddAssignee(true)
                }}
                className="text-xs text-sw-gold hover:text-sw-light"
              >
                + Add
              </button>
            )}
          </div>
        )}
      </td>
      <td>
        {task.progress_target ? (
          <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-sw-darker rounded-full overflow-hidden">
              <div
                className="h-full bg-sw-gold rounded-full transition-all"
                style={{ width: `${(task.progress_current / task.progress_target) * 100}%` }}
              />
            </div>
            <span className="text-sw-gold font-orbitron text-xs">
              {task.progress_current}/{task.progress_target}
            </span>
          </div>
        ) : (
          <span className="text-sw-gray text-sm">-</span>
        )}
      </td>
      <td>
        {task.hasConflict && !task.isResolved && (
          <button
            onClick={() => onResolve(task)}
            className="btn-danger text-xs"
          >
            Resolve
          </button>
        )}
      </td>
    </tr>
  )
}

function ConflictResolutionPanel({ task, members, onResolve, onClose }) {
  const [selectedAssignees, setSelectedAssignees] = useState([])
  const [resolutionSource, setResolutionSource] = useState('manual')

  const handleSelectMiro = () => {
    setSelectedAssignees(task.miroAssignees.map(a => a.id))
    setResolutionSource('miro')
  }

  const handleSelectLeapsome = () => {
    setSelectedAssignees(task.leapsomeAssignees.map(a => a.id))
    setResolutionSource('leapsome')
  }

  const toggleAssignee = (id) => {
    setSelectedAssignees(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
    setResolutionSource('manual')
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="hologram-card p-6 w-full max-w-3xl">
        <h3 className="font-orbitron text-sw-red text-lg mb-2">Assignment Conflict Resolution</h3>
        <p className="text-sw-gray text-sm mb-6">
          Task: <span className="text-sw-light">{task.title}</span>
        </p>

        {/* Side by side comparison */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Miro Assignees */}
          <div className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
            resolutionSource === 'miro' ? 'border-sw-blue bg-sw-blue/10' : 'border-sw-gray/30 hover:border-sw-blue/50'
          }`} onClick={handleSelectMiro}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-orbitron text-sw-blue text-sm">MIRO ASSIGNEES</h4>
              {resolutionSource === 'miro' && <span className="text-sw-green">Selected</span>}
            </div>
            <div className="space-y-2">
              {task.miroAssignees.length > 0 ? (
                task.miroAssignees.map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2 bg-sw-darker/50 rounded">
                    <div className="w-8 h-8 rounded-full bg-sw-blue/20 flex items-center justify-center">
                      <span className="text-sw-blue text-xs font-bold">
                        {a.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sw-light text-sm">{a.name}</p>
                      <p className="text-sw-gray text-xs">{a.role}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sw-gray text-sm">No assignees from Miro</p>
              )}
            </div>
          </div>

          {/* Leapsome Assignees (from parent goal) */}
          <div className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
            resolutionSource === 'leapsome' ? 'border-sw-gold bg-sw-gold/10' : 'border-sw-gray/30 hover:border-sw-gold/50'
          }`} onClick={handleSelectLeapsome}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-orbitron text-sw-gold text-sm">LEAPSOME ASSIGNEES</h4>
              {resolutionSource === 'leapsome' && <span className="text-sw-green">Selected</span>}
            </div>
            <p className="text-sw-gray text-xs mb-2">From goal: {task.goal_title}</p>
            <div className="space-y-2">
              {task.leapsomeAssignees.length > 0 ? (
                task.leapsomeAssignees.map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2 bg-sw-darker/50 rounded">
                    <div className="w-8 h-8 rounded-full bg-sw-gold/20 flex items-center justify-center">
                      <span className="text-sw-gold text-xs font-bold">
                        {a.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sw-light text-sm">{a.name}</p>
                      <p className="text-sw-gray text-xs">{a.role}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sw-gray text-sm">No assignees from Leapsome</p>
              )}
            </div>
          </div>
        </div>

        {/* Manual Selection */}
        <div className="mb-6">
          <h4 className="font-orbitron text-sw-light text-sm mb-3">OR SELECT MANUALLY</h4>
          <div className="flex flex-wrap gap-2">
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => toggleAssignee(m.id)}
                className={`px-3 py-1 rounded text-sm transition-all ${
                  selectedAssignees.includes(m.id)
                    ? 'bg-sw-green/20 text-sw-green border border-sw-green'
                    : 'bg-sw-darker text-sw-gray border border-sw-gray/30 hover:border-sw-gold/50'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Preview */}
        <div className="mb-6 p-4 bg-sw-darker/50 rounded-lg">
          <h4 className="font-orbitron text-sw-green text-xs mb-2">RESOLUTION PREVIEW</h4>
          <div className="flex flex-wrap gap-2">
            {selectedAssignees.length > 0 ? (
              members
                .filter(m => selectedAssignees.includes(m.id))
                .map(m => (
                  <span key={m.id} className="px-3 py-1 bg-sw-green/20 text-sw-green text-sm rounded">
                    {m.name}
                  </span>
                ))
            ) : (
              <span className="text-sw-gray text-sm">No assignees selected</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onResolve(task.id, selectedAssignees, resolutionSource)}
            disabled={selectedAssignees.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            Confirm Resolution
          </button>
        </div>
      </div>
    </div>
  )
}
