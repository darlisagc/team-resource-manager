import { Router } from 'express'
import { getAll, getOne, insert, update, deleteRow, run } from '../db/database.js'

const router = Router()

// Helper: Ensure owner is in initiative_assignments as Lead
function ensureOwnerAssignment(initiativeId, ownerId) {
  if (!ownerId) return
  const existing = getOne(
    'SELECT id FROM initiative_assignments WHERE initiative_id = ? AND team_member_id = ?',
    [initiativeId, ownerId]
  )
  if (!existing) {
    insert('initiative_assignments', {
      initiative_id: initiativeId,
      team_member_id: ownerId,
      role: 'Lead',
      source: 'manual'
    })
  }
}

// Helper: Recalculate estimated_hours from assignment allocations
function recalculateEstimatedHours(initiativeId, weeksInQuarter = 13) {
  const assignments = getAll(
    'SELECT allocation_percentage FROM initiative_assignments WHERE initiative_id = ?',
    [initiativeId]
  )
  const totalPct = assignments.reduce((sum, a) => sum + (a.allocation_percentage || 0), 0)
  const hours = Math.round(totalPct / 100 * 40 * weeksInQuarter)
  update('initiatives', { estimated_hours: hours, updated_at: new Date().toISOString() }, 'id = ?', [initiativeId])
  return hours
}

// Helper: Recalculate Key Result progress from its initiatives
function recalculateKeyResultProgress(keyResultId) {
  const initiatives = getAll(
    "SELECT progress FROM initiatives WHERE key_result_id = ? AND status != 'cancelled'",
    [keyResultId]
  )

  if (initiatives.length === 0) return

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

// Get all initiatives with optional filters
router.get('/', (req, res) => {
  const { status, priority, team, key_result_id, goal_id, quarter } = req.query

  let sql = `
    SELECT
      i.*,
      kr.title as key_result_title,
      COALESCE(g.title, pg.title) as goal_title,
      COALESCE(g.quarter, pg.quarter) as goal_quarter,
      tm.name as owner_name,
      (SELECT COUNT(*) FROM initiative_assignments WHERE initiative_id = i.id) as assignment_count,
      (SELECT COUNT(*) FROM weekly_allocations WHERE initiative_id = i.id) as allocation_count,
      (SELECT COALESCE(SUM(allocation_percentage), 0) FROM initiative_assignments WHERE initiative_id = i.id) as total_allocation_pct
    FROM initiatives i
    LEFT JOIN key_results kr ON i.key_result_id = kr.id
    LEFT JOIN goals g ON kr.goal_id = g.id
    LEFT JOIN goals pg ON i.parent_goal_id = pg.id
    LEFT JOIN team_members tm ON i.owner_id = tm.id
    WHERE 1=1
  `
  const params = []

  if (status) {
    sql += ' AND i.status = ?'
    params.push(status)
  }
  if (priority) {
    sql += ' AND i.project_priority = ?'
    params.push(priority)
  }
  if (team) {
    sql += ' AND i.team = ?'
    params.push(team)
  }
  if (key_result_id) {
    sql += ' AND i.key_result_id = ?'
    params.push(key_result_id)
  }
  if (goal_id) {
    // Include initiatives linked via KR or directly via parent_goal_id
    sql += ' AND (kr.goal_id = ? OR i.parent_goal_id = ?)'
    params.push(goal_id, goal_id)
  }
  if (quarter) {
    sql += ' AND g.quarter = ?'
    params.push(quarter)
  }

  sql += ' ORDER BY i.project_priority, i.name'

  const initiatives = getAll(sql, params)
  res.json(initiatives)
})

// =============== Batch Assignments (placed before /:id routes) ===============

// Get assignments for multiple initiatives in a single query
router.get('/assignments/batch', (req, res) => {
  const { ids } = req.query
  if (!ids) {
    return res.status(400).json({ message: 'ids query parameter is required' })
  }

  const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  if (idList.length === 0) {
    return res.json({})
  }

  const placeholders = idList.map(() => '?').join(',')
  const assignments = getAll(`
    SELECT
      ia.*,
      tm.name as member_name,
      tm.email as member_email,
      tm.team as member_team,
      tm.role as member_role,
      tm.weekly_hours
    FROM initiative_assignments ia
    JOIN team_members tm ON ia.team_member_id = tm.id
    WHERE ia.initiative_id IN (${placeholders})
    ORDER BY
      ia.initiative_id,
      CASE ia.role
        WHEN 'Lead' THEN 1
        WHEN 'Contributor' THEN 2
        WHEN 'Support' THEN 3
      END,
      tm.name
  `, idList)

  // Group assignments by initiative_id
  const grouped = {}
  idList.forEach(id => {
    grouped[id] = []
  })
  assignments.forEach(a => {
    if (grouped[a.initiative_id]) {
      grouped[a.initiative_id].push(a)
    }
  })

  res.json(grouped)
})

// =============== Time Tracking (placed before /:id routes) ===============

// Helper: Recalculate actual_hours for an initiative
function recalculateInitiativeActualHours(initiativeId) {
  const total = getOne(
    'SELECT COALESCE(SUM(hours_worked), 0) as total FROM initiative_time_entries WHERE initiative_id = ?',
    [initiativeId]
  )
  update('initiatives', {
    actual_hours: total?.total || 0,
    updated_at: new Date().toISOString()
  }, 'id = ?', [initiativeId])
}

// Get all time entries for an initiative
router.get('/:id/time-entries', (req, res) => {
  const initiative = getOne('SELECT id, actual_hours FROM initiatives WHERE id = ?', [req.params.id])
  if (!initiative) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  const entries = getAll(`
    SELECT
      ite.*,
      tm.name as member_name
    FROM initiative_time_entries ite
    JOIN team_members tm ON ite.team_member_id = tm.id
    WHERE ite.initiative_id = ?
    ORDER BY ite.week_start DESC, tm.name
  `, [req.params.id])

  res.json({
    initiative_id: initiative.id,
    total_hours: initiative.actual_hours || 0,
    entries
  })
})

// Add or update time entry for an initiative
router.post('/:id/time-entries', (req, res) => {
  const { team_member_id, week_start, hours_worked, notes } = req.body

  if (!team_member_id || !week_start || hours_worked === undefined) {
    return res.status(400).json({ message: 'team_member_id, week_start, and hours_worked are required' })
  }

  const initiative = getOne('SELECT id FROM initiatives WHERE id = ?', [req.params.id])
  if (!initiative) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  const member = getOne('SELECT id, name FROM team_members WHERE id = ?', [team_member_id])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Check if entry exists for this week (upsert)
  const existing = getOne(
    'SELECT id FROM initiative_time_entries WHERE initiative_id = ? AND team_member_id = ? AND week_start = ?',
    [req.params.id, team_member_id, week_start]
  )

  if (existing) {
    // Update existing entry
    update('initiative_time_entries', {
      hours_worked,
      notes: notes || null,
      updated_at: new Date().toISOString()
    }, 'id = ?', [existing.id])
  } else {
    // Create new entry
    insert('initiative_time_entries', {
      initiative_id: req.params.id,
      team_member_id,
      week_start,
      hours_worked,
      notes: notes || null
    })
  }

  // Recalculate actual_hours
  recalculateInitiativeActualHours(req.params.id)

  const updatedInitiative = getOne('SELECT id, actual_hours FROM initiatives WHERE id = ?', [req.params.id])
  const entries = getAll(`
    SELECT ite.*, tm.name as member_name
    FROM initiative_time_entries ite
    JOIN team_members tm ON ite.team_member_id = tm.id
    WHERE ite.initiative_id = ?
    ORDER BY ite.week_start DESC, tm.name
  `, [req.params.id])

  res.json({
    initiative_id: req.params.id,
    total_hours: updatedInitiative?.actual_hours || 0,
    entries
  })
})

// Delete a time entry
router.delete('/time-entries/:entryId', (req, res) => {
  const entry = getOne('SELECT * FROM initiative_time_entries WHERE id = ?', [req.params.entryId])
  if (!entry) {
    return res.status(404).json({ message: 'Time entry not found' })
  }

  deleteRow('initiative_time_entries', 'id = ?', [req.params.entryId])

  // Recalculate actual_hours
  recalculateInitiativeActualHours(entry.initiative_id)

  res.json({ message: 'Time entry deleted' })
})

// Get single initiative with full hierarchy and assignments
router.get('/:id', (req, res) => {
  const initiative = getOne(`
    SELECT
      i.*,
      kr.title as key_result_title,
      kr.metric,
      kr.current_value,
      kr.target_value,
      kr.progress as kr_progress,
      g.id as goal_id,
      g.title as goal_title,
      g.quarter as goal_quarter,
      tm.name as owner_name
    FROM initiatives i
    LEFT JOIN key_results kr ON i.key_result_id = kr.id
    LEFT JOIN goals g ON kr.goal_id = g.id
    LEFT JOIN team_members tm ON i.owner_id = tm.id
    WHERE i.id = ?
  `, [req.params.id])

  if (!initiative) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  // Get assignments with member info
  const assignments = getAll(`
    SELECT
      ia.*,
      tm.name as member_name,
      tm.email as member_email,
      tm.team as member_team,
      tm.role as member_role,
      tm.weekly_hours
    FROM initiative_assignments ia
    JOIN team_members tm ON ia.team_member_id = tm.id
    WHERE ia.initiative_id = ?
    ORDER BY
      CASE ia.role
        WHEN 'Lead' THEN 1
        WHEN 'Contributor' THEN 2
        WHEN 'Support' THEN 3
      END,
      tm.name
  `, [req.params.id])

  res.json({
    ...initiative,
    assignments
  })
})

// Create initiative
router.post('/', (req, res) => {
  const { name, description, key_result_id, project_priority, team, status, owner_id, start_date, end_date, external_id, source, category, actual_hours, progress, tracker_url } = req.body

  if (!name) {
    return res.status(400).json({ message: 'Initiative name is required' })
  }

  const result = insert('initiatives', {
    external_id: external_id || null,
    name,
    description: description || null,
    key_result_id: key_result_id || null,
    project_priority: project_priority || null,
    team: team || null,
    status: status || 'active',
    owner_id: owner_id || null,
    start_date: start_date || null,
    end_date: end_date || null,
    source: source || 'manual',
    category: category || null,
    actual_hours: actual_hours || 0,
    progress: progress || 0,
    tracker_url: tracker_url || null
  })

  // Auto-assign owner to initiative_assignments
  ensureOwnerAssignment(result.lastInsertRowid, owner_id)

  const initiative = getOne('SELECT * FROM initiatives WHERE id = ?', [result.lastInsertRowid])
  res.status(201).json(initiative)
})

// Update initiative
router.put('/:id', (req, res) => {
  const existing = getOne('SELECT * FROM initiatives WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  const { name, description, key_result_id, parent_goal_id, project_priority, team, status, owner_id, start_date, end_date, estimated_hours, current_value, comment, link, updated_by, tracker_url } = req.body

  // If status is changing and there's a comment/link, record the update
  if (status && status !== existing.status) {
    insert('initiative_updates', {
      initiative_id: req.params.id,
      previous_status: existing.status,
      new_status: status,
      comment: comment || null,
      link: link || null,
      updated_by: updated_by || null
    })
  }

  // If status changes to completed, set progress to 100%
  let newProgress = existing.progress
  if (status === 'completed' && existing.status !== 'completed') {
    newProgress = 100
  }

  update('initiatives', {
    name: name !== undefined ? name : existing.name,
    description: description !== undefined ? description : existing.description,
    key_result_id: key_result_id !== undefined ? key_result_id : existing.key_result_id,
    parent_goal_id: parent_goal_id !== undefined ? parent_goal_id : existing.parent_goal_id,
    project_priority: project_priority !== undefined ? project_priority : existing.project_priority,
    team: team !== undefined ? team : existing.team,
    status: status !== undefined ? status : existing.status,
    owner_id: owner_id !== undefined ? owner_id : existing.owner_id,
    start_date: start_date !== undefined ? start_date : existing.start_date,
    end_date: end_date !== undefined ? end_date : existing.end_date,
    estimated_hours: estimated_hours !== undefined ? estimated_hours : existing.estimated_hours,
    current_value: current_value !== undefined ? current_value : existing.current_value,
    tracker_url: tracker_url !== undefined ? tracker_url : existing.tracker_url,
    progress: newProgress
  }, 'id = ?', [req.params.id])

  // Auto-assign new owner if owner changed
  const finalOwnerId = owner_id !== undefined ? owner_id : existing.owner_id
  if (finalOwnerId) {
    ensureOwnerAssignment(req.params.id, finalOwnerId)
  }

  // Cascade progress to Key Result and Goal
  const finalKeyResultId = key_result_id !== undefined ? key_result_id : existing.key_result_id
  if (finalKeyResultId) {
    recalculateKeyResultProgress(finalKeyResultId)
    const kr = getOne('SELECT goal_id FROM key_results WHERE id = ?', [finalKeyResultId])
    if (kr?.goal_id) {
      recalculateGoalProgress(kr.goal_id)
    }
  }

  const initiative = getOne(`
    SELECT i.*, kr.title as key_result_title,
      COALESCE(g.title, pg.title) as goal_title
    FROM initiatives i
    LEFT JOIN key_results kr ON i.key_result_id = kr.id
    LEFT JOIN goals g ON kr.goal_id = g.id
    LEFT JOIN goals pg ON i.parent_goal_id = pg.id
    WHERE i.id = ?
  `, [req.params.id])

  res.json(initiative)
})

// Quick update for estimated hours (PATCH)
router.patch('/:id/estimate', (req, res) => {
  const existing = getOne('SELECT * FROM initiatives WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  const { estimated_hours } = req.body

  update('initiatives', {
    estimated_hours: estimated_hours !== undefined ? estimated_hours : existing.estimated_hours,
    updated_at: new Date().toISOString()
  }, 'id = ?', [req.params.id])

  const initiative = getOne('SELECT * FROM initiatives WHERE id = ?', [req.params.id])
  res.json(initiative)
})

// Quick update for progress (PATCH)
router.patch('/:id/progress', (req, res) => {
  const existing = getOne('SELECT * FROM initiatives WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  const { progress, current_value } = req.body
  if (progress === undefined || progress < 0 || progress > 100) {
    return res.status(400).json({ message: 'Progress must be between 0 and 100' })
  }

  const roundedProgress = Math.round(progress)
  const updateFields = { progress: roundedProgress, updated_at: new Date().toISOString() }
  if (current_value !== undefined) {
    updateFields.current_value = current_value
  }
  if (roundedProgress >= 100 && existing.status !== 'completed' && existing.status !== 'cancelled' && existing.status !== 'on-hold') {
    updateFields.status = 'completed'
  }
  update('initiatives', updateFields, 'id = ?', [req.params.id])

  // Cascade: Recalculate Key Result and Goal progress
  if (existing.key_result_id) {
    recalculateKeyResultProgress(existing.key_result_id)
    const kr = getOne('SELECT goal_id FROM key_results WHERE id = ?', [existing.key_result_id])
    if (kr?.goal_id) {
      recalculateGoalProgress(kr.goal_id)
    }
  }

  const initiative = getOne('SELECT * FROM initiatives WHERE id = ?', [req.params.id])
  res.json(initiative)
})

// Assign initiative to a quarter (PATCH)
router.patch('/:id/quarter', (req, res) => {
  const existing = getOne('SELECT * FROM initiatives WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  const { quarter } = req.body
  // Allow empty/null to unassign
  const assignedQuarter = quarter || null

  update('initiatives', {
    assigned_quarter: assignedQuarter,
    updated_at: new Date().toISOString()
  }, 'id = ?', [req.params.id])

  const initiative = getOne(`
    SELECT i.*, kr.title as key_result_title, g.title as goal_title, g.quarter as goal_quarter
    FROM initiatives i
    LEFT JOIN key_results kr ON i.key_result_id = kr.id
    LEFT JOIN goals g ON kr.goal_id = g.id
    WHERE i.id = ?
  `, [req.params.id])

  res.json(initiative)
})

// Delete initiative
router.delete('/:id', (req, res) => {
  const existing = getOne('SELECT * FROM initiatives WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  deleteRow('initiatives', 'id = ?', [req.params.id])
  res.json({ message: 'Initiative deleted' })
})

// =============== Assignment Management ===============

// Get assignments for an initiative
router.get('/:id/assignments', (req, res) => {
  const initiative = getOne('SELECT id FROM initiatives WHERE id = ?', [req.params.id])
  if (!initiative) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  const assignments = getAll(`
    SELECT
      ia.*,
      tm.name as member_name,
      tm.email as member_email,
      tm.team as member_team,
      tm.role as member_role,
      tm.weekly_hours
    FROM initiative_assignments ia
    JOIN team_members tm ON ia.team_member_id = tm.id
    WHERE ia.initiative_id = ?
    ORDER BY
      CASE ia.role
        WHEN 'Lead' THEN 1
        WHEN 'Contributor' THEN 2
        WHEN 'Support' THEN 3
      END,
      tm.name
  `, [req.params.id])

  res.json(assignments)
})

// Add/update assignment
router.post('/:id/assignments', (req, res) => {
  const { team_member_id, role, allocation_percentage, start_date, end_date } = req.body

  if (!team_member_id) {
    return res.status(400).json({ message: 'team_member_id is required' })
  }

  const initiative = getOne('SELECT id FROM initiatives WHERE id = ?', [req.params.id])
  if (!initiative) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  const member = getOne('SELECT id FROM team_members WHERE id = ?', [team_member_id])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Check if assignment already exists (upsert)
  const existing = getOne(
    'SELECT id FROM initiative_assignments WHERE initiative_id = ? AND team_member_id = ?',
    [req.params.id, team_member_id]
  )

  if (existing) {
    // Update existing assignment
    update('initiative_assignments', {
      role: role || 'Contributor',
      allocation_percentage: allocation_percentage !== undefined ? allocation_percentage : null,
      start_date: start_date || null,
      end_date: end_date || null
    }, 'id = ?', [existing.id])

    // Recalculate estimated hours
    const newEstimatedHours = recalculateEstimatedHours(req.params.id)

    const updated = getOne(`
      SELECT ia.*, tm.name as member_name
      FROM initiative_assignments ia
      JOIN team_members tm ON ia.team_member_id = tm.id
      WHERE ia.id = ?
    `, [existing.id])
    return res.json({ ...updated, initiative_estimated_hours: newEstimatedHours })
  }

  // Create new assignment
  const result = insert('initiative_assignments', {
    initiative_id: req.params.id,
    team_member_id,
    role: role || 'Contributor',
    allocation_percentage: allocation_percentage !== undefined ? allocation_percentage : 0,
    start_date: start_date || null,
    end_date: end_date || null,
    source: 'manual'
  })

  // Recalculate estimated hours
  const newEstimatedHours = recalculateEstimatedHours(req.params.id)

  const newAssignment = getOne(`
    SELECT ia.*, tm.name as member_name
    FROM initiative_assignments ia
    JOIN team_members tm ON ia.team_member_id = tm.id
    WHERE ia.id = ?
  `, [result.lastInsertRowid])

  res.status(201).json({ ...newAssignment, initiative_estimated_hours: newEstimatedHours })
})

// Update assignment
router.put('/:id/assignments/:memberId', (req, res) => {
  const { role, allocation_percentage, start_date, end_date } = req.body

  const existing = getOne(
    'SELECT * FROM initiative_assignments WHERE initiative_id = ? AND team_member_id = ?',
    [req.params.id, req.params.memberId]
  )

  if (!existing) {
    return res.status(404).json({ message: 'Assignment not found' })
  }

  update('initiative_assignments', {
    role: role !== undefined ? role : existing.role,
    allocation_percentage: allocation_percentage !== undefined ? allocation_percentage : existing.allocation_percentage,
    start_date: start_date !== undefined ? start_date : existing.start_date,
    end_date: end_date !== undefined ? end_date : existing.end_date
  }, 'id = ?', [existing.id])

  // Recalculate estimated hours
  const newEstimatedHours = recalculateEstimatedHours(req.params.id)

  const updated = getOne(`
    SELECT ia.*, tm.name as member_name
    FROM initiative_assignments ia
    JOIN team_members tm ON ia.team_member_id = tm.id
    WHERE ia.id = ?
  `, [existing.id])

  res.json({ ...updated, initiative_estimated_hours: newEstimatedHours })
})

// Remove assignment
router.delete('/:id/assignments/:memberId', (req, res) => {
  const existing = getOne(
    'SELECT id FROM initiative_assignments WHERE initiative_id = ? AND team_member_id = ?',
    [req.params.id, req.params.memberId]
  )

  if (!existing) {
    return res.status(404).json({ message: 'Assignment not found' })
  }

  deleteRow('initiative_assignments', 'id = ?', [existing.id])

  // Recalculate estimated hours
  const newEstimatedHours = recalculateEstimatedHours(req.params.id)

  res.json({ message: 'Assignment removed', initiative_estimated_hours: newEstimatedHours })
})

// =============== Member's Initiatives ===============

// Get all initiatives for a team member
router.get('/member/:memberId', (req, res) => {
  const member = getOne('SELECT id FROM team_members WHERE id = ?', [req.params.memberId])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  const initiatives = getAll(`
    SELECT
      i.*,
      ia.role,
      ia.allocation_percentage,
      ia.start_date as assignment_start,
      ia.end_date as assignment_end,
      kr.title as key_result_title,
      g.title as goal_title
    FROM initiatives i
    JOIN initiative_assignments ia ON i.id = ia.initiative_id
    LEFT JOIN key_results kr ON i.key_result_id = kr.id
    LEFT JOIN goals g ON kr.goal_id = g.id
    WHERE ia.team_member_id = ?
    AND i.status = 'active'
    ORDER BY
      CASE ia.role
        WHEN 'Lead' THEN 1
        WHEN 'Contributor' THEN 2
        WHEN 'Support' THEN 3
      END,
      i.project_priority,
      i.name
  `, [req.params.memberId])

  res.json(initiatives)
})

// =============== Update History ===============

// Get update history for an initiative
router.get('/:id/updates', (req, res) => {
  const initiative = getOne('SELECT id FROM initiatives WHERE id = ?', [req.params.id])
  if (!initiative) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  const updates = getAll(`
    SELECT
      iu.*,
      tm.name as updated_by_name
    FROM initiative_updates iu
    LEFT JOIN team_members tm ON iu.updated_by = tm.id
    WHERE iu.initiative_id = ?
    ORDER BY iu.created_at DESC
  `, [req.params.id])

  res.json(updates)
})

// Add a comment/update without changing status
router.post('/:id/updates', (req, res) => {
  const { comment, link, updated_by } = req.body

  const initiative = getOne('SELECT * FROM initiatives WHERE id = ?', [req.params.id])
  if (!initiative) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  if (!comment && !link) {
    return res.status(400).json({ message: 'Comment or link is required' })
  }

  const result = insert('initiative_updates', {
    initiative_id: req.params.id,
    previous_status: initiative.status,
    new_status: initiative.status,
    comment: comment || null,
    link: link || null,
    updated_by: updated_by || null
  })

  const update = getOne(`
    SELECT iu.*, tm.name as updated_by_name
    FROM initiative_updates iu
    LEFT JOIN team_members tm ON iu.updated_by = tm.id
    WHERE iu.id = ?
  `, [result.lastInsertRowid])

  res.status(201).json(update)
})

export default router
