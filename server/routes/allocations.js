import { Router } from 'express'
import { getAll, getOne, insert, update, deleteRow } from '../db/database.js'
import { getQuarterDateRange, WEEKS_PER_QUARTER } from '../utils/dateUtils.js'

const router = Router()

// Get all allocations with filters
router.get('/', (req, res) => {
  const { team_member_id, goal_id, task_id, quarter } = req.query

  let sql = `
    SELECT
      a.*,
      tm.name as member_name,
      tm.weekly_hours,
      g.title as goal_title,
      g.quarter,
      t.title as task_title
    FROM allocations a
    JOIN team_members tm ON a.team_member_id = tm.id
    LEFT JOIN goals g ON a.goal_id = g.id
    LEFT JOIN tasks t ON a.task_id = t.id
    WHERE 1=1
  `
  const params = []

  if (team_member_id) {
    sql += ' AND a.team_member_id = ?'
    params.push(team_member_id)
  }
  if (goal_id) {
    sql += ' AND a.goal_id = ?'
    params.push(goal_id)
  }
  if (task_id) {
    sql += ' AND a.task_id = ?'
    params.push(task_id)
  }
  if (quarter) {
    sql += ' AND g.quarter = ?'
    params.push(quarter)
  }

  sql += ' ORDER BY a.start_date DESC'

  const allocations = getAll(sql, params)
  res.json(allocations)
})

// Get allocation summary by member for a quarter
router.get('/summary', (req, res) => {
  const { quarter } = req.query

  if (!quarter) {
    return res.status(400).json({ message: 'Quarter is required' })
  }

  // Parse quarter to get date range (using centralized utility)
  const { startDate, endDate } = getQuarterDateRange(quarter)

  // Get allocation summary from weekly check-ins (actual work reported)
  // NOT from planning/initiative_assignments - those are separate
  const summary = getAll(`
    SELECT
      tm.id,
      tm.name,
      tm.role,
      tm.team,
      tm.weekly_hours,
      COALESCE((SELECT SUM(total_allocation_pct)
                FROM weekly_checkins
                WHERE team_member_id = tm.id
                AND status = 'submitted'
                AND week_start >= ? AND week_start <= ?), 0) as checkin_allocation_sum,
      COALESCE((SELECT COUNT(*)
                FROM weekly_checkins
                WHERE team_member_id = tm.id
                AND status = 'submitted'
                AND week_start >= ? AND week_start <= ?), 0) as weeks_reported,
      COALESCE((SELECT SUM(hours) FROM time_off
                WHERE team_member_id = tm.id
                AND start_date <= ? AND end_date >= ?), 0) as time_off_hours,
      COALESCE((SELECT SUM(hours) FROM time_off
                WHERE team_member_id = tm.id
                AND type = 'other'
                AND start_date <= ? AND end_date >= ?), 0) as capacity_adjustment_hours
    FROM team_members tm
    GROUP BY tm.id
    ORDER BY tm.name
  `, [startDate, endDate, startDate, endDate, endDate, startDate, endDate, startDate])

  // Calculate utilization for each member (using centralized constant)
  const weeksInQuarter = WEEKS_PER_QUARTER
  const summaryWithUtilization = summary.map(member => {
    const totalCapacity = member.weekly_hours * weeksInQuarter
    // Calculate allocated hours from weekly check-ins
    // Each check-in week's total_allocation_pct * weekly_hours = hours worked that week
    const checkinAllocSum = member.checkin_allocation_sum || 0
    const taskAllocatedHours = (checkinAllocSum / 100) * member.weekly_hours
    // PTO counts as allocated time (can't assign work during PTO)
    const allocatedHours = taskAllocatedHours + member.time_off_hours
    const availableHours = totalCapacity - member.time_off_hours
    const utilization = totalCapacity > 0 ? (allocatedHours / totalCapacity) * 100 : 0

    // Effective capacity: factor in type='other' capacity adjustments
    const capacityAdjustmentHours = member.capacity_adjustment_hours || 0
    const hasCapacityAdjustment = capacityAdjustmentHours > 0
    const effectiveQuarterlyHours = (member.weekly_hours * weeksInQuarter) - capacityAdjustmentHours
    const effectiveWeeklyHours = effectiveQuarterlyHours / weeksInQuarter
    const effectiveFte = effectiveWeeklyHours / 40

    return {
      ...member,
      checkin_allocation_pct: checkinAllocSum,
      weeks_reported: member.weeks_reported,
      totalCapacity,
      availableHours,
      allocatedHours: Math.round(taskAllocatedHours),
      taskAllocatedHours: Math.round(taskAllocatedHours),
      utilization: Math.round(utilization * 10) / 10,
      fte: member.weekly_hours / 40,
      effective_weekly_hours: Math.round(effectiveWeeklyHours * 10) / 10,
      effective_fte: Math.round(effectiveFte * 100) / 100,
      has_capacity_adjustment: hasCapacityAdjustment
    }
  })

  res.json(summaryWithUtilization)
})

// Create allocation
router.post('/', (req, res) => {
  const { team_member_id, goal_id, task_id, allocation_percentage, start_date, end_date } = req.body

  if (!team_member_id || allocation_percentage === undefined || !start_date || !end_date) {
    return res.status(400).json({ message: 'team_member_id, allocation_percentage, start_date, and end_date are required' })
  }

  const member = getOne('SELECT * FROM team_members WHERE id = ?', [team_member_id])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  // Calculate hours
  const weeks = Math.ceil((new Date(end_date) - new Date(start_date)) / (7 * 24 * 60 * 60 * 1000))
  const calculated_hours = (allocation_percentage / 100) * member.weekly_hours * weeks

  const result = insert('allocations', {
    team_member_id,
    goal_id: goal_id || null,
    task_id: task_id || null,
    allocation_percentage,
    start_date,
    end_date,
    calculated_hours,
    source: 'manual'
  })

  const allocation = getOne(`
    SELECT a.*, tm.name as member_name, g.title as goal_title, t.title as task_title
    FROM allocations a
    JOIN team_members tm ON a.team_member_id = tm.id
    LEFT JOIN goals g ON a.goal_id = g.id
    LEFT JOIN tasks t ON a.task_id = t.id
    WHERE a.id = ?
  `, [result.lastInsertRowid])

  res.status(201).json(allocation)
})

// Update allocation
router.put('/:id', (req, res) => {
  const { allocation_percentage, start_date, end_date } = req.body

  const existing = getOne('SELECT * FROM allocations WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Allocation not found' })
  }

  const member = getOne('SELECT * FROM team_members WHERE id = ?', [existing.team_member_id])

  // Recalculate hours if dates or percentage changed
  const newPercentage = allocation_percentage !== undefined ? allocation_percentage : existing.allocation_percentage
  const newStartDate = start_date || existing.start_date
  const newEndDate = end_date || existing.end_date
  const weeks = Math.ceil((new Date(newEndDate) - new Date(newStartDate)) / (7 * 24 * 60 * 60 * 1000))
  const calculated_hours = (newPercentage / 100) * member.weekly_hours * weeks

  update('allocations', {
    allocation_percentage: newPercentage,
    start_date: newStartDate,
    end_date: newEndDate,
    calculated_hours
  }, 'id = ?', [req.params.id])

  const allocation = getOne(`
    SELECT a.*, tm.name as member_name, g.title as goal_title, t.title as task_title
    FROM allocations a
    JOIN team_members tm ON a.team_member_id = tm.id
    LEFT JOIN goals g ON a.goal_id = g.id
    LEFT JOIN tasks t ON a.task_id = t.id
    WHERE a.id = ?
  `, [req.params.id])

  res.json(allocation)
})

// Delete allocation
router.delete('/:id', (req, res) => {
  const existing = getOne('SELECT * FROM allocations WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Allocation not found' })
  }

  deleteRow('allocations', 'id = ?', [req.params.id])
  res.json({ message: 'Allocation deleted' })
})

export default router
