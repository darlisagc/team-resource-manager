import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { BASELINE_FTE_HOURS, WEEKS_PER_QUARTER, calculateFTE, formatPercentage } from '../../utils/calculations'

export default function CapacityPlanning() {
  const { getAuthHeader } = useAuth()
  const [data, setData] = useState(null)
  const [quarters, setQuarters] = useState([])
  const [selectedQuarter, setSelectedQuarter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchQuarters()
  }, [])

  useEffect(() => {
    if (selectedQuarter) {
      fetchCapacityData()
    }
  }, [selectedQuarter])

  const fetchQuarters = async () => {
    try {
      const res = await fetch('/api/dashboard/quarters', { headers: getAuthHeader() })
      const data = await res.json()
      setQuarters(data)
      if (data.length > 0) setSelectedQuarter(data[0])
    } catch (error) {
      console.error('Failed to fetch quarters:', error)
    }
  }

  const fetchCapacityData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/allocations/summary?quarter=${encodeURIComponent(selectedQuarter)}`, {
        headers: getAuthHeader()
      })
      const summaryData = await res.json()

      // Also fetch dashboard data for additional metrics
      const dashRes = await fetch(`/api/dashboard?quarter=${encodeURIComponent(selectedQuarter)}`, {
        headers: getAuthHeader()
      })
      const dashData = await dashRes.json()

      setData({ summary: summaryData, dashboard: dashData })
    } catch (error) {
      console.error('Failed to fetch capacity data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sw-gold font-orbitron animate-pulse">CALCULATING FLEET CAPACITY...</div>
      </div>
    )
  }

  const { summary, dashboard } = data

  // Calculate totals
  const totalFTE = summary.reduce((sum, m) => sum + m.fte, 0)
  const totalAvailableHours = summary.reduce((sum, m) => sum + m.availableHours, 0)
  const totalAllocatedHours = summary.reduce((sum, m) => sum + m.allocatedHours, 0)
  const overallUtilization = totalAvailableHours > 0 ? (totalAllocatedHours / totalAvailableHours) * 100 : 0

  // Prepare chart data
  const chartData = summary.map(m => ({
    name: m.name.split(' ')[0],
    available: m.availableHours,
    allocated: m.allocatedHours,
    timeOff: m.time_off_hours
  }))

  // Capacity gaps
  const overAllocated = summary.filter(m => m.utilization > 100)
  const underUtilized = summary.filter(m => m.utilization < 50)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-2xl text-sw-gold">Fleet Capacity</h1>
          <p className="text-sw-gray text-sm">Resource planning and allocation</p>
        </div>
        <select
          value={selectedQuarter}
          onChange={(e) => setSelectedQuarter(e.target.value)}
          className="input-field w-40"
        >
          {quarters.map(q => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase">Total FTE</p>
          <p className="text-sw-gold font-orbitron text-2xl">{totalFTE.toFixed(2)}</p>
          <p className="text-sw-gray text-xs">{summary.length} crew members</p>
        </div>
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase">Available Hours</p>
          <p className="text-sw-blue font-orbitron text-2xl">{totalAvailableHours.toLocaleString()}</p>
          <p className="text-sw-gray text-xs">{WEEKS_PER_QUARTER} weeks</p>
        </div>
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase">Allocated Hours</p>
          <p className="text-sw-green font-orbitron text-2xl">{totalAllocatedHours.toLocaleString()}</p>
          <p className="text-sw-gray text-xs">across all tasks</p>
        </div>
        <div className="hologram-card p-4">
          <p className="text-sw-gray text-xs uppercase">Time Off</p>
          <p className="text-sw-purple font-orbitron text-2xl">{dashboard.timeOff.totalHours}</p>
          <p className="text-sw-gray text-xs">{dashboard.timeOff.membersWithTimeOff} members</p>
        </div>
        <div className={`hologram-card p-4 ${overallUtilization > 100 ? 'border-sw-red/50' : ''}`}>
          <p className="text-sw-gray text-xs uppercase">Utilization</p>
          <p className={`font-orbitron text-2xl ${
            overallUtilization > 100 ? 'text-sw-red' :
            overallUtilization >= 80 ? 'text-sw-green' : 'text-sw-gold'
          }`}>
            {formatPercentage(overallUtilization)}
          </p>
          <p className="text-sw-gray text-xs">overall average</p>
        </div>
      </div>

      {/* Capacity Chart */}
      <div className="hologram-card p-6">
        <h3 className="font-orbitron text-sw-gold text-sm mb-4">CAPACITY VS ALLOCATION</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} layout="vertical">
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

      {/* Capacity Gaps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Over-allocated */}
        <div className={`hologram-card p-6 ${overAllocated.length > 0 ? 'border-sw-red/50' : ''}`}>
          <h3 className="font-orbitron text-sw-red text-sm mb-4">
            OVER-ALLOCATED ({overAllocated.length})
          </h3>
          {overAllocated.length > 0 ? (
            <div className="space-y-3">
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
            <div className="space-y-3">
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

      {/* Detailed Table */}
      <div className="hologram-card p-6">
        <h3 className="font-orbitron text-sw-gold text-sm mb-4">DETAILED CAPACITY BREAKDOWN</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Crew Member</th>
                <th>Role</th>
                <th>Team</th>
                <th>FTE</th>
                <th>Weekly Hours</th>
                <th>Available (Q)</th>
                <th>Allocated (Q)</th>
                <th>Time Off</th>
                <th>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(m => (
                <tr key={m.id}>
                  <td className="font-medium">{m.name}</td>
                  <td className="text-sw-gray">{m.role}</td>
                  <td>{m.team}</td>
                  <td className="text-sw-gold font-orbitron">{m.fte}</td>
                  <td>{m.weekly_hours}h</td>
                  <td className="text-sw-blue">{Math.round(m.availableHours)}h</td>
                  <td className="text-sw-gold">{Math.round(m.allocatedHours)}h</td>
                  <td className="text-sw-purple">{m.time_off_hours}h</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="lightsaber-bar w-20">
                        <div
                          className={`lightsaber-bar-fill ${
                            m.utilization > 100 ? 'lightsaber-red' :
                            m.utilization >= 80 ? 'lightsaber-green' :
                            m.utilization >= 50 ? 'lightsaber-gold' : 'lightsaber-blue'
                          }`}
                          style={{ width: `${Math.min(m.utilization, 100)}%` }}
                        ></div>
                      </div>
                      <span className={`text-sm ${
                        m.utilization > 100 ? 'text-sw-red' :
                        m.utilization >= 80 ? 'text-sw-green' : 'text-sw-gold'
                      }`}>
                        {formatPercentage(m.utilization)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FTE Calculator */}
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
    </div>
  )
}
