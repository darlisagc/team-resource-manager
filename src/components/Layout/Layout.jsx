import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { path: '/dashboard', label: 'Command Center', icon: '◎' },
  { path: '/team', label: 'Crew Roster', icon: '⚔' },
  { path: '/goals', label: 'Goals Update', icon: '◈' },
  { path: '/weekly-checkin', label: 'Weekly Check-in', icon: '✓' },
  { path: '/initiatives', label: 'Quarter Estimation', icon: '◆' },
  { path: '/exports', label: 'Export', icon: '⬡' },
  { path: '/settings', label: 'Control Panel', icon: '⚙', adminOnly: true },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-sw-darker/90 backdrop-blur border-r border-sw-gold/20 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-sw-gold/20">
          <h1 className="font-orbitron text-sw-gold text-lg font-bold tracking-wider">
            GALACTIC
          </h1>
          <p className="font-orbitron text-sw-blue text-xs tracking-widest mt-1">
            RESOURCE COMMAND
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          {navItems
            .filter(item => !item.adminOnly || user?.username === 'admin')
            .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-sw-gold/10 text-sw-gold border-r-2 border-sw-gold'
                    : 'text-sw-light/70 hover:text-sw-gold hover:bg-sw-gold/5'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-space tracking-wide">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-sw-gold/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-sw-gold/20 border border-sw-gold/50 flex items-center justify-center">
              <span className="text-sw-gold font-orbitron font-bold">
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sw-light text-sm font-medium">{user?.username}</p>
              <p className="text-sw-gray text-xs">Commander</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2 text-sw-red/70 text-sm hover:text-sw-red hover:bg-sw-red/10 rounded transition-all"
          >
            ◁ Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-sw-darker/50 backdrop-blur border-b border-sw-gold/20 flex items-center justify-between px-6">
          <div>
            <h2 className="font-orbitron text-sw-light text-lg">
              {navItems.find(item => item.path === location.pathname)?.label || 'Unknown Sector'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="status-dot status-active"></span>
              <span className="text-sw-green text-xs font-space">SYSTEMS ONLINE</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
