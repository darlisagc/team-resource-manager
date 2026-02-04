import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import GoalOverview from '../WeeklyReview/WeeklyReview'

export default function Goals() {
  const navigate = useNavigate()
  const { getAuthHeader } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('goals') // 'goals' or 'overview'

  useEffect(() => {
    if (activeTab === 'goals') {
      fetchGoals()
    }
  }, [activeTab])

  const fetchGoals = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/goals', { headers: getAuthHeader() })
      const data = await res.json()
      setGoals(data)
    } catch (error) {
      console.error('Failed to fetch goals:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Strategic Goals</h1>
          <p className="text-sw-gray text-sm">Yearly goals & key results</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-sw-gray/20">
        <button
          onClick={() => setActiveTab('goals')}
          className={`px-4 py-2 font-space text-sm transition-all border-b-2 -mb-px ${
            activeTab === 'goals'
              ? 'text-sw-gold border-sw-gold'
              : 'text-sw-gray border-transparent hover:text-sw-light'
          }`}
        >
          Goals Update
        </button>
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-space text-sm transition-all border-b-2 -mb-px ${
            activeTab === 'overview'
              ? 'text-sw-gold border-sw-gold'
              : 'text-sw-gray border-transparent hover:text-sw-light'
          }`}
        >
          Goal Overview
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'goals' ? (
        loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-sw-gold font-orbitron animate-pulse">LOADING STRATEGIC GOALS...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {goals.length === 0 ? (
              <div className="hologram-card p-8 text-center col-span-full">
                <p className="text-sw-gray font-orbitron">No goals found</p>
              </div>
            ) : (
              goals.map(goal => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onClick={() => navigate(`/goals/${goal.id}`)}
                />
              ))
            )}
          </div>
        )
      ) : (
        <GoalOverview />
      )}
    </div>
  )
}

function GoalCard({ goal, onClick }) {
  return (
    <div
      className="hologram-card p-4 cursor-pointer transition-all hover:border-sw-gold/50 hover:scale-[1.02]"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-sw-light font-medium">{goal.title}</h3>
          {goal.external_id && (
            <p className="text-sw-gray text-xs mt-1">{goal.external_id}</p>
          )}
        </div>
        <span className={`badge badge-${goal.status === 'completed' ? 'success' : goal.status === 'active' ? 'info' : 'warning'}`}>
          {goal.status}
        </span>
      </div>

      {goal.description && (
        <p className="text-sw-gray text-sm mb-3 line-clamp-2">{goal.description}</p>
      )}

      <div className="flex items-center gap-4 mb-3">
        <div className="flex-1">
          <div className="lightsaber-bar">
            <div
              className={`lightsaber-bar-fill ${goal.progress >= 80 ? 'lightsaber-green' : goal.progress >= 50 ? 'lightsaber-gold' : 'lightsaber-blue'}`}
              style={{ width: `${goal.progress}%` }}
            ></div>
          </div>
        </div>
        <span className="text-sw-gold font-orbitron text-sm">{goal.progress}%</span>
      </div>

      {/* Total hours logged - show for all goals */}
      <div className="flex items-center gap-2 mb-3 p-2 bg-sw-gold/10 rounded-lg border border-sw-gold/20">
        <svg className="w-4 h-4 text-sw-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sw-gold font-orbitron text-lg">{goal.total_hours || 0}h</span>
        <span className="text-sw-gray text-xs">logged</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {goal.owner_name && (
            <span className="text-sw-gray">Owner: {goal.owner_name}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sw-blue">{goal.task_count || 0} KRs</span>
          <span className="text-sw-green">{goal.completed_tasks || 0} done</span>
        </div>
      </div>

      {goal.assignees?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {goal.assignees.slice(0, 4).map(a => (
            <span key={a.id} className="px-2 py-0.5 bg-sw-darker text-sw-gray text-xs rounded">
              {a.name.split(' ')[0]}
            </span>
          ))}
          {goal.assignees.length > 4 && (
            <span className="px-2 py-0.5 bg-sw-darker text-sw-gray text-xs rounded">
              +{goal.assignees.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Click indicator */}
      <div className="mt-4 pt-3 border-t border-sw-gray/20 flex items-center justify-center text-sw-blue text-xs">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        View Key Results & Initiatives
      </div>
    </div>
  )
}
