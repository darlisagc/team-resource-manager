-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  force_password_change INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Team members table
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT,
  team TEXT,
  weekly_hours INTEGER DEFAULT 40,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Time off records (from Personio)
CREATE TABLE IF NOT EXISTS time_off (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_member_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('PTO', 'sick', 'bank_holiday', 'birthday', 'parental', 'bereavement', 'other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours REAL NOT NULL,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Goals (from Leapsome)
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  quarter TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('draft', 'active', 'completed', 'cancelled')),
  progress INTEGER DEFAULT 0,
  owner_id INTEGER,
  team TEXT,
  source TEXT DEFAULT 'manual',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES team_members(id) ON DELETE SET NULL
);

-- Goal assignees (many-to-many for Leapsome assigned members)
CREATE TABLE IF NOT EXISTS goal_assignees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL,
  team_member_id INTEGER NOT NULL,
  source TEXT DEFAULT 'leapsome',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(goal_id, team_member_id),
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Tasks (from Miro)
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in-progress', 'done', 'blocked')),
  effort_estimate REAL,
  actual_hours REAL,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
  parent_goal_id INTEGER,
  source TEXT DEFAULT 'manual',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_goal_id) REFERENCES goals(id) ON DELETE SET NULL
);

-- Task assignees from Miro (may conflict with goal assignees)
CREATE TABLE IF NOT EXISTS task_assignees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  team_member_id INTEGER NOT NULL,
  source TEXT DEFAULT 'miro',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, team_member_id, source),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Resolved assignees (after conflict resolution)
CREATE TABLE IF NOT EXISTS resolved_assignees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  team_member_id INTEGER NOT NULL,
  resolution_source TEXT DEFAULT 'manual' CHECK(resolution_source IN ('leapsome', 'miro', 'manual')),
  resolved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Allocations (resource assignments)
CREATE TABLE IF NOT EXISTS allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_member_id INTEGER NOT NULL,
  task_id INTEGER,
  goal_id INTEGER,
  allocation_percentage REAL NOT NULL CHECK(allocation_percentage >= 0 AND allocation_percentage <= 100),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  calculated_hours REAL,
  source TEXT DEFAULT 'manual' CHECK(source IN ('leapsome', 'miro', 'manual')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
);

-- Key Results (from Leapsome, linked to Goals)
CREATE TABLE IF NOT EXISTS key_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  goal_id INTEGER NOT NULL,
  owner_id INTEGER,
  metric TEXT,
  current_value REAL,
  target_value REAL,
  progress INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK(status IN ('draft', 'active', 'completed', 'cancelled')),
  source TEXT DEFAULT 'manual' CHECK(source IN ('leapsome', 'manual')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES team_members(id) ON DELETE SET NULL
);

-- Key Result Assignees (contributors to key results)
CREATE TABLE IF NOT EXISTS key_result_assignees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_result_id INTEGER NOT NULL,
  team_member_id INTEGER NOT NULL,
  source TEXT DEFAULT 'leapsome',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(key_result_id, team_member_id),
  FOREIGN KEY (key_result_id) REFERENCES key_results(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Initiatives (Projects under Key Results, from Leapsome or manual)
CREATE TABLE IF NOT EXISTS initiatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  key_result_id INTEGER,
  project_priority TEXT CHECK(project_priority IN ('P1', 'P2', 'P3', 'P4')),
  team TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('draft', 'active', 'in-progress', 'completed', 'on-hold', 'cancelled')),
  owner_id INTEGER,
  start_date DATE,
  end_date DATE,
  source TEXT DEFAULT 'manual' CHECK(source IN ('leapsome', 'miro', 'manual', 'weekly-checkin')),
  progress INTEGER DEFAULT 0,
  estimated_hours REAL DEFAULT 0,
  actual_hours REAL DEFAULT 0,
  category TEXT CHECK(category IN ('Marketing', 'Business operation', 'BD - Enterprise Adoption', 'BD - Web3 Adoption', 'BD - Account management', 'Legal', 'Venture Hub', 'Academy', 'Ecosystem Support', 'Finances')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (key_result_id) REFERENCES key_results(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id) REFERENCES team_members(id) ON DELETE SET NULL
);

-- Initiative Assignments (member + % allocation + time period)
CREATE TABLE IF NOT EXISTS initiative_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  initiative_id INTEGER NOT NULL,
  team_member_id INTEGER NOT NULL,
  role TEXT DEFAULT 'Contributor' CHECK(role IN ('Lead', 'Contributor', 'Support')),
  allocation_percentage REAL CHECK(allocation_percentage >= 0 AND allocation_percentage <= 100),
  start_date DATE,
  end_date DATE,
  source TEXT DEFAULT 'manual' CHECK(source IN ('leapsome', 'miro', 'manual')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(initiative_id, team_member_id),
  FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Weekly Allocations (Weekly granularity per initiative for PMO)
CREATE TABLE IF NOT EXISTS weekly_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_member_id INTEGER NOT NULL,
  initiative_id INTEGER NOT NULL,
  week_start DATE NOT NULL,
  allocation_percentage REAL NOT NULL CHECK(allocation_percentage >= 0 AND allocation_percentage <= 100),
  status TEXT DEFAULT 'planned' CHECK(status IN ('planned', 'actual', 'adjusted')),
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_member_id, initiative_id, week_start),
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE,
  FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE
);

-- Duplicate Tracking (for Miro import deduplication)
CREATE TABLE IF NOT EXISTS duplicate_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK(source_type IN ('miro', 'manual')),
  source_title TEXT NOT NULL,
  matched_initiative_id INTEGER,
  similarity_score REAL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'rejected', 'new')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  FOREIGN KEY (matched_initiative_id) REFERENCES initiatives(id) ON DELETE SET NULL
);

-- PMO Export Configuration
CREATE TABLE IF NOT EXISTS pmo_export_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_week DATE NOT NULL,
  end_week DATE NOT NULL,
  include_months TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task Time Entries (weekly time tracking per task per member)
CREATE TABLE IF NOT EXISTS task_time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  team_member_id INTEGER NOT NULL,
  week_start DATE NOT NULL,
  hours_worked REAL NOT NULL CHECK(hours_worked >= 0),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, team_member_id, week_start),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON task_time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_member ON task_time_entries(team_member_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_week ON task_time_entries(week_start);
CREATE INDEX IF NOT EXISTS idx_time_off_member ON time_off(team_member_id);
CREATE INDEX IF NOT EXISTS idx_time_off_dates ON time_off(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_goals_quarter ON goals(quarter);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(parent_goal_id);
CREATE INDEX IF NOT EXISTS idx_allocations_member ON allocations(team_member_id);
CREATE INDEX IF NOT EXISTS idx_allocations_dates ON allocations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_key_results_goal ON key_results(goal_id);
CREATE INDEX IF NOT EXISTS idx_key_results_status ON key_results(status);
CREATE INDEX IF NOT EXISTS idx_key_result_assignees_kr ON key_result_assignees(key_result_id);
CREATE INDEX IF NOT EXISTS idx_key_result_assignees_member ON key_result_assignees(team_member_id);
CREATE INDEX IF NOT EXISTS idx_initiatives_key_result ON initiatives(key_result_id);
CREATE INDEX IF NOT EXISTS idx_initiatives_status ON initiatives(status);
CREATE INDEX IF NOT EXISTS idx_initiatives_priority ON initiatives(project_priority);
CREATE INDEX IF NOT EXISTS idx_initiative_assignments_initiative ON initiative_assignments(initiative_id);
CREATE INDEX IF NOT EXISTS idx_initiative_assignments_member ON initiative_assignments(team_member_id);
CREATE INDEX IF NOT EXISTS idx_weekly_allocations_member ON weekly_allocations(team_member_id);
CREATE INDEX IF NOT EXISTS idx_weekly_allocations_initiative ON weekly_allocations(initiative_id);
CREATE INDEX IF NOT EXISTS idx_weekly_allocations_week ON weekly_allocations(week_start);
CREATE INDEX IF NOT EXISTS idx_duplicate_matches_status ON duplicate_matches(status);

-- Weekly Check-ins (user self-reported time allocation)
CREATE TABLE IF NOT EXISTS weekly_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_member_id INTEGER NOT NULL,
  week_start DATE NOT NULL,
  total_allocation_pct REAL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'submitted')),
  submitted_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_member_id, week_start),
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Weekly Check-in Items (allocation per initiative/key result)
CREATE TABLE IF NOT EXISTS weekly_checkin_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkin_id INTEGER NOT NULL,
  initiative_id INTEGER,
  key_result_id INTEGER,
  time_allocation_pct REAL DEFAULT 0 CHECK(time_allocation_pct >= 0 AND time_allocation_pct <= 100),
  progress_contribution_pct REAL DEFAULT 0 CHECK(progress_contribution_pct >= 0 AND progress_contribution_pct <= 100),
  current_value_increment REAL DEFAULT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (checkin_id) REFERENCES weekly_checkins(id) ON DELETE CASCADE,
  FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
  FOREIGN KEY (key_result_id) REFERENCES key_results(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weekly_checkins_member ON weekly_checkins(team_member_id);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_week ON weekly_checkins(week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_checkin_items_checkin ON weekly_checkin_items(checkin_id);
CREATE INDEX IF NOT EXISTS idx_weekly_checkin_items_initiative ON weekly_checkin_items(initiative_id);
CREATE INDEX IF NOT EXISTS idx_weekly_checkin_items_kr ON weekly_checkin_items(key_result_id);

-- Initiative Time Entries (weekly time tracking per initiative per member)
CREATE TABLE IF NOT EXISTS initiative_time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  initiative_id INTEGER NOT NULL,
  team_member_id INTEGER NOT NULL,
  week_start DATE NOT NULL,
  hours_worked REAL NOT NULL CHECK(hours_worked >= 0),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(initiative_id, team_member_id, week_start),
  FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_init_time_entries_initiative ON initiative_time_entries(initiative_id);
CREATE INDEX IF NOT EXISTS idx_init_time_entries_member ON initiative_time_entries(team_member_id);
CREATE INDEX IF NOT EXISTS idx_init_time_entries_week ON initiative_time_entries(week_start);

-- Initiative Updates (status changes and comments)
CREATE TABLE IF NOT EXISTS initiative_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  initiative_id INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  comment TEXT,
  link TEXT,
  updated_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES team_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_initiative_updates_initiative ON initiative_updates(initiative_id);

CREATE TABLE IF NOT EXISTS calendar_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
