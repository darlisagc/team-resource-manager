import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db, { getOne, run } from '../db/database.js'
import { generateToken, authenticateToken } from '../middleware/auth.js'

const router = Router()

// Admin-only middleware (all authenticated users are admins)
function adminOnly(req, res, next) {
  next()
}

router.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' })
  }

  const user = getOne('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username])

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const validPassword = bcrypt.compareSync(password, user.password)
  if (!validPassword) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const token = generateToken(user)

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username
    },
    forcePasswordChange: user.force_password_change === 1
  })
})

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' })
})

// Get all users (admin only)
router.get('/users', authenticateToken, adminOnly, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, force_password_change, created_at
    FROM users
    ORDER BY username
  `).all()

  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    forcePasswordChange: u.force_password_change === 1,
    createdAt: u.created_at
  })))
})

// Admin reset user password
router.post('/admin/reset-password', authenticateToken, adminOnly, (req, res) => {
  const { userId, temporaryPassword } = req.body

  if (!userId || !temporaryPassword) {
    return res.status(400).json({ message: 'User ID and temporary password are required' })
  }

  if (temporaryPassword.length < 6) {
    return res.status(400).json({ message: 'Temporary password must be at least 6 characters' })
  }

  const user = getOne('SELECT * FROM users WHERE id = ?', [userId])
  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }

  const hashedPassword = bcrypt.hashSync(temporaryPassword, 10)
  run('UPDATE users SET password = ?, force_password_change = 1 WHERE id = ?', [hashedPassword, userId])

  res.json({
    message: `Password reset for ${user.username}. They will be required to change it on next login.`
  })
})

router.post('/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body
  const userId = req.user.id

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' })
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters long' })
  }

  const user = getOne('SELECT * FROM users WHERE id = ?', [userId])
  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }

  const validPassword = bcrypt.compareSync(currentPassword, user.password)
  if (!validPassword) {
    return res.status(401).json({ message: 'Current password is incorrect' })
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10)
  run('UPDATE users SET password = ?, force_password_change = 0 WHERE id = ?', [hashedPassword, userId])

  res.json({ message: 'Password changed successfully' })
})

export default router
