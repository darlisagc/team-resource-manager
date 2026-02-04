import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { authenticateToken } from './middleware/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Import routes
import authRoutes from './routes/auth.js'
import membersRoutes from './routes/members.js'
import goalsRoutes from './routes/goals.js'
import tasksRoutes from './routes/tasks.js'
import allocationsRoutes from './routes/allocations.js'
import timeoffRoutes from './routes/timeoff.js'
import importsRoutes from './routes/imports.js'
import dashboardRoutes from './routes/dashboard.js'
import calendarRoutes from './routes/calendar.js'
import initiativesRoutes from './routes/initiatives.js'
import keyResultsRoutes from './routes/key-results.js'
import weeklyAllocationsRoutes from './routes/weekly-allocations.js'
import exportsRoutes from './routes/exports.js'
import timeEntriesRoutes from './routes/time-entries.js'
import weeklyCheckinsRoutes from './routes/weekly-checkins.js'

const app = express()
const PORT = process.env.PORT || 3011

// Middleware
app.use(cors())
app.use(express.json())

// Health check (public endpoint for Docker/load balancers) - must be before protected routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// Public routes
app.use('/api/auth', authRoutes)

// Protected routes
app.use('/api/members', authenticateToken, membersRoutes)
app.use('/api/goals', authenticateToken, goalsRoutes)
app.use('/api/tasks', authenticateToken, tasksRoutes)
app.use('/api/allocations', authenticateToken, allocationsRoutes)
app.use('/api/timeoff', authenticateToken, timeoffRoutes)
app.use('/api/imports', authenticateToken, importsRoutes)
app.use('/api/dashboard', authenticateToken, dashboardRoutes)
app.use('/api/calendar', authenticateToken, calendarRoutes)
app.use('/api/initiatives', authenticateToken, initiativesRoutes)
app.use('/api/key-results', authenticateToken, keyResultsRoutes)
app.use('/api/weekly-allocations', authenticateToken, weeklyAllocationsRoutes)
app.use('/api/exports', authenticateToken, exportsRoutes)
app.use('/api/weekly-checkins', authenticateToken, weeklyCheckinsRoutes)
app.use('/api', authenticateToken, timeEntriesRoutes)

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')

  // Serve static files
  app.use(express.static(distPath))

  // Handle client-side routing - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next()
    }
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(500).json({ message: 'Internal server error', error: err.message })
})

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   ⭐ GALACTIC RESOURCE COMMAND - SERVER ONLINE ⭐        ║
  ║                                                          ║
  ║   Server running on port ${PORT}                           ║
  ║   API available at http://localhost:${PORT}/api            ║
  ║                                                          ║
  ║   May the Force be with your resources!                  ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
  `)
})
