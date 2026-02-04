import { useState, useEffect } from 'react'

export default function InitiativeForm({ initiative, keyResults, onSave, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_priority: '',
    team: '',
    status: 'active',
    key_result_id: '',
    start_date: '',
    end_date: ''
  })

  useEffect(() => {
    if (initiative) {
      setFormData({
        name: initiative.name || '',
        description: initiative.description || '',
        project_priority: initiative.project_priority || '',
        team: initiative.team || '',
        status: initiative.status || 'active',
        key_result_id: initiative.key_result_id || '',
        start_date: initiative.start_date || '',
        end_date: initiative.end_date || ''
      })
    }
  }, [initiative])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...formData,
      key_result_id: formData.key_result_id ? parseInt(formData.key_result_id) : null
    })
  }

  // Group key results by goal for better organization
  const groupedKeyResults = (keyResults || []).reduce((acc, kr) => {
    const goalTitle = kr.goal_title || 'Unassigned'
    if (!acc[goalTitle]) {
      acc[goalTitle] = []
    }
    acc[goalTitle].push(kr)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="hologram-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="font-orbitron text-sw-gold text-lg mb-6">
          {initiative ? 'Edit Operation' : 'Create New Operation'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sw-gray text-sm mb-1">Operation Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="input-field w-full"
              placeholder="e.g., CIP113 Token Standard"
            />
          </div>

          <div>
            <label className="block text-sw-gray text-sm mb-1">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="input-field w-full"
              rows="3"
              placeholder="Brief description of the operation..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sw-gray text-sm mb-1">Priority</label>
              <select
                name="project_priority"
                value={formData.project_priority}
                onChange={handleChange}
                className="input-field w-full"
              >
                <option value="">Select priority...</option>
                <option value="P1">P1 - Critical</option>
                <option value="P2">P2 - High</option>
                <option value="P3">P3 - Medium</option>
                <option value="P4">P4 - Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sw-gray text-sm mb-1">Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input-field w-full"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="on-hold">On Hold</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sw-gray text-sm mb-1">Team</label>
            <input
              type="text"
              name="team"
              value={formData.team}
              onChange={handleChange}
              className="input-field w-full"
              placeholder="e.g., Ecosystem Engineering"
            />
          </div>

          <div>
            <label className="block text-sw-gray text-sm mb-1">Key Result (from Leapsome)</label>
            <select
              name="key_result_id"
              value={formData.key_result_id}
              onChange={handleChange}
              className="input-field w-full"
            >
              <option value="">No linked Key Result</option>
              {Object.entries(groupedKeyResults).map(([goalTitle, krs]) => (
                <optgroup key={goalTitle} label={goalTitle}>
                  {krs.map(kr => (
                    <option key={kr.id} value={kr.id}>
                      {kr.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sw-gray text-sm mb-1">Start Date</label>
              <input
                type="date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                className="input-field w-full"
              />
            </div>

            <div>
              <label className="block text-sw-gray text-sm mb-1">End Date</label>
              <input
                type="date"
                name="end_date"
                value={formData.end_date}
                onChange={handleChange}
                className="input-field w-full"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn-primary flex-1">
              {initiative ? 'Update Operation' : 'Create Operation'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
