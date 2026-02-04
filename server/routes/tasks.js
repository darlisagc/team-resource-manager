import { Router } from 'express'
import { getAll, getOne, insert, update, deleteRow, run } from '../db/database.js'

const router = Router()

// Get all tasks with filters and conflict detection
router.get('/', (req, res) => {
  const { status, goal_id, unlinked, has_conflict } = req.query

  let sql = `
    SELECT
      t.*,
      g.title as goal_title,
      g.quarter as goal_quarter
    FROM tasks t
    LEFT JOIN goals g ON t.parent_goal_id = g.id
    WHERE 1=1
  `
  const params = []

  if (status) {
    sql += ' AND t.status = ?'
    params.push(status)
  }
  if (goal_id) {
    sql += ' AND t.parent_goal_id = ?'
    params.push(goal_id)
  }
  if (unlinked === 'true') {
    sql += ' AND t.parent_goal_id IS NULL'
  }

  sql += ' ORDER BY t.priority DESC, t.title'

  const tasks = getAll(sql, params)

  // Get assignees and detect conflicts for each task
  const tasksWithDetails = tasks.map(task => {
    // Get task assignees (from miro import or manual)
    const miroAssignees = getAll(`
      SELECT tm.id, tm.name, tm.role, ta.source
      FROM task_assignees ta
      JOIN team_members tm ON ta.team_member_id = tm.id
      WHERE ta.task_id = ?
    `, [task.id])

    // Get Leapsome assignees (from parent goal)
    let leapsomeAssignees = []
    if (task.parent_goal_id) {
      leapsomeAssignees = getAll(`
        SELECT tm.id, tm.name, tm.role, 'leapsome' as source
        FROM goal_assignees ga
        JOIN team_members tm ON ga.team_member_id = tm.id
        WHERE ga.goal_id = ?
      `, [task.parent_goal_id])
    }

    // Get resolved assignees
    const resolvedAssignees = getAll(`
      SELECT tm.id, tm.name, tm.role, ra.resolution_source
      FROM resolved_assignees ra
      JOIN team_members tm ON ra.team_member_id = tm.id
      WHERE ra.task_id = ?
    `, [task.id])

    // Detect conflict
    const miroIds = new Set(miroAssignees.map(a => a.id))
    const leapsomeIds = new Set(leapsomeAssignees.map(a => a.id))
    const hasConflict = miroAssignees.length > 0 && leapsomeAssignees.length > 0 &&
      ![...miroIds].every(id => leapsomeIds.has(id))

    return {
      ...task,
      miroAssignees,
      leapsomeAssignees,
      resolvedAssignees,
      hasConflict,
      isResolved: resolvedAssignees.length > 0
    }
  })

  // Filter by conflict if requested
  let result = tasksWithDetails
  if (has_conflict === 'true') {
    result = tasksWithDetails.filter(t => t.hasConflict && !t.isResolved)
  }

  res.json(result)
})

// Get single task with full details
router.get('/:id', (req, res) => {
  const task = getOne(`
    SELECT t.*, g.title as goal_title, g.quarter as goal_quarter
    FROM tasks t
    LEFT JOIN goals g ON t.parent_goal_id = g.id
    WHERE t.id = ?
  `, [req.params.id])

  if (!task) {
    return res.status(404).json({ message: 'Task not found' })
  }

  const miroAssignees = getAll(`
    SELECT tm.id, tm.name, tm.role
    FROM task_assignees ta
    JOIN team_members tm ON ta.team_member_id = tm.id
    WHERE ta.task_id = ? AND ta.source = 'miro'
  `, [req.params.id])

  let leapsomeAssignees = []
  if (task.parent_goal_id) {
    leapsomeAssignees = getAll(`
      SELECT tm.id, tm.name, tm.role
      FROM goal_assignees ga
      JOIN team_members tm ON ga.team_member_id = tm.id
      WHERE ga.goal_id = ?
    `, [task.parent_goal_id])
  }

  const resolvedAssignees = getAll(`
    SELECT tm.id, tm.name, tm.role, ra.resolution_source
    FROM resolved_assignees ra
    JOIN team_members tm ON ra.team_member_id = tm.id
    WHERE ra.task_id = ?
  `, [req.params.id])

  res.json({
    ...task,
    miroAssignees,
    leapsomeAssignees,
    resolvedAssignees
  })
})

// Create task
router.post('/', (req, res) => {
  const { title, description, status, effort_estimate, priority, parent_goal_id, assignee_ids } = req.body

  if (!title) {
    return res.status(400).json({ message: 'Title is required' })
  }

  const result = insert('tasks', {
    title,
    description: description || null,
    status: status || 'todo',
    effort_estimate: effort_estimate || null,
    priority: priority || 'medium',
    parent_goal_id: parent_goal_id || null,
    source: 'manual'
  })

  // Add assignees
  if (assignee_ids && assignee_ids.length > 0) {
    assignee_ids.forEach(memberId => {
      run('INSERT INTO task_assignees (task_id, team_member_id, source) VALUES (?, ?, ?)',
        [result.lastInsertRowid, memberId, 'manual'])
    })
  }

  const task = getOne('SELECT * FROM tasks WHERE id = ?', [result.lastInsertRowid])
  res.status(201).json(task)
})

// Update task
router.put('/:id', (req, res) => {
  const { title, description, status, effort_estimate, actual_hours, priority, parent_goal_id } = req.body

  const existing = getOne('SELECT * FROM tasks WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Task not found' })
  }

  update('tasks', {
    title: title || existing.title,
    description: description !== undefined ? description : existing.description,
    status: status || existing.status,
    effort_estimate: effort_estimate !== undefined ? effort_estimate : existing.effort_estimate,
    actual_hours: actual_hours !== undefined ? actual_hours : existing.actual_hours,
    priority: priority || existing.priority,
    parent_goal_id: parent_goal_id !== undefined ? parent_goal_id : existing.parent_goal_id
  }, 'id = ?', [req.params.id])

  const task = getOne('SELECT * FROM tasks WHERE id = ?', [req.params.id])
  res.json(task)
})

// Link task to goal
router.post('/:id/link', (req, res) => {
  const { goal_id } = req.body

  const task = getOne('SELECT * FROM tasks WHERE id = ?', [req.params.id])
  if (!task) {
    return res.status(404).json({ message: 'Task not found' })
  }

  if (goal_id) {
    const goal = getOne('SELECT * FROM goals WHERE id = ?', [goal_id])
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' })
    }
  }

  update('tasks', { parent_goal_id: goal_id || null }, 'id = ?', [req.params.id])

  const updatedTask = getOne('SELECT * FROM tasks WHERE id = ?', [req.params.id])
  res.json(updatedTask)
})

// Resolve assignment conflict
router.put('/:id/resolve', (req, res) => {
  const { assignee_ids, resolution_source } = req.body

  const task = getOne('SELECT * FROM tasks WHERE id = ?', [req.params.id])
  if (!task) {
    return res.status(404).json({ message: 'Task not found' })
  }

  if (!assignee_ids || assignee_ids.length === 0) {
    return res.status(400).json({ message: 'At least one assignee is required' })
  }

  // Clear existing resolved assignees
  deleteRow('resolved_assignees', 'task_id = ?', [req.params.id])

  // Add new resolved assignees
  assignee_ids.forEach(memberId => {
    run('INSERT INTO resolved_assignees (task_id, team_member_id, resolution_source) VALUES (?, ?, ?)',
      [req.params.id, memberId, resolution_source || 'manual'])
  })

  const resolvedAssignees = getAll(`
    SELECT tm.id, tm.name, tm.role, ra.resolution_source
    FROM resolved_assignees ra
    JOIN team_members tm ON ra.team_member_id = tm.id
    WHERE ra.task_id = ?
  `, [req.params.id])

  res.json({
    ...task,
    resolvedAssignees
  })
})

// Add assignee to task
router.post('/:id/assignees', (req, res) => {
  const { team_member_id } = req.body
  const taskId = req.params.id

  const task = getOne('SELECT * FROM tasks WHERE id = ?', [taskId])
  if (!task) {
    return res.status(404).json({ message: 'Task not found' })
  }

  // Check if already assigned
  const existing = getOne(
    'SELECT * FROM task_assignees WHERE task_id = ? AND team_member_id = ?',
    [taskId, team_member_id]
  )
  if (existing) {
    return res.status(400).json({ message: 'Already assigned' })
  }

  run('INSERT INTO task_assignees (task_id, team_member_id, source) VALUES (?, ?, ?)',
    [taskId, team_member_id, 'manual'])

  res.json({ message: 'Assignee added' })
})

// Remove assignee from task
router.delete('/:id/assignees/:memberId', (req, res) => {
  const { id: taskId, memberId } = req.params

  const task = getOne('SELECT * FROM tasks WHERE id = ?', [taskId])
  if (!task) {
    return res.status(404).json({ message: 'Task not found' })
  }

  deleteRow('task_assignees', 'task_id = ? AND team_member_id = ?', [taskId, memberId])
  res.json({ message: 'Assignee removed' })
})

// Delete task
router.delete('/:id', (req, res) => {
  const existing = getOne('SELECT * FROM tasks WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Task not found' })
  }

  deleteRow('tasks', 'id = ?', [req.params.id])
  res.json({ message: 'Task deleted' })
})

export default router
