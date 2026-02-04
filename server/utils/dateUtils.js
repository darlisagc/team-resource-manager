/**
 * Server-side date utility functions
 * Single source of truth for date calculations
 */

// Time constants
export const BASELINE_FTE_HOURS = 40
export const WEEKS_PER_QUARTER = 13

/**
 * Get quarter date range with correct end dates
 * FIXED: Properly calculates quarter end dates using Date object
 *
 * @param {string} quarter - Quarter string (e.g., "Q1 2026")
 * @returns {object} { startDate, endDate, weeksInQuarter }
 */
export function getQuarterDateRange(quarter) {
  const [q, year] = quarter.split(' ')
  const quarterNum = parseInt(q.replace('Q', ''))
  const yearNum = parseInt(year)

  // First month of the quarter (0-indexed for Date)
  const startMonthIndex = (quarterNum - 1) * 3

  // Start date: first day of first month
  const startDate = `${year}-${String(startMonthIndex + 1).padStart(2, '0')}-01`

  // End date: last day of last month of quarter
  // Use Date(year, month + 1, 0) to get last day of month
  const lastMonth = startMonthIndex + 2 // 0-indexed, so +2 for third month
  const lastDayOfQuarter = new Date(yearNum, lastMonth + 1, 0).getDate()
  const endDate = `${year}-${String(lastMonth + 1).padStart(2, '0')}-${String(lastDayOfQuarter).padStart(2, '0')}`

  return {
    startDate,
    endDate,
    weeksInQuarter: WEEKS_PER_QUARTER
  }
}

/**
 * Get the Monday (start) of the week for a given date
 * @param {Date} date - Optional date (defaults to now)
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
export function getWeekStart(date = new Date()) {
  const d = new Date(date.getTime())
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

/**
 * Get quarter string from date
 * @param {Date} date - Date object
 * @returns {string} Quarter string (e.g., "Q1 2025")
 */
export function getQuarterFromDate(date) {
  const quarter = Math.ceil((date.getMonth() + 1) / 3)
  return `Q${quarter} ${date.getFullYear()}`
}

/**
 * Get current quarter
 * @returns {string} Current quarter string
 */
export function getCurrentQuarter() {
  return getQuarterFromDate(new Date())
}
