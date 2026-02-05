import { Router } from 'express'
import { getAll, getOne, insert, run } from '../db/database.js'
import { generatePMOExportData, exportToCSV, exportToExcelData } from '../services/pmoExport.js'

const router = Router()

// Helper: Get Monday of a given week
function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// Generate PMO export
router.get('/pmo', (req, res) => {
  const { start_date, end_date, format, team, priority, source } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({
      message: 'start_date and end_date are required'
    })
  }

  try {
    const exportData = generatePMOExportData({
      startDate: start_date,
      endDate: end_date,
      team,
      priority,
      source: source || 'checkins'
    })

    // Return based on format
    if (format === 'csv') {
      const csv = exportToCSV(exportData)
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="pmo-export-${start_date}-to-${end_date}.csv"`)
      return res.send(csv)
    }

    if (format === 'xlsx') {
      // Return Excel-ready data structure
      // In production, you'd use a library like xlsx to generate actual Excel file
      const excelData = exportToExcelData(exportData)
      res.json({
        format: 'xlsx-data',
        message: 'Excel data structure ready for client-side generation',
        ...excelData
      })
      return
    }

    // Default: return JSON
    res.json(exportData)
  } catch (error) {
    console.error('PMO export error:', error)
    res.status(500).json({ message: 'Failed to generate export', error: error.message })
  }
})

// Preview PMO export (returns summary without full data)
router.get('/pmo/preview', (req, res) => {
  const { start_date, end_date, team, priority, source } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({
      message: 'start_date and end_date are required'
    })
  }

  try {
    const exportData = generatePMOExportData({
      startDate: start_date,
      endDate: end_date,
      team,
      priority,
      source: source || 'checkins'
    })

    // Return preview with first few rows
    res.json({
      metadata: exportData.metadata,
      headers: exportData.headers,
      previewRows: exportData.rows.slice(0, 5),
      totalRows: exportData.rows.length
    })
  } catch (error) {
    console.error('PMO preview error:', error)
    res.status(500).json({ message: 'Failed to generate preview', error: error.message })
  }
})

// Get allocation data pivoted by week (for charts/tables)
router.get('/allocation-matrix', (req, res) => {
  const { start_date, end_date, team_member_id, initiative_id } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({
      message: 'start_date and end_date are required'
    })
  }

  let sql = `
    SELECT
      wa.week_start,
      wa.team_member_id,
      wa.initiative_id,
      wa.allocation_percentage,
      tm.name as member_name,
      i.name as initiative_name,
      i.project_priority
    FROM weekly_allocations wa
    JOIN team_members tm ON wa.team_member_id = tm.id
    JOIN initiatives i ON wa.initiative_id = i.id
    WHERE wa.week_start >= ? AND wa.week_start <= ?
  `
  const params = [getMonday(start_date), getMonday(end_date)]

  if (team_member_id) {
    sql += ' AND wa.team_member_id = ?'
    params.push(team_member_id)
  }
  if (initiative_id) {
    sql += ' AND wa.initiative_id = ?'
    params.push(initiative_id)
  }

  sql += ' ORDER BY wa.week_start, tm.name, i.name'

  const data = getAll(sql, params)

  // Pivot data by member -> week -> initiatives
  const matrix = {}
  const weeks = new Set()
  const initiatives = new Map()

  data.forEach(row => {
    weeks.add(row.week_start)

    if (!matrix[row.team_member_id]) {
      matrix[row.team_member_id] = {
        member_name: row.member_name,
        weeks: {}
      }
    }

    if (!matrix[row.team_member_id].weeks[row.week_start]) {
      matrix[row.team_member_id].weeks[row.week_start] = {
        total: 0,
        initiatives: []
      }
    }

    matrix[row.team_member_id].weeks[row.week_start].total += row.allocation_percentage
    matrix[row.team_member_id].weeks[row.week_start].initiatives.push({
      initiative_id: row.initiative_id,
      initiative_name: row.initiative_name,
      allocation: row.allocation_percentage
    })

    initiatives.set(row.initiative_id, {
      id: row.initiative_id,
      name: row.initiative_name,
      priority: row.project_priority
    })
  })

  res.json({
    weeks: Array.from(weeks).sort(),
    initiatives: Array.from(initiatives.values()),
    matrix
  })
})

// Get team utilization summary
router.get('/utilization', (req, res) => {
  const { start_date, end_date, team } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({
      message: 'start_date and end_date are required'
    })
  }

  let memberSql = 'SELECT id, name, team, weekly_hours FROM team_members WHERE 1=1'
  const memberParams = []

  if (team) {
    memberSql += ' AND team = ?'
    memberParams.push(team)
  }

  const members = getAll(memberSql, memberParams)

  // Get all allocations in range
  const allocations = getAll(`
    SELECT
      wa.team_member_id,
      wa.week_start,
      SUM(wa.allocation_percentage) as total_allocation
    FROM weekly_allocations wa
    WHERE wa.week_start >= ? AND wa.week_start <= ?
    GROUP BY wa.team_member_id, wa.week_start
  `, [getMonday(start_date), getMonday(end_date)])

  // Build allocation lookup
  const allocationMap = {}
  allocations.forEach(a => {
    if (!allocationMap[a.team_member_id]) {
      allocationMap[a.team_member_id] = {}
    }
    allocationMap[a.team_member_id][a.week_start] = a.total_allocation
  })

  // Calculate utilization for each member
  const utilization = members.map(m => {
    const memberAllocations = allocationMap[m.id] || {}
    const weeks = Object.keys(memberAllocations)
    const avgAllocation = weeks.length > 0
      ? weeks.reduce((sum, w) => sum + memberAllocations[w], 0) / weeks.length
      : 0

    const overAllocatedWeeks = weeks.filter(w => memberAllocations[w] > 100).length
    const underAllocatedWeeks = weeks.filter(w => memberAllocations[w] < 80).length

    return {
      member_id: m.id,
      member_name: m.name,
      team: m.team,
      weekly_hours: m.weekly_hours,
      average_allocation: Math.round(avgAllocation * 10) / 10,
      weeks_tracked: weeks.length,
      over_allocated_weeks: overAllocatedWeeks,
      under_allocated_weeks: underAllocatedWeeks,
      status: avgAllocation > 100 ? 'over' : avgAllocation < 80 ? 'under' : 'optimal'
    }
  })

  res.json({
    start_date: getMonday(start_date),
    end_date: getMonday(end_date),
    utilization
  })
})

// =============== Export Configurations ===============

// Save export configuration
router.post('/config', (req, res) => {
  const { name, start_week, end_week, include_months } = req.body

  if (!name || !start_week || !end_week) {
    return res.status(400).json({
      message: 'name, start_week, and end_week are required'
    })
  }

  const result = insert('pmo_export_config', {
    name,
    start_week: getMonday(start_week),
    end_week: getMonday(end_week),
    include_months: include_months ? JSON.stringify(include_months) : null
  })

  const config = getOne('SELECT * FROM pmo_export_config WHERE id = ?', [result.lastInsertRowid])
  res.status(201).json(config)
})

// Get saved configurations
router.get('/config', (req, res) => {
  const configs = getAll('SELECT * FROM pmo_export_config ORDER BY created_at DESC')
  res.json(configs.map(c => ({
    ...c,
    include_months: c.include_months ? JSON.parse(c.include_months) : null
  })))
})

// Delete configuration
router.delete('/config/:id', (req, res) => {
  const existing = getOne('SELECT id FROM pmo_export_config WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Configuration not found' })
  }

  run('DELETE FROM pmo_export_config WHERE id = ?', [req.params.id])
  res.json({ message: 'Configuration deleted' })
})

export default router
