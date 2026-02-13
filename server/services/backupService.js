import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
// Database is at project root, not in server/db
const DB_PATH = path.join(__dirname, '..', '..', 'database.sqlite')
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups')
const MAX_BACKUPS = 4 // Keep last 4 weekly backups

/**
 * Create a backup of the database
 * @returns {string|null} Path to backup file or null if failed
 */
export function createBackup() {
  try {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true })
    }

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFileName = `database_backup_${timestamp}.sqlite`
    const backupPath = path.join(BACKUP_DIR, backupFileName)

    // Check if source database exists
    if (!fs.existsSync(DB_PATH)) {
      console.error('[Backup] Source database not found:', DB_PATH)
      return null
    }

    // Copy database file
    fs.copyFileSync(DB_PATH, backupPath)

    // Get file size for logging
    const stats = fs.statSync(backupPath)
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)

    console.log(`[Backup] ✓ Created: ${backupFileName} (${sizeMB} MB)`)

    // Clean up old backups
    cleanupOldBackups()

    return backupPath
  } catch (error) {
    console.error('[Backup] ✗ Failed to create backup:', error.message)
    return null
  }
}

/**
 * Remove old backups, keeping only the most recent ones
 */
function cleanupOldBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return

    // Get all backup files
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('database_backup_') && f.endsWith('.sqlite'))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time) // Sort by newest first

    // Remove old backups beyond MAX_BACKUPS
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS)
      toDelete.forEach(file => {
        fs.unlinkSync(file.path)
        console.log(`[Backup] Cleaned up old backup: ${file.name}`)
      })
    }
  } catch (error) {
    console.error('[Backup] Error cleaning up old backups:', error.message)
  }
}

/**
 * List all existing backups
 * @returns {Array} List of backup info objects
 */
export function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return []

    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('database_backup_') && f.endsWith('.sqlite'))
      .map(f => {
        const filePath = path.join(BACKUP_DIR, f)
        const stats = fs.statSync(filePath)
        return {
          name: f,
          path: filePath,
          size: stats.size,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
          created: stats.mtime
        }
      })
      .sort((a, b) => b.created - a.created)
  } catch (error) {
    console.error('[Backup] Error listing backups:', error.message)
    return []
  }
}

/**
 * Restore database from a backup file
 * @param {string} backupName - Name of the backup file to restore
 * @returns {object} Result object with success status and message
 */
export function restoreBackup(backupName) {
  try {
    // Validate backup name
    if (!backupName || !backupName.startsWith('database_backup_') || !backupName.endsWith('.sqlite')) {
      return { success: false, message: 'Invalid backup filename' }
    }

    const backupPath = path.join(BACKUP_DIR, backupName)

    // Check if backup file exists
    if (!fs.existsSync(backupPath)) {
      return { success: false, message: 'Backup file not found' }
    }

    // Verify it's a valid SQLite file
    const header = Buffer.alloc(16)
    const fd = fs.openSync(backupPath, 'r')
    fs.readSync(fd, header, 0, 16, 0)
    fs.closeSync(fd)

    if (!header.toString().startsWith('SQLite format 3')) {
      return { success: false, message: 'Invalid SQLite backup file' }
    }

    // Create a backup of current database before restore
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const preRestoreBackup = path.join(BACKUP_DIR, `pre_restore_${timestamp}.sqlite`)

    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, preRestoreBackup)
      console.log(`[Backup] Created pre-restore backup: pre_restore_${timestamp}.sqlite`)
    }

    // Restore the backup
    fs.copyFileSync(backupPath, DB_PATH)

    const stats = fs.statSync(DB_PATH)
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)

    console.log(`[Backup] ✓ Restored from: ${backupName} (${sizeMB} MB)`)

    return {
      success: true,
      message: `Database restored from ${backupName}`,
      preRestoreBackup: `pre_restore_${timestamp}.sqlite`,
      sizeMB
    }
  } catch (error) {
    console.error('[Backup] ✗ Failed to restore backup:', error.message)
    return { success: false, message: error.message }
  }
}

/**
 * Initialize the backup scheduler
 * Runs every Friday at 11:00 PM
 */
export function initBackupScheduler() {
  // Cron expression: 0 23 * * 5 = At 23:00 on Friday
  // Format: minute hour day-of-month month day-of-week
  const schedule = '0 23 * * 5'

  cron.schedule(schedule, () => {
    console.log('\n[Backup] Starting scheduled weekly backup...')
    const backupPath = createBackup()
    if (backupPath) {
      console.log('[Backup] Scheduled backup completed successfully')
    } else {
      console.error('[Backup] Scheduled backup failed!')
    }
  }, {
    timezone: 'Europe/Dublin' // Adjust to your timezone
  })

  console.log('[Backup] 📅 Weekly backup scheduled: Every Friday at 11:00 PM')

  // Log existing backups
  const backups = listBackups()
  if (backups.length > 0) {
    console.log(`[Backup] 📁 ${backups.length} existing backup(s) found`)
  }
}

export default {
  createBackup,
  listBackups,
  restoreBackup,
  initBackupScheduler
}
