// frontend/src/components/rooms/RoomManager.jsx
import { useState, useEffect } from 'react'
import { getRooms, createRoom, updateRoom, deleteRoom } from '../../lib/supabase'

const DEFAULT_FORM = { room_number: '', floor: '', rent_amount: '', due_date: '1' }

export default function RoomManager({ buildingId }) {
  const [rooms, setRooms] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadRooms() }, [buildingId])

  const loadRooms = async () => {
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
      due_date: parseInt(form.due_date),
    }

    if (editingId) {
      await updateRoom(editingId, payload)
    } else {
      await createRoom(payload)
    }
    setForm(DEFAULT_FORM)
    setEditingId(null)
    setShowForm(false)
    loadRooms()
    setLoading(false)
  }

  const handleEdit = (room) => {
    setEditingId(room.id)
    setForm({
      room_number: room.room_number,
      floor: room.floor || '',
      rent_amount: room.rent_amount,
      due_date: room.due_date.toString(),
    })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this room?')) return
    await deleteRoom(id)
    loadRooms()
  }

  return (
    <div className="manager-page">
      <div className="manager-header">
        <h3>Rooms ({rooms.length})</h3>
        <button className="btn-primary" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(DEFAULT_FORM) }}>
          {showForm ? 'Cancel' : '+ Add Room'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-row">
            <div className="form-group">
              <label>Room Number *</label>
              <input placeholder="101, A1, Ground-1" value={form.room_number}
                onChange={(e) => setForm({ ...form, room_number: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Floor</label>
              <input placeholder="Ground, 1st, 2nd" value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Monthly Rent (₹) *</label>
              <input type="number" placeholder="8000" value={form.rent_amount}
                onChange={(e) => setForm({ ...form, rent_amount: e.target.value })} required min="0" />
            </div>
            <div className="form-group">
              <label>Due Day of Month *</label>
              <input type="number" min="1" max="31" placeholder="1-31" value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {editingId ? 'Update Room' : 'Add Room'}
          </button>
        </form>
      )}

      <div className="rooms-grid">
        {rooms.length === 0 && <div className="empty-state">No rooms yet. Add your first room.</div>}
        {rooms.map((room) => {
          const tenant = room.tenants?.find((t) => t.is_active)
          return (
            <div key={room.id} className={`room-card ${room.is_occupied ? 'occupied' : 'vacant'}`}>
              <div className="room-header">
                <span className="room-number">Room {room.room_number}</span>
                <span className={`room-status ${room.is_occupied ? 'status-occupied' : 'status-vacant'}`}>
                  {room.is_occupied ? '🔴 Occupied' : '🟢 Vacant'}
                </span>
              </div>
              {room.floor && <div className="room-floor">Floor: {room.floor}</div>}
              <div className="room-rent">₹{parseFloat(room.rent_amount).toLocaleString()}/mo</div>
              <div className="room-due">Due: Day {room.due_date}</div>
              {tenant && <div className="room-tenant">👤 {tenant.full_name}</div>}
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
