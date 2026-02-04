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
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [savedConfigs, setSavedConfigs] = useState([])
  const [configName, setConfigName] = useState('')

  useEffect(() => {
    fetchSavedConfigs()
  }, [])

  const fetchSavedConfigs = async () => {
    try {
      const res = await fetch('/api/exports/config', { headers: getAuthHeader() })
      const data = await res.json()
      setSavedConfigs(data)
    } catch (error) {
      console.error('Failed to fetch configs:', error)
    }
  }

  const fetchPreview = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate
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
        format
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
    // Create a simple CSV from the data (for now, full XLSX requires a library)
    const { headers, rows } = data
    const allHeaders = [...headers.fixed, ...headers.weeks]

    let csv = allHeaders.map(h => `"${h}"`).join(',') + '\n'

    rows.forEach(row => {
      const values = [
        row.project_priority,
        row.project,
        row.team,
        row.project_role,
        row.team_member,
        row.allocation_1m,
        row.allocation_3m,
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

  const handleSaveConfig = async () => {
    if (!configName.trim()) return

    try {
      const res = await fetch('/api/exports/config', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: configName,
          start_week: startDate,
          end_week: endDate
        })
      })

      if (res.ok) {
        setConfigName('')
        fetchSavedConfigs()
      }
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  const handleLoadConfig = (config) => {
    setStartDate(config.start_week)
    setEndDate(config.end_week)
    fetchPreview()
  }

  const handleDeleteConfig = async (id) => {
    try {
      await fetch(`/api/exports/config/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      })
      fetchSavedConfigs()
    } catch (error) {
      console.error('Failed to delete config:', error)
    }
  }

  // Quick range presets
  const setQuickRange = (weeks) => {
    const start = getMonday(new Date())
    setStartDate(start)
    setEndDate(addWeeks(start, weeks - 1))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-orbitron text-2xl text-sw-gold">PMO Export</h1>
        <p className="text-sw-gray text-sm">Generate allocation reports in PMO spreadsheet format</p>
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

              <button
                onClick={fetchPreview}
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? 'Loading...' : 'Generate Preview'}
              </button>
            </div>
          </div>

          {/* Saved Configurations */}
          <div className="hologram-card p-6">
            <h2 className="font-orbitron text-sw-blue text-sm mb-4">SAVED CONFIGURATIONS</h2>

            <div className="space-y-3 mb-4">
              {savedConfigs.map(config => (
                <div key={config.id} className="flex items-center justify-between p-2 bg-sw-darker/50 rounded">
                  <div>
                    <p className="text-sw-light text-sm">{config.name}</p>
                    <p className="text-sw-gray text-xs">{config.start_week} to {config.end_week}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLoadConfig(config)}
                      className="text-sw-blue hover:text-sw-gold text-xs"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDeleteConfig(config.id)}
                      className="text-sw-red/70 hover:text-sw-red text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {savedConfigs.length === 0 && (
                <p className="text-sw-gray text-sm">No saved configurations</p>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="Config name..."
                className="input-field flex-1 text-sm"
              />
              <button
                onClick={handleSaveConfig}
                disabled={!configName.trim()}
                className="btn-secondary text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-2">
          <div className="hologram-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-orbitron text-sw-blue text-sm">EXPORT PREVIEW</h2>
              {preview && (
                <div className="flex gap-2">
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

            {preview ? (
              <div>
                {/* Metadata */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="p-3 bg-sw-darker/50 rounded">
                    <p className="text-sw-gray text-xs">Total Rows</p>
                    <p className="font-orbitron text-sw-gold text-xl">{preview.totalRows}</p>
                  </div>
                  <div className="p-3 bg-sw-darker/50 rounded">
                    <p className="text-sw-gray text-xs">Weeks</p>
                    <p className="font-orbitron text-sw-blue text-xl">{preview.metadata.weekCount}</p>
                  </div>
                  <div className="p-3 bg-sw-darker/50 rounded">
                    <p className="text-sw-gray text-xs">Start</p>
                    <p className="text-sw-light text-sm">{preview.metadata.startDate}</p>
                  </div>
                  <div className="p-3 bg-sw-darker/50 rounded">
                    <p className="text-sw-gray text-xs">End</p>
                    <p className="text-sw-light text-sm">{preview.metadata.endDate}</p>
                  </div>
                </div>

                {/* Headers Preview */}
                <div className="mb-4">
                  <h3 className="text-sw-gray text-xs mb-2">COLUMNS</h3>
                  <div className="flex flex-wrap gap-1">
                    {preview.headers.fixed.map((h, i) => (
                      <span key={i} className="px-2 py-1 bg-sw-gold/20 text-sw-gold text-xs rounded">{h}</span>
                    ))}
                    <span className="px-2 py-1 bg-sw-blue/20 text-sw-blue text-xs rounded">
                      + {preview.headers.weeks.length} weekly columns
                    </span>
                  </div>
                </div>

                {/* Data Preview */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sw-gray/30">
                        <th className="text-left py-2 px-2 text-sw-gray text-xs">Priority</th>
                        <th className="text-left py-2 px-2 text-sw-gray text-xs">Project</th>
                        <th className="text-left py-2 px-2 text-sw-gray text-xs">Role</th>
                        <th className="text-left py-2 px-2 text-sw-gray text-xs">Member</th>
                        <th className="text-right py-2 px-2 text-sw-gray text-xs">1M Avg</th>
                        <th className="text-right py-2 px-2 text-sw-gray text-xs">3M Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-sw-gray/10">
                          <td className="py-2 px-2">
                            <span className={`font-bold ${
                              row.project_priority === 'P1' ? 'text-sw-red' :
                              row.project_priority === 'P2' ? 'text-sw-gold' :
                              row.project_priority === 'P3' ? 'text-sw-blue' : 'text-sw-green'
                            }`}>
                              {row.project_priority}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-sw-light">{row.project}</td>
                          <td className="py-2 px-2 text-sw-gray">{row.project_role}</td>
                          <td className="py-2 px-2 text-sw-light">{row.team_member}</td>
                          <td className="py-2 px-2 text-right text-sw-blue">{row.allocation_1m}%</td>
                          <td className="py-2 px-2 text-right text-sw-purple">{row.allocation_3m}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {preview.totalRows > 5 && (
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
