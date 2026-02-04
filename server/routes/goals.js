import { Router } from 'express'
import { getAll, getOne, insert, update, deleteRow, run } from '../db/database.js'

const router = Router()

// Get all goals with filters
router.get('/', (req, res) => {
  const { quarter, team, status } = req.query

  let sql = `
    SELECT
      g.*,
      tm.name as owner_name,
      (SELECT COUNT(*) FROM tasks WHERE parent_goal_id = g.id) as task_count,
      (SELECT COUNT(*) FROM tasks WHERE parent_goal_id = g.id AND status = 'done') as completed_tasks,
      (SELECT COALESCE(AVG(progress), 0) FROM key_results WHERE goal_id = g.id) as calculated_progress,
      (SELECT COALESCE(SUM(ite.hours_worked), 0)
       FROM initiative_time_entries ite
       JOIN initiatives i ON ite.initiative_id = i.id
       JOIN key_results kr ON i.key_result_id = kr.id
       WHERE kr.goal_id = g.id) as total_hours
    FROM goals g
    LEFT JOIN team_members tm ON g.owner_id = tm.id
    WHERE 1=1
  `
  const params = []

  if (quarter) {
    sql += ' AND g.quarter = ?'
    params.push(quarter)
  }
  if (team) {
    sql += ' AND g.team = ?'
    params.push(team)
  }
  if (status) {
    sql += ' AND g.status = ?'
    params.push(status)
  }

  sql += ' ORDER BY g.quarter DESC, g.title'

  const goals = getAll(sql, params)

  // Get assignees for each goal
  const goalsWithAssignees = goals.map(goal => {
    const assignees = getAll(`
      SELECT tm.id, tm.name, tm.role, ga.source
      FROM goal_assignees ga
      JOIN team_members tm ON ga.team_member_id = tm.id
      WHERE ga.goal_id = ?
    `, [goal.id])
    return {
      ...goal,
      progress: Math.round(goal.calculated_progress || 0),
      assignees
    }
  })

  res.json(goalsWithAssignees)
})

// Helper function to calculate goal progress from key results
function calculateGoalProgress(goalId) {
  const keyResults = getAll(`
    SELECT progress FROM key_results WHERE goal_id = ?
  `, [goalId])

  if (keyResults.length === 0) return 0

  const totalProgress = keyResults.reduce((sum, kr) => sum + (kr.progress || 0), 0)
  return Math.round(totalProgress / keyResults.length)
}

// Get single goal with tasks
router.get('/:id', (req, res) => {
  const goal = getOne(`
    SELECT g.*, tm.name as owner_name
    FROM goals g
    LEFT JOIN team_members tm ON g.owner_id = tm.id
    WHERE g.id = ?
  `, [req.params.id])

  if (!goal) {
    return res.status(404).json({ message: 'Goal not found' })
  }

  // Calculate progress from key results
  const calculatedProgress = calculateGoalProgress(goal.id)

  // Calculate total hours from initiatives
  const hoursResult = getOne(`
    SELECT COALESCE(SUM(i.actual_hours), 0) as total_hours
    FROM initiatives i
    JOIN key_results kr ON i.key_result_id = kr.id
    WHERE kr.goal_id = ?
  `, [req.params.id])

  const assignees = getAll(`
    SELECT tm.id, tm.name, tm.role, ga.source
    FROM goal_assignees ga
    JOIN team_members tm ON ga.team_member_id = tm.id
    WHERE ga.goal_id = ?
  `, [req.params.id])

  const tasks = getAll(`
    SELECT t.*,
      (SELECT GROUP_CONCAT(tm.name) FROM task_assignees ta
       JOIN team_members tm ON ta.team_member_id = tm.id
       WHERE ta.task_id = t.id) as assignee_names
    FROM tasks t
    WHERE t.parent_goal_id = ?
    ORDER BY t.priority DESC, t.title
  `, [req.params.id])

  res.json({
    ...goal,
    progress: calculatedProgress,
    total_hours: hoursResult?.total_hours || 0,
    assignees,
    tasks
  })
})

// Create goal
router.post('/', (req, res) => {
  const { title, description, quarter, status, owner_id, team, assignee_ids } = req.body

  if (!title || !quarter) {
    return res.status(400).json({ message: 'Title and quarter are required' })
  }

  const result = insert('goals', {
    title,
    description: description || null,
    quarter,
    status: status || 'active',
    owner_id: owner_id || null,
    team: team || null,
    source: 'manual'
  })

  // Add assignees
  if (assignee_ids && assignee_ids.length > 0) {
    const stmt = run
    assignee_ids.forEach(memberId => {
      run('INSERT INTO goal_assignees (goal_id, team_member_id, source) VALUES (?, ?, ?)',
        [result.lastInsertRowid, memberId, 'manual'])
    })
  }

  const goal = getOne('SELECT * FROM goals WHERE id = ?', [result.lastInsertRowid])
  res.status(201).json(goal)
})

// Update goal
router.put('/:id', (req, res) => {
  const { title, description, quarter, status, progress, owner_id, team } = req.body

  const existing = getOne('SELECT * FROM goals WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Goal not found' })
  }

  update('goals', {
    title: title || existing.title,
    description: description !== undefined ? description : existing.description,
    quarter: quarter || existing.quarter,
    status: status || existing.status,
    progress: progress !== undefined ? progress : existing.progress,
    owner_id: owner_id !== undefined ? owner_id : existing.owner_id,
    team: team !== undefined ? team : existing.team
  }, 'id = ?', [req.params.id])

  const goal = getOne('SELECT * FROM goals WHERE id = ?', [req.params.id])
  res.json(goal)
})

// Delete goal
router.delete('/:id', (req, res) => {
  const existing = getOne('SELECT * FROM goals WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Goal not found' })
  }

  deleteRow('goals', 'id = ?', [req.params.id])
  res.json({ message: 'Goal deleted' })
})

// Add assignee to goal
router.post('/:id/assignees', (req, res) => {
  const { team_member_id } = req.body

  if (!team_member_id) {
    return res.status(400).json({ message: 'team_member_id is required' })
  }

  const goal = getOne('SELECT * FROM goals WHERE id = ?', [req.params.id])
  if (!goal) {
    return res.status(404).json({ message: 'Goal not found' })
  }

  const member = getOne('SELECT * FROM team_members WHERE id = ?', [team_member_id])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Check if already assigned
  const existing = getOne(
    'SELECT * FROM goal_assignees WHERE goal_id = ? AND team_member_id = ?',
    [req.params.id, team_member_id]
  )

  if (existing) {
    return res.status(400).json({ message: 'Member already assigned to this goal' })
  }

  run('INSERT INTO goal_assignees (goal_id, team_member_id, source) VALUES (?, ?, ?)',
    [req.params.id, team_member_id, 'manual'])

  res.json({ message: 'Assignee added', member: { id: member.id, name: member.name } })
})

// Remove assignee from goal
router.delete('/:id/assignees/:memberId', (req, res) => {
  const goal = getOne('SELECT * FROM goals WHERE id = ?', [req.params.id])
  if (!goal) {
    return res.status(404).json({ message: 'Goal not found' })
  }

  const existing = getOne(
    'SELECT * FROM goal_assignees WHERE goal_id = ? AND team_member_id = ?',
    [req.params.id, req.params.memberId]
  )

  if (!existing) {
    return res.status(404).json({ message: 'Assignee not found' })
  }

  run('DELETE FROM goal_assignees WHERE goal_id = ? AND team_member_id = ?',
    [req.params.id, req.params.memberId])

  res.json({ message: 'Assignee removed' })
})

// Get key results with initiatives for a goal
router.get('/:id/key-results', (req, res) => {
  const goal = getOne('SELECT * FROM goals WHERE id = ?', [req.params.id])
  if (!goal) {
    return res.status(404).json({ message: 'Goal not found' })
  }

  const keyResults = getAll(`
    SELECT kr.*,
      tm.name as owner_name
    FROM key_results kr
    LEFT JOIN team_members tm ON kr.owner_id = tm.id
    WHERE kr.goal_id = ?
    ORDER BY kr.title
  `, [req.params.id])

  // Get initiatives and assignees for each key result
  const keyResultsWithData = keyResults.map(kr => {
    const initiatives = getAll(`
      SELECT i.*, tm.name as owner_name,
        COALESCE(i.actual_hours, 0) as actual_hours
      FROM initiatives i
      LEFT JOIN team_members tm ON i.owner_id = tm.id
      WHERE i.key_result_id = ?
      ORDER BY i.name
    `, [kr.id])

    // Get assignees for each initiative
    const initiativesWithAssignees = initiatives.map(init => {
      const assignees = getAll(`
        SELECT tm.id, tm.name
        FROM initiative_assignments ia
        JOIN team_members tm ON ia.team_member_id = tm.id
        WHERE ia.initiative_id = ?
      `, [init.id])
      return { ...init, assignees }
    })

    // Get assignees for key result
    const assignees = getAll(`
      SELECT tm.id, tm.name
      FROM key_result_assignees kra
      JOIN team_members tm ON kra.team_member_id = tm.id
      WHERE kra.key_result_id = ?
    `, [kr.id])

    return { ...kr, initiatives: initiativesWithAssignees, assignees }
  })

  res.json(keyResultsWithData)
})

// Get available quarters
router.get('/meta/quarters', (req, res) => {
  const quarters = getAll('SELECT DISTINCT quarter FROM goals ORDER BY quarter DESC')
  res.json(quarters.map(q => q.quarter))
})

export default router
