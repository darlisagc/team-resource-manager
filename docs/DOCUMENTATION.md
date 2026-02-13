# Galactic Resource Command
## Team Resource Manager - Comprehensive Documentation

---

# Table of Contents

1. [Executive Summary](#executive-summary)
2. [Business Perspective](#business-perspective)
3. [User Perspective](#user-perspective)
4. [Technical Architecture](#technical-architecture)
5. [Data Architecture](#data-architecture)
6. [API Reference](#api-reference)
7. [Deployment Guide](#deployment-guide)

---

# Executive Summary

**Galactic Resource Command** (Team Resource Manager) is a comprehensive team resource management platform designed to help engineering teams track OKRs (Objectives and Key Results), manage capacity, and monitor team health through weekly check-ins.

The platform features a unique Star Wars-inspired theme, providing an engaging user experience while delivering powerful resource management capabilities.

**Key Value Propositions:**
- Unified OKR tracking and resource planning
- Real-time team capacity visibility
- Weekly check-in system with mood tracking (Force Index)
- Automated status transitions and progress tracking
- Flexible export capabilities for PMO reporting

---

# Business Perspective

## Problem Statement

Engineering teams face several challenges in resource management:

1. **Visibility Gap**: Managers lack real-time visibility into team capacity and workload distribution
2. **OKR Tracking Friction**: Tracking progress on objectives requires manual updates across multiple systems
3. **Capacity Planning**: Estimating resource needs for upcoming quarters is time-consuming and error-prone
4. **Team Health Monitoring**: No systematic way to track team morale and identify blockers early
5. **Reporting Overhead**: Generating PMO reports requires manual data aggregation

## Solution Overview

### Core Capabilities

| Capability | Business Value |
|------------|----------------|
| **OKR Management** | Hierarchical goal tracking (Goals → Key Results → Initiatives) with automatic progress rollup |
| **Capacity Planning** | FTE-based estimation with per-member allocation visibility |
| **Weekly Check-ins** | Structured time tracking with mood monitoring (Force Index) |
| **Dashboard Analytics** | Real-time utilization charts with multicolor visualization |
| **Automated Workflows** | Status auto-transitions, progress calculations, and alerts |
| **Export & Reporting** | CSV/JSON exports for PMO integration |

### Business Metrics Tracked

- **Team Utilization Rate**: Percentage of available capacity being used
- **Goal Progress**: Completion percentage across all OKRs
- **Force Index**: Team morale indicator (GRANDMASTER → PADAWAN scale)
- **Capacity Allocation**: Distribution across Time Off, Events, and Work

### ROI Benefits

1. **Time Savings**: Automated status updates and progress calculations reduce manual tracking by ~60%
2. **Improved Visibility**: Real-time dashboards eliminate weekly status meeting overhead
3. **Better Planning**: Historical data enables more accurate capacity forecasting
4. **Early Warning**: Force Index trends identify team health issues before they escalate

## Target Users

| Role | Primary Use Cases |
|------|-------------------|
| **Engineering Manager** | Dashboard monitoring, capacity planning, team health tracking |
| **Team Lead** | Goal updates, initiative management, weekly reviews |
| **Individual Contributor** | Weekly check-ins, time allocation reporting |
| **PMO/Leadership** | Export reports, cross-team visibility |

---

# User Perspective

## Getting Started

### Login
Access the application at your organization's URL and log in with your credentials.

```
URL: https://uat.yaci.cf-app.org/login
Default: admin / admin (change on first login)
```

### Navigation

The sidebar provides access to all main features:

| Menu Item | Purpose |
|-----------|---------|
| **Command Center** | Dashboard with utilization charts and team overview |
| **Crew Roster** | Team member management and assignments |
| **Goals Update** | OKR tracking (Goals → Key Results → Initiatives) |
| **Weekly Check-in** | Submit weekly time allocation and mood |
| **Planning** | Quarter-based FTE estimation |
| **Export** | Generate PMO reports |
| **Control Panel** | Admin settings, imports, calendar sync |

## Daily Workflows

### Morning Check (2 minutes)

1. Open **Command Center** (Dashboard)
2. Review **Crew Utilization** chart for team workload
3. Check **Goals Progress** for any blocked items
4. Note any capacity alerts (over/under allocation)

### Weekly Check-in (5 minutes)

1. Navigate to **Weekly Check-in**
2. Select your name and the current week
3. For each initiative you worked on:
   - Set **Time Allocation %** (how much of your week)
   - Update **Progress** (current value or percentage)
   - Add optional **Notes**
4. Set your **Force Level** (mood):
   - ⚔️ **GRANDMASTER** - Excellent, highly productive
   - 🗡️ **JEDI MASTER** - Good, on track
   - ✨ **JEDI KNIGHT** - Neutral, some challenges
   - 🌑 **PADAWAN** - Blocked, needs help
5. Click **Submit**

### Updating OKRs

1. Go to **Goals Update**
2. Click on a goal to see its Key Results
3. Click on a Key Result to see its Initiatives
4. To update progress:
   - Click the status badge
   - Update current value (e.g., 5/12 integrations)
   - Add a comment explaining the update
   - Optionally add a link (PR, Jira ticket)
5. Save changes

### Creating New Initiatives

1. Navigate to a Goal's detail page
2. Click **+ Add Initiative** under a Key Result
3. Fill in:
   - **Name**: Clear, action-oriented title
   - **Assignees**: Lead + Contributors
   - **Tracker URL**: Link to Jira/GitHub
   - **Category**: For BAU goals
4. Save

## Key Features Explained

### Dashboard - Crew Utilization Chart

The stacked bar chart shows each team member's workload breakdown:

| Color | Meaning |
|-------|---------|
| 🔴 Red (#FF6B6B) | Time Off (PTO, holidays, sick leave) |
| 🟣 Purple (#A855F7) | Events (meetings, training, conferences) |
| 🔵 Cyan (#4BD5EE) | Work Allocation (actual project work) |

**User names are displayed in orange (#FF6B35)** for visibility.

### Force Index

The Force Index measures team morale based on weekly check-in mood submissions:

| Level | Score | Meaning |
|-------|-------|---------|
| ⚔️ GRANDMASTER | 3.5-4.0 | Team is thriving |
| 🗡️ JEDI MASTER | 2.5-3.4 | Team is healthy |
| ✨ JEDI KNIGHT | 1.5-2.4 | Some challenges |
| 🌑 PADAWAN | 1.0-1.4 | Team needs support |

When no check-ins exist, the display shows: *"The Force is silent..."*

### Auto-Status Transitions

The system automatically updates statuses based on actions:

| Trigger | Status Change |
|---------|---------------|
| Hours logged via check-in | Active → **In Progress** |
| Progress reaches 100% | In Progress → **Completed** |
| All KR initiatives complete | Key Result → **Completed** |

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 INTERCONNECTED PAGES                     │
│  (Share data from weekly_checkins table)                │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Dashboard │  │  Crew    │  │  Goals   │  │ Weekly   │ │
│  │          │◄─┤  Roster  │◄─┤  Update  │◄─┤ Check-in │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   SEPARATE SYSTEM                        │
│  (Planning data only affects Export)                    │
│                                                          │
│  ┌──────────┐                          ┌──────────┐     │
│  │ Planning │ ─────────────────────────► │  Export  │     │
│  │ (FTE)    │    Estimations source    │          │     │
│  └──────────┘                          └──────────┘     │
└─────────────────────────────────────────────────────────┘
```

---

# Technical Architecture

## Tech Stack Overview

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.2.0 | UI framework |
| **React Router** | 6.22.0 | Client-side routing |
| **Vite** | 5.1.0 | Build tool & dev server |
| **Tailwind CSS** | 3.4.1 | Utility-first styling |
| **Recharts** | 2.12.0 | Data visualization |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 20.x | Runtime environment |
| **Express** | 4.18.2 | Web framework |
| **better-sqlite3** | 9.4.3 | SQLite database driver |
| **JWT** | 9.0.2 | Authentication |
| **node-cron** | 4.2.1 | Scheduled tasks (backups) |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **Docker** | Containerization |
| **Docker Compose** | Container orchestration |
| **Nginx** | Reverse proxy (production) |
| **SQLite** | Database |

### Additional Libraries

| Library | Purpose |
|---------|---------|
| **Tesseract.js** | OCR for Miro image imports |
| **node-ical** | Calendar feed parsing |
| **xlsx** | Excel file processing |
| **csv-parse** | CSV file processing |
| **pdfjs-dist** | PDF processing |
| **multer** | File upload handling |
| **bcryptjs** | Password hashing |

## Project Structure

```
team-resource-manager/
├── src/                      # Frontend source
│   ├── components/           # React components
│   │   ├── Dashboard/        # Command Center
│   │   ├── Goals/            # OKR management
│   │   ├── WeeklyCheckin/    # Check-in system
│   │   ├── Initiatives/      # Planning page
│   │   ├── TeamOverview/     # Crew Roster
│   │   ├── Exports/          # PMO Export
│   │   ├── Settings/         # Control Panel
│   │   └── Layout/           # App shell, auth
│   ├── constants/            # App constants, colors
│   └── App.jsx               # Root component
├── server/                   # Backend source
│   ├── routes/               # API endpoints
│   ├── services/             # Business logic
│   │   └── backupService.js  # Backup/restore
│   ├── middleware/           # Auth middleware
│   ├── db/                   # Database setup
│   └── index.js              # Express server
├── public/                   # Static assets
│   └── workflow-diagram.html # Documentation
├── scripts/                  # Deployment scripts
├── backups/                  # Database backups
└── docs/                     # Documentation
```

## Security

### Authentication
- JWT-based token authentication
- Tokens expire after 24 hours
- Password hashing with bcryptjs

### API Protection
- All API routes (except `/api/auth` and `/api/health`) require valid JWT
- Token passed via `Authorization: Bearer <token>` header

### Data Protection
- Automatic weekly database backups (Fridays 11 PM)
- Pre-restore backups before any restore operation
- Backup retention: Last 4 weekly backups

---

# Data Architecture

## Database Schema

### Core Tables

```
goals
├── id, title, description
├── quarter, status, progress
├── owner_id → team_members
└── team, source

key_results
├── id, title, description
├── goal_id → goals
├── status, progress
├── current_value, target_value
└── owner_id → team_members

initiatives
├── id, name, description
├── key_result_id → key_results
├── status, progress, priority
├── estimated_hours, actual_hours
├── owner_id → team_members
└── tracker_url, category

team_members
├── id, name, email
├── role, team, country
└── weekly_hours, effective_fte

weekly_checkins
├── id, team_member_id
├── week_start, status
├── total_allocation_pct
└── mood_score, notes

weekly_checkin_items
├── id, checkin_id
├── initiative_id / key_result_id
├── time_allocation_pct
├── progress_value, notes
└── is_event
```

### Status Values

| Entity | Valid Statuses |
|--------|----------------|
| Goals | draft, active, completed, cancelled |
| Key Results | draft, active, not-started, in-progress, completed, on-hold, cancelled |
| Initiatives | draft, active, in-progress, completed, on-hold, cancelled |
| Check-ins | draft, submitted |

---

# API Reference

## Authentication

### Login
```
POST /api/auth/login
Body: { "username": "admin", "password": "admin" }
Response: { "token": "jwt...", "user": {...} }
```

## Core Endpoints

### Goals
```
GET    /api/goals                    # List all goals
GET    /api/goals/:id                # Get goal with KRs
POST   /api/goals                    # Create goal
PUT    /api/goals/:id                # Update goal
DELETE /api/goals/:id                # Delete goal
```

### Key Results
```
GET    /api/key-results/:id          # Get KR with initiatives
POST   /api/key-results              # Create KR
PUT    /api/key-results/:id          # Update KR
POST   /api/key-results/:id/updates  # Add progress update
```

### Initiatives
```
GET    /api/initiatives              # List all initiatives
POST   /api/initiatives              # Create initiative
PUT    /api/initiatives/:id          # Update initiative
DELETE /api/initiatives/:id          # Delete initiative
```

### Weekly Check-ins
```
GET    /api/weekly-checkins          # List check-ins
POST   /api/weekly-checkins          # Create/update check-in
GET    /api/weekly-checkins/analytics # Get analytics data
```

### Team Members
```
GET    /api/members                  # List all members
POST   /api/members                  # Create member
PUT    /api/members/:id              # Update member
```

### Backups
```
GET    /api/backups                  # List all backups
POST   /api/backups                  # Create manual backup
POST   /api/backups/restore          # Restore from backup
Body: { "backupName": "database_backup_2026-02-13T15-12-43-866Z.sqlite" }
```

### Health Check
```
GET    /api/health                   # Server health (public)
Response: { "status": "ok", "uptime": 123.45, "environment": "production" }
```

---

# Deployment Guide

## Local Development

```bash
# Install dependencies
npm install

# Start development server (frontend + backend)
npm run dev

# Frontend: http://localhost:3010
# Backend:  http://localhost:3011
```

## Production Deployment

### Prerequisites
- Docker installed on server
- SSH access via jump server
- nginx configured for reverse proxy

### Deploy Command
```bash
# From project root
./scripts/deploy.sh

# First-time deployment
./scripts/deploy.sh --first-time
```

### Deployment Process
1. Creates source archive (excludes node_modules, .git)
2. Copies to remote server via SSH (through jumpbox)
3. Builds Docker image on server
4. Deploys with docker-compose
5. Verifies health check

### Environment Variables
```
NODE_ENV=production
PORT=3011
JWT_SECRET=your-secret-key
DATABASE_PATH=/app/data/database.sqlite
```

## Backup & Restore

### Automatic Backups
- **Schedule**: Every Friday at 11:00 PM (Europe/Dublin)
- **Retention**: Last 4 weekly backups
- **Location**: `/backups/`

### Manual Backup
```bash
# Via API
curl -X POST https://your-server/api/backups \
  -H "Authorization: Bearer <token>"

# Via npm script
npm run backup
```

### Restore
```bash
# Via API
curl -X POST https://your-server/api/backups/restore \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"backupName": "database_backup_2026-02-13T15-12-43-866Z.sqlite"}'
```

---

# Support & Resources

## URLs

| Environment | URL |
|-------------|-----|
| UAT | https://uat.yaci.cf-app.org |
| Workflow Diagram | https://uat.yaci.cf-app.org/workflow-diagram.html |

## Team Assignment by Country

| Country | Team Members |
|---------|--------------|
| Ireland | Darlisa, Giovanni, Marco |
| Germany | Luis, Fabian, Mateusz, Florian, Max |
| Singapore | Saty |
| Switzerland | Marvin |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Feb 2026 | Initial release with OKR tracking, check-ins, Force Index |
| 1.1.0 | Feb 2026 | Dashboard multicolor bars, auto-status, backup system |

---

*Documentation generated: February 2026*
*Galactic Resource Command - May the Force be with your resources!*
