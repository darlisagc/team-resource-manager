import { Router } from 'express'
import { getAll, getOne } from '../db/database.js'
import { getQuarterDateRange, WEEKS_PER_QUARTER } from '../utils/dateUtils.js'

const router = Router()

// Get dashboard metrics
router.get('/', (req, res) => {
  const { quarter } = req.query

  if (!quarter) {
    return res.status(400).json({ message: 'Quarter is required' })
  }

  // Parse quarter to get date range (using centralized utility)
  const { startDate, endDate, weeksInQuarter } = getQuarterDateRange(quarter)
  const [, year] = quarter.split(' ')

  // Team overview
  const teamStats = getOne(`
    SELECT
      COUNT(*) as total_members,
      SUM(weekly_hours) as total_weekly_hours,
      SUM(weekly_hours) / 40.0 as total_fte
    FROM team_members
  `)

  // Goals stats
  const goalStats = getOne(`
    SELECT
      COUNT(*) as total_goals,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_goals,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_goals,
      AVG(progress) as avg_progress
    FROM goals
    WHERE quarter = ?
  `, [quarter])

  // Individual goals with progress - all quarters for the year (excluding BAU/Backlog)
  const yearPattern = `%${year}%`
  const goalsList = getAll(`
    SELECT id, title, progress, status, quarter
    FROM goals
    WHERE (quarter LIKE ? OR quarter = 'All' OR quarter = 'Backlog')
    AND title NOT LIKE '%Business as Usual%'
    AND title != 'Backlog'
    ORDER BY quarter, progress DESC, title
  `, [yearPattern])

  // Task stats
  const taskStats = getOne(`
    SELECT
      COUNT(*) as total_tasks,
      SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) as todo_tasks,
      SUM(CASE WHEN t.status = 'in-progress' THEN 1 ELSE 0 END) as in_progress_tasks,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_tasks,
      SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END) as blocked_tasks
    FROM tasks t
    LEFT JOIN goals g ON t.parent_goal_id = g.id
    WHERE g.quarter = ? OR t.parent_goal_id IS NULL
  `, [quarter])

  // Conflict count
  const conflictCount = getOne(`
    SELECT COUNT(DISTINCT t.id) as count
    FROM tasks t
    INNER JOIN task_assignees ta ON t.id = ta.task_id
    INNER JOIN goals g ON t.parent_goal_id = g.id
    INNER JOIN goal_assignees ga ON g.id = ga.goal_id
    LEFT JOIN resolved_assignees ra ON t.id = ra.task_id
    WHERE ra.id IS NULL
    AND ta.team_member_id NOT IN (SELECT team_member_id FROM goal_assignees WHERE goal_id = g.id)
  `)

  // Time off summary
  const timeOffStats = getOne(`
    SELECT
      COALESCE(SUM(hours), 0) as total_hours,
      COUNT(DISTINCT team_member_id) as members_with_timeoff
    FROM time_off
    WHERE start_date >= ? AND end_date <= ?
  `, [startDate, endDate])

  // Member utilization data - using weekly check-ins for actual utilization
  const memberUtilization = getAll(`
    SELECT
      tm.id,
      tm.name,
      tm.role,
      tm.team,
      tm.weekly_hours,
      COALESCE((SELECT SUM(total_allocation_pct) FROM weekly_checkins
                WHERE team_member_id = tm.id
                AND status = 'submitted'
                AND week_start >= ? AND week_start <= ?), 0) as total_allocation_sum,
      COALESCE((SELECT COUNT(*) FROM weekly_checkins
                WHERE team_member_id = tm.id
                AND status = 'submitted'
                AND week_start >= ? AND week_start <= ?), 0) as weeks_reported,
      COALESCE((SELECT SUM(hours) FROM time_off
                WHERE team_member_id = tm.id
                AND start_date >= ? AND end_date <= ?), 0) as time_off_hours
    FROM team_members tm
    GROUP BY tm.id
    ORDER BY total_allocation_sum DESC
  `, [startDate, endDate, startDate, endDate, startDate, endDate])

  // Calculate utilization metrics
  // Utilization = (Hours worked from check-ins + Time off) / Total quarter capacity * 100
  // 1 week at 100% = 40h, Quarter = 13 weeks = 520h capacity
  const utilizationData = memberUtilization.map(member => {
    const totalCapacityHours = member.weekly_hours * weeksInQuarter
    // Calculate actual hours worked from check-ins
    // Each week's allocation % * weekly_hours = hours worked that week
    // Sum of all weeks = total hours worked
    const hoursWorked = (member.total_allocation_sum / 100) * member.weekly_hours
    // Utilization = (hours worked + time off) / total capacity * 100
    const utilization = totalCapacityHours > 0
      ? ((hoursWorked + member.time_off_hours) / totalCapacityHours) * 100
      : 0

    return {
      id: member.id,
      name: member.name,
      role: member.role,
      team: member.team,
      weeklyHours: member.weekly_hours,
      fte: member.weekly_hours / 40,
      totalCapacityHours: Math.round(totalCapacityHours),
      hoursWorked: Math.round(hoursWorked),
      utilization: Math.round(utilization * 10) / 10,
      weeksReported: member.weeks_reported,
      timeOffHours: member.time_off_hours,
      timeOffPercent: totalCapacityHours > 0 ? Math.round((member.time_off_hours / totalCapacityHours) * 1000) / 10 : 0
    }
  })

  // Calculate team-level metrics
  const totalCapacityHours = utilizationData.reduce((sum, m) => sum + m.totalCapacityHours, 0)
  const totalHoursWorked = utilizationData.reduce((sum, m) => sum + m.hoursWorked, 0)
  const totalTimeOffHours = utilizationData.reduce((sum, m) => sum + m.timeOffHours, 0)
  const avgUtilization = totalCapacityHours > 0
    ? ((totalTimeOffHours + totalHoursWorked) / totalCapacityHours) * 100
    : 0
  const timeOffPercent = totalCapacityHours > 0
    ? (totalTimeOffHours / totalCapacityHours) * 100
    : 0

  const overAllocated = utilizationData.filter(m => m.utilization > 100)
  const underUtilized = utilizationData.filter(m => m.utilization < 50)

  // Allocation by team - using weekly check-ins
  const teamAllocation = getAll(`
    SELECT
      tm.team,
      COUNT(DISTINCT tm.id) as member_count,
      SUM(tm.weekly_hours) as total_hours,
      COALESCE(AVG(wc.avg_alloc), 0) as avg_allocation
    FROM team_members tm
    LEFT JOIN (
      SELECT team_member_id, AVG(total_allocation_pct) as avg_alloc
      FROM weekly_checkins
      WHERE status = 'submitted'
        AND week_start >= ? AND week_start <= ?
      GROUP BY team_member_id
    ) wc ON tm.id = wc.team_member_id
    WHERE tm.team IS NOT NULL
    GROUP BY tm.team
    ORDER BY avg_allocation DESC
  `, [startDate, endDate])

  res.json({
    quarter,
    team: {
      totalMembers: teamStats.total_members,
      totalWeeklyHours: teamStats.total_weekly_hours,
      totalFTE: Math.round(teamStats.total_fte * 100) / 100
    },
    goals: {
      total: goalStats.total_goals || 0,
      active: goalStats.active_goals || 0,
      completed: goalStats.completed_goals || 0,
      avgProgress: Math.round(goalStats.avg_progress || 0)
    },
    goalsList: goalsList.map(g => ({
      id: g.id,
      title: g.title,
      progress: g.progress || 0,
      status: g.status,
      quarter: g.quarter
    })),
    tasks: {
      total: taskStats.total_tasks || 0,
      todo: taskStats.todo_tasks || 0,
      inProgress: taskStats.in_progress_tasks || 0,
      done: taskStats.done_tasks || 0,
      blocked: taskStats.blocked_tasks || 0
    },
    conflicts: {
      unresolved: conflictCount.count || 0
    },
    timeOff: {
      totalHours: timeOffStats.total_hours,
      membersWithTimeOff: timeOffStats.members_with_timeoff
    },
    utilization: {
      average: Math.round(avgUtilization * 10) / 10,
      timeOffPercent: Math.round(timeOffPercent * 10) / 10,
      workPercent: totalCapacityHours > 0 ? Math.round((totalHoursWorked / totalCapacityHours) * 1000) / 10 : 0,
      totalCapacityHours,
      totalHoursWorked,
      totalTimeOffHours,
      overAllocatedCount: overAllocated.length,
      underUtilizedCount: underUtilized.length
    },
    memberUtilization: utilizationData,
    teamAllocation: teamAllocation.map(t => ({
      team: t.team,
      memberCount: t.member_count,
      totalHours: t.total_hours,
      avgAllocation: Math.round(t.avg_allocation * 10) / 10
    }))
  })
})

// Get available quarters
router.get('/quarters', (req, res) => {
  const quarters = getAll(`
    SELECT DISTINCT quarter FROM goals
    UNION
    SELECT DISTINCT
      'Q' || ((CAST(strftime('%m', start_date) AS INTEGER) - 1) / 3 + 1) || ' ' || strftime('%Y', start_date)
    FROM time_off
    ORDER BY quarter DESC
  `)

  // Add current quarter if not present
  const now = new Date()
  const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`

  const quarterSet = new Set(quarters.map(q => q.quarter))
  quarterSet.add(currentQuarter)

  // Remove 'Ongoing' from the set if present
  quarterSet.delete('Ongoing')

  // Sort quarters - current quarter first, then descending, special quarters at end
  const specialQuarters = ['All', 'Backlog']
  const sortedQuarters = Array.from(quarterSet).sort((a, b) => {
    // Current quarter always first
    if (a === currentQuarter) return -1
    if (b === currentQuarter) return 1

    // Special quarters (All, Backlog) go at the end
    const aIsSpecial = specialQuarters.includes(a)
    const bIsSpecial = specialQuarters.includes(b)
    if (aIsSpecial && !bIsSpecial) return 1
    if (!aIsSpecial && bIsSpecial) return -1
    if (aIsSpecial && bIsSpecial) return a.localeCompare(b)

    const [qa, ya] = a.split(' ')
    const [qb, yb] = b.split(' ')
    if (ya !== yb) return parseInt(yb) - parseInt(ya)
    return parseInt(qb.replace('Q', '')) - parseInt(qa.replace('Q', ''))
  })

  res.json(sortedQuarters)
})

export default router
