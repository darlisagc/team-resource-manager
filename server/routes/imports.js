import { Router } from 'express'
import multer from 'multer'
import { parse } from 'csv-parse/sync'
import * as XLSX from 'xlsx'
import Tesseract from 'tesseract.js'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { getAll, getOne, insert, run, deleteRow } from '../db/database.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// Name mapping for team members (short names to full names)
const NAME_MAPPING = {
  'darlisa': 'Darlisa Consoni',
  'fabian': 'Fabian Bormann',
  'florian': 'Florian Schumann',
  'gio': 'Giovanni Gargiulo',
  'giovanni': 'Giovanni Gargiulo',
  'luis': 'Luis Zarate',
  'manvir': 'Manvir Schneider',
  'marco': 'Marco Russo',
  'mati': 'Mateusz Czeladka',
  'mateusz': 'Mateusz Czeladka',
  'max': 'Max Grützmacher',
  'satya': 'Satya Ranjan',
  'thomas': 'Thomas Kammerlocher'
}

function resolveTeamMemberName(name) {
  if (!name) return null
  const normalized = name.toLowerCase().trim()
  // Check if it's a short name
  for (const [short, full] of Object.entries(NAME_MAPPING)) {
    if (normalized === short || normalized.includes(short)) {
      return full
    }
  }
  return name
}

// Extract text from Miro board PDF (best quality - text is preserved)
router.post('/miro/extract-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'PDF file is required' })
  }

  try {
    console.log('Extracting text from PDF...')

    // Load PDF using pdfjs-dist
    const loadingTask = pdfjsLib.getDocument({ data: req.file.buffer })
    const pdfDoc = await loadingTask.promise

    let extractedText = ''

    // Extract text from all pages
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map(item => item.str).join(' ')
      extractedText += pageText + '\n'
    }

    console.log('Extracted text from PDF:', extractedText.substring(0, 500))

    // Parse extracted text into tasks
    const tasks = parseTextToTasks(extractedText)

    // Generate CSV
    let csvOutput = 'title,status,priority,assignees,effort\n'
    if (tasks.length > 0) {
      csvOutput += tasks
        .slice(0, 50)
        .map(t => `${t.title},${t.status},${t.priority},${t.assignee},${t.effort}`)
        .join('\n')
    }

    res.json({
      success: true,
      extractedText: extractedText.substring(0, 3000),
      taskCount: tasks.length,
      csv: csvOutput
    })
  } catch (error) {
    console.error('PDF extraction error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to extract text from PDF: ' + error.message
    })
  }
})

// Shared function to parse text into tasks
function parseTextToTasks(text) {
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 3)

  const tasks = []
  const teamMembers = ['Darlisa', 'Fabian', 'Florian', 'Giovanni', 'Gio', 'Luis', 'Manvir', 'Marco', 'Mateusz', 'Mati', 'Max', 'Satya', 'Thomas']
  const statusKeywords = { 'todo': 'todo', 'to do': 'todo', 'backlog': 'todo', 'in progress': 'in-progress', 'doing': 'in-progress', 'wip': 'in-progress', 'done': 'done', 'completed': 'done', 'blocked': 'blocked' }
  const priorityKeywords = { 'high': 'high', 'medium': 'medium', 'low': 'low', 'critical': 'critical', 'urgent': 'critical' }

  // Track seen titles to avoid duplicates
  const seenTitles = new Set()

  for (const line of lines) {
    // Skip very short lines or lines that are just numbers/symbols
    if (line.length < 8 || /^[\d\s\-\.\,]+$/.test(line)) continue

    // Skip lines that are just a team member name
    if (teamMembers.some(m => line.toLowerCase() === m.toLowerCase())) continue

    // Clean up the line
    let title = line.replace(/[^\w\s\-\.\,\:\(\)\/]/g, ' ').replace(/\s+/g, ' ').trim()

    // Skip if too short after cleaning or already seen
    if (title.length < 8 || seenTitles.has(title.toLowerCase())) continue
    seenTitles.add(title.toLowerCase())

    // Check for team member in the line
    const foundMember = teamMembers.find(m => line.toLowerCase().includes(m.toLowerCase()))

    // Check for status
    let status = 'todo'
    for (const [keyword, statusVal] of Object.entries(statusKeywords)) {
      if (line.toLowerCase().includes(keyword)) {
        status = statusVal
        break
      }
    }

    // Check for priority
    let priority = 'medium'
    for (const [keyword, priorityVal] of Object.entries(priorityKeywords)) {
      if (line.toLowerCase().includes(keyword)) {
        priority = priorityVal
        break
      }
    }

    tasks.push({
      title: title,
      status: status,
      priority: priority,
      assignee: foundMember || '',
      effort: ''
    })
  }

  return tasks
}

// Extract text from Miro board image using OCR
router.post('/miro/extract-image', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Image file is required' })
  }

  try {
    console.log('Starting OCR extraction...')

    // Run OCR on the image with optimized settings
    const result = await Tesseract.recognize(
      req.file.buffer,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log('OCR progress:', Math.round(m.progress * 100) + '%')
          }
        },
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
        preserve_interword_spaces: '1'
      }
    )

    const extractedText = result.data.text
    console.log('Extracted text:', extractedText.substring(0, 500))

    // Use shared parsing function
    const tasks = parseTextToTasks(extractedText)

    // Generate CSV
    let csvOutput = 'title,status,priority,assignees,effort\n'
    if (tasks.length > 0) {
      csvOutput += tasks
        .slice(0, 50)
        .map(t => `${t.title},${t.status},${t.priority},${t.assignee},${t.effort}`)
        .join('\n')
    }

    res.json({
      success: true,
      extractedText: extractedText.substring(0, 2000),
      taskCount: tasks.length,
      csv: csvOutput
    })
  } catch (error) {
    console.error('OCR Error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to extract text from image: ' + error.message
    })
  }
})

// Import team members from Personio CSV
router.post('/personio/members', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'CSV file is required' })
  }

  try {
    const records = parse(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true
    })

    const imported = []
    const errors = []

    records.forEach((record, index) => {
      try {
        const name = record.name || record.Name || record.full_name || record['Full Name']
        const email = record.email || record.Email || record.work_email || record['Work Email']
        const role = record.role || record.Role || record.position || record.Position || record.job_title
        const team = record.team || record.Team || record.department || record.Department
        const hours = parseInt(record.weekly_hours || record.hours || record['Weekly Hours']) || 40

        if (!name) {
          errors.push({ row: index + 2, error: 'Name is required' })
          return
        }

        const result = insert('team_members', {
          name,
          email: email || null,
          role: role || null,
          team: team || null,
          weekly_hours: hours
        })

        imported.push({ id: result.lastInsertRowid, name })
      } catch (error) {
        errors.push({ row: index + 2, error: error.message })
      }
    })

    res.json({
      success: true,
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors }
    })
  } catch (error) {
    res.status(400).json({ message: 'Failed to parse CSV: ' + error.message })
  }
})

// Import time-off from Personio CSV
router.post('/personio/timeoff', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'CSV file is required' })
  }

  try {
    const records = parse(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true
    })

    const imported = []
    const errors = []

    // Get all team members for matching
    const members = getAll('SELECT id, name, email FROM team_members')
    const memberMap = new Map()
    members.forEach(m => {
      memberMap.set(m.name.toLowerCase(), m.id)
      if (m.email) memberMap.set(m.email.toLowerCase(), m.id)
    })

    records.forEach((record, index) => {
      try {
        const employeeName = record.employee || record.Employee || record.name || record.Name
        const employeeEmail = record.email || record.Email
        const type = (record.type || record.Type || record.absence_type || 'PTO').toUpperCase()
        const startDate = record.start_date || record['Start Date'] || record.from
        const endDate = record.end_date || record['End Date'] || record.to
        const hours = parseFloat(record.hours || record.Hours || record.duration) || 8

        // Find team member
        let memberId = null
        if (employeeEmail) memberId = memberMap.get(employeeEmail.toLowerCase())
        if (!memberId && employeeName) memberId = memberMap.get(employeeName.toLowerCase())

        if (!memberId) {
          errors.push({ row: index + 2, error: `Team member not found: ${employeeName || employeeEmail}` })
          return
        }

        // Normalize type
        let normalizedType = 'PTO'
        if (type.includes('SICK')) normalizedType = 'sick'
        else if (type.includes('HOLIDAY') || type.includes('PUBLIC')) normalizedType = 'holiday'

        const result = insert('time_off', {
          team_member_id: memberId,
          type: normalizedType,
          start_date: startDate,
          end_date: endDate,
          hours,
          source: 'personio'
        })

        imported.push({ id: result.lastInsertRowid, employee: employeeName })
      } catch (error) {
        errors.push({ row: index + 2, error: error.message })
      }
    })

    res.json({
      success: true,
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors }
    })
  } catch (error) {
    res.status(400).json({ message: 'Failed to parse CSV: ' + error.message })
  }
})

// Import goals from Leapsome CSV
router.post('/leapsome/goals', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'CSV file is required' })
  }

  try {
    const records = parse(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true
    })

    const imported = []
    const errors = []

    // Get all team members for matching
    const members = getAll('SELECT id, name, email FROM team_members')
    const memberMap = new Map()
    members.forEach(m => {
      memberMap.set(m.name.toLowerCase(), m.id)
      if (m.email) memberMap.set(m.email.toLowerCase(), m.id)
    })

    records.forEach((record, index) => {
      try {
        const externalId = record.id || record.ID || record.goal_id
        const title = record.title || record.Title || record.name || record.Name
        const description = record.description || record.Description
        const quarter = record.quarter || record.Quarter || record.cycle
        const ownerName = record.owner || record.Owner
        const team = record.team || record.Team
        const status = (record.status || record.Status || 'active').toLowerCase()
        const progress = parseInt(record.progress || record.Progress) || 0
        const assignees = record.assignees || record.Assignees || record.contributors

        if (!title || !quarter) {
          errors.push({ row: index + 2, error: 'Title and quarter are required' })
          return
        }

        // Find owner
        let ownerId = null
        if (ownerName) ownerId = memberMap.get(ownerName.toLowerCase())

        const result = insert('goals', {
          external_id: externalId || null,
          title,
          description: description || null,
          quarter,
          status: ['active', 'completed', 'cancelled'].includes(status) ? status : 'active',
          progress,
          owner_id: ownerId,
          team: team || null,
          source: 'leapsome'
        })

        // Add assignees
        if (assignees) {
          const assigneeNames = assignees.split(/[,;]/).map(n => n.trim())
          assigneeNames.forEach(name => {
            const memberId = memberMap.get(name.toLowerCase())
            if (memberId) {
              run('INSERT OR IGNORE INTO goal_assignees (goal_id, team_member_id, source) VALUES (?, ?, ?)',
                [result.lastInsertRowid, memberId, 'leapsome'])
            }
          })
        }

        imported.push({ id: result.lastInsertRowid, title })
      } catch (error) {
        errors.push({ row: index + 2, error: error.message })
      }
    })

    res.json({
      success: true,
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors }
    })
  } catch (error) {
    res.status(400).json({ message: 'Failed to parse CSV: ' + error.message })
  }
})

// Import full hierarchy from Leapsome Excel (Goal → Key Result → Initiative)
router.post('/leapsome/goals-xlsx', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Excel file is required' })
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0] // Usually 'Summary'
    const sheet = workbook.Sheets[sheetName]
    const records = XLSX.utils.sheet_to_json(sheet)

    const imported = { goals: [], keyResults: [], initiatives: [] }
    const errors = []
    const goalIdMap = new Map() // Map external IDs to internal IDs
    const krIdMap = new Map() // Map KR external IDs to internal IDs

    // Get all team members for matching
    const members = getAll('SELECT id, name, email FROM team_members')
    const memberMap = new Map()
    members.forEach(m => {
      memberMap.set(m.name.toLowerCase(), m.id)
      const firstName = m.name.split(' ')[0].toLowerCase()
      memberMap.set(firstName, m.id)
      if (m.email) memberMap.set(m.email.toLowerCase(), m.id)
    })

    // Clear existing leapsome data (cascade will handle children)
    run("DELETE FROM key_result_assignees WHERE source = 'leapsome'")
    run("DELETE FROM initiative_assignments WHERE source = 'leapsome'")
    run("DELETE FROM initiatives WHERE source = 'leapsome'")
    run("DELETE FROM key_results WHERE source = 'leapsome'")
    run("DELETE FROM goal_assignees WHERE source = 'leapsome'")
    run("DELETE FROM goals WHERE source = 'leapsome'")

    // First pass: Import Goals
    records.forEach((record, index) => {
      try {
        const goalType = record['Goal / Key Result']
        if (goalType !== 'Goal') return

        const externalId = record['ID']
        const title = record['Name']
        const description = record['Description'] || null
        const goalCycle = record['Goal Cycle'] || 'GKRs 2026 Cycle'
        const status = (record['Status'] || 'Draft').toLowerCase()
        const progress = parseInt(record['Progress (%)']) || 0
        const ownerName = record['Owner']

        if (!title) {
          errors.push({ row: index + 2, error: 'Title is required' })
          return
        }

        // Determine quarter from goal cycle
        let quarter = 'Q1 2026'
        if (goalCycle.includes('2025')) quarter = goalCycle.includes('Q4') ? 'Q4 2025' : 'Q1 2025'
        else if (goalCycle.includes('2026')) quarter = 'Q1 2026'

        // Find owner
        let ownerId = null
        if (ownerName) {
          const resolvedOwner = resolveTeamMemberName(ownerName)
          ownerId = memberMap.get(resolvedOwner?.toLowerCase())
        }

        // Normalize status
        let normalizedStatus = 'active'
        if (status.includes('draft')) normalizedStatus = 'draft'
        else if (status.includes('done') || status.includes('complete')) normalizedStatus = 'completed'
        else if (status.includes('cancel')) normalizedStatus = 'cancelled'

        const result = insert('goals', {
          external_id: externalId || null,
          title,
          description,
          quarter,
          status: normalizedStatus,
          progress,
          owner_id: ownerId,
          team: 'Ecosystem Engineering',
          source: 'leapsome'
        })

        goalIdMap.set(externalId, result.lastInsertRowid)

        // Add contributors as assignees
        for (let i = 1; i <= 6; i++) {
          const contributor = record[`Contributor ${i}`]
          if (contributor) {
            const resolvedName = resolveTeamMemberName(contributor)
            const memberId = memberMap.get(resolvedName?.toLowerCase())
            if (memberId) {
              run('INSERT OR IGNORE INTO goal_assignees (goal_id, team_member_id, source) VALUES (?, ?, ?)',
                [result.lastInsertRowid, memberId, 'leapsome'])
            }
          }
        }

        imported.goals.push({ id: result.lastInsertRowid, title, externalId })
      } catch (error) {
        errors.push({ row: index + 2, error: error.message })
      }
    })

    // Second pass: Import Key Results and link to goals
    records.forEach((record, index) => {
      try {
        const goalType = record['Goal / Key Result']
        if (goalType !== 'Key Result') return

        const externalId = record['ID']
        const title = record['Name']
        const description = record['Description'] || null
        const parentId = record['Parent ID']
        const status = (record['Status'] || 'Draft').toLowerCase()
        const progress = parseInt(record['Progress (%)']) || 0
        const ownerName = record['Owner']
        const metric = record['Metric'] || null
        const current = parseFloat(record['Current']) || null
        const target = parseFloat(record['Target']) || null

        if (!title) {
          errors.push({ row: index + 2, error: 'Title is required for Key Result' })
          return
        }

        // Find parent goal
        const parentGoalId = goalIdMap.get(parentId)
        if (!parentGoalId) {
          errors.push({ row: index + 2, error: `Parent goal not found for KR: ${title}` })
          return
        }

        // Find owner
        let ownerId = null
        if (ownerName) {
          const resolvedOwner = resolveTeamMemberName(ownerName)
          ownerId = memberMap.get(resolvedOwner?.toLowerCase())
        }

        // Normalize status
        let normalizedStatus = 'active'
        if (status.includes('draft')) normalizedStatus = 'draft'
        else if (status.includes('done') || status.includes('complete')) normalizedStatus = 'completed'
        else if (status.includes('cancel')) normalizedStatus = 'cancelled'

        const result = insert('key_results', {
          external_id: externalId || null,
          title,
          description,
          goal_id: parentGoalId,
          owner_id: ownerId,
          metric,
          current_value: current,
          target_value: target,
          progress,
          status: normalizedStatus,
          source: 'leapsome'
        })

        krIdMap.set(externalId, result.lastInsertRowid)

        // Add contributors as assignees
        for (let i = 1; i <= 6; i++) {
          const contributor = record[`Contributor ${i}`]
          if (contributor) {
            const resolvedName = resolveTeamMemberName(contributor)
            const memberId = memberMap.get(resolvedName?.toLowerCase())
            if (memberId) {
              run('INSERT OR IGNORE INTO key_result_assignees (key_result_id, team_member_id, source) VALUES (?, ?, ?)',
                [result.lastInsertRowid, memberId, 'leapsome'])
            }
          }
        }

        imported.keyResults.push({ id: result.lastInsertRowid, title, parentGoalId, externalId })
      } catch (error) {
        errors.push({ row: index + 2, error: error.message })
      }
    })

    // Third pass: Import Initiatives (if present in Leapsome export)
    // Note: Leapsome may have Initiatives as a third level, or they might be embedded in KRs
    records.forEach((record, index) => {
      try {
        const goalType = record['Goal / Key Result']
        if (goalType !== 'Initiative') return

        const externalId = record['ID']
        const title = record['Name']
        const description = record['Description'] || null
        const parentId = record['Parent ID']
        const status = (record['Status'] || 'active').toLowerCase()
        const ownerName = record['Owner']

        if (!title) {
          errors.push({ row: index + 2, error: 'Title is required for Initiative' })
          return
        }

        // Find parent key result
        const parentKrId = krIdMap.get(parentId)

        // Find owner
        let ownerId = null
        if (ownerName) {
          const resolvedOwner = resolveTeamMemberName(ownerName)
          ownerId = memberMap.get(resolvedOwner?.toLowerCase())
        }

        // Normalize status
        let normalizedStatus = 'active'
        if (status.includes('done') || status.includes('complete')) normalizedStatus = 'completed'
        else if (status.includes('hold')) normalizedStatus = 'on-hold'
        else if (status.includes('cancel')) normalizedStatus = 'cancelled'

        const result = insert('initiatives', {
          external_id: externalId || null,
          name: title,
          description,
          key_result_id: parentKrId || null,
          project_priority: null,
          team: 'Ecosystem Engineering',
          status: normalizedStatus,
          owner_id: ownerId,
          source: 'leapsome'
        })

        // Add contributors as assignments
        for (let i = 1; i <= 6; i++) {
          const contributor = record[`Contributor ${i}`]
          if (contributor) {
            const resolvedName = resolveTeamMemberName(contributor)
            const memberId = memberMap.get(resolvedName?.toLowerCase())
            if (memberId) {
              run('INSERT OR IGNORE INTO initiative_assignments (initiative_id, team_member_id, role, source) VALUES (?, ?, ?, ?)',
                [result.lastInsertRowid, memberId, 'Contributor', 'leapsome'])
            }
          }
        }

        // Set owner as Lead
        if (ownerId) {
          run('INSERT OR IGNORE INTO initiative_assignments (initiative_id, team_member_id, role, source) VALUES (?, ?, ?, ?)',
            [result.lastInsertRowid, ownerId, 'Lead', 'leapsome'])
        }

        imported.initiatives.push({ id: result.lastInsertRowid, title, parentKrId })
      } catch (error) {
        errors.push({ row: index + 2, error: error.message })
      }
    })

    res.json({
      success: true,
      imported: imported.goals.length + imported.keyResults.length + imported.initiatives.length,
      goals: imported.goals.length,
      keyResults: imported.keyResults.length,
      initiatives: imported.initiatives.length,
      errors: errors.length,
      details: { imported, errors: errors.slice(0, 20) }
    })
  } catch (error) {
    res.status(400).json({ message: 'Failed to parse Excel: ' + error.message })
  }
})

// Parse Miro's flat CSV export (task names mixed with assignee names)
router.post('/miro/extract-csv', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'CSV file is required' })
  }

  try {
    const content = req.file.buffer.toString('utf-8')
    const lines = content.split('\n')
      .map(line => line.replace(/^"|"$/g, '').trim())
      .filter(line => line.length > 0)

    const teamMembers = ['Darlisa', 'Fabian', 'Florian', 'Giovanni', 'Gio', 'Luis', 'Manvir', 'Marco', 'Mateusz', 'Mati', 'Max', 'Satya', 'Thomas']
    const categoryKeywords = ['2026 Q1', '2026 Q2', '2026 Q3', '2026 Q4', '2026 Roadmap', 'Team Ecosystem', 'Main Story', 'Side Quests', 'Proof of Concepts', 'Ecosystem Enabler', 'Ecosystem & Research', 'The Unknown', 'The Known Unknown', 'Advanced Integations']

    const tasks = []
    const seenTasks = new Set()
    let currentTask = null
    let currentAssignees = []

    for (const line of lines) {
      // Skip empty, category headers, and quarter labels
      if (!line || categoryKeywords.some(k => line.includes(k))) continue
      if (line === '?' || line === '& Reeve') continue

      // Check if this line is a team member name
      const isTeamMember = teamMembers.some(m => m.toLowerCase() === line.toLowerCase())

      if (isTeamMember) {
        // Add to current task's assignees
        if (currentTask) {
          const normalizedName = teamMembers.find(m => m.toLowerCase() === line.toLowerCase()) || line
          if (!currentAssignees.includes(normalizedName)) {
            currentAssignees.push(normalizedName)
          }
        }
      } else {
        // This is a task name
        // Save previous task if exists
        if (currentTask && !seenTasks.has(currentTask.toLowerCase())) {
          seenTasks.add(currentTask.toLowerCase())
          tasks.push({
            title: currentTask,
            status: 'todo',
            priority: 'medium',
            assignees: currentAssignees.join(';'),
            effort: ''
          })
        }
        // Start new task
        currentTask = line
        currentAssignees = []
      }
    }

    // Don't forget the last task
    if (currentTask && !seenTasks.has(currentTask.toLowerCase())) {
      tasks.push({
        title: currentTask,
        status: 'todo',
        priority: 'medium',
        assignees: currentAssignees.join(';'),
        effort: ''
      })
    }

    // Generate CSV output
    let csvOutput = 'title,status,priority,assignees,effort\n'
    csvOutput += tasks
      .map(t => `${t.title.replace(/,/g, ' ')},${t.status},${t.priority},${t.assignees},${t.effort}`)
      .join('\n')

    res.json({
      success: true,
      taskCount: tasks.length,
      csv: csvOutput,
      tasks: tasks
    })
  } catch (error) {
    console.error('CSV parsing error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to parse CSV: ' + error.message
    })
  }
})

// Calculate similarity between two strings (0-100)
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()

  // Exact match
  if (s1 === s2) return 100

  // Word-based similarity
  const words1 = s1.split(/\s+/).filter(w => w.length > 2)
  const words2 = s2.split(/\s+/).filter(w => w.length > 2)

  if (words1.length === 0 || words2.length === 0) return 0

  // Count matching words
  const matchingWords = words1.filter(w1 =>
    words2.some(w2 => w2.includes(w1) || w1.includes(w2))
  ).length

  // Calculate percentage of matching words
  const maxWords = Math.max(words1.length, words2.length)
  const wordSimilarity = (matchingWords / maxWords) * 100

  // Also check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return Math.max(wordSimilarity, 70)
  }

  return Math.round(wordSimilarity)
}

// Check for duplicate and similar items against initiatives, goals, and key results (for Miro import)
router.post('/miro/check-duplicates', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'CSV file is required' })
  }

  try {
    const records = parse(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true
    })

    // Get existing initiatives with their hierarchy info
    const existingInitiatives = getAll(`
      SELECT
        i.id, i.name as title, i.status, i.source,
        kr.title as key_result_title,
        g.title as goal_title
      FROM initiatives i
      LEFT JOIN key_results kr ON i.key_result_id = kr.id
      LEFT JOIN goals g ON kr.goal_id = g.id
    `)

    // Get existing goals (especially Leapsome goals)
    const existingGoals = getAll(`
      SELECT
        g.id, g.title, g.status, g.source, g.quarter,
        g.title as goal_title,
        NULL as key_result_title
      FROM goals g
    `)

    // Get existing key results
    const existingKeyResults = getAll(`
      SELECT
        kr.id, kr.title, kr.status, kr.source,
        g.title as goal_title,
        kr.title as key_result_title
      FROM key_results kr
      LEFT JOIN goals g ON kr.goal_id = g.id
    `)

    // Also check against tasks for backward compatibility
    const existingTasks = getAll(`
      SELECT t.id, t.title, t.status, t.source, g.title as goal_title, NULL as key_result_title
      FROM tasks t
      LEFT JOIN goals g ON t.parent_goal_id = g.id
    `)

    const allExisting = [
      ...existingGoals.map(g => ({ ...g, type: 'goal' })),
      ...existingKeyResults.map(kr => ({ ...kr, type: 'key_result' })),
      ...existingInitiatives.map(i => ({ ...i, type: 'initiative' })),
      ...existingTasks.map(t => ({ ...t, type: 'task' }))
    ]

    const existingTitlesMap = new Map()
    allExisting.forEach(item => {
      existingTitlesMap.set(item.title.toLowerCase().trim(), item)
    })

    const duplicates = []  // Exact matches
    const similar = []     // Similar but not exact
    const leapsomeMatches = []  // Matches specifically against Leapsome items
    const newItems = []

    const SIMILARITY_THRESHOLD = 50  // Consider similar if >= 50% match

    records.forEach((record, index) => {
      const title = record.title || record.Title || record.name || record.Name
      if (!title) return

      const normalizedTitle = title.toLowerCase().trim()

      // Check for exact match
      const exactMatch = existingTitlesMap.get(normalizedTitle)
      if (exactMatch) {
        const matchData = {
          row: index + 1,
          title: title,
          existingId: exactMatch.id,
          existingTitle: exactMatch.title,
          existingType: exactMatch.type,
          existingStatus: exactMatch.status,
          existingSource: exactMatch.source,
          goalTitle: exactMatch.goal_title,
          keyResultTitle: exactMatch.key_result_title,
          quarter: exactMatch.quarter,
          similarity: 100
        }

        if (exactMatch.source === 'leapsome') {
          leapsomeMatches.push(matchData)
        }
        duplicates.push(matchData)
        return
      }

      // Check for similar matches - track all matches above threshold
      const matchesFound = []

      for (const existing of allExisting) {
        const sim = calculateSimilarity(title, existing.title)
        if (sim >= SIMILARITY_THRESHOLD) {
          matchesFound.push({
            existing,
            similarity: sim
          })
        }
      }

      // Sort by similarity descending
      matchesFound.sort((a, b) => b.similarity - a.similarity)

      if (matchesFound.length > 0) {
        const bestMatch = matchesFound[0]

        const matchData = {
          row: index + 1,
          title: title,
          existingId: bestMatch.existing.id,
          existingTitle: bestMatch.existing.title,
          existingType: bestMatch.existing.type,
          existingStatus: bestMatch.existing.status,
          existingSource: bestMatch.existing.source,
          goalTitle: bestMatch.existing.goal_title,
          keyResultTitle: bestMatch.existing.key_result_title,
          quarter: bestMatch.existing.quarter,
          similarity: bestMatch.similarity,
          // Include other potential matches
          otherMatches: matchesFound.slice(1, 4).map(m => ({
            id: m.existing.id,
            title: m.existing.title,
            type: m.existing.type,
            source: m.existing.source,
            similarity: m.similarity
          }))
        }

        // Check if any of the matches are from Leapsome
        const leapsomeMatch = matchesFound.find(m => m.existing.source === 'leapsome')
        if (leapsomeMatch) {
          leapsomeMatches.push({
            ...matchData,
            leapsomeMatch: {
              id: leapsomeMatch.existing.id,
              title: leapsomeMatch.existing.title,
              type: leapsomeMatch.existing.type,
              similarity: leapsomeMatch.similarity,
              goalTitle: leapsomeMatch.existing.goal_title,
              quarter: leapsomeMatch.existing.quarter
            }
          })
        }

        similar.push(matchData)
      } else {
        newItems.push({ row: index + 1, title })
      }
    })

    res.json({
      success: true,
      total: records.length,
      duplicates: duplicates,
      duplicateCount: duplicates.length,
      similar: similar,
      similarCount: similar.length,
      leapsomeMatches: leapsomeMatches,
      leapsomeMatchCount: leapsomeMatches.length,
      newItems: newItems,
      newCount: newItems.length
    })
  } catch (error) {
    res.status(400).json({ message: 'Failed to parse CSV: ' + error.message })
  }
})

// Import Miro items as Initiatives under BAU key result (with deduplication)
router.post('/miro/initiatives', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'CSV file is required' })
  }

  const duplicateAction = req.query.duplicateAction || 'skip' // skip, replace, or create

  try {
    const records = parse(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true
    })

    const imported = []
    const skipped = []
    const matched = []
    const errors = []
    const unmatchedAssignees = new Set()

    // Get the BAU key result (under "Business as Usual / Others" goal)
    const bauKeyResult = getOne(`
      SELECT kr.id FROM key_results kr
      JOIN goals g ON kr.goal_id = g.id
      WHERE g.title LIKE '%Business as Usual%'
      LIMIT 1
    `)
    const bauKeyResultId = bauKeyResult?.id || null

    // Get all team members for matching
    const members = getAll('SELECT id, name, email FROM team_members')
    const memberMap = new Map()
    members.forEach(m => {
      memberMap.set(m.name.toLowerCase(), m.id)
      const firstName = m.name.split(' ')[0].toLowerCase()
      memberMap.set(firstName, m.id)
      if (m.email) memberMap.set(m.email.toLowerCase(), m.id)
    })
    memberMap.set('gio', memberMap.get('giovanni'))
    memberMap.set('mati', memberMap.get('mateusz'))

    // Get existing initiatives for duplicate detection
    const existingInitiatives = getAll('SELECT id, name FROM initiatives')
    const existingMap = new Map()
    existingInitiatives.forEach(i => {
      existingMap.set(i.name.toLowerCase().trim(), i.id)
    })

    records.forEach((record, index) => {
      try {
        const title = record.title || record.Title || record.name || record.Name || record.content
        const description = record.description || record.Description
        const assignees = record.assignees || record.Assignees || record.assigned_to || record.owner
        const priority = record.priority || record.Priority

        if (!title) {
          errors.push({ row: index + 2, error: 'Title is required' })
          return
        }

        const normalizedTitle = title.toLowerCase().trim()

        // Check for exact duplicate
        const existingId = existingMap.get(normalizedTitle)
        if (existingId) {
          if (duplicateAction === 'skip') {
            skipped.push({ title, reason: 'exact duplicate', existingId })
            return
          } else if (duplicateAction === 'replace') {
            // Delete existing and create new
            run('DELETE FROM initiative_assignments WHERE initiative_id = ?', [existingId])
            deleteRow('initiatives', 'id = ?', [existingId])
          }
          // If 'create', continue to create new
        }

        // Check for similar matches when skipping
        if (duplicateAction === 'skip') {
          for (const existing of existingInitiatives) {
            const sim = calculateSimilarity(title, existing.name)
            if (sim >= 50) {
              // Record potential match for user review
              insert('duplicate_matches', {
                source_type: 'miro',
                source_title: title,
                matched_initiative_id: existing.id,
                similarity_score: sim,
                status: 'pending'
              })
              matched.push({ title, matchedTitle: existing.name, similarity: sim, existingId: existing.id })
              return
            }
          }
        }

        // Normalize priority
        let projectPriority = null
        if (priority) {
          const p = priority.toLowerCase()
          if (p.includes('critical') || p.includes('p1')) projectPriority = 'P1'
          else if (p.includes('high') || p.includes('p2')) projectPriority = 'P2'
          else if (p.includes('medium') || p.includes('p3')) projectPriority = 'P3'
          else if (p.includes('low') || p.includes('p4')) projectPriority = 'P4'
        }

        // Create initiative under BAU key result
        const result = insert('initiatives', {
          name: title,
          description: description || null,
          project_priority: projectPriority,
          team: 'General',
          status: 'active',
          key_result_id: bauKeyResultId,
          source: 'miro'
        })

        existingMap.set(normalizedTitle, result.lastInsertRowid)

        // Add assignees
        if (assignees) {
          const assigneeNames = assignees.split(/[,;]/).map(n => n.trim()).filter(n => n)
          assigneeNames.forEach((name, idx) => {
            const normalizedName = name.toLowerCase()
            let memberId = memberMap.get(normalizedName)

            if (!memberId) {
              for (const [key, id] of memberMap.entries()) {
                if (normalizedName.includes(key) || key.includes(normalizedName)) {
                  memberId = id
                  break
                }
              }
            }

            if (memberId) {
              const role = idx === 0 ? 'Lead' : 'Contributor'
              run('INSERT OR IGNORE INTO initiative_assignments (initiative_id, team_member_id, role, source) VALUES (?, ?, ?, ?)',
                [result.lastInsertRowid, memberId, role, 'miro'])
            } else if (name.length > 1) {
              unmatchedAssignees.add(name)
            }
          })
        }

        imported.push({ id: result.lastInsertRowid, title })
      } catch (error) {
        errors.push({ row: index + 2, error: error.message })
      }
    })

    res.json({
      success: true,
      imported: imported.length,
      skipped: skipped.length,
      matched: matched.length,
      errors: errors.length,
      unmatchedAssignees: Array.from(unmatchedAssignees),
      details: { imported, skipped, matched, errors }
    })
  } catch (error) {
    res.status(400).json({ message: 'Failed to parse CSV: ' + error.message })
  }
})

// Resolve duplicate match (confirm or reject)
router.post('/duplicates/:id/resolve', (req, res) => {
  const { action } = req.body // 'confirm' or 'reject'

  const match = getOne('SELECT * FROM duplicate_matches WHERE id = ?', [req.params.id])
  if (!match) {
    return res.status(404).json({ message: 'Match not found' })
  }

  if (action === 'confirm') {
    // Mark as confirmed - the Miro item is a duplicate of the existing initiative
    run('UPDATE duplicate_matches SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['confirmed', req.params.id])
  } else if (action === 'reject') {
    // Mark as rejected - create the Miro item as a new initiative
    run('UPDATE duplicate_matches SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['rejected', req.params.id])

    // Create new initiative from the source title
    const result = insert('initiatives', {
      name: match.source_title,
      team: 'Ecosystem Engineering',
      status: 'active',
      source: 'miro'
    })

    return res.json({
      message: 'Match rejected, new initiative created',
      newInitiativeId: result.lastInsertRowid
    })
  }

  res.json({ message: `Match ${action}ed` })
})

// Get pending duplicate matches
router.get('/duplicates/pending', (req, res) => {
  const matches = getAll(`
    SELECT
      dm.*,
      i.name as matched_initiative_name,
      i.status as matched_initiative_status,
      kr.title as key_result_title,
      g.title as goal_title
    FROM duplicate_matches dm
    LEFT JOIN initiatives i ON dm.matched_initiative_id = i.id
    LEFT JOIN key_results kr ON i.key_result_id = kr.id
    LEFT JOIN goals g ON kr.goal_id = g.id
    WHERE dm.status = 'pending'
    ORDER BY dm.similarity_score DESC
  `)
  res.json(matches)
})

// Import initiatives from Miro CSV (creates initiatives linked to goals/KRs)
router.post('/miro/tasks', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'CSV file is required' })
  }

  // Get duplicate action from query string: 'skip', 'replace', or 'keep' (default)
  const duplicateAction = req.query.duplicateAction || 'keep'

  try {
    const records = parse(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true
    })

    const imported = []
    const skipped = []
    const replaced = []
    const errors = []
    const unmatchedAssignees = new Set()

    // Get all team members for matching
    const members = getAll('SELECT id, name, email FROM team_members')
    const memberMap = new Map()
    members.forEach(m => {
      memberMap.set(m.name.toLowerCase(), m.id)
      const firstName = m.name.split(' ')[0].toLowerCase()
      memberMap.set(firstName, m.id)
      if (m.email) memberMap.set(m.email.toLowerCase(), m.id)
    })

    // Add nickname mappings
    memberMap.set('gio', memberMap.get('giovanni'))
    memberMap.set('mati', memberMap.get('mateusz'))

    // Get existing initiatives for duplicate detection
    const existingInitiatives = getAll('SELECT id, name FROM initiatives')
    const existingTitlesMap = new Map()
    existingInitiatives.forEach(i => {
      existingTitlesMap.set(i.name.toLowerCase().trim(), i.id)
    })

    // Cache for goal → first key result lookups
    const goalKrCache = new Map()
    function getFirstKrForGoal(goalId) {
      if (goalKrCache.has(goalId)) return goalKrCache.get(goalId)
      const kr = getOne('SELECT id FROM key_results WHERE goal_id = ? ORDER BY id LIMIT 1', [goalId])
      goalKrCache.set(goalId, kr ? kr.id : null)
      return kr ? kr.id : null
    }

    // Find BAU goal and its first KR
    const bauGoal = getOne("SELECT id FROM goals WHERE title LIKE '%Business as Usual%' ORDER BY id DESC LIMIT 1")
    const bauKrId = bauGoal ? getFirstKrForGoal(bauGoal.id) : null

    records.forEach((record, index) => {
      try {
        const externalId = record.id || record.ID || record.card_id
        const title = record.title || record.Title || record.name || record.Name || record.content
        const description = record.description || record.Description
        const status = (record.status || record.Status || 'active').toLowerCase().trim()
        const priority = (record.priority || record.Priority || '').toUpperCase().trim()
        const assignees = record.assignees || record.Assignees || record.assigned_to || record.owner
        const goalId = record.goal_id || ''
        const bauCategory = record.bau_category || ''

        if (!title) {
          errors.push({ row: index + 2, error: 'Title is required' })
          return
        }

        // Check for exact duplicate
        const normalizedTitle = title.toLowerCase().trim()
        const existingId = existingTitlesMap.get(normalizedTitle)

        if (existingId) {
          if (duplicateAction === 'skip') {
            skipped.push({ title, reason: 'exact duplicate' })
            return
          } else if (duplicateAction === 'replace') {
            // Delete existing initiative and its assignments
            run('DELETE FROM initiative_assignments WHERE initiative_id = ?', [existingId])
            deleteRow('initiatives', 'id = ?', [existingId])
            replaced.push({ title, oldId: existingId })
          }
          // If 'keep', we just create a new one (duplicate allowed)
        } else if (duplicateAction === 'skip') {
          // Also check for similar matches when skipping
          const allInitiatives = getAll('SELECT id, name FROM initiatives')
          for (const existing of allInitiatives) {
            const sim = calculateSimilarity(title, existing.name)
            if (sim >= 50) {
              skipped.push({ title, reason: `${sim}% similar to "${existing.name}"` })
              return
            }
          }
        }

        // Normalize status to match initiatives table constraint
        let normalizedStatus = 'active'
        if (status === 'draft') normalizedStatus = 'draft'
        else if (status === 'active') normalizedStatus = 'active'
        else if (status === 'in-progress' || status.includes('progress') || status.includes('doing')) normalizedStatus = 'in-progress'
        else if (status === 'completed' || status.includes('done') || status.includes('complete')) normalizedStatus = 'completed'
        else if (status === 'on-hold' || status.includes('hold')) normalizedStatus = 'on-hold'
        else if (status === 'cancelled' || status.includes('cancel')) normalizedStatus = 'cancelled'

        // Normalize priority to P1-P4
        let normalizedPriority = null
        if (priority === 'P1' || priority === 'P2' || priority === 'P3' || priority === 'P4') {
          normalizedPriority = priority
        }

        // Determine key_result_id based on goal association
        let keyResultId = null
        let category = null

        if (goalId && goalId !== 'bau' && goalId !== '') {
          // Linked to a specific goal - find its first KR
          keyResultId = getFirstKrForGoal(parseInt(goalId))
        } else if (goalId === 'bau' && bauCategory) {
          // BAU with specific category
          keyResultId = bauKrId
          category = bauCategory
        } else {
          // Default: BAU (no goal selected)
          keyResultId = bauKrId
        }

        const result = insert('initiatives', {
          external_id: externalId || null,
          name: title,
          description: description || null,
          key_result_id: keyResultId,
          project_priority: normalizedPriority,
          team: 'Ecosystem Engineering',
          status: normalizedStatus,
          owner_id: null,
          source: 'miro',
          progress: 0,
          category: category || null
        })

        // Update the map so subsequent duplicates in same import are detected
        existingTitlesMap.set(normalizedTitle, result.lastInsertRowid)

        // Add assignees as initiative_assignments with improved matching
        let firstAssigneeId = null
        if (assignees) {
          const assigneeNames = assignees.split(/[,;]/).map(n => n.trim()).filter(n => n)
          assigneeNames.forEach((name, i) => {
            const normalizedName = name.toLowerCase()
            let memberId = memberMap.get(normalizedName)

            if (!memberId) {
              for (const [key, id] of memberMap.entries()) {
                if (normalizedName.includes(key) || key.includes(normalizedName)) {
                  memberId = id
                  break
                }
              }
            }

            if (memberId) {
              run('INSERT OR IGNORE INTO initiative_assignments (initiative_id, team_member_id, role, source) VALUES (?, ?, ?, ?)',
                [result.lastInsertRowid, memberId, i === 0 ? 'Lead' : 'Contributor', 'miro'])
              if (i === 0) firstAssigneeId = memberId
            } else if (name.length > 1) {
              unmatchedAssignees.add(name)
            }
          })
        }

        // Set first assignee as owner
        if (firstAssigneeId) {
          run('UPDATE initiatives SET owner_id = ? WHERE id = ?', [firstAssigneeId, result.lastInsertRowid])
        }

        imported.push({ id: result.lastInsertRowid, title, goalId: goalId || 'bau' })
      } catch (error) {
        errors.push({ row: index + 2, error: error.message })
      }
    })

    res.json({
      success: true,
      imported: imported.length,
      skipped: skipped.length,
      replaced: replaced.length,
      errors: errors.length,
      unmatchedAssignees: Array.from(unmatchedAssignees),
      details: { imported, skipped, replaced, errors }
    })
  } catch (error) {
    res.status(400).json({ message: 'Failed to parse CSV: ' + error.message })
  }
})

export default router
