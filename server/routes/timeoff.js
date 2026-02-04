import { Router } from 'express'
import { getAll, getOne, insert, update, deleteRow } from '../db/database.js'

const router = Router()

// Get all time-off records with filters
router.get('/', (req, res) => {
  const { team_member_id, type, start_date, end_date } = req.query

  let sql = `
    SELECT
      t.*,
      tm.name as member_name
    FROM time_off t
    JOIN team_members tm ON t.team_member_id = tm.id
    WHERE 1=1
  `
  const params = []

  if (team_member_id) {
    sql += ' AND t.team_member_id = ?'
    params.push(team_member_id)
  }
  if (type) {
    sql += ' AND t.type = ?'
    params.push(type)
  }
  if (start_date) {
    sql += ' AND t.start_date >= ?'
    params.push(start_date)
  }
  if (end_date) {
    sql += ' AND t.end_date <= ?'
    params.push(end_date)
  }

  sql += ' ORDER BY t.start_date DESC'

  const records = getAll(sql, params)
  res.json(records)
})

// Get time-off summary by quarter
router.get('/summary', (req, res) => {
  const { quarter } = req.query

  if (!quarter) {
    return res.status(400).json({ message: 'Quarter is required' })
  }

  // Parse quarter to get date range
  const [q, year] = quarter.split(' ')
  const quarterNum = parseInt(q.replace('Q', ''))
  const startMonth = (quarterNum - 1) * 3
  const startDate = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
  const endDate = `${year}-${String(startMonth + 3).padStart(2, '0')}-${quarterNum === 1 || quarterNum === 4 ? '31' : '30'}`

  const summary = getAll(`
    SELECT
      tm.id,
      tm.name,
      COALESCE(SUM(CASE WHEN t.type = 'PTO' THEN t.hours ELSE 0 END), 0) as pto_hours,
      COALESCE(SUM(CASE WHEN t.type = 'sick' THEN t.hours ELSE 0 END), 0) as sick_hours,
      COALESCE(SUM(CASE WHEN t.type = 'bank_holiday' THEN t.hours ELSE 0 END), 0) as bank_holiday_hours,
      COALESCE(SUM(CASE WHEN t.type = 'birthday' THEN t.hours ELSE 0 END), 0) as birthday_hours,
      COALESCE(SUM(CASE WHEN t.type = 'parental' THEN t.hours ELSE 0 END), 0) as parental_hours,
      COALESCE(SUM(CASE WHEN t.type = 'bereavement' THEN t.hours ELSE 0 END), 0) as bereavement_hours,
      COALESCE(SUM(CASE WHEN t.type = 'other' THEN t.hours ELSE 0 END), 0) as other_hours,
      COALESCE(SUM(t.hours), 0) as total_hours
    FROM team_members tm
    LEFT JOIN time_off t ON tm.id = t.team_member_id
      AND t.start_date >= ? AND t.end_date <= ?
    GROUP BY tm.id
    ORDER BY tm.name
  `, [startDate, endDate])

  res.json(summary)
})

// Get time-off breakdown by type (for charts)
router.get('/breakdown', (req, res) => {
  const breakdown = getAll(`
    SELECT
      type,
      COUNT(*) as count,
      COALESCE(SUM(hours), 0) as total_hours,
      COUNT(DISTINCT team_member_id) as member_count
    FROM time_off
    GROUP BY type
    ORDER BY total_hours DESC
  `)

  // Also get breakdown per member
  const byMember = getAll(`
    SELECT
      t.team_member_id,
      tm.name as member_name,
      tm.team,
      t.type,
      COUNT(*) as count,
      COALESCE(SUM(t.hours), 0) as total_hours
    FROM time_off t
    JOIN team_members tm ON t.team_member_id = tm.id
    GROUP BY t.team_member_id, t.type
    ORDER BY tm.name, t.type
  `)

  res.json({ breakdown, byMember })
})

// Create time-off record
router.post('/', (req, res) => {
  const { team_member_id, type, start_date, end_date, hours, notes } = req.body

  if (!team_member_id || !type || !start_date || !end_date || !hours) {
    return res.status(400).json({ message: 'team_member_id, type, start_date, end_date, and hours are required' })
  }

  const member = getOne('SELECT * FROM team_members WHERE id = ?', [team_member_id])
  if (!member) {
    return res.status(404).json({ message: 'Team member not found' })
  }

  const result = insert('time_off', {
    team_member_id,
    type,
    start_date,
    end_date,
    hours,
    notes: notes || null,
    source: 'manual'
  })

  const record = getOne(`
    SELECT t.*, tm.name as member_name
    FROM time_off t
    JOIN team_members tm ON t.team_member_id = tm.id
    WHERE t.id = ?
  `, [result.lastInsertRowid])

  res.status(201).json(record)
})

// Update time-off record
router.put('/:id', (req, res) => {
  const { type, start_date, end_date, hours, notes } = req.body

  const existing = getOne('SELECT * FROM time_off WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Time-off record not found' })
  }

  update('time_off', {
    type: type || existing.type,
    start_date: start_date || existing.start_date,
    end_date: end_date || existing.end_date,
    hours: hours !== undefined ? hours : existing.hours,
    notes: notes !== undefined ? notes : existing.notes
  }, 'id = ?', [req.params.id])

  const record = getOne(`
    SELECT t.*, tm.name as member_name
    FROM time_off t
    JOIN team_members tm ON t.team_member_id = tm.id
    WHERE t.id = ?
  `, [req.params.id])

  res.json(record)
})

// Delete time-off record
router.delete('/:id', (req, res) => {
  const existing = getOne('SELECT * FROM time_off WHERE id = ?', [req.params.id])
  if (!existing) {
    return res.status(404).json({ message: 'Time-off record not found' })
  }

  deleteRow('time_off', 'id = ?', [req.params.id])
  res.json({ message: 'Time-off record deleted' })
})

export default router
