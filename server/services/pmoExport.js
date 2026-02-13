import { getAll, getOne } from '../db/database.js'

// Helper: Get Monday of a given week
function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// Helper: Get all Mondays between two dates
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

// Helper: Get date range for a quarter (e.g., "Q1 2026" -> {start: "2026-01-01", end: "2026-03-31"})
function getQuarterDateRange(quarterStr) {
  if (!quarterStr) return null

  const match = quarterStr.match(/Q(\d)\s+(\d{4})/)
  if (!match) return null

  const quarterNum = parseInt(match[1])
  const year = match[2]
  const startMonth = (quarterNum - 1) * 3 + 1
  const endMonth = startMonth + 2
  const endDay = [1, 3, 5, 7, 8, 10, 12].includes(endMonth) ? 31 : 30

  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth).padStart(2, '0')}-${endDay}`
  }
}

// Helper: Check if a week falls within a quarter
function isWeekInQuarter(weekDate, quarterStr) {
  const range = getQuarterDateRange(quarterStr)
  if (!range) return true // If no quarter assigned, show in all weeks

  const week = new Date(weekDate)
  const start = new Date(range.start)
  const end = new Date(range.end)

  return week >= start && week <= end
}

// Helper: Format date for display (e.g., "02/06")
function formatWeekLabel(dateStr) {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

/**
 * Generate export data from weekly check-ins (actual work done)
 */
function generateFromCheckins(options) {
  const { startDate, endDate, team, priority } = options
  const weeks = getWeeksBetween(startDate, endDate)

  let sql = `
    SELECT DISTINCT
      wci.initiative_id,
      wci.key_result_id,
      wci.time_allocation_pct,
      wc.week_start,
      wc.team_member_id,
      tm.name as member_name,
      tm.team as member_team,
      i.name as initiative_name,
      i.project_priority as init_priority,
      i.team as initiative_team,
      ia.role as init_role,
      kr.title as kr_title,
      g.title as goal_title
    FROM weekly_checkin_items wci
    JOIN weekly_checkins wc ON wci.checkin_id = wc.id
    JOIN team_members tm ON wc.team_member_id = tm.id
    LEFT JOIN initiatives i ON wci.initiative_id = i.id
    LEFT JOIN initiative_assignments ia ON i.id = ia.initiative_id AND ia.team_member_id = tm.id
    LEFT JOIN key_results kr ON wci.key_result_id = kr.id
    LEFT JOIN goals g ON kr.goal_id = g.id
    WHERE wc.week_start >= ? AND wc.week_start <= ?
    AND wc.status = 'submitted'
    AND wci.time_allocation_pct > 0
  `
  const params = [getMonday(startDate), getMonday(endDate)]

  if (team) {
    sql += ' AND (i.team = ? OR tm.team = ? OR g.team = ?)'
    params.push(team, team, team)
  }
  if (priority) {
    sql += ' AND i.project_priority = ?'
    params.push(priority)
  }

  sql += ' ORDER BY tm.name, i.name, kr.title, wc.week_start'

  const checkinItems = getAll(sql, params)

  // Group by member + project
  const groupedData = {}

  checkinItems.forEach(item => {
    const projectName = item.initiative_name || item.kr_title || 'Unknown'
    const projectPriority = item.init_priority || ''
    const projectTeam = item.initiative_team || item.member_team || ''
    const role = item.init_role || 'Contributor'

    const key = `${item.team_member_id}-${item.initiative_id || 'kr' + item.key_result_id}`

    if (!groupedData[key]) {
      groupedData[key] = {
        project_priority: projectPriority,
        project: projectName,
        team: projectTeam,
        project_role: role,
        team_member: item.member_name,
        weekly: {}
      }
      weeks.forEach(week => {
        groupedData[key].weekly[week] = 0
      })
    }

    if (weeks.includes(item.week_start)) {
      groupedData[key].weekly[item.week_start] = item.time_allocation_pct
    }
  })

  return Object.values(groupedData).sort((a, b) => {
    if (a.project_priority !== b.project_priority) {
      return (a.project_priority || 'Z').localeCompare(b.project_priority || 'Z')
    }
    if (a.project !== b.project) {
      return a.project.localeCompare(b.project)
    }
    return a.team_member.localeCompare(b.team_member)
  })
}

/**
 * Generate export data from estimations (planned allocations)
 */
function generateFromEstimations(options) {
  const { startDate, endDate, team, priority } = options
  const weeks = getWeeksBetween(startDate, endDate)

  let initSql = `
    SELECT DISTINCT
      i.id as initiative_id,
      i.name as initiative_name,
      i.project_priority,
      i.team as initiative_team,
      i.assigned_quarter,
      ia.team_member_id,
      ia.role,
      ia.allocation_percentage as assignment_allocation,
      tm.name as member_name,
      tm.team as member_team
    FROM initiatives i
    JOIN initiative_assignments ia ON i.id = ia.initiative_id
    JOIN team_members tm ON ia.team_member_id = tm.id
    WHERE i.status = 'active'
  `
  const params = []

  if (team) {
    initSql += ' AND (i.team = ? OR tm.team = ?)'
    params.push(team, team)
  }
  if (priority) {
    initSql += ' AND i.project_priority = ?'
    params.push(priority)
  }

  initSql += ' ORDER BY i.project_priority, i.name, tm.name'

  const initiativeMembers = getAll(initSql, params)

  // Fetch weekly allocations
  const allocations = getAll(`
    SELECT
      wa.team_member_id,
      wa.initiative_id,
      wa.week_start,
      wa.allocation_percentage
    FROM weekly_allocations wa
    WHERE wa.week_start >= ? AND wa.week_start <= ?
  `, [getMonday(startDate), getMonday(endDate)])

  // Build allocation lookup
  const allocationMap = {}
  allocations.forEach(a => {
    const key = `${a.initiative_id}-${a.team_member_id}`
    if (!allocationMap[key]) {
      allocationMap[key] = {}
    }
    allocationMap[key][a.week_start] = a.allocation_percentage
  })

  // Build rows
  return initiativeMembers.map(im => {
    const key = `${im.initiative_id}-${im.team_member_id}`
    const weeklyData = allocationMap[key] || {}
    const hasWeeklyAllocations = Object.keys(weeklyData).length > 0

    const row = {
      project_priority: im.project_priority || '',
      project: im.initiative_name,
      team: im.initiative_team || im.member_team || '',
      project_role: im.role,
      team_member: im.member_name,
      weekly: {}
    }

    // If no weekly_allocations exist for this member/initiative,
    // fall back to initiative_assignments.allocation_percentage
    // BUT only for weeks within the initiative's assigned_quarter
    const flatAllocation = im.assignment_allocation || 0
    const assignedQuarter = im.assigned_quarter

    weeks.forEach(week => {
      if (hasWeeklyAllocations) {
        row.weekly[week] = weeklyData[week] || 0
      } else {
        // Only show allocation for weeks within the assigned quarter
        if (isWeekInQuarter(week, assignedQuarter)) {
          row.weekly[week] = flatAllocation
        } else {
          row.weekly[week] = 0
        }
      }
    })

    return row
  })
}

/**
 * Generate PMO export data
 * @param {Object} options - Export options
 * @param {string} options.startDate - Start date for export range
 * @param {string} options.endDate - End date for export range
 * @param {string} [options.team] - Optional team filter
 * @param {string} [options.priority] - Optional priority filter
 * @param {string} [options.source] - 'checkins' for actual work, 'estimations' for planned
 * @returns {Object} Export data with headers and rows
 */
export function generatePMOExportData(options) {
  const { startDate, endDate, source = 'checkins' } = options
  const weeks = getWeeksBetween(startDate, endDate)

  // Generate rows based on source
  const rows = source === 'estimations'
    ? generateFromEstimations(options)
    : generateFromCheckins(options)

  // Build headers
  const headers = {
    fixed: [
      'Project Priority',
      'Project',
      'Team',
      'Project Role / Topics',
      'Team member'
    ],
    weeks: weeks.map(w => formatWeekLabel(w))
  }

  return {
    headers,
    rows,
    metadata: {
      startDate: getMonday(startDate),
      endDate: getMonday(endDate),
      weekCount: weeks.length,
      rowCount: rows.length,
      source,
      generatedAt: new Date().toISOString()
    }
  }
}

/**
 * Convert export data to CSV format
 * @param {Object} exportData - Data from generatePMOExportData
 * @returns {string} CSV content
 */
export function exportToCSV(exportData) {
  const { rows } = exportData

  // Build data rows (no header row)
  const csvRows = []

  rows.forEach(row => {
    const values = [
      row.project_priority,
      row.project,
      row.team,
      row.project_role,
      row.team_member,
      ...Object.values(row.weekly)
    ]

    csvRows.push(values.map(v => {
      if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) {
        return `"${v.replace(/"/g, '""')}"`
      }
      return v
    }).join(','))
  })

  return csvRows.join('\n')
}

/**
 * Export data for Excel format (returns structured data for xlsx library)
 * @param {Object} exportData - Data from generatePMOExportData
 * @returns {Array} Array of row arrays for Excel
 */
export function exportToExcelData(exportData) {
  const { rows, metadata } = exportData

  // Build data rows (no header row)
  const dataRows = rows.map(row => [
    row.project_priority,
    row.project,
    row.team,
    row.project_role,
    row.team_member,
    ...Object.values(row.weekly)
  ])

  return {
    data: dataRows,
    metadata
  }
}

export default {
  generatePMOExportData,
  exportToCSV,
  exportToExcelData
}
