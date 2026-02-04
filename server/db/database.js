import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Database file path - use environment variable in production, local path in development
const dbPath = process.env.DATABASE_PATH || join(__dirname, '../../database.sqlite')

// Create database connection
const db = new Database(dbPath)

// Enable foreign keys
db.pragma('foreign_keys = ON')

// Initialize schema
function initializeDatabase() {
  const schemaPath = join(__dirname, 'schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')
  db.exec(schema)
  console.log('Database initialized successfully')
}

// Helper functions
export function getAll(sql, params = []) {
  return db.prepare(sql).all(...params)
}

export function getOne(sql, params = []) {
  return db.prepare(sql).get(...params)
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...params)
}

export function insert(table, data) {
  const keys = Object.keys(data)
  const values = Object.values(data)
  const placeholders = keys.map(() => '?').join(', ')
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`
  return db.prepare(sql).run(...values)
}

export function update(table, data, whereClause, whereParams = []) {
  const keys = Object.keys(data)
  const values = Object.values(data)
  const setClause = keys.map(k => `${k} = ?`).join(', ')
  const sql = `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE ${whereClause}`
  return db.prepare(sql).run(...values, ...whereParams)
}

export function deleteRow(table, whereClause, whereParams = []) {
  const sql = `DELETE FROM ${table} WHERE ${whereClause}`
  return db.prepare(sql).run(...whereParams)
}

// Transaction helper
export function transaction(fn) {
  return db.transaction(fn)()
}

// Initialize on import
initializeDatabase()

export default db
