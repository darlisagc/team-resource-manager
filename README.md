# Team Resource Manager - Galactic Command

A comprehensive team resource management system with a Star Wars-inspired theme. Built for tracking goals, initiatives, team allocations, and weekly progress.

**Live URL:** https://uat.yaci.cf-app.org/

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Application Structure](#application-structure)
- [Usage Guide](#usage-guide)
- [Deployment](#deployment)
- [API Endpoints](#api-endpoints)

## Overview

Team Resource Manager helps teams track their objectives and key results (OKRs), manage initiatives, and monitor weekly progress. The application provides a clear view of team capacity, resource allocation, and goal completion status.

## Features

### Goal Management
- Create and manage hierarchical goals with key results
- Track goal progress across multiple initiatives
- View goal details with assignees and timelines
- Support for different goal types: Strategic, Quarterly, BAU (Business as Usual), Events

### Initiative Tracking
- Link initiatives to key results and goals
- Assign team members to initiatives
- Track progress percentages
- Set deadlines and priorities

### Weekly Check-in System
- Team members submit weekly progress updates
- Track time allocation across initiatives
- Support for BAU (Business as Usual) work
- Historical check-in review and analysis

### Team Management (Crew Roster)
- View all team members with their assignments
- See individual member's goals, key results, and initiatives
- Track member capacity and workload
- Profile cards with assignment details

### Capacity Planning
- Visual capacity planning by week
- Track team utilization
- Forecast resource availability

### Dashboard & Exports
- Overview dashboard with key metrics
- PMO export functionality
- Data exports for reporting

## Technology Stack

### Frontend
- **React 18** - UI component library
- **Vite** - Build tool and development server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Custom Star Wars Theme** - Orbitron & Space Mono fonts

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **better-sqlite3** - SQLite database driver
- **JWT** - JSON Web Tokens for authentication
- **bcryptjs** - Password hashing

### Database
- **SQLite** - Lightweight relational database
- Schema includes: users, members, goals, key_results, initiatives, allocations, weekly_checkins, etc.

### Deployment
- **Docker** - Containerized deployment with multi-stage builds
- **Docker Compose** - Container orchestration
- **PM2** - Process manager for Node.js (non-Docker deployments)
- **Nginx** - Reverse proxy and SSL termination
- **Git** - Version control

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/darlisagc/team-resource-manager.git
cd team-resource-manager
```

2. Install dependencies:
```bash
npm install
```

3. Initialize the database:
```bash
npm run seed
```

4. Start development server:
```bash
npm run dev
```

This starts both the frontend (Vite on port 5173) and backend (Express on port 3011).

### Production Build

```bash
npm run build
NODE_ENV=production node server/index.js
```

## Application Structure

```
team-resource-manager/
├── src/                    # Frontend React application
│   ├── components/         # React components
│   │   ├── Dashboard/      # Main dashboard
│   │   ├── Goals/          # Goal management views
│   │   ├── Initiatives/    # Initiative tracking
│   │   ├── WeeklyCheckin/  # Weekly check-in system
│   │   ├── TeamOverview/   # Crew roster
│   │   ├── Layout/         # App layout, login, navigation
│   │   └── ...
│   ├── context/            # React context (AuthContext)
│   ├── constants/          # App constants
│   └── utils/              # Utility functions
├── server/                 # Backend Express application
│   ├── routes/             # API route handlers
│   ├── middleware/         # Express middleware (auth)
│   ├── db/                 # Database setup and migrations
│   ├── services/           # Business logic services
│   └── index.js            # Server entry point
├── dist/                   # Production build output
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Docker Compose configuration
├── scripts/                # Deployment and utility scripts
└── package.json
```

## Usage Guide

### Login
- Default credentials: `admin` / `admin`
- First-time users may be prompted to change password

### Navigation

| Page | Description |
|------|-------------|
| Dashboard | Overview of key metrics and recent activity |
| Goals | Create and manage organizational goals |
| Initiatives | Track individual initiatives linked to goals |
| Weekly Check-in | Submit and review weekly progress updates |
| Crew Roster | View team members and their assignments |
| Capacity Planning | Plan and forecast resource allocation |
| Settings | Application configuration |

### Weekly Check-in Workflow

1. Navigate to **Weekly Check-in**
2. Select a team member (or your own profile)
3. View assigned initiatives and goals
4. Update time allocation percentages
5. Add progress contributions
6. Include any BAU or miscellaneous work
7. Submit the check-in

### Goal Hierarchy

```
Goal (e.g., "Improve Customer Satisfaction")
└── Key Result (e.g., "Reduce response time to <24 hours")
    └── Initiative (e.g., "Implement automated ticketing")
        └── Assigned Team Member(s)
```

## Deployment

### Docker Deployment (Recommended)

The application includes a multi-stage Dockerfile optimized for production.

#### Quick Start with Docker

```bash
# Build the image
npm run docker:build
# or
docker build -t team-resource-manager .

# Run with Docker Compose
npm run docker:run
# or
docker-compose up -d

# View logs
npm run docker:logs
# or
docker-compose logs -f

# Stop
npm run docker:stop
# or
docker-compose down
```

#### Docker Configuration

**Dockerfile features:**
- Multi-stage build (builder + production)
- Node.js 20 slim base image
- Non-root user for security
- Health check endpoint
- Optimized layer caching

**docker-compose.yml features:**
- Persistent volumes for database and uploads
- Environment variable configuration
- Automatic restart policy
- Log rotation (10MB max, 3 files)
- Health checks

#### Environment Variables (Docker)

```bash
# Set in docker-compose.yml or pass via -e flag
PORT=3011                          # Application port
NODE_ENV=production                # Environment mode
JWT_SECRET=your-secret-key         # JWT signing secret (change in production!)
DATABASE_PATH=/app/data/database.sqlite  # Database location
```

#### Data Persistence

Docker volumes ensure data persists across container restarts:
- `team-resource-manager-data` - SQLite database
- `team-resource-manager-uploads` - Uploaded files

To backup the database:
```bash
docker cp team-resource-manager:/app/data/database.sqlite ./backup.sqlite
```

---

### Remote Server (UAT)

The application is deployed on the UAT server using Docker.

**Server:** uat.yaci.cf-app.org
**Port:** 3011
**Deployment:** Docker container
**Reverse Proxy:** Nginx (managed by Ansible)

### UAT Deployment Steps

1. SSH to server (via jump host):
```bash
ssh uat  # Uses SSH config alias
```

2. Pull latest changes and rebuild:
```bash
cd /home/darlisa/apps/team-resource-manager
git pull origin main
docker build -t team-resource-manager .
```

3. Restart container:
```bash
docker-compose down
docker-compose up -d
```

4. Copy database if needed:
```bash
docker cp database.sqlite team-resource-manager:/app/data/database.sqlite
docker restart team-resource-manager
```

### Docker Commands (UAT)

```bash
docker ps                                    # View running containers
docker logs team-resource-manager            # View logs
docker logs -f team-resource-manager         # Follow logs
docker restart team-resource-manager         # Restart container
docker exec -it team-resource-manager sh     # Shell into container
```

### Nginx Configuration

Located at `/etc/nginx/vhosts.d/uat.yaci.cf-app.internal.conf` (managed by Ansible).

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/change-password` | Change password |

### Members
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/members` | List all members |
| GET | `/api/members/:id` | Get member details |

### Goals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/goals` | List all goals |
| GET | `/api/goals/:id` | Get goal details |
| POST | `/api/goals` | Create new goal |
| PUT | `/api/goals/:id` | Update goal |
| DELETE | `/api/goals/:id` | Delete goal |

### Initiatives
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/initiatives` | List all initiatives |
| GET | `/api/initiatives/member/:id` | Get member's initiatives |
| POST | `/api/initiatives` | Create new initiative |
| PUT | `/api/initiatives/:id` | Update initiative |

### Weekly Check-ins
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/weekly-checkins/:memberId/:year/:week` | Get check-in |
| POST | `/api/weekly-checkins` | Create/update check-in |

### Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health status |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3011 | Server port |
| `HOST` | 0.0.0.0 | Server host binding |
| `NODE_ENV` | development | Environment mode |
| `JWT_SECRET` | (internal) | JWT signing secret |

## Contributing

1. Create a feature branch
2. Make changes
3. Test locally
4. Submit pull request

## License

Internal project - not for public distribution.
