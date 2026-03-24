// frontend/src/components/buildings/BuildingManager.jsx
import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useBuilding } from '../../hooks/useBuilding'
import { createBuilding, updateBuilding, deleteBuilding } from '../../lib/supabase'

export default function BuildingManager({ onClose }) {
  const { user } = useAuth()
  const { buildings, refreshBuildings } = useBuilding()
  const [form, setForm] = useState({ name: '', address: '' })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (editingId) {
        const { error } = await updateBuilding(editingId, { name: form.name, address: form.address })
        if (error) throw error
      } else {
        const { error } = await createBuilding({ ownerId: user.id, name: form.name, address: form.address })
        if (error) throw error
      }
      setForm({ name: '', address: '' })
      setEditingId(null)
      refreshBuildings()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (b) => {
    setEditingId(b.id)
    setForm({ name: b.name, address: b.address || '' })
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this building? All rooms and tenant records will be deleted.')) return
    const { error } = await deleteBuilding(id)
    if (!error) refreshBuildings()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🏢 Manage Buildings</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleSubmit} className="inline-form">
            <input
              placeholder="Building Name (e.g. Building A, PG-1)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              placeholder="Address (optional)"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {editingId ? 'Update' : '+ Add Building'}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setForm({ name: '', address: '' }) }}>
                Cancel
              </button>
            )}
          </form>

          {error && <div className="error-msg">{error}</div>}

          <div className="buildings-list">
            {buildings.map((b) => (
              <div key={b.id} className="building-item">
                <div>
                  <div className="building-name">{b.name}</div>
                  {b.address && <div className="building-address">{b.address}</div>}
                </div>
                <div className="item-actions">
                  <button className="btn-icon" onClick={() => handleEdit(b)}>✏️</button>
                  <button className="btn-icon btn-danger" onClick={() => handleDelete(b.id)}>🗑️</button>
                </div>
              </div>
            ))}
            {buildings.length === 0 && <p className="empty-msg">No buildings yet. Add your first one above.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
