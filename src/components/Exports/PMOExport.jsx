import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

// Helper: Get Monday of a given week
function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// Helper: Add weeks to date
function addWeeks(date, weeks) {
  const d = new Date(date)
  d.setDate(d.getDate() + (weeks * 7))
  return d.toISOString().split('T')[0]
}

export default function PMOExport() {
  const { getAuthHeader } = useAuth()
  const [startDate, setStartDate] = useState(getMonday(new Date()))
  const [endDate, setEndDate] = useState(addWeeks(getMonday(new Date()), 12))
  const [team, setTeam] = useState('')
  const [priority, setPriority] = useState('')
  const [source, setSource] = useState('checkins')
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fetchPreview = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        source
      })
      if (team) params.append('team', team)
      if (priority) params.append('priority', priority)

      const res = await fetch(`/api/exports/pmo/preview?${params}`, { headers: getAuthHeader() })
      const data = await res.json()
      setPreview(data)
    } catch (error) {
      console.error('Failed to fetch preview:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (format) => {
    setExporting(true)
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        format,
        source
      })
      if (team) params.append('team', team)
      if (priority) params.append('priority', priority)

      if (format === 'csv') {
        // Download CSV directly
        const res = await fetch(`/api/exports/pmo?${params}`, { headers: getAuthHeader() })
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `pmo-export-${startDate}-to-${endDate}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        a.remove()
      } else if (format === 'xlsx') {
        // Get XLSX data and generate file client-side
        const res = await fetch(`/api/exports/pmo?${params}`, { headers: getAuthHeader() })
        const data = await res.json()
        downloadAsExcel(data)
      } else {
        // JSON download
        const res = await fetch(`/api/exports/pmo?${params}`, { headers: getAuthHeader() })
        const data = await res.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `pmo-export-${startDate}-to-${endDate}.json`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        a.remove()
      }
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setExporting(false)
    }
  }

  const downloadAsExcel = (data) => {
    // Create a simple CSV from the data (no headers)
    const { rows } = data

    let csv = ''

    rows.forEach(row => {
      const values = [
        row.project_priority,
        row.project,
        row.team,
        row.project_role,
        row.team_member,
        ...Object.values(row.weekly)
      ]
      csv += values.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(',') + '\n'
    })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pmo-export-${startDate}-to-${endDate}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    a.remove()
  }

  // Quick range presets - auto fetch preview
  const setQuickRange = async (weeks) => {
    const start = getMonday(new Date())
    const end = addWeeks(start, weeks - 1)
    setStartDate(start)
    setEndDate(end)

    // Auto fetch preview with new dates
    setLoading(true)
    try {
      const params = new URLSearchParams({
        start_date: start,
        end_date: end,
        source
      })
      if (team) params.append('team', team)
      if (priority) params.append('priority', priority)

      const res = await fetch(`/api/exports/pmo/preview?${params}`, { headers: getAuthHeader() })
      const data = await res.json()
      setPreview(data)
    } catch (error) {
      console.error('Failed to fetch preview:', error)
    } finally {
      setLoading(false)
    }
  }

  // Clear preview
  const clearPreview = () => {
    setPreview(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-orbitron text-2xl text-sw-gold">Export</h1>
        <p className="text-sw-gray text-sm">Generate allocation reports in spreadsheet format</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="hologram-card p-6">
            <h2 className="font-orbitron text-sw-blue text-sm mb-4">EXPORT CONFIGURATION</h2>

            {/* Date Range */}
            <div className="space-y-4">
              <div>
                <label className="block text-sw-gray text-sm mb-1">Start Week</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(getMonday(e.target.value))}
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="block text-sw-gray text-sm mb-1">End Week</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(getMonday(e.target.value))}
                  className="input-field w-full"
                />
              </div>

              {/* Quick presets */}
              <div>
                <label className="block text-sw-gray text-sm mb-2">Quick Range</label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setQuickRange(4)} className="btn-secondary text-xs py-1 px-2">4 weeks</button>
                  <button onClick={() => setQuickRange(8)} className="btn-secondary text-xs py-1 px-2">8 weeks</button>
                  <button onClick={() => setQuickRange(13)} className="btn-secondary text-xs py-1 px-2">Quarter</button>
                </div>
              </div>

              {/* Filters */}
              <div>
                <label className="block text-sw-gray text-sm mb-1">Filter by Team</label>
                <input
                  type="text"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="All teams"
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="block text-sw-gray text-sm mb-1">Filter by Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">All priorities</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                  <option value="P4">P4</option>
                </select>
              </div>

              {/* Data Source */}
              <div>
                <label className="block text-sw-gray text-sm mb-2">Data Source</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="source"
                      value="checkins"
                      checked={source === 'checkins'}
                      onChange={(e) => setSource(e.target.value)}
                      className="accent-sw-gold"
                    />
                    <span className="text-sw-light text-sm">Work Done (Check-ins)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="source"
                      value="estimations"
                      checked={source === 'estimations'}
                      onChange={(e) => setSource(e.target.value)}
                      className="accent-sw-gold"
                    />
                    <span className="text-sw-light text-sm">Estimations (Planned)</span>
                  </label>
                </div>
              </div>

              <button
                onClick={fetchPreview}
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? 'Loading...' : 'Generate Preview'}
              </button>
            </div>
          </div>

        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-2">
          <div className="hologram-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-orbitron text-sw-blue text-sm">EXPORT PREVIEW</h2>
              {preview && preview.metadata && (
                <div className="flex gap-2">
                  <button
                    onClick={clearPreview}
                    className="btn-secondary text-sm"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    disabled={exporting}
                    className="btn-primary text-sm"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    disabled={exporting}
                    className="btn-secondary text-sm"
                  >
                    Export JSON
                  </button>
                </div>
              )}
            </div>

            {preview && preview.metadata ? (
              <div>
                {/* Metadata */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="p-3 bg-sw-darker/50 rounded">
                    <p className="text-sw-gray text-xs">Total Rows</p>
                    <p className="font-orbitron text-sw-gold text-xl">{preview.totalRows || 0}</p>
                  </div>
                  <div className="p-3 bg-sw-darker/50 rounded">
                    <p className="text-sw-gray text-xs">Weeks</p>
                    <p className="font-orbitron text-sw-blue text-xl">{preview.metadata?.weekCount || 0}</p>
                  </div>
                  <div className="p-3 bg-sw-darker/50 rounded">
                    <p className="text-sw-gray text-xs">Start</p>
                    <p className="text-sw-light text-sm">{preview.metadata?.startDate || '-'}</p>
                  </div>
                  <div className="p-3 bg-sw-darker/50 rounded">
                    <p className="text-sw-gray text-xs">End</p>
                    <p className="text-sw-light text-sm">{preview.metadata?.endDate || '-'}</p>
                  </div>
                </div>

                {/* Headers Preview */}
                {preview.headers && (
                  <div className="mb-4">
                    <h3 className="text-sw-gray text-xs mb-2">COLUMNS</h3>
                    <div className="flex flex-wrap gap-1">
                      {preview.headers.fixed?.map((h, i) => (
                        <span key={i} className="px-2 py-1 bg-sw-gold/20 text-sw-gold text-xs rounded">{h}</span>
                      ))}
                      <span className="px-2 py-1 bg-sw-blue/20 text-sw-blue text-xs rounded">
                        + {preview.headers.weeks?.length || 0} weekly columns
                      </span>
                    </div>
                  </div>
                )}

                {/* Data Preview */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sw-gray/30">
                        <th className="text-left py-2 px-2 text-sw-gray text-xs">Project Priority</th>
                        <th className="text-left py-2 px-2 text-sw-gray text-xs">Project</th>
                        <th className="text-left py-2 px-2 text-sw-gray text-xs">Team</th>
                        <th className="text-left py-2 px-2 text-sw-gray text-xs">Project Role / Topics</th>
                        <th className="text-left py-2 px-2 text-sw-gray text-xs">Team member</th>
                        {preview.headers?.weeks?.map((week, i) => (
                          <th key={i} className="text-center py-2 px-2 text-sw-blue text-xs">{week}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows?.map((row, i) => (
                        <tr key={i} className="border-b border-sw-gray/10">
                          <td className="py-2 px-2">
                            <span className={`font-bold ${
                              row.project_priority === 'P1' ? 'text-sw-red' :
                              row.project_priority === 'P2' ? 'text-sw-gold' :
                              row.project_priority === 'P3' ? 'text-sw-blue' : 'text-sw-green'
                            }`}>
                              {row.project_priority || '-'}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-sw-light">{row.project}</td>
                          <td className="py-2 px-2 text-sw-gray">{row.team || '-'}</td>
                          <td className="py-2 px-2 text-sw-gray">{row.project_role || '-'}</td>
                          <td className="py-2 px-2 text-sw-light">{row.team_member}</td>
                          {Object.values(row.weekly || {}).map((pct, j) => (
                            <td key={j} className="py-2 px-2 text-center text-sw-gold">{pct}%</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {(preview.totalRows || 0) > 5 && (
                    <p className="text-sw-gray text-xs mt-2 text-center">
                      Showing 5 of {preview.totalRows} rows
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-sw-gray font-orbitron">Configure export settings and click Generate Preview</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
