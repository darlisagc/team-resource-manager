// Migration script to add current_value_increment column to weekly_checkin_items table
// Run this with: node server/db/migrations/add-current-value-increment.js

import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', '..', '..', 'database.sqlite')

console.log('Database path:', dbPath)

const db = new Database(dbPath)

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(weekly_checkin_items)").all()
  const hasColumn = tableInfo.some(col => col.name === 'current_value_increment')

  if (hasColumn) {
    console.log('Column "current_value_increment" already exists in weekly_checkin_items table')
  } else {
    console.log('Adding "current_value_increment" column to weekly_checkin_items table...')
    db.exec(`ALTER TABLE weekly_checkin_items ADD COLUMN current_value_increment REAL DEFAULT NULL`)
    console.log('Successfully added "current_value_increment" column')
  }

  // Verify the column was added
  const updatedInfo = db.prepare("PRAGMA table_info(weekly_checkin_items)").all()
  console.log('\nCurrent weekly_checkin_items table columns:')
  updatedInfo.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`)
  })

} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  db.close()
}

console.log('\nMigration completed successfully!')
