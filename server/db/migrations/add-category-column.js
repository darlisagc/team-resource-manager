// Migration script to add category column to initiatives table
// Run this with: node server/db/migrations/add-category-column.js

import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dbPath = join(__dirname, '..', 'team_resources.db')

console.log('Database path:', dbPath)

const db = new Database(dbPath)

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(initiatives)").all()
  const hasCategory = tableInfo.some(col => col.name === 'category')

  if (hasCategory) {
    console.log('Column "category" already exists in initiatives table')
  } else {
    console.log('Adding "category" column to initiatives table...')
    db.exec(`ALTER TABLE initiatives ADD COLUMN category TEXT`)
    console.log('Successfully added "category" column to initiatives table')
  }

  // Verify the column was added
  const updatedInfo = db.prepare("PRAGMA table_info(initiatives)").all()
  console.log('\nCurrent initiatives table columns:')
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
