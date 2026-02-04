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

// Helper: Format date for display (e.g., "02/06")
function formatWeekLabel(dateStr) {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

// Helper: Get month name from date
function getMonthName(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', { month: 'long' })
}

// Helper: Get month key (YYYY-MM)
function getMonthKey(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Calculate monthly allocation average
function calculateMonthlyAverage(weeklyData, monthKey) {
  const monthWeeks = Object.entries(weeklyData).filter(([week]) => getMonthKey(week) === monthKey)
  if (monthWeeks.length === 0) return 0

  const total = monthWeeks.reduce((sum, [, value]) => sum + (value || 0), 0)
  return Math.round((total / monthWeeks.length) * 10) / 10
}

// Calculate 3-month rolling average
function calculateRollingAverage(weeklyData, weeks) {
  if (weeks.length === 0) return 0

  const total = weeks.reduce((sum, week) => sum + (weeklyData[week] || 0), 0)
  return Math.round((total / weeks.length) * 10) / 10
}

/**
 * Generate PMO export data
 * @param {Object} options - Export options
 * @param {string} options.startDate - Start date for export range
 * @param {string} options.endDate - End date for export range
 * @param {string} [options.team] - Optional team filter
 * @param {string} [options.priority] - Optional priority filter
 * @returns {Object} Export data with headers and rows
 */
export function generatePMOExportData(options) {
  const { startDate, endDate, team, priority } = options

  // Get all weeks in range
  const weeks = getWeeksBetween(startDate, endDate)

  // Get unique months in range
  const months = [...new Set(weeks.map(w => getMonthKey(w)))].sort()

  // Build SQL for fetching allocations
  let initSql = `
    SELECT DISTINCT
      i.id as initiative_id,
      i.name as initiative_name,
      i.project_priority,
      i.team as initiative_team,
      ia.team_member_id,
      ia.role,
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

  // Fetch all weekly allocations for the date range
  const allocations = getAll(`
    SELECT
      wa.team_member_id,
      wa.initiative_id,
      wa.week_start,
      wa.allocation_percentage
    FROM weekly_allocations wa
    WHERE wa.week_start >= ? AND wa.week_start <= ?
  `, [getMonday(startDate), getMonday(endDate)])

  // Build allocation lookup map
  const allocationMap = {}
  allocations.forEach(a => {
    const key = `${a.initiative_id}-${a.team_member_id}`
    if (!allocationMap[key]) {
      allocationMap[key] = {}
    }
    allocationMap[key][a.week_start] = a.allocation_percentage
  })

  // Build export rows
  const rows = initiativeMembers.map(im => {
    const key = `${im.initiative_id}-${im.team_member_id}`
    const weeklyData = allocationMap[key] || {}

    // Calculate monthly averages
    const monthlyAverages = {}
    months.forEach(month => {
      monthlyAverages[month] = calculateMonthlyAverage(weeklyData, month)
    })

    // Calculate 3-month rolling average
    const rollingAverage = calculateRollingAverage(weeklyData, weeks)

    // Build row data
    const row = {
      project_priority: im.project_priority || '',
      project: im.initiative_name,
      team: im.initiative_team || im.member_team || '',
      project_role: im.role,
      team_member: im.member_name,
      // Current month allocation (first month in range)
      allocation_1m: monthlyAverages[months[0]] || 0,
      // 3-month rolling average
      allocation_3m: rollingAverage,
      // Weekly allocations
      weekly: {}
    }

    // Add weekly values
    weeks.forEach(week => {
      row.weekly[week] = weeklyData[week] || 0
    })

    return row
  })

  // Build headers
  const headers = {
    fixed: [
      'Project Priority',
      'Project',
      'Team',
      'Project Role',
      'Team member',
      `Allocation [${getMonthName(months[0] + '-01')}]`,
      'Allocation [3 Months]'
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
      months,
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
  const { headers, rows, metadata } = exportData

  // Build header row
  const allHeaders = [...headers.fixed, ...headers.weeks]
  const csvRows = [allHeaders.map(h => `"${h}"`).join(',')]

  // Build data rows
  rows.forEach(row => {
    const values = [
      row.project_priority,
      row.project,
      row.team,
      row.project_role,
      row.team_member,
      row.allocation_1m,
      row.allocation_3m,
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
  const { headers, rows, metadata } = exportData

  // Build header row
  const allHeaders = [...headers.fixed, ...headers.weeks]

  // Build data rows
  const dataRows = rows.map(row => [
    row.project_priority,
    row.project,
    row.team,
    row.project_role,
    row.team_member,
    row.allocation_1m,
    row.allocation_3m,
    ...Object.values(row.weekly)
  ])

  return {
    headers: allHeaders,
    data: dataRows,
    metadata
  }
}

export default {
  generatePMOExportData,
  exportToCSV,
  exportToExcelData
}
