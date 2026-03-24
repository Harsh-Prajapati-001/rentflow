// frontend/src/components/tenants/TenantManager.jsx
import { useState, useEffect } from 'react'
import { getTenants, getRooms, createTenant, updateTenant } from '../../lib/supabase'

const DEFAULT_FORM = {
  full_name: '', phone: '', email: '', whatsapp_number: '',
  room_id: '', id_proof_type: '', join_date: new Date().toISOString().split('T')[0]
}

export default function TenantManager({ buildingId, ownerId }) {
  const [tenants, setTenants] = useState([])
  const [rooms, setRooms] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadTenants()
    loadRooms()
  }, [buildingId])

  const loadTenants = async () => {
    const { data } = await getTenants(buildingId)
    setTenants(data || [])
  }

  const loadRooms = async () => {
    const { data } = await getRooms(buildingId)
    setRooms(data || [])
  }

  const vacantRooms = rooms.filter((r) => !r.is_occupied)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    const payload = {
      ...form,
      building_id: buildingId,
      owner_id: ownerId,
      whatsapp_number: form.whatsapp_number || form.phone,
    }

    if (editingId) {
      await updateTenant(editingId, payload)
    } else {
      const { data: tenant } = await createTenant(payload)
      // Mark room as occupied
      if (tenant && form.room_id) {
        const { updateRoom } = await import('../../lib/supabase')
        await updateRoom(form.room_id, { is_occupied: true })
      }
    }

    setForm(DEFAULT_FORM)
    setEditingId(null)
    setShowForm(false)
    loadTenants()
    loadRooms()
    setLoading(false)
  }

  const handleEdit = (t) => {
    setEditingId(t.id)
    setForm({
      full_name: t.full_name, phone: t.phone, email: t.email || '',
      whatsapp_number: t.whatsapp_number || '', room_id: t.room_id || '',
      id_proof_type: t.id_proof_type || '', join_date: t.join_date || '',
    })
    setShowForm(true)
  }

  const handleDeactivate = async (id) => {
    if (!window.confirm('Mark tenant as inactive (moved out)?')) return
    await updateTenant(id, { is_active: false })
    loadTenants()
  }

  return (
    <div className="manager-page">
      <div className="manager-header">
        <h3>Tenants ({tenants.length})</h3>
        <button className="btn-primary" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(DEFAULT_FORM) }}>
          {showForm ? 'Cancel' : '+ Add Tenant'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-row">
            <div className="form-group">
              <label>Full Name *</label>
              <input placeholder="Tenant's full name" value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Phone *</label>
              <input placeholder="+91 98765 43210" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>WhatsApp Number</label>
              <input placeholder="Same as phone if blank" value={form.whatsapp_number}
                onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" placeholder="tenant@email.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Assign Room</label>
              <select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
                <option value="">-- Select Room --</option>
                {vacantRooms.map((r) => (
                  <option key={r.id} value={r.id}>Room {r.room_number} — ₹{r.rent_amount}/mo</option>
                ))}
                {editingId && rooms.filter((r) => r.id === form.room_id).map((r) => (
                  <option key={r.id} value={r.id}>Room {r.room_number} (current)</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>ID Proof Type</label>
              <select value={form.id_proof_type} onChange={(e) => setForm({ ...form, id_proof_type: e.target.value })}>
                <option value="">-- Select --</option>
                <option value="aadhar">Aadhar Card</option>
                <option value="pan">PAN Card</option>
                <option value="passport">Passport</option>
                <option value="driving_license">Driving License</option>
                <option value="voter_id">Voter ID</option>
              </select>
            </div>
            <div className="form-group">
              <label>Join Date</label>
              <input type="date" value={form.join_date}
                onChange={(e) => setForm({ ...form, join_date: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {editingId ? 'Update Tenant' : 'Add Tenant'}
          </button>
        </form>
      )}

      <div className="tenants-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Room</th>
              <th>Rent/mo</th>
              <th>Join Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 && (
              <tr><td colSpan={6} className="empty-row">No tenants yet.</td></tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id}>
                <td>{t.full_name}</td>
                <td>{t.phone}</td>
                <td>{t.rooms?.room_number || '—'}</td>
                <td>₹{parseFloat(t.rooms?.rent_amount || 0).toLocaleString()}</td>
                <td>{t.join_date ? new Date(t.join_date).toLocaleDateString('en-IN') : '—'}</td>
                <td>
                  <button className="btn-icon" onClick={() => handleEdit(t)}>✏️</button>
                  <button className="btn-icon btn-danger" onClick={() => handleDeactivate(t.id)}>🚪 Move Out</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
