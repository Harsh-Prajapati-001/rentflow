// frontend/src/components/electricity/ElectricityManager.jsx
import { useState, useEffect } from 'react'
import { getElectricityRecords, createElectricityRecord, getRooms, getTenants } from '../../lib/supabase'

const DEFAULT_FORM = {
  room_id: '', tenant_id: '', month: new Date().getMonth() + 1,
  year: new Date().getFullYear(), previous_reading: '', current_reading: '', rate_per_unit: '8',
  reading_date: new Date().toISOString().split('T')[0],
}

export default function ElectricityManager({ buildingId }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [records, setRecords] = useState([])
  const [rooms, setRooms] = useState([])
  const [tenants, setTenants] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadData() }, [buildingId, month, year])

  const loadData = async () => {
    const [recRes, roomRes, tenRes] = await Promise.all([
      getElectricityRecords(buildingId, month, year),
      getRooms(buildingId),
      getTenants(buildingId),
    ])
    setRecords(recRes.data || [])
    setRooms(roomRes.data || [])
    setTenants(tenRes.data || [])
  }

  const handleRoomChange = (roomId) => {
    const tenant = tenants.find((t) => t.room_id === roomId && t.is_active)
    setForm({ ...form, room_id: roomId, tenant_id: tenant?.id || '' })
  }

  const units = form.current_reading && form.previous_reading
    ? Math.max(0, parseFloat(form.current_reading) - parseFloat(form.previous_reading))
    : 0

  const totalAmount = units * (parseFloat(form.rate_per_unit) || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    await createElectricityRecord({
      ...form,
      building_id: buildingId,
      previous_reading: parseFloat(form.previous_reading),
      current_reading: parseFloat(form.current_reading),
      rate_per_unit: parseFloat(form.rate_per_unit),
      month: parseInt(form.month),
      year: parseInt(form.year),
    })
    setForm(DEFAULT_FORM)
    setShowForm(false)
    loadData()
    setLoading(false)
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleString('en-IN', { month: 'long' }),
  }))

  return (
    <div className="manager-page">
      <div className="manager-header">
        <h3>Electricity Bills</h3>
        <div className="filter-group">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add Reading'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-row">
            <div className="form-group">
              <label>Room *</label>
              <select value={form.room_id} onChange={(e) => handleRoomChange(e.target.value)} required>
                <option value="">-- Select Room --</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>Room {r.room_number}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Month</label>
              <select value={form.month} onChange={(e) => setForm({ ...form, month: parseInt(e.target.value) })}>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Year</label>
              <select value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}>
                {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Previous Reading</label>
              <input type="number" step="0.01" placeholder="0.00" value={form.previous_reading}
                onChange={(e) => setForm({ ...form, previous_reading: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Current Reading</label>
              <input type="number" step="0.01" placeholder="0.00" value={form.current_reading}
                onChange={(e) => setForm({ ...form, current_reading: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Rate per Unit (₹)</label>
              <input type="number" step="0.01" value={form.rate_per_unit}
                onChange={(e) => setForm({ ...form, rate_per_unit: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Reading Date</label>
              <input type="date" value={form.reading_date}
                onChange={(e) => setForm({ ...form, reading_date: e.target.value })} />
            </div>
          </div>

          {units > 0 && (
            <div className="calc-preview">
              <span>Units: <strong>{units.toFixed(2)}</strong></span>
              <span>×</span>
              <span>₹{form.rate_per_unit}/unit</span>
              <span>=</span>
              <span className="total-amount">₹{totalAmount.toFixed(2)}</span>
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>Add Reading</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Tenant</th>
            <th>Prev</th>
            <th>Current</th>
            <th>Units</th>
            <th>Rate</th>
            <th>Total</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr><td colSpan={8} className="empty-row">No readings for this period.</td></tr>
          )}
          {records.map((r) => (
            <tr key={r.id}>
              <td>Room {r.rooms?.room_number}</td>
              <td>{r.tenants?.full_name || '—'}</td>
              <td>{r.previous_reading}</td>
              <td>{r.current_reading}</td>
              <td><strong>{r.units_consumed}</strong></td>
              <td>₹{r.rate_per_unit}</td>
              <td><strong>₹{parseFloat(r.total_amount).toLocaleString()}</strong></td>
              <td>{new Date(r.reading_date).toLocaleDateString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
