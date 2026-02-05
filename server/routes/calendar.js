import { Router } from 'express'
import ical from 'node-ical'
import { getAll, getOne, insert, run, deleteRow } from '../db/database.js'

const router = Router()

// Country to team members mapping for public holidays
const COUNTRY_HOLIDAYS_MAPPING = {
  'ireland': ['Darlisa Giusti Consoni', 'Giovanni Gargiulo', 'Marco Russo'],
  'germany': ['Fabian Bormann', 'Florian Schumann', 'Luis Zarate', 'Mateusz Czeladka', 'Max Grützmacher', 'Thomas Kammerlocher'],
  'singapore': ['Satya Ranjan'],
  'switzerland': ['Manvir Schneider'],
  'swiss': ['Manvir Schneider']
}

// Extract country from public holiday event type
function getCountryFromEventType(eventType) {
  const lower = eventType.toLowerCase()
  for (const country of Object.keys(COUNTRY_HOLIDAYS_MAPPING)) {
    if (lower.includes(country)) {
      return country
    }
  }
  return null
}

// Default Personio iCal feeds
const DEFAULT_ICAL_FEEDS = [
  {
    id: 'personio-timeoff',
    name: 'Personio Time Off',
    url: 'https://cardano-foundation.app.personio.com/calendar/ical-links/9255751/MrMrtNU1eJd4W1A30DAemvN4IrLdLYtldsqcZfHrlNsA26c2Zr3WFhswBz1WK7c8g8iHJc4aIsdTbZ5JXp27LEhaX4EWllx1fz0z8WrboBZuY8f8uBItsUFMEmfTv7Ht/60ba9896-1a27-431f-9b99-481ebbdbf3ad.ics'
  }
]

// Check if a name matches any team member in database
function isTrackedMember(name, memberNames) {
  const normalizedName = name.toLowerCase().trim()
  // Clean name (remove suffixes like "½ first day", etc.)
  const cleanName = normalizedName.replace(/\s*[\(½].*$/g, '').trim()

  return memberNames.some(member => {
    const memberLower = member.toLowerCase()
    const memberFirst = memberLower.split(' ')[0]
    return cleanName === memberLower ||
           cleanName.includes(memberLower) ||
           memberLower.includes(cleanName) ||
           cleanName === memberFirst ||
           cleanName.split(' ')[0] === memberFirst
  })
}

// Get configured calendar feeds
router.get('/feeds', (req, res) => {
  res.json(DEFAULT_ICAL_FEEDS)
})

// Calculate similarity between two names
function nameSimilarity(name1, name2) {
  const n1 = name1.toLowerCase().trim()
  const n2 = name2.toLowerCase().trim()
  if (n1 === n2) return 100

  // Check if first names match
  const parts1 = n1.split(/\s+/)
  const parts2 = n2.split(/\s+/)
  if (parts1[0] === parts2[0]) return 80

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 70

  // Check word overlap
  const words1 = new Set(parts1)
  const words2 = new Set(parts2)
  const overlap = [...words1].filter(w => words2.has(w)).length
  return Math.round((overlap / Math.max(words1.size, words2.size)) * 60)
}

// Sync time-off from iCal feeds
router.post('/sync', async (req, res) => {
  const { feedUrls, nameMappings } = req.body

  // nameMappings: { "Name From Calendar": memberId } - user-provided mappings for unmatched names

  // Use provided URLs or defaults
  const urls = feedUrls && feedUrls.length > 0
    ? feedUrls
    : DEFAULT_ICAL_FEEDS.map(f => f.url)

  try {
    const results = {
      success: true,
      feeds: [],
      totalImported: 0,
      totalSkipped: 0,
      totalErrors: 0,
      unmatchedNames: [] // Names that couldn't be matched
    }

    // Get existing team members for matching
    const members = getAll('SELECT id, name, email FROM team_members')
    const memberMap = new Map()
    const memberList = []
    const memberNames = []
    members.forEach(m => {
      memberList.push({ id: m.id, name: m.name })
      memberNames.push(m.name)
      // Create multiple lookup keys for flexible matching
      memberMap.set(m.name.toLowerCase(), m.id)
      memberMap.set(m.name.toLowerCase().replace(/\s+/g, ''), m.id)
      // Also add first name only
      const firstName = m.name.split(' ')[0].toLowerCase()
      if (!memberMap.has(firstName)) {
        memberMap.set(firstName, m.id)
      }
    })

    // Apply user-provided name mappings
    const userMappings = nameMappings || {}

    for (const url of urls) {
      const feedResult = {
        url: url.substring(0, 50) + '...',
        imported: 0,
        skipped: 0,
        errors: []
      }

      try {
        // Fetch and parse iCal
        const events = await ical.async.fromURL(url)

        for (const [key, event] of Object.entries(events)) {
          if (event.type !== 'VEVENT') continue

          try {
            const summary = event.summary || ''

            // Parse event type and name from summary
            const match = summary.match(/\[([^\]]+)\]\s*(.+)/)
            if (!match) {
              feedResult.skipped++
              continue
            }

            const eventType = match[1].toLowerCase()
            const personName = match[2].trim()

            // Skip probation period end events (not useful for capacity)
            if (eventType.includes('probation')) {
              feedResult.skipped++
              continue
            }

            // Check if this is a birthday (they use placeholder year like 1904)
            const isBirthday = eventType.includes('birthday')

            if (isBirthday) {
              // Skip if not a tracked team member
              if (!isTrackedMember(personName, memberNames)) {
                feedResult.skipped++
                continue
              }

              // Get the month and day from the event, use 2026 as the year
              const eventDate = event.start ? new Date(event.start) : null
              if (!eventDate) {
                feedResult.skipped++
                continue
              }

              const month = String(eventDate.getMonth() + 1).padStart(2, '0')
              const day = String(eventDate.getDate()).padStart(2, '0')
              const startDate = `2026-${month}-${day}`
              const endDate = `2026-${month}-${String(eventDate.getDate() + 1).padStart(2, '0')}`

              // Find team member
              let memberId = memberMap.get(personName.toLowerCase())
              if (!memberId) {
                const cleanName = personName.replace(/\s*[\(½].*/g, '').trim()
                memberId = memberMap.get(cleanName.toLowerCase())
                if (!memberId) {
                  const firstName = cleanName.split(' ')[0].toLowerCase()
                  memberId = memberMap.get(firstName)
                }
              }

              if (!memberId) {
                feedResult.skipped++
                continue
              }

              // Check if already exists
              const existing = getOne(`
                SELECT id FROM time_off
                WHERE team_member_id = ? AND start_date = ? AND type = 'birthday'
              `, [memberId, startDate])

              if (existing) {
                feedResult.skipped++
                continue
              }

              insert('time_off', {
                team_member_id: memberId,
                type: 'birthday',
                start_date: startDate,
                end_date: endDate,
                hours: 8,
                notes: `Birthday - ${personName}`,
                source: 'ical'
              })
              feedResult.imported++
              continue
            }

            // Check if this is a public/bank holiday
            const isPublicHoliday = eventType.includes('public holiday') || eventType.includes('bank holiday') ||
                                    (eventType.includes('holiday') && eventType.includes('/'))

            if (isPublicHoliday) {
              // Handle public holidays - assign to team members by country
              const country = getCountryFromEventType(eventType)
              if (!country) {
                feedResult.skipped++
                continue
              }

              const holidayMembers = COUNTRY_HOLIDAYS_MAPPING[country] || []
              if (holidayMembers.length === 0) {
                feedResult.skipped++
                continue
              }

              // Get dates
              const startDate = event.start ? formatDate(event.start) : null
              const endDate = event.end ? formatDate(event.end) : null

              if (!startDate || !endDate) {
                feedResult.errors.push(`Invalid dates for holiday: ${personName}`)
                continue
              }

              // Only import 2026 dates
              if (!startDate.startsWith('2026')) {
                feedResult.skipped++
                continue
              }

              // Calculate hours
              const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))
              const hours = days * 8

              // Create time-off for each team member in that country
              for (const memberName of holidayMembers) {
                const memberId = memberMap.get(memberName.toLowerCase())
                if (!memberId) continue

                // Check if already exists
                const existing = getOne(`
                  SELECT id FROM time_off
                  WHERE team_member_id = ? AND start_date = ? AND end_date = ? AND type = 'bank_holiday'
                `, [memberId, startDate, endDate])

                if (existing) continue

                insert('time_off', {
                  team_member_id: memberId,
                  type: 'bank_holiday',
                  start_date: startDate,
                  end_date: endDate,
                  hours: hours,
                  notes: `${personName} (${country})`,
                  source: 'ical'
                })
                feedResult.imported++
              }
              continue
            }

            // Regular time-off event - skip if not a tracked team member
            if (!isTrackedMember(personName, memberNames)) {
              feedResult.skipped++
              continue
            }

            // Determine time-off type based on event
            let timeOffType = 'PTO'
            if (eventType.includes('sick')) {
              timeOffType = 'sick'
            } else if (eventType.includes('parental') || eventType.includes('maternity') || eventType.includes('paternity')) {
              timeOffType = 'parental'
            } else if (eventType.includes('birthday') || eventType.includes('anniversary')) {
              timeOffType = 'birthday'
            } else if (eventType.includes('remote') || eventType.includes('home office') || eventType.includes('work remotely')) {
              timeOffType = 'remote'
            } else if (eventType.includes('vacation') || eventType.includes('time off') || eventType.includes('my calendar')) {
              timeOffType = 'PTO'
            } else if (eventType.includes('time off in lieu') || eventType.includes('lieu')) {
              timeOffType = 'lieu'
            } else if (eventType.includes('benefits plan') || eventType.includes('employee benefits')) {
              timeOffType = 'benefits'
            } else if (eventType.includes('service provider')) {
              timeOffType = 'service_provider'
            } else if (eventType.includes('event')) {
              timeOffType = 'event'
            } else if (eventType.includes('overtime') || eventType.includes('compensation')) {
              timeOffType = 'overtime'
            } else if (eventType.includes('unpaid')) {
              timeOffType = 'unpaid'
            } else if (eventType.includes('start date') || eventType.includes('end date')) {
              timeOffType = 'employment'
            }

            // Find team member - try multiple matching strategies
            let memberId = null

            // 1. Check user-provided mapping first
            if (userMappings[personName]) {
              memberId = userMappings[personName]
            }

            // 2. Exact match
            if (!memberId) {
              memberId = memberMap.get(personName.toLowerCase())
            }

            // 3. Without spaces
            if (!memberId) {
              memberId = memberMap.get(personName.toLowerCase().replace(/\s+/g, ''))
            }

            // 4. First name only (strip suffixes like "½ first day")
            if (!memberId) {
              const cleanName = personName.replace(/\s*[\(½].*/g, '').trim()
              memberId = memberMap.get(cleanName.toLowerCase())
              if (!memberId) {
                const firstName = cleanName.split(' ')[0].toLowerCase()
                memberId = memberMap.get(firstName)
              }
            }

            // If still not found, skip and add to unmatched list with suggestions
            if (!memberId) {
              // Find best matching suggestions
              const suggestions = memberList
                .map(m => ({ ...m, similarity: nameSimilarity(personName, m.name) }))
                .filter(m => m.similarity >= 30)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 3)

              // Only add if not already in unmatched list
              if (!results.unmatchedNames.some(u => u.calendarName === personName)) {
                results.unmatchedNames.push({
                  calendarName: personName,
                  suggestions: suggestions
                })
              }

              feedResult.skipped++
              continue
            }

            // Get dates
            const startDate = event.start ? formatDate(event.start) : null
            const endDate = event.end ? formatDate(event.end) : null

            if (!startDate || !endDate) {
              feedResult.errors.push(`Invalid dates for: ${personName}`)
              continue
            }

            // Only import 2026 dates, skip everything else
            if (!startDate.startsWith('2026')) {
              feedResult.skipped++
              continue
            }

            // Calculate hours (assuming 8 hours per day)
            const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))
            const hours = days * 8

            // Check if this event already exists (by UID)
            const existingByUid = getOne(
              'SELECT id FROM time_off WHERE notes = ?',
              [event.uid]
            )

            if (existingByUid) {
              feedResult.skipped++
              continue
            }

            // Check for overlapping records (same person, overlapping dates)
            const existing = getOne(`
              SELECT id FROM time_off
              WHERE team_member_id = ?
              AND (
                (start_date <= ? AND end_date >= ?)
                OR (start_date >= ? AND start_date < ?)
              )
            `, [memberId, startDate, startDate, startDate, endDate])

            if (existing) {
              feedResult.skipped++
              continue
            }

            // Insert time-off record
            insert('time_off', {
              team_member_id: memberId,
              type: timeOffType,
              start_date: startDate,
              end_date: endDate,
              hours: hours,
              notes: event.uid,
              source: 'ical'
            })

            feedResult.imported++
          } catch (eventError) {
            feedResult.errors.push(eventError.message)
          }
        }
      } catch (fetchError) {
        feedResult.errors.push(`Failed to fetch feed: ${fetchError.message}`)
      }

      results.feeds.push(feedResult)
      results.totalImported += feedResult.imported
      results.totalSkipped += feedResult.skipped
      results.totalErrors += feedResult.errors.length
    }

    res.json(results)
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// Preview iCal feed (don't import, just show what would be imported)
router.post('/preview', async (req, res) => {
  const { url } = req.body

  if (!url) {
    return res.status(400).json({ message: 'URL is required' })
  }

  try {
    const events = await ical.async.fromURL(url)
    const preview = []

    // Get existing team members
    const members = getAll('SELECT id, name FROM team_members')
    const memberNames = members.map(m => m.name)
    const memberNamesLower = new Set(members.map(m => m.name.toLowerCase()))

    for (const [key, event] of Object.entries(events)) {
      if (event.type !== 'VEVENT') continue

      const summary = event.summary || ''
      const match = summary.match(/\[([^\]]+)\]\s*(.+)/)

      if (match) {
        const eventType = match[1]
        const personName = match[2].trim()
        const eventTypeLower = eventType.toLowerCase()

        // Only skip probation end dates
        if (eventTypeLower.includes('probation')) continue

        let startDate = event.start ? formatDate(event.start) : null
        let endDate = event.end ? formatDate(event.end) : null

        // Handle birthdays (they use placeholder year like 1904)
        const isBirthday = eventTypeLower.includes('birthday')
        if (isBirthday) {
          if (!isTrackedMember(personName, memberNames)) continue
          // Convert to 2026
          const eventDate = event.start ? new Date(event.start) : null
          if (eventDate) {
            const month = String(eventDate.getMonth() + 1).padStart(2, '0')
            const day = String(eventDate.getDate()).padStart(2, '0')
            startDate = `2026-${month}-${day}`
            endDate = startDate
          }
          const memberExists = memberNamesLower.has(personName.toLowerCase().replace(/\s*[\(½].*$/g, '').trim())
          preview.push({
            type: 'Birthday',
            person: personName,
            startDate,
            endDate,
            memberExists,
            isBirthday: true
          })
          continue
        }

        // Only include 2026 dates for other events
        if (!startDate?.startsWith('2026')) continue

        // Check if this is a public/bank holiday
        const isPublicHoliday = eventTypeLower.includes('public holiday') || eventTypeLower.includes('bank holiday') ||
                                (eventTypeLower.includes('holiday') && eventTypeLower.includes('/'))

        if (isPublicHoliday) {
          const country = getCountryFromEventType(eventTypeLower)
          if (country) {
            const holidayMembers = COUNTRY_HOLIDAYS_MAPPING[country] || []
            preview.push({
              type: eventType,
              person: `${personName} → ${holidayMembers.map(n => n.split(' ')[0]).join(', ')}`,
              startDate,
              endDate,
              memberExists: true,
              isHoliday: true,
              country
            })
          }
          continue
        }

        // Regular time-off - skip if not a tracked team member
        if (!isTrackedMember(personName, memberNames)) continue

        const memberExists = memberNamesLower.has(personName.toLowerCase().replace(/\s*[\(½].*$/g, '').trim())

        preview.push({
          type: eventType,
          person: personName,
          startDate,
          endDate,
          memberExists
        })
      }
    }

    // Sort by date
    preview.sort((a, b) => new Date(a.startDate) - new Date(b.startDate))

    res.json({
      totalEvents: preview.length,
      events: preview.slice(0, 100), // Limit to first 100
      uniquePersons: [...new Set(preview.map(p => p.person))].length
    })
  } catch (error) {
    res.status(500).json({ message: `Failed to fetch calendar: ${error.message}` })
  }
})

// Clear all iCal-imported time-off records
router.delete('/clear', (req, res) => {
  const result = run("DELETE FROM time_off WHERE source = 'ical'")
  res.json({
    success: true,
    message: `Cleared ${result.changes} iCal-imported records`
  })
})

// Helper to format date as YYYY-MM-DD
function formatDate(date) {
  if (!date) return null
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

export default router
