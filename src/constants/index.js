/**
 * Centralized constants and utility functions for Team Resource Manager
 * This file provides a single source of truth for status values, colors, and calculations
 */

// =============================================================================
// TIME CONSTANTS
// =============================================================================

export const BASELINE_FTE_HOURS = 40
export const WEEKS_PER_QUARTER = 13

// =============================================================================
// STATUS VALUES
// =============================================================================

// Goal statuses
export const GOAL_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed'
}

// Key Result / Initiative statuses
export const ITEM_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
}

// Task statuses
export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in-progress',
  DONE: 'done',
  BLOCKED: 'blocked'
}

// Check-in statuses
export const CHECKIN_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted'
}

// All status options for status selectors
export const STATUS_OPTIONS = [
  ITEM_STATUS.DRAFT,
  ITEM_STATUS.ACTIVE,
  ITEM_STATUS.IN_PROGRESS,
  ITEM_STATUS.COMPLETED
]

// =============================================================================
// COLOR CONSTANTS
// =============================================================================

export const COLORS = {
  green: '#00FF00',
  gold: '#FF6B35',
  red: '#FF6B6B',      // Coral red for time off
  blue: '#4BD5EE',     // Cyan for work allocation
  purple: '#A855F7',   // Vibrant purple for events
  orange: '#F97316',   // Orange alternative
  gray: '#6B7280'
}

// =============================================================================
// PROGRESS COLOR THRESHOLDS (Unified)
// =============================================================================

/**
 * Get the color class for a progress percentage
 * This is the SINGLE SOURCE OF TRUTH for progress colors across the app
 *
 * Thresholds:
 * - >= 100%: Red (over-allocated) or Green (completed for goals)
 * - >= 80%: Green (on track)
 * - >= 50%: Gold/Yellow (moderate)
 * - >= 25%: Blue (needs attention)
 * - < 25%: Purple/Gray (at risk)
 *
 * @param {number} progress - Progress percentage (0-100+)
 * @param {object} options - Options for color calculation
 * @param {boolean} options.isUtilization - If true, 100%+ is red (over-allocated)
 * @returns {string} Tailwind color class
 */
export function getProgressColorClass(progress, options = {}) {
  const { isUtilization = false } = options

  if (progress >= 100) {
    return isUtilization ? 'text-sw-red' : 'text-sw-green'
  }
  if (progress >= 80) return 'text-sw-green'
  if (progress >= 50) return 'text-sw-gold'
  if (progress >= 25) return 'text-sw-blue'
  return 'text-sw-purple'
}

/**
 * Get the background color class for progress bars
 * @param {number} progress - Progress percentage
 * @param {object} options - Options
 * @returns {string} Tailwind background color class
 */
export function getProgressBgClass(progress, options = {}) {
  const { isUtilization = false } = options

  if (progress >= 100) {
    return isUtilization ? 'bg-sw-red' : 'bg-sw-green'
  }
  if (progress >= 80) return 'bg-sw-green'
  if (progress >= 50) return 'bg-sw-gold'
  if (progress >= 25) return 'bg-sw-blue'
  return 'bg-sw-purple'
}

/**
 * Get lightsaber bar color class
 * @param {number} progress - Progress percentage
 * @param {object} options - Options
 * @returns {string} Lightsaber color class
 */
export function getLightsaberClass(progress, options = {}) {
  const { isUtilization = false } = options

  if (progress >= 100) {
    return isUtilization ? 'lightsaber-red' : 'lightsaber-green'
  }
  if (progress >= 80) return 'lightsaber-green'
  if (progress >= 50) return 'lightsaber-gold'
  return 'lightsaber-blue'
}

/**
 * Get hex color for charts
 * @param {number} progress - Progress percentage
 * @param {object} options - Options
 * @returns {string} Hex color
 */
export function getProgressHexColor(progress, options = {}) {
  const { isUtilization = false } = options

  if (progress >= 100) {
    return isUtilization ? COLORS.red : COLORS.green
  }
  if (progress >= 80) return COLORS.green
  if (progress >= 50) return COLORS.gold
  if (progress >= 25) return COLORS.blue
  return COLORS.purple
}

// =============================================================================
// UTILIZATION STATUS
// =============================================================================

/**
 * Get utilization status based on percentage
 * @param {number} utilization - Utilization percentage
 * @returns {object} Status object with status, color, and label
 */
export function getUtilizationStatus(utilization) {
  if (utilization >= 100) {
    return { status: 'over-allocated', color: 'red', label: 'Over-allocated' }
  }
  if (utilization >= 80) {
    return { status: 'optimal', color: 'green', label: 'Optimal' }
  }
  if (utilization >= 50) {
    return { status: 'moderate', color: 'gold', label: 'Moderate' }
  }
  return { status: 'under-utilized', color: 'blue', label: 'Under-utilized' }
}

// =============================================================================
// STATUS COLOR STYLING
// =============================================================================

/**
 * Get status badge color classes
 * @param {string} status - Status value
 * @returns {string} Tailwind classes for the status badge
 */
export function getStatusColorClass(status) {
  switch (status) {
    case 'completed':
    case 'done':
      return 'text-green-400 bg-green-400/20 border-green-400/30'
    case 'active':
      return 'text-blue-400 bg-blue-400/20 border-blue-400/30'
    case 'in-progress':
      return 'text-yellow-400 bg-yellow-400/20 border-yellow-400/30'
    case 'blocked':
      return 'text-red-400 bg-red-400/20 border-red-400/30'
    case 'draft':
    case 'todo':
    default:
      return 'text-gray-400 bg-gray-400/20 border-gray-400/30'
  }
}

// =============================================================================
// DATE UTILITIES (Fixed to avoid mutation bugs)
// =============================================================================

/**
 * Get the Monday (start) of the week for a given date
 * FIXED: Does not mutate the input date
 * @param {Date} date - Optional date (defaults to now)
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
export function getWeekStart(date = new Date()) {
  // Create a new date to avoid mutating the input
  const d = new Date(date.getTime())
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

/**
 * Get the Friday (end) of the work week for a given date
 * @param {Date} date - Optional date (defaults to now)
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
export function getWeekEnd(date = new Date()) {
  const monday = new Date(getWeekStart(date) + 'T00:00:00')
  monday.setDate(monday.getDate() + 4)
  return monday.toISOString().split('T')[0]
}

/**
 * Format week display as "Mon D - Mon D, YYYY"
 * @param {string} weekStart - Week start date string
 * @returns {string} Formatted week display
 */
export function formatWeekDisplay(weekStart) {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 4)
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

/**
 * Get quarter date range with correct end dates
 * FIXED: Properly calculates quarter end dates
 * @param {string} quarter - Quarter string (e.g., "Q1 2026")
 * @returns {object} { startDate, endDate } as ISO strings
 */
export function getQuarterDateRange(quarter) {
  const [q, year] = quarter.split(' ')
  const quarterNum = parseInt(q.replace('Q', ''))
  const startMonth = (quarterNum - 1) * 3

  // Start date is first day of first month of quarter
  const startDate = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`

  // End date is last day of last month of quarter
  // Q1: Jan-Mar (ends Mar 31)
  // Q2: Apr-Jun (ends Jun 30)
  // Q3: Jul-Sep (ends Sep 30)
  // Q4: Oct-Dec (ends Dec 31)
  const endMonth = startMonth + 3 // Month after quarter ends (1-indexed)
  const lastDayOfQuarter = new Date(parseInt(year), endMonth, 0).getDate()
  const endDate = `${year}-${String(startMonth + 3).padStart(2, '0')}-${lastDayOfQuarter}`

  return { startDate, endDate }
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

// =============================================================================
// CALCULATION UTILITIES
// =============================================================================

/**
 * Calculate FTE value based on weekly hours
 * @param {number} weeklyHours - Individual's contracted weekly hours
 * @returns {number} FTE value (1.0 = 40 hours/week)
 */
export function calculateFTE(weeklyHours) {
  return weeklyHours / BASELINE_FTE_HOURS
}

/**
 * Calculate quarterly available hours
 * @param {number} weeklyHours - Weekly contracted hours
 * @param {number} timeOffHours - Total time-off hours
 * @returns {number} Available hours for the quarter
 */
export function calculateQuarterlyAvailableHours(weeklyHours, timeOffHours = 0) {
  return (weeklyHours * WEEKS_PER_QUARTER) - timeOffHours
}

/**
 * Calculate utilization percentage
 * @param {number} allocatedHours - Hours allocated to tasks
 * @param {number} availableHours - Total available hours (after PTO)
 * @returns {number} Utilization percentage (0-100+)
 */
export function calculateUtilization(allocatedHours, availableHours) {
  if (availableHours <= 0) return 0
  return (allocatedHours / availableHours) * 100
}

/**
 * Convert allocation percentage to hours
 * Uses BASELINE_FTE_HOURS constant
 * @param {number} percentage - Allocation percentage (0-100)
 * @returns {number} Hours per week
 */
export function percentageToHours(percentage) {
  return Math.round((percentage / 100) * BASELINE_FTE_HOURS)
}

/**
 * Convert hours to allocation percentage
 * Uses BASELINE_FTE_HOURS constant
 * @param {number} hours - Hours per week
 * @returns {number} Percentage (0-100)
 */
export function hoursToPercentage(hours) {
  return Math.round((hours / BASELINE_FTE_HOURS) * 100)
}

/**
 * Format percentage for display
 * @param {number} value - Percentage value
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value) {
  return `${Math.round(value)}%`
}

// =============================================================================
// API ERROR HANDLING
// =============================================================================

/**
 * Handle API errors consistently
 * @param {Error} error - Error object
 * @param {string} context - Context message
 * @param {object} options - Options
 * @param {boolean} options.showAlert - Whether to show alert to user
 * @param {function} options.setError - State setter for error message
 */
export function handleApiError(error, context, options = {}) {
  const { showAlert = false, setError = null } = options
  const message = `Failed to ${context}: ${error.message}`

  console.error(message, error)

  if (setError) {
    setError(message)
  }

  if (showAlert) {
    alert(message)
  }
}

/**
 * Check if response is OK, otherwise throw error
 * @param {Response} response - Fetch response
 * @param {string} context - Context for error message
 * @throws {Error} If response is not OK
 */
export async function checkResponse(response, context) {
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`${context}: ${response.status} - ${errorText}`)
  }
  return response
}
