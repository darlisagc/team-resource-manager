export default function AllocationGrid({ allocations, priorityColors, onAllocationChange }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-sw-gray/30">
            <th className="text-left py-3 px-4 text-sw-gray text-xs font-orbitron">Initiative</th>
            <th className="text-left py-3 px-2 text-sw-gray text-xs font-orbitron w-24">Role</th>
            <th className="text-center py-3 px-2 text-sw-gray text-xs font-orbitron w-32">This Week %</th>
            <th className="text-left py-3 px-2 text-sw-gray text-xs font-orbitron">Notes</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((alloc) => (
            <tr
              key={alloc.initiative_id}
              className="border-b border-sw-gray/10 hover:bg-sw-darker/30"
            >
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  {alloc.project_priority && (
                    <span className={`text-xs font-bold ${priorityColors[alloc.project_priority]}`}>
                      {alloc.project_priority}
                    </span>
                  )}
                  <span className="text-sw-light">{alloc.initiative_name}</span>
                </div>
              </td>
              <td className="py-3 px-2">
                <span className={`badge text-xs ${
                  alloc.role === 'Lead' ? 'badge-warning' :
                  alloc.role === 'Contributor' ? 'badge-info' : 'badge-success'
                }`}>
                  {alloc.role}
                </span>
              </td>
              <td className="py-3 px-2">
                <div className="flex items-center justify-center">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={alloc.allocation_percentage}
                    onChange={(e) => onAllocationChange(
                      alloc.initiative_id,
                      'allocation_percentage',
                      parseFloat(e.target.value) || 0
                    )}
                    className="input-field w-20 text-center"
                  />
                  <span className="text-sw-gray ml-1">%</span>
                </div>
              </td>
              <td className="py-3 px-2">
                <input
                  type="text"
                  value={alloc.notes || ''}
                  onChange={(e) => onAllocationChange(
                    alloc.initiative_id,
                    'notes',
                    e.target.value
                  )}
                  placeholder="Optional notes..."
                  className="input-field w-full text-sm"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Quick allocation buttons */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sw-gray text-sm">Quick set:</span>
        {[0, 10, 20, 25, 30, 40, 50].map(pct => (
          <button
            key={pct}
            onClick={() => {
              // This could be enhanced to apply to selected row
            }}
            className="px-2 py-1 text-xs bg-sw-darker hover:bg-sw-gold/20 text-sw-light rounded transition-colors"
          >
            {pct}%
          </button>
        ))}
      </div>
    </div>
  )
}
