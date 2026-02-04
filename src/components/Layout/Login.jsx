import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(username, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block p-4 rounded-full border-2 border-sw-gold/50 mb-4">
            <svg className="w-16 h-16 text-sw-gold" viewBox="0 0 100 100" fill="currentColor">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="3"/>
              <circle cx="50" cy="50" r="20" fill="none" stroke="#4BD5EE" strokeWidth="2"/>
              <circle cx="50" cy="50" r="5" fill="currentColor"/>
              <line x1="50" y1="5" x2="50" y2="30" stroke="currentColor" strokeWidth="2"/>
              <line x1="50" y1="70" x2="50" y2="95" stroke="currentColor" strokeWidth="2"/>
              <line x1="5" y1="50" x2="30" y2="50" stroke="currentColor" strokeWidth="2"/>
              <line x1="70" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <h1 className="font-orbitron text-sw-gold text-2xl font-bold tracking-wider">
            GALACTIC COMMAND
          </h1>
          <p className="font-orbitron text-sw-blue text-sm tracking-widest mt-2">
            RESOURCE MANAGEMENT SYSTEM
          </p>
        </div>

        {/* Login form */}
        <div className="hologram-card p-8">
          <h2 className="font-orbitron text-sw-light text-lg mb-6 text-center">
            AUTHENTICATION REQUIRED
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sw-gray text-xs font-orbitron uppercase tracking-wider mb-2">
                Identification
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="Enter username"
                required
              />
            </div>

            <div>
              <label className="block text-sw-gray text-xs font-orbitron uppercase tracking-wider mb-2">
                Access Code
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter password"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-sw-red/10 border border-sw-red/30 rounded text-sw-red text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 mt-4"
            >
              {loading ? (
                <span className="animate-pulse">AUTHENTICATING...</span>
              ) : (
                'ACCESS COMMAND CENTER'
              )}
            </button>
          </form>

        </div>

        {/* Footer */}
        <p className="text-center text-sw-gray/50 text-xs mt-8 font-space">
          Team Resource Management System v1.0
        </p>
      </div>
    </div>
  )
}
