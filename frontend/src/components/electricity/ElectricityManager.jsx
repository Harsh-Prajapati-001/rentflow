import { useState, useEffect } from 'react'
import { getElectricityRecords, createElectricityRecord, markElectricityPaid, getRooms, getTenants, getAllElectricityRecords } from '../../lib/supabase'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function ElectricityManager({ buildingId }) {
  const today = new Date()
  const defaultMonth = today.getMonth() === 0 ? 12 : today.getMonth()
  const defaultYear  = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()

  const [month, setMonth] = useState(defaultMonth)
  const [year, setYear] = useState(defaultYear)
  const [records, setRecords] = useState([])
  const [rooms, setRooms] = useState([])
  const [tenants, setTenants] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ room_id: '', current_reading: '', reading_date: today.toISOString().split('T')[0] })
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [currentError, setCurrentError] = useState('')
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState('month') // month | all

  useEffect(() => { loadData() }, [buildingId, month, year])

  const loadData = async () => {
    const [recRes, roomRes, tenRes] = await Promise.all([
      getElectricityRecords(buildingId, month, year),
      getRooms(buildingId),
      getTenants(buildingId)
    ])
    setRecords(recRes.data || [])
    setRooms(roomRes.data || [])
    setTenants(tenRes.data || [])
  }

  const handleRoomSelect = (roomId) => {
    const room = rooms.find(r => r.id === roomId)
    setSelectedRoom(room)
    setForm(f => ({ ...f, room_id: roomId, current_reading: '' }))
    setCurrentError('')
  }

  const validateCurrentReading = (val) => {
    if (!selectedRoom) return true
    const curr = parseFloat(val)
    const prev = parseFloat(selectedRoom.last_meter_reading)
    if (curr < prev) {
      setCurrentError(`Current reading (${curr}) cannot be less than previous reading (${prev})`)
      return false
    }
    setCurrentError('')
    return true
  }

  const units = selectedRoom && form.current_reading
    ? Math.max(0, parseFloat(form.current_reading) - parseFloat(selectedRoom.last_meter_reading))
    : 0
  const totalAmount = units * (parseFloat(selectedRoom?.rate_per_unit) || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateCurrentReading(form.current_reading)) return
    if (!selectedRoom) { alert('Select a room'); return }

    setLoading(true)
    const tenant = tenants.find(t => t.room_id === selectedRoom.id)
    const dueDay = selectedRoom.due_date_day || 5
    const dueMonth = month === 12 ? 1 : month + 1
    const dueYear = month === 12 ? year + 1 : year
    const periodStart = new Date(year, month - 1, 1)
    const periodEnd = new Date(year, month, 0)
    const dueDate = new Date(dueYear, dueMonth - 1, dueDay)

    const { error } = await createElectricityRecord({
      room_id: selectedRoom.id,
      building_id: buildingId,
      tenant_id: tenant?.id || null,
      stay_month: month,
      stay_year: year,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      previous_reading: parseFloat(selectedRoom.last_meter_reading),
      current_reading: parseFloat(form.current_reading),
      rate_per_unit: parseFloat(selectedRoom.rate_per_unit),
      due_date: dueDate.toISOString().split('T')[0],
      reading_date: form.reading_date
    })

    if (error) alert('Error: ' + error.message)
    else { setForm({ room_id: '', current_reading: '', reading_date: today.toISOString().split('T')[0] }); setSelectedRoom(null); setShowForm(false); loadData() }
    setLoading(false)
  }

  const handleMarkPaid = async (id) => {
    const method = window.prompt('Payment method (cash / upi / bank):', 'cash')
    if (!method) return
    await markElectricityPaid(id, method)
    loadData()
  }

  // Filter out rooms that already have a bill for this month
  const billedRoomIds = records.map(r => r.room_id)
  const unbilledRooms = rooms.filter(r => !billedRoomIds.includes(r.id) && r.is_occupied)

  const paidCount = records.filter(r => r.status === 'paid').length
  const unpaidCount = records.filter(r => r.status === 'unpaid').length
  const overdueCount = records.filter(r => r.status === 'overdue').length

  return (
    <div className="manager-page">
      <div className="manager-header">
        <div>
          <h3>Electricity Bills</h3>
          <div className="postpaid-info">
            Stay month: <strong>{MONTHS[month-1]} {year}</strong> — Bill due in <strong>{month === 12 ? `January ${year+1}` : `${MONTHS[month]} ${year}`}</strong>
          </div>
        </div>
        <div className="filter-group">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn-primary" onClick={() => { setShowForm(!showForm); setSelectedRoom(null); setCurrentError('') }}>
            {showForm ? 'Cancel' : '+ Add Reading'}
          </button>
        </div>
      </div>

      {/* ── Add reading form ── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-row">
            <div className="form-group">
              <label>Room *</label>
              <select value={form.room_id} onChange={e => handleRoomSelect(e.target.value)} required>
                <option value="">-- Select Room --</option>
                {unbilledRooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
                {unbilledRooms.length === 0 && <option disabled>All occupied rooms billed this month</option>}
              </select>
            </div>
            {selectedRoom && (
              <>
                <div className="form-group">
                  <label>Previous Reading (auto-fetched)</label>
                  <input type="number" value={selectedRoom.last_meter_reading} disabled className="input-disabled" />
                  <span className="field-hint">Last recorded on {selectedRoom.last_meter_reading_date}</span>
                </div>
                <div className="form-group">
                  <label>Current Reading *</label>
                  <input
                    type="number" step="0.01" placeholder="Enter current meter reading"
                    value={form.current_reading}
                    onChange={e => { setForm(f => ({ ...f, current_reading: e.target.value })); validateCurrentReading(e.target.value) }}
                    required
                  />
                  {currentError && <span className="field-error">{currentError}</span>}
                </div>
                <div className="form-group">
                  <label>Rate (₹/unit)</label>
                  <input type="number" value={selectedRoom.rate_per_unit} disabled className="input-disabled" />
                </div>
                <div className="form-group">
                  <label>Reading Date</label>
                  <input type="date" value={form.reading_date} onChange={e => setForm(f => ({ ...f, reading_date: e.target.value }))} />
                </div>
              </>
            )}
          </div>

          {selectedRoom && form.current_reading && !currentError && (
            <div className="calc-preview">
              <span>Units: <strong>{units.toFixed(2)}</strong></span>
              <span>×</span>
              <span>₹{selectedRoom.rate_per_unit}/unit</span>
              <span>=</span>
              <span className="total-amount">₹{totalAmount.toFixed(2)}</span>
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading || !!currentError || !form.current_reading}>
            {loading ? 'Saving…' : 'Generate Bill'}
          </button>
        </form>
      )}

      {/* ── Summary ── */}
      <div className="summary-pills">
        <span className="pill pill-total">Total: {records.length}</span>
        <span className="pill pill-paid">Paid: {paidCount}</span>
        <span className="pill pill-pending">Pending: {unpaidCount}</span>
        <span className="pill pill-overdue">Overdue: {overdueCount}</span>
      </div>

      {/* ── Records table ── */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Room</th><th>Tenant</th><th>Period</th><th>Prev</th><th>Curr</th>
              <th>Units</th><th>Rate</th><th>Amount</th><th>Due Date</th>
              <th>Status</th><th>Paid On</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr><td colSpan={12} className="empty-row">No bills for {MONTHS[month-1]} {year}. Add readings above.</td></tr>
            )}
            {records.map(r => (
              <tr key={r.id} className={r.status === 'overdue' ? 'row-danger' : r.status === 'paid' ? 'row-success' : ''}>
                <td>Room {r.rooms?.room_number}</td>
                <td>{r.tenants?.full_name || '—'}</td>
                <td className="period-cell">{r.period_start ? new Date(r.period_start).toLocaleDateString('en-IN') : '—'} → {r.period_end ? new Date(r.period_end).toLocaleDateString('en-IN') : '—'}</td>
                <td>{r.previous_reading}</td>
                <td>{r.current_reading}</td>
                <td><strong>{r.units_consumed}</strong></td>
                <td>₹{r.rate_per_unit}</td>
                <td><strong>₹{parseFloat(r.total_amount).toLocaleString('en-IN')}</strong></td>
                <td>{new Date(r.due_date).toLocaleDateString('en-IN')}</td>
                <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                <td>{r.paid_date ? new Date(r.paid_date).toLocaleDateString('en-IN') : '—'}</td>
                <td>
                  {r.status !== 'paid'
                    ? <button className="btn-sm btn-success" onClick={() => handleMarkPaid(r.id)}>✅ Mark Paid</button>
                    : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
