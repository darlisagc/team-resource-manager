import { Router } from 'express'
import { getAll, getOne, run, deleteRow } from '../db/database.js'

const router = Router()

// Helper to recalculate and update tasks.actual_hours
function updateTaskActualHours(taskId) {
  const result = getOne(
    'SELECT COALESCE(SUM(hours_worked), 0) as total FROM task_time_entries WHERE task_id = ?',
    [taskId]
  )
  run(
    'UPDATE tasks SET actual_hours = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [result.total, taskId]
  )
  return result.total
}

// Get all time entries for a specific task
router.get('/tasks/:taskId/time-entries', (req, res) => {
  const { taskId } = req.params

  const task = getOne('SELECT id, title, actual_hours FROM tasks WHERE id = ?', [taskId])
  if (!task) {
    return res.status(404).json({ message: 'Task not found' })
  }

  const entries = getAll(`
    SELECT
      tte.id,
      tte.task_id,
      tte.team_member_id,
      tte.week_start,
      tte.hours_worked,
      tte.notes,
      tte.created_at,
      tte.updated_at,
      tm.name as member_name
    FROM task_time_entries tte
    JOIN team_members tm ON tte.team_member_id = tm.id
    WHERE tte.task_id = ?
    ORDER BY tte.week_start DESC, tm.name
  `, [taskId])

  res.json({
    task_id: parseInt(taskId),
    total_hours: task.actual_hours || 0,
    entries
  })
})

// Get all time entries for a specific week
router.get('/time-entries/week/:weekStart', (req, res) => {
  const { weekStart } = req.params

  const entries = getAll(`
    SELECT
      tte.id,
      tte.task_id,
      tte.team_member_id,
      tte.week_start,
      tte.hours_worked,
      tte.notes,
      tte.created_at,
      tte.updated_at,
      tm.name as member_name,
      t.title as task_title
    FROM task_time_entries tte
    JOIN team_members tm ON tte.team_member_id = tm.id
    JOIN tasks t ON tte.task_id = t.id
    WHERE tte.week_start = ?
    ORDER BY tm.name, t.title
  `, [weekStart])

  // Group by member
  const byMember = entries.reduce((acc, entry) => {
    if (!acc[entry.team_member_id]) {
      acc[entry.team_member_id] = {
        member_id: entry.team_member_id,
        member_name: entry.member_name,
        total_hours: 0,
        entries: []
      }
    }
    acc[entry.team_member_id].total_hours += entry.hours_worked
    acc[entry.team_member_id].entries.push(entry)
    return acc
  }, {})

  res.json({
    week_start: weekStart,
    members: Object.values(byMember),
    entries
  })
})

// Add or update time entry for a task
router.post('/tasks/:taskId/time-entries', (req, res) => {
  const { taskId } = req.params
  const { team_member_id, week_start, hours_worked, notes } = req.body

  // Validate task exists
  const task = getOne('SELECT * FROM tasks WHERE id = ?', [taskId])
  if (!task) {
    return res.status(404).json({ message: 'Task not found' })
  }

  // Validate team member exists
  const member = getOne('SELECT * FROM team_members WHERE id = ?', [team_member_id])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Validate required fields
  if (!week_start) {
    return res.status(400).json({ message: 'week_start is required' })
  }
  if (hours_worked === undefined || hours_worked === null) {
    return res.status(400).json({ message: 'hours_worked is required' })
  }
  if (hours_worked < 0) {
    return res.status(400).json({ message: 'hours_worked must be non-negative' })
  }

  // Check if entry exists (upsert)
  const existing = getOne(
    'SELECT * FROM task_time_entries WHERE task_id = ? AND team_member_id = ? AND week_start = ?',
    [taskId, team_member_id, week_start]
  )

  let entry
  if (existing) {
    // Update existing entry
    if (hours_worked === 0) {
      // Delete if hours is 0
      run('DELETE FROM task_time_entries WHERE id = ?', [existing.id])
      entry = null
    } else {
      run(
        'UPDATE task_time_entries SET hours_worked = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hours_worked, notes || null, existing.id]
      )
      entry = getOne('SELECT * FROM task_time_entries WHERE id = ?', [existing.id])
    }
  } else if (hours_worked > 0) {
    // Insert new entry (only if hours > 0)
    const result = run(
      'INSERT INTO task_time_entries (task_id, team_member_id, week_start, hours_worked, notes) VALUES (?, ?, ?, ?, ?)',
      [taskId, team_member_id, week_start, hours_worked, notes || null]
    )
    entry = getOne('SELECT * FROM task_time_entries WHERE id = ?', [result.lastInsertRowid])
  }

  // Update task's actual_hours
  const totalHours = updateTaskActualHours(taskId)

  res.json({
    entry,
    task_total_hours: totalHours
  })
})

// Delete a specific time entry
router.delete('/time-entries/:id', (req, res) => {
  const { id } = req.params

  const entry = getOne('SELECT * FROM task_time_entries WHERE id = ?', [id])
  if (!entry) {
    return res.status(404).json({ message: 'Time entry not found' })
  }

  const taskId = entry.task_id
  deleteRow('task_time_entries', 'id = ?', [id])

  // Update task's actual_hours
  const totalHours = updateTaskActualHours(taskId)

  res.json({
    message: 'Time entry deleted',
    task_total_hours: totalHours
  })
})

// Get time entries for a task for a specific week (convenience endpoint)
router.get('/tasks/:taskId/time-entries/week/:weekStart', (req, res) => {
  const { taskId, weekStart } = req.params

  const task = getOne('SELECT id, title, actual_hours FROM tasks WHERE id = ?', [taskId])
  if (!task) {
    return res.status(404).json({ message: 'Task not found' })
  }

  const entries = getAll(`
    SELECT
      tte.id,
      tte.task_id,
      tte.team_member_id,
      tte.week_start,
      tte.hours_worked,
      tte.notes,
      tm.name as member_name
    FROM task_time_entries tte
    JOIN team_members tm ON tte.team_member_id = tm.id
    WHERE tte.task_id = ? AND tte.week_start = ?
    ORDER BY tm.name
  `, [taskId, weekStart])

  // Calculate this week's total
  const weekTotal = entries.reduce((sum, e) => sum + e.hours_worked, 0)

  res.json({
    task_id: parseInt(taskId),
    week_start: weekStart,
    week_total: weekTotal,
    total_hours: task.actual_hours || 0,
    entries
  })
})

export default router
