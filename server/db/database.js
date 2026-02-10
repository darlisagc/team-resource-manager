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

// Migrations
function runMigrations() {
  // Migration: Add 'draft' and 'in-progress' to initiatives status constraint
  try {
    db.prepare("INSERT INTO initiatives (name, status) VALUES ('__migration_test__', 'draft')").run()
    db.prepare("DELETE FROM initiatives WHERE name = '__migration_test__'").run()
  } catch (e) {
    // Constraint doesn't allow 'draft' yet - update it by reading actual columns
    db.pragma('foreign_keys = OFF')
    try {
      const cols = db.prepare("PRAGMA table_info(initiatives)").all()
      const colNames = cols.map(c => c.name).join(', ')

      db.transaction(() => {
        db.exec(`
          CREATE TABLE initiatives_migrated (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            project_priority TEXT,
            team TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('draft', 'active', 'in-progress', 'completed', 'on-hold', 'cancelled')),
            parent_goal_id INTEGER,
            leapsome_external_id TEXT,
            start_date DATE,
            end_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            external_id TEXT,
            description TEXT,
            key_result_id INTEGER,
            owner_id INTEGER,
            source TEXT DEFAULT 'manual',
            progress INTEGER DEFAULT 0,
            estimated_hours REAL DEFAULT 0,
            actual_hours REAL DEFAULT 0,
            category TEXT,
            current_value REAL DEFAULT 0,
            target_value REAL,
            FOREIGN KEY (key_result_id) REFERENCES key_results(id) ON DELETE SET NULL,
            FOREIGN KEY (owner_id) REFERENCES team_members(id) ON DELETE SET NULL
          );
          INSERT INTO initiatives_migrated SELECT ${colNames} FROM initiatives;
          DROP TABLE initiatives;
          ALTER TABLE initiatives_migrated RENAME TO initiatives;
          CREATE INDEX IF NOT EXISTS idx_initiatives_key_result ON initiatives(key_result_id);
          CREATE INDEX IF NOT EXISTS idx_initiatives_status ON initiatives(status);
          CREATE INDEX IF NOT EXISTS idx_initiatives_priority ON initiatives(project_priority);
        `)
      })()
      console.log('Migration: Updated initiatives status constraint')
    } finally {
      db.pragma('foreign_keys = ON')
    }
  }
}

// Initialize on import
initializeDatabase()
runMigrations()

export default db
