import { useState, useEffect, useRef } from 'react'
import { getRentRecords, getAllRentRecords, markRentPaid, updateRentRecord } from '../../lib/supabase'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function RentManager({ buildingId, onRefresh }) {
  const today = new Date()
  const defaultMonth = today.getMonth() === 0 ? 12 : today.getMonth()
  const defaultYear  = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()

  const [viewMode, setViewMode] = useState('month') // month | all
  const [month, setMonth] = useState(defaultMonth)
  const [year, setYear] = useState(defaultYear)
  const [records, setRecords] = useState([])
  const [allRecords, setAllRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => { loadRecords() }, [buildingId, month, year, viewMode])

  const loadRecords = async () => {
    setLoading(true)
    if (viewMode === 'month') {
      const { data } = await getRentRecords(buildingId, month, year)
      setRecords(data || [])
    } else {
      const { data } = await getAllRentRecords(buildingId)
      setAllRecords(data || [])
    }
    setLoading(false)
  }

  const handleMarkPaid = async (id) => {
    const method = window.prompt('Payment method (cash / upi / bank / cheque):', 'cash')
    if (!method) return
    await markRentPaid(id, method)
    loadRecords(); onRefresh?.()
  }

  const handleMarkUnpaid = async (id) => {
    if (!window.confirm('Undo this payment?')) return
    await updateRentRecord(id, { status: 'unpaid', paid_date: null, payment_method: null })
    loadRecords(); onRefresh?.()
  }

  const billingLabel = `${MONTHS[month-1]} ${year}`
  const dueLabel = month === 12 ? `January ${year+1}` : `${MONTHS[month]} ${year}`
  const paidCount = records.filter(r => r.status === 'paid').length
  const unpaidCount = records.filter(r => r.status === 'unpaid').length
  const overdueCount = records.filter(r => r.status === 'overdue').length

  // Group allRecords by month for the sliding window
  const groupedByMonth = allRecords.reduce((acc, r) => {
    const key = `${r.stay_year}-${String(r.stay_month).padStart(2,'0')}`
    if (!acc[key]) acc[key] = { month: r.stay_month, year: r.stay_year, records: [] }
    acc[key].records.push(r)
    return acc
  }, {})
  const monthGroups = Object.values(groupedByMonth).sort((a, b) => b.year - a.year || b.month - a.month)

  return (
    <div className="manager-page">
      <div className="manager-header">
        <div>
          <h3>Rent Records</h3>
          {viewMode === 'month' && (
            <div className="postpaid-info">
              Stay: <strong>{billingLabel}</strong> — Due in: <strong>{dueLabel}</strong>
            </div>
          )}
        </div>
        <div className="filter-group">
          <div className="view-toggle">
            <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>Month View</button>
            <button className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>History</button>
          </div>
          {viewMode === 'month' && (
            <>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))}>
                {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))}>
                {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Month view */}
      {viewMode === 'month' && (
        <>
          <div className="info-banner">
            📌 <strong>Postpaid:</strong> Tenant stayed in <strong>{billingLabel}</strong> → payment due in <strong>{dueLabel}</strong>. Records are auto-generated.
          </div>
          <div className="summary-pills">
            <span className="pill pill-total">Total: {records.length}</span>
            <span className="pill pill-paid">Paid: {paidCount}</span>
            <span className="pill pill-pending">Pending: {unpaidCount}</span>
            <span className="pill pill-overdue">Overdue: {overdueCount}</span>
          </div>
          {loading ? <div className="loading">Loading…</div> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Tenant</th><th>Room</th><th>Period</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Paid On</th><th>Method</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {records.length === 0 && <tr><td colSpan={9} className="empty-row">No records for {billingLabel}. Auto-generated when tenant has completed this stay month.</td></tr>}
                  {records.map(r => (
                    <tr key={r.id} className={r.status==='overdue'?'row-danger':r.status==='paid'?'row-success':''}>
                      <td>{r.tenants?.full_name}</td>
                      <td>{r.rooms?.room_number}</td>
                      <td className="period-cell">
                        {r.period_start ? new Date(r.period_start).toLocaleDateString('en-IN') : '—'}
                        {' → '}
                        {r.period_end ? new Date(r.period_end).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td>₹{parseFloat(r.amount).toLocaleString('en-IN')}</td>
                      <td>{new Date(r.due_date).toLocaleDateString('en-IN')}</td>
                      <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                      <td>{r.paid_date ? new Date(r.paid_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td>{r.payment_method || '—'}</td>
                      <td>
                        {r.status !== 'paid'
                          ? <button className="btn-sm btn-success" onClick={() => handleMarkPaid(r.id)}>✅ Paid</button>
                          : <button className="btn-sm btn-secondary" onClick={() => handleMarkUnpaid(r.id)}>↩ Undo</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* History / sliding window view */}
      {viewMode === 'all' && (
        <div className="history-view">
          <div className="info-banner">📋 Full rent history — scroll horizontally through months. Click any record to see details.</div>
          {loading ? <div className="loading">Loading history…</div> : (
            <div className="sliding-window" ref={scrollRef}>
              {monthGroups.length === 0 && <div className="empty-state">No rent history yet.</div>}
              {monthGroups.map(group => {
                const paidC = group.records.filter(r => r.status === 'paid').length
                const total = group.records.length
                return (
                  <div key={`${group.year}-${group.month}`} className="month-column">
                    <div className="month-col-header">
                      <div className="month-col-label">{MONTHS[group.month-1]}</div>
                      <div className="month-col-year">{group.year}</div>
                      <div className={`month-col-rate ${paidC === total ? 'all-paid' : paidC === 0 ? 'none-paid' : 'partial'}`}>
                        {paidC}/{total} paid
                      </div>
                    </div>
                    {group.records.map(r => (
                      <div key={r.id} className={`history-record status-${r.status}`}>
                        <div className="hr-tenant">{r.tenants?.full_name}</div>
                        <div className="hr-room">Room {r.rooms?.room_number}</div>
                        <div className="hr-period">
                          {r.period_start ? new Date(r.period_start).toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—'}
                          {' to '}
                          {r.period_end ? new Date(r.period_end).toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—'}
                        </div>
                        <div className="hr-amount">₹{parseFloat(r.amount).toLocaleString('en-IN')}</div>
                        <span className={`badge badge-${r.status}`}>{r.status}</span>
                        {r.status !== 'paid' && (
                          <button className="btn-sm btn-success mt-4" onClick={() => { handleMarkPaid(r.id) }}>✅ Pay</button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
