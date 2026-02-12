import { Router } from 'express'
import { getAll, getOne, insert, update, deleteRow, run } from '../db/database.js'

const router = Router()

// Helper: Ensure owner is in key_result_assignees
function ensureOwnerAssignment(keyResultId, ownerId) {
  if (!ownerId) return
  const existing = getOne(
    'SELECT id FROM key_result_assignees WHERE key_result_id = ? AND team_member_id = ?',
    [keyResultId, ownerId]
  )
  if (!existing) {
    insert('key_result_assignees', {
      key_result_id: keyResultId,
      team_member_id: ownerId,
      source: 'manual'
    })
  }
}

// Helper: Recalculate Goal progress from its key results
function recalculateGoalProgress(goalId) {
  const keyResults = getAll(
    "SELECT progress FROM key_results WHERE goal_id = ? AND status != 'cancelled'",
    [goalId]
  )

  if (keyResults.length === 0) return

  const avgProgress = keyResults.reduce((sum, kr) => sum + (kr.progress || 0), 0) / keyResults.length
  update('goals', {
    progress: Math.round(avgProgress),
    updated_at: new Date().toISOString()
  }, 'id = ?', [goalId])
}

// Get all key results with optional filters
router.get('/', (req, res) => {
  const { goal_id, status, quarter, assignee_id, bau } = req.query

  // Special case: fetch BAU (Business as Usual) key result
  if (bau === 'true') {
    const bauKeyResults = getAll(`
      SELECT
        kr.*,
        g.title as goal_title,
        g.quarter,
        tm.name as owner_name
      FROM key_results kr
      JOIN goals g ON kr.goal_id = g.id
      LEFT JOIN team_members tm ON kr.owner_id = tm.id
      WHERE g.title LIKE '%Business as Usual%'
      ORDER BY kr.id
      LIMIT 1
    `)
    return res.json(bauKeyResults)
  }

  let sql = `
    SELECT
      kr.*,
      g.title as goal_title,
      g.quarter,
      tm.name as owner_name,
      (SELECT COUNT(*) FROM initiatives WHERE key_result_id = kr.id) as initiative_count,
      (SELECT COUNT(*) FROM key_result_assignees WHERE key_result_id = kr.id) as assignee_count
    FROM key_results kr
    JOIN goals g ON kr.goal_id = g.id
    LEFT JOIN team_members tm ON kr.owner_id = tm.id
    WHERE 1=1
  `
  const params = []

  if (goal_id) {
    sql += ' AND kr.goal_id = ?'
    params.push(goal_id)
  }
  if (status) {
    sql += ' AND kr.status = ?'
    params.push(status)
  }
  if (quarter) {
    sql += ' AND g.quarter = ?'
    params.push(quarter)
  }
  if (assignee_id) {
    sql += ' AND kr.id IN (SELECT key_result_id FROM key_result_assignees WHERE team_member_id = ?)'
    params.push(assignee_id)
  }

  sql += ' ORDER BY g.quarter DESC, g.title, kr.title'

  const keyResults = getAll(sql, params)
  res.json(keyResults)
})

// Get single key result with initiatives
router.get('/:id', (req, res) => {
  const keyResult = getOne(`
    SELECT
      kr.*,
      g.title as goal_title,
      g.quarter,
      g.status as goal_status,
      tm.name as owner_name
    FROM key_results kr
    JOIN goals g ON kr.goal_id = g.id
    LEFT JOIN team_members tm ON kr.owner_id = tm.id
    WHERE kr.id = ?
  `, [req.params.id])

  if (!keyResult) {
    return res.status(404).json({ message: 'Key Result not found' })
  }

  // Get assignees
  const assignees = getAll(`
    SELECT
      kra.*,
      tm.name as member_name,
      tm.email,
      tm.team,
      tm.role as member_role
    FROM key_result_assignees kra
    JOIN team_members tm ON kra.team_member_id = tm.id
    WHERE kra.key_result_id = ?
    ORDER BY tm.name
  `, [req.params.id])

  // Get initiatives under this key result
  const initiatives = getAll(`
    SELECT
      i.*,
      tm.name as owner_name,
      (SELECT COUNT(*) FROM initiative_assignments WHERE initiative_id = i.id) as assignment_count
    FROM initiatives i
    LEFT JOIN team_members tm ON i.owner_id = tm.id
    WHERE i.key_result_id = ?
    ORDER BY i.project_priority, i.name
  `, [req.params.id])

  res.json({
    ...keyResult,
    assignees,
    initiatives
  })
})

// Create key result
router.post('/', (req, res) => {
  const { goal_id, title, description, owner_id, metric, current_value, target_value, status, external_id, source } = req.body

  if (!goal_id || !title) {
    return res.status(400).json({ message: 'goal_id and title are required' })
  }

  // Verify goal exists
  const goal = getOne('SELECT id FROM goals WHERE id = ?', [goal_id])
  if (!goal) {
    return res.status(404).json({ message: 'Goal not found' })
  }

  const result = insert('key_results', {
    external_id: external_id || null,
    title,
    description: description || null,
    goal_id,
    owner_id: owner_id || null,
    metric: metric || null,
    current_value: current_value || null,
    target_value: target_value || null,
    progress: 0,
    status: status || 'active',
    source: source || 'manual'
  })

  // Auto-assign owner to key_result_assignees
  ensureOwnerAssignment(result.lastInsertRowid, owner_id)

  const keyResult = getOne(`
    SELECT kr.*, g.title as goal_title, g.quarter
    FROM key_results kr
    JOIN goals g ON kr.goal_id = g.id
    WHERE kr.id = ?
  `, [result.lastInsertRowid])

  res.status(201).json(keyResult)
})

// Helper: Recalculate Key Result progress from its initiatives
function recalculateKeyResultProgress(keyResultId) {
  const initiatives = getAll(
    "SELECT progress FROM initiatives WHERE key_result_id = ? AND status != 'cancelled'",
    [keyResultId]
  )

  if (initiatives.length === 0) return null

  const avgProgress = initiatives.reduce((sum, i) => sum + (i.progress || 0), 0) / initiatives.length
  const rounded = Math.round(avgProgress)

  const updateFields = { progress: rounded, updated_at: new Date().toISOString() }
  if (rounded >= 100) {
    const kr = getOne('SELECT status FROM key_results WHERE id = ?', [keyResultId])
    if (kr && kr.status !== 'completed' && kr.status !== 'cancelled') {
      updateFields.status = 'completed'
    }
  }
  update('key_results', updateFields, 'id = ?', [keyResultId])

  return rounded
}

// Update key result
router.put('/:id', (req, res) => {
  const existing = getOne('SELECT * FROM key_results WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Key Result not found' })
  }

  const { title, description, owner_id, metric, current_value, target_value, progress, status, comment, link, updated_by } = req.body

  // If status is changing, record the update
  if (status && status !== existing.status) {
    insert('key_result_updates', {
      key_result_id: req.params.id,
      previous_status: existing.status,
      new_status: status,
      comment: comment || null,
      link: link || null,
      updated_by: updated_by || null
    })
  }

  // Determine final progress:
  // 1. If progress is explicitly passed, use it
  // 2. Otherwise, if target_value exists, calculate from current/target
  // 3. Otherwise, keep existing
  const finalCurrentValue = current_value !== undefined ? current_value : existing.current_value
  const finalTargetValue = target_value !== undefined ? target_value : existing.target_value

  let finalProgress = existing.progress || 0
  if (progress !== undefined) {
    // Manual progress update
    finalProgress = progress
  } else if (finalTargetValue > 0 && finalCurrentValue !== null && finalCurrentValue !== undefined) {
    // Auto-calculate from current/target values
    finalProgress = Math.round((finalCurrentValue / finalTargetValue) * 100)
  }

  update('key_results', {
    title: title !== undefined ? title : existing.title,
    description: description !== undefined ? description : existing.description,
    owner_id: owner_id !== undefined ? owner_id : existing.owner_id,
    metric: metric !== undefined ? metric : existing.metric,
    current_value: finalCurrentValue,
    target_value: finalTargetValue,
    progress: finalProgress,
    status: status !== undefined ? status : existing.status
  }, 'id = ?', [req.params.id])

  // Auto-assign new owner if owner changed
  const finalOwnerId = owner_id !== undefined ? owner_id : existing.owner_id
  if (finalOwnerId) {
    ensureOwnerAssignment(req.params.id, finalOwnerId)
  }

  // Cascade: Recalculate Goal progress
  if (existing.goal_id) {
    recalculateGoalProgress(existing.goal_id)
  }

  const keyResult = getOne(`
    SELECT kr.*, g.title as goal_title, g.quarter
    FROM key_results kr
    JOIN goals g ON kr.goal_id = g.id
    WHERE kr.id = ?
  `, [req.params.id])

  res.json(keyResult)
})

// Delete key result
router.delete('/:id', (req, res) => {
  const existing = getOne('SELECT * FROM key_results WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Key Result not found' })
  }

  deleteRow('key_results', 'id = ?', [req.params.id])
  res.json({ message: 'Key Result deleted' })
})

// Quick update for estimated hours (PATCH)
router.patch('/:id/estimate', (req, res) => {
  const existing = getOne('SELECT * FROM key_results WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Key Result not found' })
  }

  const { estimated_hours } = req.body
  update('key_results', {
    estimated_hours: estimated_hours !== undefined ? estimated_hours : existing.estimated_hours,
    updated_at: new Date().toISOString()
  }, 'id = ?', [req.params.id])

  res.json({ ...existing, estimated_hours: estimated_hours || 0 })
})

// Assign key result to a quarter (PATCH)
router.patch('/:id/quarter', (req, res) => {
  const existing = getOne('SELECT * FROM key_results WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Key Result not found' })
  }

  const { quarter } = req.body
  const assignedQuarter = quarter || null

  update('key_results', {
    assigned_quarter: assignedQuarter,
    updated_at: new Date().toISOString()
  }, 'id = ?', [req.params.id])

  const updated = getOne(`
    SELECT kr.*, g.title as goal_title, g.quarter as goal_quarter
    FROM key_results kr
    LEFT JOIN goals g ON kr.goal_id = g.id
    WHERE kr.id = ?
  `, [req.params.id])

  res.json(updated)
})

// =============== Assignee Management ===============

// Add assignee to key result
router.post('/:id/assignees', (req, res) => {
  const { team_member_id } = req.body

  if (!team_member_id) {
    return res.status(400).json({ message: 'team_member_id is required' })
  }

  const keyResult = getOne('SELECT id FROM key_results WHERE id = ?', [req.params.id])
  if (!keyResult) {
    return res.status(404).json({ message: 'Key Result not found' })
  }

  const member = getOne('SELECT id, name FROM team_members WHERE id = ?', [team_member_id])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Check if already assigned
  const existing = getOne(
    'SELECT id FROM key_result_assignees WHERE key_result_id = ? AND team_member_id = ?',
    [req.params.id, team_member_id]
  )

  if (existing) {
    return res.status(400).json({ message: 'Member already assigned' })
  }

  const result = insert('key_result_assignees', {
    key_result_id: req.params.id,
    team_member_id,
    source: 'manual'
  })

  res.status(201).json({
    id: result.lastInsertRowid,
    key_result_id: req.params.id,
    team_member_id,
    member_name: member.name
  })
})

// Remove assignee from key result
router.delete('/:id/assignees/:memberId', (req, res) => {
  const existing = getOne(
    'SELECT id FROM key_result_assignees WHERE key_result_id = ? AND team_member_id = ?',
    [req.params.id, req.params.memberId]
  )

  if (!existing) {
    return res.status(404).json({ message: 'Assignee not found' })
  }

  deleteRow('key_result_assignees', 'id = ?', [existing.id])
  res.json({ message: 'Assignee removed' })
})

// =============== Hierarchy View ===============

// Get full hierarchy for a goal (Goal → Key Results → Initiatives)
router.get('/hierarchy/:goalId', (req, res) => {
  const goal = getOne(`
    SELECT g.*, tm.name as owner_name
    FROM goals g
    LEFT JOIN team_members tm ON g.owner_id = tm.id
    WHERE g.id = ?
  `, [req.params.goalId])

  if (!goal) {
    return res.status(404).json({ message: 'Goal not found' })
  }

  // Get all key results for this goal
  const keyResults = getAll(`
    SELECT
      kr.*,
      tm.name as owner_name
    FROM key_results kr
    LEFT JOIN team_members tm ON kr.owner_id = tm.id
    WHERE kr.goal_id = ?
    ORDER BY kr.title
  `, [req.params.goalId])

  // Get all initiatives grouped by key result
  const initiatives = getAll(`
    SELECT
      i.*,
      tm.name as owner_name
    FROM initiatives i
    LEFT JOIN team_members tm ON i.owner_id = tm.id
    WHERE i.key_result_id IN (SELECT id FROM key_results WHERE goal_id = ?)
    ORDER BY i.key_result_id, i.project_priority, i.name
  `, [req.params.goalId])

  // Build hierarchy
  const hierarchy = {
    ...goal,
    key_results: keyResults.map(kr => ({
      ...kr,
      initiatives: initiatives.filter(i => i.key_result_id === kr.id)
    }))
  }

  res.json(hierarchy)
})

// =============== Update History ===============

// Get update history for a key result
router.get('/:id/updates', (req, res) => {
  const keyResult = getOne('SELECT id FROM key_results WHERE id = ?', [req.params.id])
  if (!keyResult) {
    return res.status(404).json({ message: 'Key Result not found' })
  }

  const updates = getAll(`
    SELECT
      kru.*,
      tm.name as updated_by_name
    FROM key_result_updates kru
    LEFT JOIN team_members tm ON kru.updated_by = tm.id
    WHERE kru.key_result_id = ?
    ORDER BY kru.created_at DESC
  `, [req.params.id])

  res.json(updates)
})

// Add a comment/update without changing status
router.post('/:id/updates', (req, res) => {
  const { comment, link, updated_by } = req.body

  const keyResult = getOne('SELECT * FROM key_results WHERE id = ?', [req.params.id])
  if (!keyResult) {
    return res.status(404).json({ message: 'Key Result not found' })
  }

  if (!comment && !link) {
    return res.status(400).json({ message: 'Comment or link is required' })
  }

  const result = insert('key_result_updates', {
    key_result_id: req.params.id,
    previous_status: keyResult.status,
    new_status: keyResult.status,
    comment: comment || null,
    link: link || null,
    updated_by: updated_by || null
  })

  const update = getOne(`
    SELECT kru.*, tm.name as updated_by_name
    FROM key_result_updates kru
    LEFT JOIN team_members tm ON kru.updated_by = tm.id
    WHERE kru.id = ?
  `, [result.lastInsertRowid])

  res.status(201).json(update)
})

export default router
