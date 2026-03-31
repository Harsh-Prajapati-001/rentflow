import { useState, useEffect } from 'react'
import { getRooms, createRoom, updateRoom, deleteRoom } from '../../lib/supabase'

const EMPTY = { room_number: '', floor: '', rent_amount: '', due_date_day: '5', last_meter_reading: '0', rate_per_unit: '8' }

export default function RoomManager({ buildingId }) {
  const [rooms, setRooms] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [buildingId])

  const load = async () => {
    const { data } = await getRooms(buildingId)
    setRooms(data || [])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    const payload = {
      building_id: buildingId,
      room_number: form.room_number,
      floor: form.floor,
      rent_amount: parseFloat(form.rent_amount),
      due_date_day: parseInt(form.due_date_day),
      last_meter_reading: parseFloat(form.last_meter_reading || 0),
      last_meter_reading_date: new Date().toISOString().split('T')[0],
      rate_per_unit: parseFloat(form.rate_per_unit || 8)
    }
    if (editingId) await updateRoom(editingId, payload)
    else await createRoom(payload)
    setForm(EMPTY); setEditingId(null); setShowForm(false); load()
    setLoading(false)
  }

  const handleEdit = (r) => {
    setEditingId(r.id)
    setForm({ room_number: r.room_number, floor: r.floor || '', rent_amount: r.rent_amount, due_date_day: r.due_date_day.toString(), last_meter_reading: r.last_meter_reading.toString(), rate_per_unit: r.rate_per_unit.toString() })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this room? All records will be deleted.')) return
    await deleteRoom(id); load()
  }

  return (
    <div className="manager-page">
      <div className="manager-header">
        <h3>Rooms ({rooms.length})</h3>
        <button className="btn-primary" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(EMPTY) }}>
          {showForm ? 'Cancel' : '+ Add Room'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-row">
            <div className="form-group">
              <label>Room Number *</label>
              <input placeholder="101, A1, Ground-1" value={form.room_number} onChange={e => setForm(f => ({ ...f, room_number: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Floor</label>
              <input placeholder="Ground, 1st, 2nd" value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Monthly Rent (₹) *</label>
              <input type="number" placeholder="8000" value={form.rent_amount} onChange={e => setForm(f => ({ ...f, rent_amount: e.target.value }))} required min="0" />
            </div>
            <div className="form-group">
              <label>Due Day of Next Month *</label>
              <input type="number" min="1" max="31" placeholder="5" value={form.due_date_day} onChange={e => setForm(f => ({ ...f, due_date_day: e.target.value }))} required />
              <span className="field-hint">e.g. 5 = rent due on 5th of following month</span>
            </div>
            <div className="form-group">
              <label>Initial Meter Reading (units) *</label>
              <input type="number" step="0.01" placeholder="0.00" value={form.last_meter_reading} onChange={e => setForm(f => ({ ...f, last_meter_reading: e.target.value }))} required />
              <span className="field-hint">Previous reading when room was set up</span>
            </div>
            <div className="form-group">
              <label>Electricity Rate (₹/unit) *</label>
              <input type="number" step="0.01" placeholder="8" value={form.rate_per_unit} onChange={e => setForm(f => ({ ...f, rate_per_unit: e.target.value }))} required />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {editingId ? 'Update Room' : 'Add Room'}
          </button>
        </form>
      )}

      <div className="rooms-grid">
        {rooms.length === 0 && <div className="empty-state">No rooms yet. Add your first room above.</div>}
        {rooms.map(room => {
          const tenant = room.tenants?.find(t => t.is_active)
          return (
            <div key={room.id} className={`room-card ${room.is_occupied ? 'occupied' : 'vacant'}`}>
              <div className="room-header">
                <span className="room-number">Room {room.room_number}</span>
                <span className={`room-status-pill ${room.is_occupied ? 'occupied' : 'vacant'}`}>
                  {room.is_occupied ? '🔴 Occupied' : '🟢 Vacant'}
                </span>
              </div>
              {room.floor && <div className="room-meta">Floor: {room.floor}</div>}
              <div className="room-rent">₹{parseFloat(room.rent_amount).toLocaleString('en-IN')}/mo</div>
              <div className="room-meta">Due: Day {room.due_date_day} of next month</div>
              <div className="room-meta">⚡ Meter: {room.last_meter_reading} units · ₹{room.rate_per_unit}/unit</div>
              {tenant && <div className="room-tenant-tag">👤 {tenant.full_name}</div>}
              <div className="room-actions">
                <button className="btn-icon" onClick={() => handleEdit(room)}>✏️ Edit</button>
                <button className="btn-icon btn-danger" onClick={() => handleDelete(room.id)}>🗑️</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
