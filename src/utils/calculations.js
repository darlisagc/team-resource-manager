/**
 * Calculation utilities for Team Resource Manager
 *
 * NOTE: Core constants and utilities are now in src/constants/index.js
 * This file re-exports for backward compatibility and adds additional helpers
 */

// Re-export from centralized constants for backward compatibility
export {
  BASELINE_FTE_HOURS,
  WEEKS_PER_QUARTER,
  getUtilizationStatus,
  formatPercentage,
  getQuarterFromDate,
  getCurrentQuarter,
  calculateFTE,
  calculateQuarterlyAvailableHours,
  calculateUtilization
} from '../constants'

// Import constants for use in this file
import { BASELINE_FTE_HOURS, WEEKS_PER_QUARTER, getQuarterFromDate, calculateFTE } from '../constants'

/**
 * Calculate capacity gap
 * @param {number} requiredFTE - FTE required for project
 * @param {number} availableFTE - FTE available
 * @returns {number} Gap (positive = understaffed, negative = overstaffed)
 */
export function calculateCapacityGap(requiredFTE, availableFTE) {
  return requiredFTE - availableFTE
}

/**
 * Calculate hours per task based on allocation percentage
 * @param {number} allocationPercentage - Allocation percentage (0-100)
 * @param {number} availableHours - Total available hours
 * @returns {number} Hours allocated to the task
 */
export function calculateTaskHours(allocationPercentage, availableHours) {
  return (allocationPercentage / 100) * availableHours
}

/**
 * Get list of quarters for the past year and next quarter
 * @returns {string[]} Array of quarter strings
 */
export function getAvailableQuarters() {
  const quarters = []
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3)

  // Past year quarters
  for (let y = currentYear - 1; y <= currentYear; y++) {
    for (let q = 1; q <= 4; q++) {
      if (y === currentYear && q > currentQuarter + 1) break
      quarters.push(`Q${q} ${y}`)
    }
  }

  return quarters
}

/**
 * Calculate time-off hours from records
 * @param {Array} timeOffRecords - Array of time-off records
 * @param {string} quarter - Quarter to filter by (e.g., "Q1 2025")
 * @returns {number} Total time-off hours
 */
export function calculateTimeOffHours(timeOffRecords, quarter) {
  return timeOffRecords
    .filter(record => {
      const recordQuarter = getQuarterFromDate(new Date(record.startDate))
      return recordQuarter === quarter
    })
    .reduce((total, record) => total + (record.hours || 0), 0)
}

/**
 * Format hours as FTE
 * @param {number} hours - Weekly hours
 * @returns {string} Formatted FTE string
 */
export function formatFTE(hours) {
  const fte = calculateFTE(hours)
  return fte === 1 ? '1 FTE' : `${fte.toFixed(2)} FTE`
}
