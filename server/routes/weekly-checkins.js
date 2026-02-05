import { Router } from 'express'
import { getAll, getOne, insert, update, deleteRow, run } from '../db/database.js'

const router = Router()

// Helper: Recalculate Key Result progress from its initiatives
function recalculateKeyResultProgress(keyResultId) {
  const initiatives = getAll(
    "SELECT progress FROM initiatives WHERE key_result_id = ? AND status != 'cancelled'",
    [keyResultId]
  )

  if (initiatives.length === 0) return

  const avgProgress = initiatives.reduce((sum, i) => sum + (i.progress || 0), 0) / initiatives.length
  update('key_results', {
    progress: Math.round(avgProgress),
    updated_at: new Date().toISOString()
  }, 'id = ?', [keyResultId])
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

// Get Monday of the current week
function getCurrentWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setDate(diff))
  return monday.toISOString().split('T')[0]
}

// Get user's assigned initiatives and key results
router.get('/my-assignments', (req, res) => {
  const userId = req.user.id

  // Get team member ID for this user
  const member = getOne(`
    SELECT tm.* FROM team_members tm
    JOIN users u ON LOWER(tm.name) LIKE '%' || LOWER(u.username) || '%'
    WHERE u.id = ?
  `, [userId])

  if (!member) {
    return res.status(404).json({ message: 'Team member profile not found' })
  }

  // Get assigned initiatives
  const initiatives = getAll(`
    SELECT
      i.*,
      ia.role,
      kr.title as key_result_title,
      g.title as goal_title,
      g.quarter
    FROM initiatives i
    JOIN initiative_assignments ia ON i.id = ia.initiative_id
    LEFT JOIN key_results kr ON i.key_result_id = kr.id
    LEFT JOIN goals g ON kr.goal_id = g.id
    WHERE ia.team_member_id = ?
    AND i.status = 'active'
    ORDER BY g.quarter DESC, g.title, kr.title, i.name
  `, [member.id])

  // Get assigned key results
  const keyResults = getAll(`
    SELECT
      kr.*,
      kra.source,
      g.title as goal_title,
      g.quarter
    FROM key_results kr
    JOIN key_result_assignees kra ON kr.id = kra.key_result_id
    LEFT JOIN goals g ON kr.goal_id = g.id
    WHERE kra.team_member_id = ?
    AND kr.status = 'active'
    ORDER BY g.quarter DESC, g.title, kr.title
  `, [member.id])

  res.json({
    member,
    initiatives,
    keyResults
  })
})

// Get check-in for a specific week (current user)
router.get('/week/:weekStart', (req, res) => {
  const userId = req.user.id
  const { weekStart } = req.params

  const member = getOne(`
    SELECT tm.* FROM team_members tm
    JOIN users u ON LOWER(tm.name) LIKE '%' || LOWER(u.username) || '%'
    WHERE u.id = ?
  `, [userId])

  if (!member) {
    return res.status(404).json({ message: 'Team member profile not found' })
  }

  const checkin = getOne(`
    SELECT * FROM weekly_checkins
    WHERE team_member_id = ? AND week_start = ?
  `, [member.id, weekStart])

  if (!checkin) {
    return res.json({
      checkin: null,
      items: []
    })
  }

  const items = getAll(`
    SELECT
      wci.*,
      i.name as initiative_name,
      i.category as category,
      kr.title as key_result_title,
      COALESCE(g_init.title, g_kr.title) as goal_title
    FROM weekly_checkin_items wci
    LEFT JOIN initiatives i ON wci.initiative_id = i.id
    LEFT JOIN key_results kr_init ON i.key_result_id = kr_init.id
    LEFT JOIN goals g_init ON kr_init.goal_id = g_init.id
    LEFT JOIN key_results kr ON wci.key_result_id = kr.id
    LEFT JOIN goals g_kr ON kr.goal_id = g_kr.id
    WHERE wci.checkin_id = ?
  `, [checkin.id])

  res.json({
    checkin,
    items
  })
})

// Get check-in for a specific member and week
router.get('/member/:memberId/week/:weekStart', (req, res) => {
  const { memberId, weekStart } = req.params

  const member = getOne('SELECT * FROM team_members WHERE id = ?', [memberId])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  const checkin = getOne(`
    SELECT * FROM weekly_checkins
    WHERE team_member_id = ? AND week_start = ?
  `, [memberId, weekStart])

  if (!checkin) {
    return res.json({
      checkin: null,
      items: []
    })
  }

  const items = getAll(`
    SELECT
      wci.*,
      i.name as initiative_name,
      i.category as category,
      kr.title as key_result_title,
      COALESCE(g_init.title, g_kr.title) as goal_title
    FROM weekly_checkin_items wci
    LEFT JOIN initiatives i ON wci.initiative_id = i.id
    LEFT JOIN key_results kr_init ON i.key_result_id = kr_init.id
    LEFT JOIN goals g_init ON kr_init.goal_id = g_init.id
    LEFT JOIN key_results kr ON wci.key_result_id = kr.id
    LEFT JOIN goals g_kr ON kr.goal_id = g_kr.id
    WHERE wci.checkin_id = ?
  `, [checkin.id])

  res.json({
    checkin,
    items
  })
})

// Create or update a weekly check-in
router.post('/', (req, res) => {
  const userId = req.user.id
  const username = req.user.username
  const { week_start, items, notes, mood, submit, member_id } = req.body

  if (!week_start) {
    return res.status(400).json({ message: 'week_start is required' })
  }

  let member

  // If member_id is provided, use it directly
  if (member_id) {
    member = getOne('SELECT * FROM team_members WHERE id = ?', [member_id])
  } else {
    // Fall back to finding member via JWT user
    member = getOne(`
      SELECT tm.* FROM team_members tm
      JOIN users u ON LOWER(tm.name) LIKE '%' || LOWER(u.username) || '%'
      WHERE u.id = ?
    `, [userId])
  }

  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Security: Users can only submit check-ins for themselves (admin can submit for anyone)
  if (username !== 'admin') {
    const memberFirstName = member.name.split(' ')[0].toLowerCase()
    if (username.toLowerCase() !== memberFirstName) {
      return res.status(403).json({ message: 'You can only submit check-ins for yourself' })
    }
  }

  // Calculate total allocation
  const totalAllocation = items.reduce((sum, item) => sum + (item.time_allocation_pct || 0), 0)

  // Validate total doesn't exceed 100%
  if (totalAllocation > 100) {
    return res.status(400).json({
      message: 'Total time allocation cannot exceed 100%',
      total: totalAllocation
    })
  }

  // Check if check-in exists
  let checkin = getOne(`
    SELECT * FROM weekly_checkins
    WHERE team_member_id = ? AND week_start = ?
  `, [member.id, week_start])

  if (checkin) {
    // Update existing
    update('weekly_checkins', {
      total_allocation_pct: totalAllocation,
      status: submit ? 'submitted' : 'draft',
      submitted_at: submit ? new Date().toISOString() : checkin.submitted_at,
      notes: notes || checkin.notes,
      mood: mood || checkin.mood,
      updated_at: new Date().toISOString()
    }, 'id = ?', [checkin.id])

    // Delete existing items
    deleteRow('weekly_checkin_items', 'checkin_id = ?', [checkin.id])
  } else {
    // Create new
    const result = insert('weekly_checkins', {
      team_member_id: member.id,
      week_start,
      total_allocation_pct: totalAllocation,
      status: submit ? 'submitted' : 'draft',
      submitted_at: submit ? new Date().toISOString() : null,
      notes: notes || null,
      mood: mood || null
    })
    checkin = { id: result.lastInsertRowid }
  }

  // Get BAU key result for creating BAU initiatives
  const bauKeyResult = getOne(`
    SELECT kr.id FROM key_results kr
    JOIN goals g ON kr.goal_id = g.id
    WHERE g.title LIKE '%Business as Usual%'
    ORDER BY kr.id
    LIMIT 1
  `)

  // Track processed items with their actual initiative IDs (for progress update later)
  const processedItems = []

  // Insert items - create initiatives for BAU tasks when submitting
  for (const item of items) {
    if (item.time_allocation_pct > 0 || item.progress_contribution_pct > 0) {
      let initiativeId = item.initiative_id || null
      let keyResultId = item.key_result_id || null

      // If this is a BAU task with a name, create an actual initiative for it
      if (item.is_bau && item.notes && item.notes.trim() && bauKeyResult) {
        // Calculate hours from time allocation (assuming 40h week)
        const hoursWorked = Math.round(item.time_allocation_pct * 0.4)

        // Create initiative under BAU key result, assigned to this member
        const initResult = insert('initiatives', {
          name: item.notes.trim(),
          description: `[Weekly Check-in] BAU task added ${week_start}`,
          key_result_id: bauKeyResult.id,
          owner_id: member.id,
          status: 'active',
          source: 'manual',
          progress: 0,
          actual_hours: hoursWorked,
          category: item.category || null
        })
        initiativeId = initResult.lastInsertRowid

        // Create time entry for this week
        insert('initiative_time_entries', {
          initiative_id: initiativeId,
          team_member_id: member.id,
          week_start: week_start,
          hours_worked: hoursWorked,
          notes: `Weekly check-in: ${item.time_allocation_pct}%`
        })

        // Assign the initiative to this member
        insert('initiative_assignments', {
          initiative_id: initiativeId,
          team_member_id: member.id,
          role: 'Lead',
          source: 'manual'
        })

        // Link to the new initiative instead of BAU key result
        keyResultId = null
      }

      insert('weekly_checkin_items', {
        checkin_id: checkin.id,
        initiative_id: initiativeId,
        key_result_id: keyResultId,
        time_allocation_pct: item.time_allocation_pct || 0,
        progress_contribution_pct: item.progress_contribution_pct || 0,
        notes: item.notes || null
      })

      // Track the actual initiative ID for progress update
      processedItems.push({
        ...item,
        initiative_id: initiativeId,
        key_result_id: keyResultId
      })
    }
  }

  // Update initiative/key result progress when submitting
  // Progress is proportional: each assignee's contribution = their % / total assignees
  if (submit) {
    const affectedKeyResultIds = new Set()
    const affectedGoalIds = new Set()

    // Use processedItems which has the actual initiative IDs (including newly created ones)
    for (const item of processedItems) {
      if (item.progress_contribution_pct > 0) {
        if (item.initiative_id) {
          // Get current initiative progress and count of assignees
          const initiative = getOne('SELECT progress, key_result_id FROM initiatives WHERE id = ?', [item.initiative_id])
          const assigneeCount = getOne('SELECT COUNT(*) as count FROM initiative_assignments WHERE initiative_id = ?', [item.initiative_id])
          if (initiative) {
            const numAssignees = Math.max(1, assigneeCount?.count || 1)
            // Each assignee's 100% = (100 / numAssignees)% of total
            // So their contribution is scaled: contribution * (100 / numAssignees) / 100
            const scaledContribution = item.progress_contribution_pct / numAssignees
            const newProgress = Math.min(100, (initiative.progress || 0) + scaledContribution)
            update('initiatives', {
              progress: Math.round(newProgress * 100) / 100, // Round to 2 decimals
              updated_at: new Date().toISOString()
            }, 'id = ?', [item.initiative_id])

            // Track affected key result for cascade
            if (initiative.key_result_id) {
              affectedKeyResultIds.add(initiative.key_result_id)
            }
          }
        }
        if (item.key_result_id) {
          // Get current key result progress and count of assignees
          const kr = getOne('SELECT progress, goal_id FROM key_results WHERE id = ?', [item.key_result_id])
          const assigneeCount = getOne('SELECT COUNT(*) as count FROM key_result_assignees WHERE key_result_id = ?', [item.key_result_id])
          if (kr) {
            const numAssignees = Math.max(1, assigneeCount?.count || 1)
            const scaledContribution = item.progress_contribution_pct / numAssignees
            const newProgress = Math.min(100, (kr.progress || 0) + scaledContribution)
            update('key_results', {
              progress: Math.round(newProgress * 100) / 100,
              updated_at: new Date().toISOString()
            }, 'id = ?', [item.key_result_id])

            // Track affected goal for cascade
            if (kr.goal_id) {
              affectedGoalIds.add(kr.goal_id)
            }
          }
        }
      }
    }

    // Cascade: Recalculate Key Result progress from initiatives
    for (const krId of affectedKeyResultIds) {
      recalculateKeyResultProgress(krId)
      // Get the goal for this KR
      const kr = getOne('SELECT goal_id FROM key_results WHERE id = ?', [krId])
      if (kr?.goal_id) {
        affectedGoalIds.add(kr.goal_id)
      }
    }

    // Cascade: Recalculate Goal progress from key results
    for (const goalId of affectedGoalIds) {
      recalculateGoalProgress(goalId)
    }
  }

  // Fetch updated checkin with items
  const updatedCheckin = getOne('SELECT * FROM weekly_checkins WHERE id = ?', [checkin.id])
  const updatedItems = getAll(`
    SELECT
      wci.*,
      i.name as initiative_name,
      i.category as category,
      kr.title as key_result_title
    FROM weekly_checkin_items wci
    LEFT JOIN initiatives i ON wci.initiative_id = i.id
    LEFT JOIN key_results kr ON wci.key_result_id = kr.id
    WHERE wci.checkin_id = ?
  `, [checkin.id])

  res.json({
    checkin: updatedCheckin,
    items: updatedItems,
    message: submit ? 'Check-in submitted successfully' : 'Check-in saved as draft'
  })
})

// Get check-in history for current user
router.get('/history', (req, res) => {
  const userId = req.user.id
  const { limit = 10 } = req.query

  const member = getOne(`
    SELECT tm.* FROM team_members tm
    JOIN users u ON LOWER(tm.name) LIKE '%' || LOWER(u.username) || '%'
    WHERE u.id = ?
  `, [userId])

  if (!member) {
    return res.status(404).json({ message: 'Team member profile not found' })
  }

  const checkins = getAll(`
    SELECT * FROM weekly_checkins
    WHERE team_member_id = ?
    ORDER BY week_start DESC
    LIMIT ?
  `, [member.id, parseInt(limit)])

  res.json(checkins)
})

// Get team check-ins for a week (manager view)
router.get('/team/:weekStart', (req, res) => {
  const { weekStart } = req.params

  const checkins = getAll(`
    SELECT
      wc.*,
      tm.name as member_name,
      tm.team,
      tm.role as member_role
    FROM weekly_checkins wc
    JOIN team_members tm ON wc.team_member_id = tm.id
    WHERE wc.week_start = ?
    ORDER BY tm.name
  `, [weekStart])

  // Get items for each checkin
  const result = checkins.map(checkin => {
    const items = getAll(`
      SELECT
        wci.*,
        i.name as initiative_name,
        i.category as category,
        kr.title as key_result_title,
        COALESCE(g_init.title, g_kr.title) as goal_title
      FROM weekly_checkin_items wci
      LEFT JOIN initiatives i ON wci.initiative_id = i.id
      LEFT JOIN key_results kr_init ON i.key_result_id = kr_init.id
      LEFT JOIN goals g_init ON kr_init.goal_id = g_init.id
      LEFT JOIN key_results kr ON wci.key_result_id = kr.id
      LEFT JOIN goals g_kr ON kr.goal_id = g_kr.id
      WHERE wci.checkin_id = ?
    `, [checkin.id])
    return { ...checkin, items }
  })

  res.json(result)
})

export default router
