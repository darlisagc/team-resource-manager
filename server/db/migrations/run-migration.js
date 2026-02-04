// Migration script to add force_password_change column
import Database from 'better-sqlite3'

const dbPath = process.env.DATABASE_PATH || '/app/data/database.sqlite'
const db = new Database(dbPath)

console.log('Running migration: Add force_password_change column...')

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(users)").all()
  const columnExists = tableInfo.some(col => col.name === 'force_password_change')

  if (columnExists) {
    console.log('Column force_password_change already exists. Skipping.')
  } else {
    // Add the column
    db.exec('ALTER TABLE users ADD COLUMN force_password_change INTEGER DEFAULT 1')
    console.log('Added force_password_change column.')

    // Set existing admin user to not require password change
    const result = db.prepare("UPDATE users SET force_password_change = 0 WHERE username = 'admin'").run()
    console.log(`Updated ${result.changes} admin user(s) to not require password change.`)
  }

  console.log('Migration completed successfully!')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
} finally {
  db.close()
}
