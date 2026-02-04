import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { changePassword } = useAuth()

  const getPasswordStrength = (password) => {
    if (!password) return { level: 0, text: '', color: '' }
    let strength = 0
    if (password.length >= 8) strength++
    if (password.length >= 12) strength++
    if (/[A-Z]/.test(password)) strength++
    if (/[0-9]/.test(password)) strength++
    if (/[^A-Za-z0-9]/.test(password)) strength++

    if (strength <= 1) return { level: 1, text: 'WEAK', color: 'bg-sw-red' }
    if (strength <= 2) return { level: 2, text: 'FAIR', color: 'bg-yellow-500' }
    if (strength <= 3) return { level: 3, text: 'GOOD', color: 'bg-sw-blue' }
    return { level: 4, text: 'STRONG', color: 'bg-green-500' }
  }

  const passwordStrength = getPasswordStrength(newPassword)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    setLoading(true)

    try {
      await changePassword(currentPassword, newPassword)
    } catch (err) {
      setError(err.message || 'Password change failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-space-dark/95 flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block p-4 rounded-full border-2 border-sw-gold/50 mb-4">
            <svg className="w-12 h-12 text-sw-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 className="font-orbitron text-sw-gold text-xl font-bold tracking-wider">
            PASSWORD CHANGE REQUIRED
          </h1>
          <p className="font-space text-sw-gray text-sm mt-2">
            For security, please set a new password before continuing
          </p>
        </div>

        <div className="hologram-card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sw-gray text-xs font-orbitron uppercase tracking-wider mb-2">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input-field"
                placeholder="Enter current password"
                required
              />
            </div>

            <div>
              <label className="block text-sw-gray text-xs font-orbitron uppercase tracking-wider mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field"
                placeholder="Enter new password (min 8 characters)"
                required
              />
              {newPassword && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded ${
                          level <= passwordStrength.level
                            ? passwordStrength.color
                            : 'bg-sw-gray/30'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-orbitron ${
                    passwordStrength.level <= 1 ? 'text-sw-red' :
                    passwordStrength.level === 2 ? 'text-yellow-500' :
                    passwordStrength.level === 3 ? 'text-sw-blue' :
                    'text-green-500'
                  }`}>
                    {passwordStrength.text}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sw-gray text-xs font-orbitron uppercase tracking-wider mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="Confirm new password"
                required
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-sw-red text-xs mt-1">Passwords do not match</p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-sw-red/10 border border-sw-red/30 rounded text-sw-red text-sm text-center">
                {error}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3"
              >
                {loading ? (
                  <span className="animate-pulse">UPDATING CREDENTIALS...</span>
                ) : (
                  'SET NEW PASSWORD'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 p-3 bg-sw-blue/10 border border-sw-blue/30 rounded">
            <p className="text-sw-blue text-xs font-orbitron mb-2">PASSWORD REQUIREMENTS:</p>
            <ul className="text-sw-gray text-xs space-y-1">
              <li className={newPassword.length >= 8 ? 'text-green-500' : ''}>
                • Minimum 8 characters
              </li>
              <li className={/[A-Z]/.test(newPassword) ? 'text-green-500' : ''}>
                • Uppercase letter (recommended)
              </li>
              <li className={/[0-9]/.test(newPassword) ? 'text-green-500' : ''}>
                • Number (recommended)
              </li>
              <li className={/[^A-Za-z0-9]/.test(newPassword) ? 'text-green-500' : ''}>
                • Special character (recommended)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
