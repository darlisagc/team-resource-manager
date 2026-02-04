import { Router } from 'express'
import { getAll, getOne, insert, update, deleteRow, run, transaction } from '../db/database.js'

const router = Router()

// Helper: Get Monday of a given week
function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// Helper: Get week range from start_date to end_date
function getWeeksBetween(startDate, endDate) {
  const weeks = []
  let current = new Date(getMonday(startDate))
  const end = new Date(getMonday(endDate))

  while (current <= end) {
    weeks.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 7)
  }

  return weeks
}

// Get weekly allocations with filters
router.get('/', (req, res) => {
  const { team_member_id, initiative_id, week_start, start_date, end_date, status } = req.query

  let sql = `
    SELECT
      wa.*,
      tm.name as member_name,
      tm.team as member_team,
      tm.weekly_hours,
      i.name as initiative_name,
      i.project_priority,
      ir.role
    FROM weekly_allocations wa
    JOIN team_members tm ON wa.team_member_id = tm.id
    JOIN initiatives i ON wa.initiative_id = i.id
    LEFT JOIN initiative_roles ir ON ir.initiative_id = wa.initiative_id AND ir.team_member_id = wa.team_member_id
    WHERE 1=1
  `
  const params = []

  if (team_member_id) {
    sql += ' AND wa.team_member_id = ?'
    params.push(team_member_id)
  }
  if (initiative_id) {
    sql += ' AND wa.initiative_id = ?'
    params.push(initiative_id)
  }
  if (week_start) {
    sql += ' AND wa.week_start = ?'
    params.push(getMonday(week_start))
  }
  if (start_date) {
    sql += ' AND wa.week_start >= ?'
    params.push(getMonday(start_date))
  }
  if (end_date) {
    sql += ' AND wa.week_start <= ?'
    params.push(getMonday(end_date))
  }
  if (status) {
    sql += ' AND wa.status = ?'
    params.push(status)
  }

  sql += ' ORDER BY wa.week_start DESC, tm.name, i.name'

  const allocations = getAll(sql, params)
  res.json(allocations)
})

// Get allocations for a specific member for a week
router.get('/member/:memberId', (req, res) => {
  const { week_start, start_date, end_date } = req.query

  const member = getOne('SELECT * FROM team_members WHERE id = ?', [req.params.memberId])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  let sql = `
    SELECT
      wa.*,
      i.name as initiative_name,
      i.project_priority,
      i.status as initiative_status,
      ir.role
    FROM weekly_allocations wa
    JOIN initiatives i ON wa.initiative_id = i.id
    LEFT JOIN initiative_roles ir ON ir.initiative_id = wa.initiative_id AND ir.team_member_id = wa.team_member_id
    WHERE wa.team_member_id = ?
  `
  const params = [req.params.memberId]

  if (week_start) {
    sql += ' AND wa.week_start = ?'
    params.push(getMonday(week_start))
  }
  if (start_date) {
    sql += ' AND wa.week_start >= ?'
    params.push(getMonday(start_date))
  }
  if (end_date) {
    sql += ' AND wa.week_start <= ?'
    params.push(getMonday(end_date))
  }

  sql += ' ORDER BY wa.week_start, i.project_priority, i.name'

  const allocations = getAll(sql, params)

  // Calculate totals per week
  const weeklyTotals = {}
  allocations.forEach(a => {
    if (!weeklyTotals[a.week_start]) {
      weeklyTotals[a.week_start] = 0
    }
    weeklyTotals[a.week_start] += a.allocation_percentage
  })

  res.json({
    member,
    allocations,
    weeklyTotals
  })
})

// Get summary for a week (all members)
router.get('/summary', (req, res) => {
  const { week_start } = req.query

  if (!week_start) {
    return res.status(400).json({ message: 'week_start is required' })
  }

  const weekDate = getMonday(week_start)

  const summary = getAll(`
    SELECT
      tm.id,
      tm.name,
      tm.team,
      tm.weekly_hours,
      COALESCE(SUM(wa.allocation_percentage), 0) as total_allocation,
      COUNT(wa.id) as initiative_count
    FROM team_members tm
    LEFT JOIN weekly_allocations wa ON tm.id = wa.team_member_id AND wa.week_start = ?
    GROUP BY tm.id
    ORDER BY tm.name
  `, [weekDate])

  res.json({
    week_start: weekDate,
    members: summary
  })
})

// Create or update a single weekly allocation
router.post('/', (req, res) => {
  const { team_member_id, initiative_id, week_start, allocation_percentage, status, notes } = req.body

  if (!team_member_id || !initiative_id || !week_start || allocation_percentage === undefined) {
    return res.status(400).json({
      message: 'team_member_id, initiative_id, week_start, and allocation_percentage are required'
    })
  }

  const weekDate = getMonday(week_start)

  // Check member exists
  const member = getOne('SELECT id FROM team_members WHERE id = ?', [team_member_id])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Check initiative exists
  const initiative = getOne('SELECT id FROM initiatives WHERE id = ?', [initiative_id])
  if (!initiative) {
    return res.status(404).json({ message: 'Initiative not found' })
  }

  // Check if allocation already exists (upsert)
  const existing = getOne(
    'SELECT id FROM weekly_allocations WHERE team_member_id = ? AND initiative_id = ? AND week_start = ?',
    [team_member_id, initiative_id, weekDate]
  )

  if (existing) {
    // Update existing
    update('weekly_allocations', {
      allocation_percentage,
      status: status || 'planned',
      notes: notes || null
    }, 'id = ?', [existing.id])

    const updated = getOne(`
      SELECT wa.*, i.name as initiative_name, tm.name as member_name
      FROM weekly_allocations wa
      JOIN initiatives i ON wa.initiative_id = i.id
      JOIN team_members tm ON wa.team_member_id = tm.id
      WHERE wa.id = ?
    `, [existing.id])

    return res.json(updated)
  }

  // Create new
  const result = insert('weekly_allocations', {
    team_member_id,
    initiative_id,
    week_start: weekDate,
    allocation_percentage,
    status: status || 'planned',
    notes: notes || null,
    created_by: req.user?.id || null
  })

  const allocation = getOne(`
    SELECT wa.*, i.name as initiative_name, tm.name as member_name
    FROM weekly_allocations wa
    JOIN initiatives i ON wa.initiative_id = i.id
    JOIN team_members tm ON wa.team_member_id = tm.id
    WHERE wa.id = ?
  `, [result.lastInsertRowid])

  res.status(201).json(allocation)
})

// Bulk update allocations for a member for a week
router.post('/bulk', (req, res) => {
  const { team_member_id, week_start, allocations } = req.body

  if (!team_member_id || !week_start || !Array.isArray(allocations)) {
    return res.status(400).json({
      message: 'team_member_id, week_start, and allocations array are required'
    })
  }

  const weekDate = getMonday(week_start)

  // Validate member
  const member = getOne('SELECT id FROM team_members WHERE id = ?', [team_member_id])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Calculate total to check if exceeds 100%
  const totalAllocation = allocations.reduce((sum, a) => sum + (a.allocation_percentage || 0), 0)

  try {
    const results = []

    // Delete existing allocations for this member/week that aren't in the new list
    const initiativeIds = allocations.map(a => a.initiative_id).filter(Boolean)
    if (initiativeIds.length > 0) {
      run(
        `DELETE FROM weekly_allocations
         WHERE team_member_id = ? AND week_start = ?
         AND initiative_id NOT IN (${initiativeIds.map(() => '?').join(',')})`,
        [team_member_id, weekDate, ...initiativeIds]
      )
    } else {
      // If no allocations provided, delete all for this week
      run(
        'DELETE FROM weekly_allocations WHERE team_member_id = ? AND week_start = ?',
        [team_member_id, weekDate]
      )
    }

    // Upsert each allocation
    for (const alloc of allocations) {
      if (!alloc.initiative_id || alloc.allocation_percentage === undefined) continue

      const existing = getOne(
        'SELECT id FROM weekly_allocations WHERE team_member_id = ? AND initiative_id = ? AND week_start = ?',
        [team_member_id, alloc.initiative_id, weekDate]
      )

      if (existing) {
        update('weekly_allocations', {
          allocation_percentage: alloc.allocation_percentage,
          status: alloc.status || 'planned',
          notes: alloc.notes || null
        }, 'id = ?', [existing.id])
        results.push({ id: existing.id, action: 'updated' })
      } else {
        const result = insert('weekly_allocations', {
          team_member_id,
          initiative_id: alloc.initiative_id,
          week_start: weekDate,
          allocation_percentage: alloc.allocation_percentage,
          status: alloc.status || 'planned',
          notes: alloc.notes || null,
          created_by: req.user?.id || null
        })
        results.push({ id: result.lastInsertRowid, action: 'created' })
      }
    }

    // Fetch the updated allocations
    const updatedAllocations = getAll(`
      SELECT wa.*, i.name as initiative_name, ir.role
      FROM weekly_allocations wa
      JOIN initiatives i ON wa.initiative_id = i.id
      LEFT JOIN initiative_roles ir ON ir.initiative_id = wa.initiative_id AND ir.team_member_id = wa.team_member_id
      WHERE wa.team_member_id = ? AND wa.week_start = ?
      ORDER BY i.project_priority, i.name
    `, [team_member_id, weekDate])

    res.json({
      week_start: weekDate,
      total_allocation: totalAllocation,
      warning: totalAllocation > 100 ? 'Total allocation exceeds 100%' : null,
      allocations: updatedAllocations,
      changes: results
    })
  } catch (error) {
    console.error('Bulk update error:', error)
    res.status(500).json({ message: 'Failed to update allocations', error: error.message })
  }
})

// Copy allocations from previous week
router.post('/copy-from-week', (req, res) => {
  const { team_member_id, source_week, target_week } = req.body

  if (!team_member_id || !source_week || !target_week) {
    return res.status(400).json({
      message: 'team_member_id, source_week, and target_week are required'
    })
  }

  const sourceWeekDate = getMonday(source_week)
  const targetWeekDate = getMonday(target_week)

  // Get source allocations
  const sourceAllocations = getAll(
    'SELECT * FROM weekly_allocations WHERE team_member_id = ? AND week_start = ?',
    [team_member_id, sourceWeekDate]
  )

  if (sourceAllocations.length === 0) {
    return res.status(404).json({ message: 'No allocations found for source week' })
  }

  try {
    const results = []

    for (const alloc of sourceAllocations) {
      // Check if target already exists
      const existing = getOne(
        'SELECT id FROM weekly_allocations WHERE team_member_id = ? AND initiative_id = ? AND week_start = ?',
        [team_member_id, alloc.initiative_id, targetWeekDate]
      )

      if (existing) {
        // Skip or update existing
        update('weekly_allocations', {
          allocation_percentage: alloc.allocation_percentage,
          status: 'planned',
          notes: alloc.notes
        }, 'id = ?', [existing.id])
        results.push({ id: existing.id, action: 'updated' })
      } else {
        const result = insert('weekly_allocations', {
          team_member_id,
          initiative_id: alloc.initiative_id,
          week_start: targetWeekDate,
          allocation_percentage: alloc.allocation_percentage,
          status: 'planned',
          notes: alloc.notes,
          created_by: req.user?.id || null
        })
        results.push({ id: result.lastInsertRowid, action: 'created' })
      }
    }

    // Fetch updated allocations
    const allocations = getAll(`
      SELECT wa.*, i.name as initiative_name, ir.role
      FROM weekly_allocations wa
      JOIN initiatives i ON wa.initiative_id = i.id
      LEFT JOIN initiative_roles ir ON ir.initiative_id = wa.initiative_id AND ir.team_member_id = wa.team_member_id
      WHERE wa.team_member_id = ? AND wa.week_start = ?
      ORDER BY i.project_priority, i.name
    `, [team_member_id, targetWeekDate])

    res.json({
      source_week: sourceWeekDate,
      target_week: targetWeekDate,
      copied_count: results.length,
      allocations
    })
  } catch (error) {
    console.error('Copy week error:', error)
    res.status(500).json({ message: 'Failed to copy allocations', error: error.message })
  }
})

// Delete a specific allocation
router.delete('/:id', (req, res) => {
  const existing = getOne('SELECT id FROM weekly_allocations WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Allocation not found' })
  }

  deleteRow('weekly_allocations', 'id = ?', [req.params.id])
  res.json({ message: 'Allocation deleted' })
})

// Get available weeks (helper endpoint)
router.get('/weeks', (req, res) => {
  const { start_date, end_date, count } = req.query

  let weeks = []

  if (start_date && end_date) {
    weeks = getWeeksBetween(start_date, end_date)
  } else {
    // Default: current week and next 12 weeks
    const today = new Date()
    const currentMonday = getMonday(today)
    const weeksCount = parseInt(count) || 13

    for (let i = 0; i < weeksCount; i++) {
      const weekDate = new Date(currentMonday)
      weekDate.setDate(weekDate.getDate() + (i * 7))
      weeks.push(weekDate.toISOString().split('T')[0])
    }
  }

  res.json(weeks)
})

export default router
