import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout/Layout'
import Login from './components/Layout/Login'
import ChangePassword from './components/Layout/ChangePassword'
import Dashboard from './components/Dashboard/Dashboard'
import TeamOverview from './components/TeamOverview/TeamOverview'
import Goals from './components/Goals/Goals'
import GoalDetail from './components/Goals/GoalDetail'
import Tasks from './components/Tasks/Tasks'
import WeeklyReview from './components/WeeklyReview/WeeklyReview'
import CapacityPlanning from './components/CapacityPlanning/CapacityPlanning'
import Settings from './components/Settings/Settings'
import Initiatives from './components/Initiatives/Initiatives'
import WeeklyInput from './components/WeeklyInput/WeeklyInput'
import WeeklyCheckin from './components/WeeklyCheckin/WeeklyCheckin'
import PMOExport from './components/Exports/PMOExport'

function ProtectedRoute({ children }) {
  const { user, loading, forcePasswordChange } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sw-gold font-orbitron text-xl animate-pulse">
          INITIALIZING SYSTEMS...
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (forcePasswordChange) {
    return <ChangePassword />
  }

  return children
}

function AdminRoute({ children }) {
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="team" element={<TeamOverview />} />
        <Route path="goals" element={<Goals />} />
        <Route path="goals/:id" element={<GoalDetail />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="weekly-review" element={<WeeklyReview />} />
        <Route path="capacity" element={<CapacityPlanning />} />
        <Route path="estimation" element={<Initiatives />} />
        <Route path="weekly-input" element={<WeeklyInput />} />
        <Route path="weekly-checkin" element={<WeeklyCheckin />} />
        <Route path="exports" element={<PMOExport />} />
        <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
      </Route>
    </Routes>
  )
}

export default App
