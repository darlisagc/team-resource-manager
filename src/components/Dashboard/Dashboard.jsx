import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import {
  getUtilizationStatus,
  formatPercentage,
  getProgressHexColor,
  getProgressColorClass,
  getProgressBgClass,
  BASELINE_FTE_HOURS,
  WEEKS_PER_QUARTER,
  COLORS
} from '../../constants'

export default function Dashboard() {
  const { getAuthHeader } = useAuth()
  const [dashboardData, setDashboardData] = useState(null)
  const [capacityData, setCapacityData] = useState(null)
  const [quarters, setQuarters] = useState([])
  const [selectedQuarter, setSelectedQuarter] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ team: '', member: '' })
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchQuarters()
  }, [])

  useEffect(() => {
    if (selectedQuarter) {
      fetchAllData()
    }
  }, [selectedQuarter])

  const fetchQuarters = async () => {
    try {
      const res = await fetch('/api/dashboard/quarters', { headers: getAuthHeader() })
      const data = await res.json()
      setQuarters(data)
      if (data.length > 0) {
        setSelectedQuarter(data[0])
      }
    } catch (error) {
      console.error('Failed to fetch quarters:', error)
    }
  }

  const fetchAllData = async () => {
    setLoading(true)
    try {
      const [dashRes, capRes] = await Promise.all([
        fetch(`/api/dashboard?quarter=${encodeURIComponent(selectedQuarter)}`, {
          headers: getAuthHeader()
        }),
        fetch(`/api/allocations/summary?quarter=${encodeURIComponent(selectedQuarter)}`, {
          headers: getAuthHeader()
        })
      ])
      setDashboardData(await dashRes.json())
      setCapacityData(await capRes.json())
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !dashboardData || !capacityData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sw-gold font-orbitron animate-pulse">LOADING COMMAND DATA...</div>
      </div>
    )
  }

  // Calculate capacity totals
  const totalFTE = capacityData.reduce((sum, m) => sum + m.fte, 0)
  const totalAvailableHours = capacityData.reduce((sum, m) => sum + m.availableHours, 0)
  const totalAllocatedHours = capacityData.reduce((sum, m) => sum + m.allocatedHours, 0)

  // Prepare utilization chart data (using centralized color function)
  const utilizationChartData = dashboardData.memberUtilization
    .filter(m => !filter.team || m.team === filter.team)
    .filter(m => !filter.member || m.id === parseInt(filter.member))
    .map(m => ({
      name: m.name.split(' ')[0],
      timeOff: m.timeOffPercent || 0,
      work: m.utilization - (m.timeOffPercent || 0),
      total: m.utilization,
      fill: getProgressHexColor(m.utilization, { isUtilization: true })
    }))

  // Prepare capacity chart data
  const capacityChartData = capacityData
    .filter(m => !filter.team || m.team === filter.team)
    .map(m => ({
      name: m.name.split(' ')[0],
      available: m.availableHours,
      allocated: m.allocatedHours,
      timeOff: m.time_off_hours
    }))

  // Goals progress data grouped by quarter
  const goalsProgressByQuarter = (dashboardData.goalsList || []).reduce((acc, g) => {
    const q = g.quarter || 'Unknown'
    if (!acc[q]) acc[q] = []
    acc[q].push({
      id: g.id,
      name: g.title.length > 30 ? g.title.substring(0, 30) + '...' : g.title,
      value: g.progress || 0,
      fullName: g.title
    })
    return acc
  }, {})

  const teams = [...new Set(dashboardData.memberUtilization.map(m => m.team).filter(Boolean))]

  // Capacity gaps
  const overAllocated = capacityData.filter(m => m.utilization > 100)
  const underUtilized = capacityData.filter(m => m.utilization < 50)

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Command Center</h1>
          <p className="text-sw-gray text-sm">Fleet Resource Overview & Capacity Planning</p>
        </div>
        <div className="flex gap-3">
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            className="input-field w-40"
          >
            {quarters.map(q => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
          <select
            value={filter.team}
            onChange={(e) => setFilter(f => ({ ...f, team: e.target.value }))}
            className="input-field w-40"
          >
            <option value="">All Teams</option>
            {teams.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-sw-gold/30 pb-2">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'capacity', label: 'Capacity Details' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-orbitron text-sm transition-all ${
              activeTab === tab.id
                ? 'text-sw-gold border-b-2 border-sw-gold'
                : 'text-sw-gray hover:text-sw-light'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              title="Team Utilization"
              value={`${dashboardData.utilization.average.toFixed(1)}%`}
              subtitle={`${dashboardData.utilization.workPercent.toFixed(1)}% work + ${dashboardData.utilization.timeOffPercent.toFixed(1)}% time off`}
              secondarySubtitle={`${dashboardData.team.totalMembers} crew members • ${totalFTE.toFixed(1)} FTE`}
              status={getUtilizationStatus(dashboardData.utilization.average)}
            />
            <MetricCard
              title="Active Goals"
              value={dashboardData.goals.active}
              subtitle={`${dashboardData.goals.avgProgress}% avg progress`}
              icon="◈"
            />
            <MetricCard
              title="Goals Progress"
              value={`${dashboardData.goals.avgProgress}%`}
              subtitle={`${dashboardData.goals.active} active goals`}
              status={dashboardData.goals.avgProgress >= 75 ? { color: 'green' } : dashboardData.goals.avgProgress >= 50 ? { color: 'gold' } : { color: 'blue' }}
            />
            <MetricCard
              title="Conflicts"
              value={dashboardData.conflicts.unresolved}
              subtitle="Unresolved assignments"
              warning={dashboardData.conflicts.unresolved > 0}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Utilization Chart */}
            <div className="hologram-card p-6">
              <h3 className="font-orbitron text-sw-gold text-sm mb-4">CREW UTILIZATION</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={utilizationChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,232,31,0.1)" />
                  <XAxis type="number" domain={[0, 150]} stroke="#f0f0f0" />
                  <YAxis type="category" dataKey="name" stroke="#f0f0f0" width={80} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #FFE81F' }}
                    formatter={(value, name) => [`${value.toFixed(1)}%`, name === 'timeOff' ? 'Time Off' : 'Work']}
                  />
                  <Bar dataKey="timeOff" stackId="utilization" fill={COLORS.red} name="timeOff" />
                  <Bar dataKey="work" stackId="utilization" fill={COLORS.blue} name="work" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-4 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{background: COLORS.red}}></span> Time Off</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{background: COLORS.blue}}></span> Work Allocation</span>
              </div>
            </div>

            {/* Goals Progress Chart - All Quarters */}
            <div className="hologram-card p-6">
              <h3 className="font-orbitron text-sw-gold text-sm mb-4">GOALS PROGRESS (ALL QUARTERS)</h3>
              {Object.keys(goalsProgressByQuarter).length > 0 ? (
                <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                  {Object.entries(goalsProgressByQuarter).sort(([a], [b]) => a.localeCompare(b)).map(([quarter, goals]) => (
                    <div key={quarter}>
                      <div className="text-sw-blue text-xs font-orbitron mb-2 sticky top-0 bg-sw-dark py-1">{quarter}</div>
                      <div className="space-y-2 ml-2">
                        {goals.map((goal) => (
                          <div key={goal.id} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-sw-light truncate pr-2 text-xs" title={goal.fullName}>{goal.name}</span>
                              <span className={`font-orbitron text-xs ${getProgressColorClass(goal.value)}`}>
                                {goal.value}%
                              </span>
                            </div>
                            <div className="h-2 bg-sw-darker rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all rounded-full ${getProgressBgClass(goal.value)}`}
                                style={{ width: `${Math.max(goal.value, 2)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-sw-gray">
                  No goals data available
                </div>
              )}
            </div>
          </div>

          {/* Alerts Section */}
          {(dashboardData.utilization.overAllocatedCount > 0 || dashboardData.conflicts.unresolved > 0) && (
            <div className="hologram-card p-6 border-sw-red/50">
              <h3 className="font-orbitron text-sw-red text-sm mb-4">ALERTS</h3>
              <div className="space-y-2">
                {dashboardData.utilization.overAllocatedCount > 0 && (
                  <div className="flex items-center gap-2 text-sw-red">
                    <span className="status-dot status-danger"></span>
                    <span>{dashboardData.utilization.overAllocatedCount} crew member(s) over-allocated</span>
                  </div>
                )}
                {dashboardData.conflicts.unresolved > 0 && (
                  <div className="flex items-center gap-2 text-sw-gold">
                    <span className="status-dot status-warning"></span>
                    <span>{dashboardData.conflicts.unresolved} assignment conflict(s) need resolution</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'capacity' && (
        <>
          {/* Capacity Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`hologram-card p-4 ${(totalAvailableHours - totalAllocatedHours) < 0 ? 'border-sw-red/50' : ''}`}>
              <p className="text-sw-gray text-xs uppercase">Hours Available</p>
              <p className={`font-orbitron text-2xl ${(totalAvailableHours - totalAllocatedHours) < 0 ? 'text-sw-red' : 'text-sw-green'}`}>
                {(totalAvailableHours - totalAllocatedHours).toLocaleString()}h
              </p>
              <p className="text-sw-gray text-xs">from {totalAvailableHours.toLocaleString()}h capacity</p>
            </div>
            <div className="hologram-card p-4">
              <p className="text-sw-gray text-xs uppercase">Quarter Capacity</p>
              <p className="text-sw-blue font-orbitron text-2xl">{totalAvailableHours.toLocaleString()}h</p>
              <p className="text-sw-gray text-xs">{WEEKS_PER_QUARTER} weeks • {capacityData.length} members</p>
            </div>
            <div className="hologram-card p-4">
              <p className="text-sw-gray text-xs uppercase">Time Off</p>
              <p className="text-sw-purple font-orbitron text-2xl">{dashboardData.timeOff.totalHours}h</p>
              <p className="text-sw-gray text-xs">{dashboardData.timeOff.membersWithTimeOff} members</p>
            </div>
            <div className="hologram-card p-4">
              <p className="text-sw-gray text-xs uppercase">Hours Worked</p>
              <p className="text-sw-green font-orbitron text-2xl">{dashboardData.utilization.totalHoursWorked?.toLocaleString() || 0}h</p>
              <p className="text-sw-gray text-xs">from check-ins</p>
            </div>
          </div>

          {/* Capacity Gaps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Over-allocated */}
            <div className={`hologram-card p-6 ${overAllocated.length > 0 ? 'border-sw-red/50' : ''}`}>
              <h3 className="font-orbitron text-sw-red text-sm mb-4">
                OVER-ALLOCATED ({overAllocated.length})
              </h3>
              {overAllocated.length > 0 ? (
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {overAllocated.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-3 bg-sw-red/10 rounded-lg">
                      <div>
                        <p className="text-sw-light font-medium">{m.name}</p>
                        <p className="text-sw-gray text-xs">{m.role}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sw-red font-orbitron">{formatPercentage(m.utilization)}</p>
                        <p className="text-sw-gray text-xs">+{Math.round(m.allocatedHours - m.availableHours)}h</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sw-gray text-center py-4">No over-allocated crew members</p>
              )}
            </div>

            {/* Under-utilized */}
            <div className="hologram-card p-6">
              <h3 className="font-orbitron text-sw-blue text-sm mb-4">
                UNDER-UTILIZED ({underUtilized.length})
              </h3>
              {underUtilized.length > 0 ? (
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {underUtilized.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-3 bg-sw-blue/10 rounded-lg">
                      <div>
                        <p className="text-sw-light font-medium">{m.name}</p>
                        <p className="text-sw-gray text-xs">{m.role}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sw-blue font-orbitron">{formatPercentage(m.utilization)}</p>
                        <p className="text-sw-gray text-xs">{Math.round(m.availableHours - m.allocatedHours)}h free</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sw-gray text-center py-4">No under-utilized crew members</p>
              )}
            </div>
          </div>

          {/* Capacity Chart */}
          <div className="hologram-card p-6">
            <h3 className="font-orbitron text-sw-gold text-sm mb-4">CAPACITY VS ALLOCATION</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={capacityChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,232,31,0.1)" />
                <XAxis type="number" stroke="#f0f0f0" />
                <YAxis type="category" dataKey="name" stroke="#f0f0f0" width={80} />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #FFE81F' }}
                />
                <Legend />
                <Bar dataKey="available" name="Available" fill="#4BD5EE" radius={[0, 4, 4, 0]} />
                <Bar dataKey="allocated" name="Allocated" fill="#FFE81F" radius={[0, 4, 4, 0]} />
                <Bar dataKey="timeOff" name="Time Off" fill="#9D4EDD" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed Table */}
          <div className="hologram-card p-6">
            <h3 className="font-orbitron text-sw-gold text-sm mb-4">CREW CAPACITY BREAKDOWN - {selectedQuarter}</h3>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Crew Member</th>
                    <th>Role</th>
                    <th>Team</th>
                    <th>FTE</th>
                    <th>Weekly Hours</th>
                    <th>Quarter Capacity</th>
                    <th>Time Off</th>
                    <th>Utilization</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.memberUtilization
                    .filter(m => !filter.team || m.team === filter.team)
                    .map(member => {
                      const status = getUtilizationStatus(member.utilization)
                      return (
                        <tr key={member.id}>
                          <td className="font-medium">{member.name}</td>
                          <td className="text-sw-gray">{member.role}</td>
                          <td>{member.team}</td>
                          <td className="text-sw-gold font-orbitron">{member.fte}</td>
                          <td>{member.weeklyHours}h</td>
                          <td className="text-sw-blue">{member.totalCapacityHours}h</td>
                          <td className={member.timeOffHours > 0 ? 'text-sw-purple' : 'text-sw-gray'}>
                            {member.timeOffHours > 0 ? `${member.timeOffHours}h` : '-'}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="lightsaber-bar w-20">
                                <div
                                  className={`lightsaber-bar-fill ${
                                    member.utilization > 100 ? 'lightsaber-red' :
                                    member.utilization >= 80 ? 'lightsaber-green' :
                                    member.utilization >= 50 ? 'lightsaber-gold' : 'lightsaber-blue'
                                  }`}
                                  style={{ width: `${Math.min(member.utilization, 100)}%` }}
                                ></div>
                              </div>
                              <span className={`text-sm ${
                                member.utilization > 100 ? 'text-sw-red' :
                                member.utilization >= 80 ? 'text-sw-green' : 'text-sw-gold'
                              }`}>
                                {member.utilization.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge badge-${status.color === 'red' ? 'danger' : status.color === 'green' ? 'success' : status.color === 'gold' ? 'warning' : 'info'}`}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* FTE Reference */}
          <div className="hologram-card p-6">
            <h3 className="font-orbitron text-sw-gold text-sm mb-4">FTE REFERENCE</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-sw-darker/50 rounded-lg text-center">
                <p className="text-sw-gold font-orbitron text-xl">1.0 FTE</p>
                <p className="text-sw-gray text-sm">{BASELINE_FTE_HOURS}h/week</p>
                <p className="text-sw-gray text-xs">{BASELINE_FTE_HOURS * WEEKS_PER_QUARTER}h/quarter</p>
              </div>
              <div className="p-3 bg-sw-darker/50 rounded-lg text-center">
                <p className="text-sw-gold font-orbitron text-xl">0.75 FTE</p>
                <p className="text-sw-gray text-sm">30h/week</p>
                <p className="text-sw-gray text-xs">{30 * WEEKS_PER_QUARTER}h/quarter</p>
              </div>
              <div className="p-3 bg-sw-darker/50 rounded-lg text-center">
                <p className="text-sw-gold font-orbitron text-xl">0.5 FTE</p>
                <p className="text-sw-gray text-sm">20h/week</p>
                <p className="text-sw-gray text-xs">{20 * WEEKS_PER_QUARTER}h/quarter</p>
              </div>
              <div className="p-3 bg-sw-darker/50 rounded-lg text-center">
                <p className="text-sw-gold font-orbitron text-xl">{WEEKS_PER_QUARTER}</p>
                <p className="text-sw-gray text-sm">weeks/quarter</p>
                <p className="text-sw-gray text-xs">standard calculation</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ title, value, subtitle, secondarySubtitle, status, icon, warning }) {
  return (
    <div className={`hologram-card p-4 ${warning ? 'border-sw-red/50' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sw-gray text-xs uppercase tracking-wider">{title}</p>
          <p className={`font-orbitron text-3xl mt-1 ${warning ? 'text-sw-red' : status ? `text-sw-${status.color}` : 'text-sw-light'}`}>
            {value}
          </p>
          <p className="text-sw-gray text-xs mt-1">{subtitle}</p>
          {secondarySubtitle && <p className="text-sw-gray text-xs">{secondarySubtitle}</p>}
        </div>
        {icon && <span className="text-sw-gold text-2xl">{icon}</span>}
        {status && (
          <span className={`status-dot status-${status.status === 'over-allocated' ? 'danger' : status.status === 'optimal' ? 'active' : 'warning'}`}></span>
        )}
      </div>
    </div>
  )
}
