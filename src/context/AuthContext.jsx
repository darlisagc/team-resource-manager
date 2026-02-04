import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [forcePasswordChange, setForcePasswordChange] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    const savedForcePasswordChange = localStorage.getItem('forcePasswordChange')
    if (token && savedUser) {
      setUser(JSON.parse(savedUser))
      setForcePasswordChange(savedForcePasswordChange === 'true')
    }
    setLoading(false)
  }, [])

  const login = async (username, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Login failed')
    }

    const data = await response.json()
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    localStorage.setItem('forcePasswordChange', data.forcePasswordChange ? 'true' : 'false')
    setUser(data.user)
    setForcePasswordChange(data.forcePasswordChange || false)
    return data
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('forcePasswordChange')
    setUser(null)
    setForcePasswordChange(false)
  }

  const changePassword = async (currentPassword, newPassword) => {
    const token = localStorage.getItem('token')
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Password change failed')
    }

    localStorage.setItem('forcePasswordChange', 'false')
    setForcePasswordChange(false)
    return await response.json()
  }

  const getAuthHeader = () => {
    const token = localStorage.getItem('token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, getAuthHeader, forcePasswordChange, changePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
