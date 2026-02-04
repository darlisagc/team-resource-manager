import { Router } from 'express'
import { getAll, getOne, insert, update, deleteRow } from '../db/database.js'

const router = Router()

// Get all team members with their stats
router.get('/', (req, res) => {
  // Get current quarter date range
  const now = new Date()
  const quarterNum = Math.ceil((now.getMonth() + 1) / 3)
  const year = now.getFullYear()
  const startMonth = (quarterNum - 1) * 3
  const startDate = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
  const endDate = `${year}-${String(startMonth + 3).padStart(2, '0')}-${quarterNum === 1 || quarterNum === 4 ? '31' : '30'}`
  const weeksInQuarter = 13

  const members = getAll(`
    SELECT
      tm.*,
      (SELECT COUNT(*) FROM weekly_checkins
       WHERE team_member_id = tm.id AND status = 'submitted') as checkin_count,
      (SELECT COALESCE(SUM(total_allocation_pct), 0) FROM weekly_checkins
       WHERE team_member_id = tm.id
       AND status = 'submitted'
       AND week_start >= ? AND week_start <= ?
      ) as total_allocation_sum,
      (SELECT total_allocation_pct FROM weekly_checkins
       WHERE team_member_id = tm.id
       AND status = 'submitted'
       ORDER BY week_start DESC LIMIT 1
      ) as last_week_allocation,
      (SELECT COALESCE(SUM(hours), 0) FROM time_off
       WHERE team_member_id = tm.id
       AND start_date >= ? AND end_date <= ?
      ) as time_off_hours
    FROM team_members tm
    ORDER BY tm.name
  `, [startDate, endDate, startDate, endDate])

  // Calculate utilization from weekly check-ins
  // Utilization = (Hours worked from check-ins + Time off) / Total quarter capacity * 100
  // 1 week at 100% = 40h, Quarter = 13 weeks = 520h capacity
  const membersWithUtilization = members.map(member => {
    const totalCapacityHours = member.weekly_hours * weeksInQuarter
    // Calculate hours worked from check-ins: sum of allocation % * weekly hours
    const hoursWorked = (member.total_allocation_sum / 100) * member.weekly_hours
    // Utilization = (hours worked + time off) / total capacity * 100
    const utilization = totalCapacityHours > 0
      ? ((hoursWorked + member.time_off_hours) / totalCapacityHours) * 100
      : 0
    const lastWeek = member.last_week_allocation || 0

    return {
      ...member,
      current_allocation: Math.round(utilization * 10) / 10,
      last_week_allocation: Math.round(lastWeek * 10) / 10,
      time_off_hours: member.time_off_hours,
      checkin_count: member.checkin_count,
      hours_worked: Math.round(hoursWorked),
      total_capacity_hours: Math.round(totalCapacityHours)
    }
  })

  res.json(membersWithUtilization)
})

// Get single team member with details
router.get('/:id', (req, res) => {
  const member = getOne('SELECT * FROM team_members WHERE id = ?', [req.params.id])

  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Get time off records
  const timeOff = getAll(
    'SELECT * FROM time_off WHERE team_member_id = ? ORDER BY start_date DESC',
    [req.params.id]
  )

  // Get allocations
  const allocations = getAll(`
    SELECT a.*, g.title as goal_title, t.title as task_title
    FROM allocations a
    LEFT JOIN goals g ON a.goal_id = g.id
    LEFT JOIN tasks t ON a.task_id = t.id
    WHERE a.team_member_id = ?
    ORDER BY a.start_date DESC
  `, [req.params.id])

  // Get assigned initiatives with their key result and goal info
  const initiatives = getAll(`
    SELECT
      i.*,
      ia.role as assignment_role,
      kr.title as key_result_title,
      kr.id as key_result_id,
      g.title as goal_title,
      g.id as goal_id,
      g.quarter
    FROM initiatives i
    JOIN initiative_assignments ia ON i.id = ia.initiative_id
    LEFT JOIN key_results kr ON i.key_result_id = kr.id
    LEFT JOIN goals g ON kr.goal_id = g.id
    WHERE ia.team_member_id = ?
    ORDER BY g.quarter DESC, g.title, kr.title, i.name
  `, [req.params.id])

  // Get assigned key results with their goal info
  const keyResults = getAll(`
    SELECT
      kr.*,
      kra.source as assignment_source,
      g.title as goal_title,
      g.id as goal_id,
      g.quarter,
      (SELECT COUNT(*) FROM initiatives WHERE key_result_id = kr.id) as initiative_count
    FROM key_results kr
    JOIN key_result_assignees kra ON kr.id = kra.key_result_id
    LEFT JOIN goals g ON kr.goal_id = g.id
    WHERE kra.team_member_id = ?
    ORDER BY g.quarter DESC, g.title, kr.title
  `, [req.params.id])

  // Get assigned goals
  const goals = getAll(`
    SELECT
      g.*,
      ga.source as assignment_source,
      (SELECT COUNT(*) FROM key_results WHERE goal_id = g.id) as key_result_count,
      (SELECT COUNT(*) FROM initiatives i
       JOIN key_results kr ON i.key_result_id = kr.id
       WHERE kr.goal_id = g.id) as initiative_count
    FROM goals g
    JOIN goal_assignees ga ON g.id = ga.goal_id
    WHERE ga.team_member_id = ?
    ORDER BY g.quarter DESC, g.title
  `, [req.params.id])

  res.json({
    ...member,
    timeOff,
    allocations,
    initiatives,
    keyResults,
    goals
  })
})

// Create team member
router.post('/', (req, res) => {
  const { name, email, role, team, weekly_hours } = req.body

  if (!name) {
    return res.status(400).json({ message: 'Name is required' })
  }

  try {
    const result = insert('team_members', {
      name,
      email: email || null,
      role: role || null,
      team: team || null,
      weekly_hours: weekly_hours || 40
    })

    const member = getOne('SELECT * FROM team_members WHERE id = ?', [result.lastInsertRowid])
    res.status(201).json(member)
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ message: 'Email already exists' })
    }
    throw error
  }
})

// Update team member
router.put('/:id', (req, res) => {
  const { name, email, role, team, weekly_hours } = req.body

  const existing = getOne('SELECT * FROM team_members WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  try {
    update('team_members', {
      name: name || existing.name,
      email: email !== undefined ? email : existing.email,
      role: role !== undefined ? role : existing.role,
      team: team !== undefined ? team : existing.team,
      weekly_hours: weekly_hours !== undefined ? weekly_hours : existing.weekly_hours
    }, 'id = ?', [req.params.id])

    const member = getOne('SELECT * FROM team_members WHERE id = ?', [req.params.id])
    res.json(member)
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ message: 'Email already exists' })
    }
    throw error
  }
})

// Delete team member
router.delete('/:id', (req, res) => {
  const existing = getOne('SELECT * FROM team_members WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  deleteRow('team_members', 'id = ?', [req.params.id])
  res.json({ message: 'Team member deleted' })
})

export default router
