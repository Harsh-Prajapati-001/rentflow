// frontend/src/components/rent/RentManager.jsx
import { useState, useEffect } from 'react'
import { getRentRecords, getTenants, createRentRecord, markRentPaid, updateRentRecord } from '../../lib/supabase'

export default function RentManager({ buildingId, onRefresh }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [records, setRecords] = useState([])
  const [tenants, setTenants] = useState([])
  const [showGenerate, setShowGenerate] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadRecords()
    loadTenants()
  }, [buildingId, month, year])

  const loadRecords = async () => {
    const { data } = await getRentRecords(buildingId, month, year)
    setRecords(data || [])
  }

  const loadTenants = async () => {
    const { data } = await getTenants(buildingId)
    setTenants(data || [])
  }

  const generateRentForMonth = async () => {
    setLoading(true)
    const existingTenantIds = records.map((r) => r.tenant_id)
    const newTenants = tenants.filter((t) => !existingTenantIds.includes(t.id) && t.room_id)

    for (const t of newTenants) {
      const dueDate = new Date(year, month - 1, t.rooms?.due_date || 1)
      await createRentRecord({
        tenant_id: t.id,
        room_id: t.room_id,
        building_id: buildingId,
        month,
        year,
        amount: t.rooms?.rent_amount || 0,
        due_date: dueDate.toISOString().split('T')[0],
      })
    }

    loadRecords()
    onRefresh?.()
    setLoading(false)
    setShowGenerate(false)
  }

  const handleMarkPaid = async (id) => {
    const method = prompt('Payment method (cash/upi/bank):', 'cash')
    if (!method) return
    await markRentPaid(id, method)
    loadRecords()
    onRefresh?.()
  }

  const handleMarkUnpaid = async (id) => {
    if (!window.confirm('Mark as unpaid?')) return
    await updateRentRecord(id, { status: 'unpaid', paid_date: null, payment_method: null })
    loadRecords()
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleString('en-IN', { month: 'long' }),
  }))

  const paidCount = records.filter((r) => r.status === 'paid').length
  const overdueCount = records.filter((r) => r.status === 'overdue').length

  return (
    <div className="manager-page">
      <div className="manager-header">
        <h3>Rent Records</h3>
        <div className="filter-group">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {[2023, 2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => setShowGenerate(true)}>⚡ Generate</button>
        </div>
      </div>

      {showGenerate && (
        <div className="info-banner">
          Generate rent records for {months[month - 1]?.label} {year} for all active tenants without a record.
          <button className="btn-primary" onClick={generateRentForMonth} disabled={loading}>
            {loading ? 'Generating...' : 'Confirm Generate'}
          </button>
          <button className="btn-secondary" onClick={() => setShowGenerate(false)}>Cancel</button>
        </div>
      )}

      <div className="summary-pills">
        <span className="pill pill-total">Total: {records.length}</span>
        <span className="pill pill-paid">Paid: {paidCount}</span>
        <span className="pill pill-pending">Pending: {records.length - paidCount - overdueCount}</span>
        <span className="pill pill-overdue">Overdue: {overdueCount}</span>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Room</th>
            <th>Amount</th>
            <th>Due Date</th>
            <th>Status</th>
            <th>Paid On</th>
            <th>Method</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr><td colSpan={8} className="empty-row">No records. Click "Generate" to create rent entries.</td></tr>
          )}
          {records.map((r) => (
            <tr key={r.id} className={r.status === 'overdue' ? 'row-danger' : r.status === 'paid' ? 'row-success' : ''}>
              <td>{r.tenants?.full_name}</td>
              <td>{r.rooms?.room_number}</td>
              <td>₹{parseFloat(r.amount).toLocaleString()}</td>
              <td>{new Date(r.due_date).toLocaleDateString('en-IN')}</td>
              <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
              <td>{r.paid_date ? new Date(r.paid_date).toLocaleDateString('en-IN') : '—'}</td>
              <td>{r.payment_method || '—'}</td>
              <td>
                {r.status !== 'paid'
                  ? <button className="btn-sm btn-success" onClick={() => handleMarkPaid(r.id)}>✅ Mark Paid</button>
                  : <button className="btn-sm btn-secondary" onClick={() => handleMarkUnpaid(r.id)}>↩ Unpaid</button>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
