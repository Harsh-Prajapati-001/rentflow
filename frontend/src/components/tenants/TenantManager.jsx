import { useState, useEffect } from 'react'
import { getTenants, getRooms, createTenant, updateTenant, updateRoom, getRoomRequests, approveRoomRequest, updateRoomRequest, subscribeToRoomRequests, unsubscribe } from '../../lib/supabase'

const EMPTY = { full_name: '', phone: '', email: '', whatsapp_number: '', room_id: '', id_proof_type: '', join_date: new Date().toISOString().split('T')[0] }

export default function TenantManager({ buildingId, ownerId, onTenantAdded }) {
  const [tenants, setTenants] = useState([])
  const [rooms, setRooms] = useState([])
  const [requests, setRequests] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [activeTab, setActiveTab] = useState('tenants') // tenants | requests

  useEffect(() => { load() }, [buildingId])

  useEffect(() => {
    if (!buildingId) return
    const channel = subscribeToRoomRequests(buildingId, () => load())
    return () => unsubscribe(channel)
  }, [buildingId])

  const load = async () => {
    const [tRes, rRes, reqRes] = await Promise.all([getTenants(buildingId), getRooms(buildingId), getRoomRequests(buildingId)])
    setTenants(tRes.data || [])
    setRooms(rRes.data || [])
    setRequests(reqRes.data || [])
  }

  const vacantRooms = rooms.filter(r => !r.is_occupied || (editingId && r.id === form.room_id))

  const validatePhone = (v) => {
    const digits = v.replace(/\D/g, '')
    if (digits.length !== 10) { setPhoneError('Phone must be exactly 10 digits'); return false }
    setPhoneError(''); return true
  }

  const handlePhoneChange = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 10)
    setForm(f => ({ ...f, phone: digits }))
    if (digits.length === 10) setPhoneError('')
    else setPhoneError(`${10 - digits.length} more digit(s) needed`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validatePhone(form.phone)) return
    setLoading(true)
    const payload = { ...form, building_id: buildingId, owner_id: ownerId, whatsapp_number: form.whatsapp_number || form.phone }
    if (editingId) {
      await updateTenant(editingId, payload)
    } else {
      const { data: tenant } = await createTenant(payload)
      if (tenant && form.room_id) await updateRoom(form.room_id, { is_occupied: true })
    }
    setForm(EMPTY); setEditingId(null); setShowForm(false); load(); onTenantAdded?.()
    setLoading(false)
  }

  const handleEdit = (t) => {
    setEditingId(t.id)
    setForm({ full_name: t.full_name, phone: t.phone, email: t.email || '', whatsapp_number: t.whatsapp_number || '', room_id: t.room_id || '', id_proof_type: t.id_proof_type || '', join_date: t.join_date || '' })
    setShowForm(true)
    setPhoneError('')
  }

  const handleDeactivate = async (id, roomId) => {
    if (!window.confirm('Mark tenant as moved out?')) return
    await updateTenant(id, { is_active: false })
    if (roomId) await updateRoom(roomId, { is_occupied: false })
    load()
  }

  const handleApproveRequest = async (req) => {
    // Approve request and auto-assign room
    await approveRoomRequest(req.id)
    // Create tenant record and assign room
    const { data: tenant } = await createTenant({
      owner_id: ownerId,
      building_id: buildingId,
      room_id: req.room_id,
      full_name: req.profiles?.full_name || 'Tenant',
      phone: req.profiles?.phone || '0000000000',
      email: req.profiles?.email || '',
      user_id: req.tenant_user_id,
      join_date: new Date().toISOString().split('T')[0]
    })
    if (tenant) await updateRoom(req.room_id, { is_occupied: true })
    load(); onTenantAdded?.()
  }

  const handleRejectRequest = async (id) => {
    await updateRoomRequest(id, 'rejected')
    load()
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')

  return (
    <div className="manager-page">
      <div className="manager-header">
        <div className="tab-pills">
          <button className={`tab-pill ${activeTab === 'tenants' ? 'active' : ''}`} onClick={() => setActiveTab('tenants')}>
            Tenants ({tenants.length})
          </button>
          <button className={`tab-pill ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
            Room Requests {pendingRequests.length > 0 && <span className="badge-count">{pendingRequests.length}</span>}
          </button>
        </div>
        {activeTab === 'tenants' && (
          <button className="btn-primary" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(EMPTY); setPhoneError('') }}>
            {showForm ? 'Cancel' : '+ Add Tenant'}
          </button>
        )}
      </div>

      {/* ── Tenant Form ── */}
      {activeTab === 'tenants' && showForm && (
        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-row">
            <div className="form-group">
              <label>Full Name *</label>
              <input placeholder="Tenant's full name" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Phone * (10 digits)</label>
              <input type="tel" placeholder="9876543210" value={form.phone} onChange={e => handlePhoneChange(e.target.value)} maxLength={10} required />
              {phoneError && <span className="field-error">{phoneError}</span>}
            </div>
            <div className="form-group">
              <label>WhatsApp (if different)</label>
              <input type="tel" placeholder="Same as phone if blank" value={form.whatsapp_number}
                onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))} maxLength={10} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" placeholder="tenant@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Assign Room</label>
              <select value={form.room_id} onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}>
                <option value="">-- Select Vacant Room --</option>
                {vacantRooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} — ₹{r.rent_amount}/mo</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>ID Proof Type</label>
              <select value={form.id_proof_type} onChange={e => setForm(f => ({ ...f, id_proof_type: e.target.value }))}>
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
              <input type="date" value={form.join_date} onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))} />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={loading || !!phoneError}>
            {editingId ? 'Update Tenant' : 'Add Tenant'}
          </button>
        </form>
      )}

      {/* ── Tenants Table ── */}
      {activeTab === 'tenants' && (
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Room</th><th>Rent/mo</th><th>Join Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {tenants.length === 0 && <tr><td colSpan={6} className="empty-row">No active tenants.</td></tr>}
            {tenants.map(t => (
              <tr key={t.id}>
                <td>{t.full_name}</td>
                <td>{t.phone}</td>
                <td>{t.rooms?.room_number || '—'}</td>
                <td>₹{parseFloat(t.rooms?.rent_amount || 0).toLocaleString('en-IN')}</td>
                <td>{t.join_date ? new Date(t.join_date).toLocaleDateString('en-IN') : '—'}</td>
                <td className="action-cell">
                  <button className="btn-icon" onClick={() => handleEdit(t)}>✏️</button>
                  <button className="btn-icon btn-danger" onClick={() => handleDeactivate(t.id, t.room_id)}>🚪 Move Out</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Room Requests ── */}
      {activeTab === 'requests' && (
        <div className="requests-list">
          {requests.length === 0 && <div className="empty-state">No room requests yet.</div>}
          {requests.map(req => (
            <div key={req.id} className={`request-card status-${req.status}`}>
              <div className="request-header">
                <div>
                  <div className="request-name">{req.profiles?.full_name || 'Tenant'}</div>
                  <div className="request-contact">{req.profiles?.phone} · {req.profiles?.email}</div>
                </div>
                <span className={`badge badge-${req.status}`}>{req.status}</span>
              </div>
              <div className="request-room">
                Room {req.rooms?.room_number} · Floor {req.rooms?.floor || '—'} · ₹{req.rooms?.rent_amount}/mo
              </div>
              {req.message && <div className="request-message">"{req.message}"</div>}
              <div className="request-date">{new Date(req.created_at).toLocaleDateString('en-IN')}</div>
              {req.status === 'pending' && (
                <div className="request-actions">
                  <button className="btn-sm btn-success" onClick={() => handleApproveRequest(req)}>✅ Approve & Assign</button>
                  <button className="btn-sm btn-danger-outline" onClick={() => handleRejectRequest(req.id)}>❌ Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
