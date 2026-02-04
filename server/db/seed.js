import bcrypt from 'bcryptjs'
import db from './database.js'

// Clear existing data
function clearData() {
  db.exec(`
    DELETE FROM resolved_assignees;
    DELETE FROM allocations;
    DELETE FROM task_assignees;
    DELETE FROM goal_assignees;
    DELETE FROM tasks;
    DELETE FROM goals;
    DELETE FROM time_off;
    DELETE FROM team_members;
    DELETE FROM users;
  `)
}

// Seed users
function seedUsers() {
  const password = bcrypt.hashSync('admin', 10)
  // Set force_password_change = 0 for default admin user
  db.prepare('INSERT INTO users (username, password, force_password_change) VALUES (?, ?, ?)').run('admin', password, 0)
  console.log('Users seeded')
}

// Seed team members (Cardano Foundation team)
function seedTeamMembers() {
  const members = [
    { name: 'Darlisa Giusti Consoni', email: 'darlisa.consoni@cardanofoundation.org', role: 'Product Owner', team: 'Ecosystem Engineering', weekly_hours: 40 },
    { name: 'Fabian Bormann', email: 'fabian.bormann@cardanofoundation.org', role: 'Team Lead Ecosystem Engineering', team: 'Ecosystem Engineering', weekly_hours: 40 },
    { name: 'Florian Schumann', email: 'florian.schumann@cardanofoundation.org', role: 'DevOps Engineer', team: 'Ecosystem Engineering', weekly_hours: 40 },
    { name: 'Giovanni Gargiulo', email: 'giovanni.gargiulo@cardanofoundation.org', role: 'Senior Enterprise Architect', team: 'Ecosystem Engineering', weekly_hours: 40 },
    { name: 'Luis Zarate', email: 'luis.zarate@cardanofoundation.org', role: 'QA Engineer', team: 'Ecosystem Engineering', weekly_hours: 40 },
    { name: 'Manvir Schneider', email: 'manvir.schneider@cardanofoundation.org', role: 'Senior Research Scientist', team: 'Ecosystem Engineering', weekly_hours: 40 },
    { name: 'Marco Russo', email: 'marco.russo@cardanofoundation.org', role: 'Backend Development Lead', team: 'Ecosystem Engineering', weekly_hours: 40 },
    { name: 'Mateusz Czeladka', email: 'mateusz.czeladka@cardanofoundation.org', role: 'Senior Software Architect', team: 'Ecosystem Engineering', weekly_hours: 32 }, // Tue-Fri
    { name: 'Max Grützmacher', email: 'max.gruetzmacher@cardanofoundation.org', role: 'Intern', team: 'Ecosystem Engineering', weekly_hours: 20 },
    { name: 'Satya Ranjan', email: 'satya.ranjan@cardanofoundation.org', role: 'Lead Blockchain Architect', team: 'Ecosystem Engineering', weekly_hours: 40 },
    { name: 'Thomas Kammerlocher', email: 'thomas.kammerlocher@cardanofoundation.org', role: 'Senior Full Stack Developer', team: 'Ecosystem Engineering', weekly_hours: 40 },
  ]

  const stmt = db.prepare('INSERT INTO team_members (name, email, role, team, weekly_hours) VALUES (?, ?, ?, ?, ?)')
  members.forEach(m => stmt.run(m.name, m.email, m.role, m.team, m.weekly_hours))
  console.log('Team members seeded')
}

// Seed time off - will be populated from Personio calendar sync
function seedTimeOff() {
  // Time off records will come from Personio calendar sync
  console.log('Time off will be synced from Personio calendar')
}

// Seed goals (sample OKRs)
function seedGoals() {
  const goals = [
    // Q1 2025 - owner_ids correspond to team members (1=Darlisa, 2=Fabian, 3=Florian, etc.)
    { external_id: 'G-001', title: 'Platform Infrastructure Modernization', description: 'Upgrade core infrastructure and improve reliability', quarter: 'Q1 2025', status: 'active', progress: 35, owner_id: 1, team: 'Ecosystem Engineering' },
    { external_id: 'G-002', title: 'API Development & Integration', description: 'Build and integrate new API endpoints', quarter: 'Q1 2025', status: 'active', progress: 50, owner_id: 2, team: 'Ecosystem Engineering' },
    { external_id: 'G-003', title: 'Testing & Quality Assurance', description: 'Implement comprehensive testing framework', quarter: 'Q1 2025', status: 'active', progress: 25, owner_id: 3, team: 'Ecosystem Engineering' },
    { external_id: 'G-004', title: 'Documentation & Knowledge Base', description: 'Create and maintain technical documentation', quarter: 'Q1 2025', status: 'active', progress: 40, owner_id: 4, team: 'Ecosystem Engineering' },
  ]

  const stmt = db.prepare('INSERT INTO goals (external_id, title, description, quarter, status, progress, owner_id, team, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  goals.forEach(g => stmt.run(g.external_id, g.title, g.description, g.quarter, g.status, g.progress, g.owner_id, g.team, 'manual'))
  console.log('Goals seeded')
}

// Seed goal assignees
function seedGoalAssignees() {
  const assignees = [
    { goal_id: 1, team_member_id: 1 }, { goal_id: 1, team_member_id: 2 }, { goal_id: 1, team_member_id: 8 },
    { goal_id: 2, team_member_id: 2 }, { goal_id: 2, team_member_id: 4 }, { goal_id: 2, team_member_id: 5 },
    { goal_id: 3, team_member_id: 8 }, { goal_id: 3, team_member_id: 9 }, { goal_id: 3, team_member_id: 10 },
    { goal_id: 4, team_member_id: 3 }, { goal_id: 4, team_member_id: 6 }, { goal_id: 4, team_member_id: 7 },
  ]

  const stmt = db.prepare('INSERT INTO goal_assignees (goal_id, team_member_id, source) VALUES (?, ?, ?)')
  assignees.forEach(a => stmt.run(a.goal_id, a.team_member_id, 'manual'))
  console.log('Goal assignees seeded')
}

// Seed tasks (sample tasks)
function seedTasks() {
  const tasks = [
    // Tasks for Goal 1 (Infrastructure)
    { external_id: 'T-001', title: 'Set up monitoring infrastructure', status: 'done', effort_estimate: 40, parent_goal_id: 1, priority: 'high' },
    { external_id: 'T-002', title: 'Deploy staging environment', status: 'in-progress', effort_estimate: 32, parent_goal_id: 1, priority: 'high' },
    { external_id: 'T-003', title: 'Configure CI/CD pipelines', status: 'todo', effort_estimate: 24, parent_goal_id: 1, priority: 'medium' },
    // Tasks for Goal 2 (API)
    { external_id: 'T-004', title: 'Design API endpoints', status: 'done', effort_estimate: 16, parent_goal_id: 2, priority: 'high' },
    { external_id: 'T-005', title: 'Implement authentication', status: 'in-progress', effort_estimate: 40, parent_goal_id: 2, priority: 'critical' },
    { external_id: 'T-006', title: 'Add rate limiting', status: 'todo', effort_estimate: 16, parent_goal_id: 2, priority: 'medium' },
    // Tasks for Goal 3 (Testing)
    { external_id: 'T-007', title: 'Write unit tests', status: 'in-progress', effort_estimate: 32, parent_goal_id: 3, priority: 'high' },
    { external_id: 'T-008', title: 'Set up integration tests', status: 'todo', effort_estimate: 24, parent_goal_id: 3, priority: 'medium' },
    // Tasks for Goal 4 (Documentation)
    { external_id: 'T-009', title: 'Write API documentation', status: 'in-progress', effort_estimate: 20, parent_goal_id: 4, priority: 'medium' },
    { external_id: 'T-010', title: 'Create developer guides', status: 'todo', effort_estimate: 16, parent_goal_id: 4, priority: 'low' },
  ]

  const stmt = db.prepare('INSERT INTO tasks (external_id, title, status, effort_estimate, parent_goal_id, priority, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
  tasks.forEach(t => stmt.run(t.external_id, t.title, t.status, t.effort_estimate, t.parent_goal_id, t.priority, 'manual'))
  console.log('Tasks seeded')
}

// Seed task assignees
function seedTaskAssignees() {
  const assignees = [
    { task_id: 1, team_member_id: 1, source: 'manual' },
    { task_id: 2, team_member_id: 2, source: 'manual' },
    { task_id: 3, team_member_id: 8, source: 'manual' },
    { task_id: 4, team_member_id: 4, source: 'manual' },
    { task_id: 5, team_member_id: 5, source: 'manual' },
    { task_id: 6, team_member_id: 2, source: 'manual' },
    { task_id: 7, team_member_id: 8, source: 'manual' },
    { task_id: 8, team_member_id: 9, source: 'manual' },
    { task_id: 9, team_member_id: 3, source: 'manual' },
    { task_id: 10, team_member_id: 6, source: 'manual' },
  ]

  const stmt = db.prepare('INSERT INTO task_assignees (task_id, team_member_id, source) VALUES (?, ?, ?)')
  assignees.forEach(a => stmt.run(a.task_id, a.team_member_id, a.source))
  console.log('Task assignees seeded')
}

// Seed allocations
function seedAllocations() {
  const allocations = [
    // Q1 2025 allocations - distribute across team
    { team_member_id: 1, goal_id: 1, allocation_percentage: 50, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 1, goal_id: 2, allocation_percentage: 30, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 2, goal_id: 1, allocation_percentage: 40, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 2, goal_id: 2, allocation_percentage: 40, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 3, goal_id: 4, allocation_percentage: 60, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 4, goal_id: 2, allocation_percentage: 70, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 5, goal_id: 2, allocation_percentage: 60, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 6, goal_id: 4, allocation_percentage: 50, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 7, goal_id: 4, allocation_percentage: 40, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 8, goal_id: 1, allocation_percentage: 30, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 8, goal_id: 3, allocation_percentage: 50, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 9, goal_id: 3, allocation_percentage: 60, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 10, goal_id: 3, allocation_percentage: 50, start_date: '2025-01-01', end_date: '2025-03-31' },
    { team_member_id: 11, goal_id: 1, allocation_percentage: 40, start_date: '2025-01-01', end_date: '2025-03-31' },
  ]

  const stmt = db.prepare('INSERT INTO allocations (team_member_id, goal_id, task_id, allocation_percentage, start_date, end_date, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
  allocations.forEach(a => stmt.run(a.team_member_id, a.goal_id || null, a.task_id || null, a.allocation_percentage, a.start_date, a.end_date, 'manual'))
  console.log('Allocations seeded')
}

// Run seed
function seed() {
  console.log('Starting database seed...')
  clearData()
  seedUsers()
  seedTeamMembers()
  seedTimeOff()
  seedGoals()
  seedGoalAssignees()
  seedTasks()
  seedTaskAssignees()
  seedAllocations()
  console.log('Database seeded successfully!')
}

seed()
