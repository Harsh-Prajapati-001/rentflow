// frontend/src/pages/TenantDashboard.jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  getTenantByUserId,
  getTenantRentRecords,
  getElectricityRecords,
  getDocuments,
  getNotifications,
  markAllNotificationsRead,
  signOut,
} from '../lib/supabase'
import DocumentManager from '../components/documents/DocumentManager'
import NotificationPanel from '../components/notifications/NotificationPanel'
import { useNavigate } from 'react-router-dom'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'rent', label: 'Rent History', icon: '💰' },
  { id: 'electricity', label: 'Electricity', icon: '⚡' },
  { id: 'documents', label: 'Documents', icon: '📂' },
]

export default function TenantDashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [rentRecords, setRentRecords] = useState([])
  const [electricityRecords, setElectricityRecords] = useState([])
  const [notifications, setNotifications] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [showNotifications, setShowNotifications] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    const [tenantRes, notifRes] = await Promise.all([
      getTenantByUserId(user.id),
      getNotifications(user.id),
    ])

    if (tenantRes.data) {
      setTenant(tenantRes.data)
      const [rentRes, elecRes] = await Promise.all([
        getTenantRentRecords(tenantRes.data.id),
        getElectricityRecords(tenantRes.data.building_id),
      ])
      setRentRecords(rentRes.data || [])
      setElectricityRecords(
        (elecRes.data || []).filter((r) => r.tenant_id === tenantRes.data.id)
      )
    }

    setNotifications(notifRes.data || [])
    setLoading(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length
  const currentRent = rentRecords.find(
    (r) => r.month === new Date().getMonth() + 1 && r.year === new Date().getFullYear()
  )

  if (loading) return <div className="page-loading">Loading your dashboard...</div>

  if (!tenant) {
    return (
      <div className="empty-state full-page">
        <h2>Account Not Linked</h2>
        <p>Your tenant account hasn't been set up yet. Please contact your owner.</p>
        <button className="btn-primary" onClick={handleSignOut}>Sign Out</button>
      </div>
    )
  }

  return (
    <div className="tenant-layout">
      <aside className="sidebar">
        <div className="sidebar-brand"><span>🏢</span><span>RentFlow</span></div>

        <div className="tenant-room-info">
          <div className="room-badge">Room {tenant.rooms?.room_number}</div>
          <div className="building-name">{tenant.buildings?.name}</div>
        </div>

        <nav className="sidebar-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{profile?.full_name}</span>
            <span className="user-role">Tenant</span>
          </div>
          <button className="btn-logout" onClick={handleSignOut}>Sign Out</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <h2>{TABS.find((t) => t.id === activeTab)?.icon} {TABS.find((t) => t.id === activeTab)?.label}</h2>
          <button className="notif-btn" onClick={() => setShowNotifications(true)}>
            🔔 {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>
        </header>

        <div className="tab-content">
          {activeTab === 'overview' && (
            <TenantOverview tenant={tenant} currentRent={currentRent} />
          )}
          {activeTab === 'rent' && (
            <TenantRentHistory records={rentRecords} />
          )}
          {activeTab === 'electricity' && (
            <TenantElectricityHistory records={electricityRecords} />
          )}
          {activeTab === 'documents' && (
            <DocumentManager
              buildingId={tenant.building_id}
              tenantId={tenant.id}
              isOwner={false}
              uploadedBy={user.id}
            />
          )}
        </div>
      </main>

      {showNotifications && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onMarkAllRead={async () => {
            await markAllNotificationsRead(user.id)
            loadData()
          }}
          onRefresh={loadData}
        />
      )}
    </div>
  )
}

function TenantOverview({ tenant, currentRent }) {
  const daysOverdue = currentRent?.status === 'overdue'
    ? Math.floor((new Date() - new Date(currentRent.due_date)) / 86400000)
    : 0

  return (
    <div className="tenant-overview">
      <div className="info-cards">
        <div className="info-card">
          <div className="info-label">Building</div>
          <div className="info-value">{tenant.buildings?.name}</div>
          <div className="info-sub">{tenant.buildings?.address}</div>
        </div>
        <div className="info-card">
          <div className="info-label">Room</div>
          <div className="info-value">Room {tenant.rooms?.room_number}</div>
        </div>
        <div className="info-card">
          <div className="info-label">Monthly Rent</div>
          <div className="info-value">₹{parseFloat(tenant.rooms?.rent_amount || 0).toLocaleString()}</div>
        </div>
        <div className={`info-card ${currentRent?.status === 'paid' ? 'card-success' : currentRent?.status === 'overdue' ? 'card-danger' : 'card-warning'}`}>
          <div className="info-label">This Month's Status</div>
          <div className="info-value">
            {!currentRent && 'Not Generated'}
            {currentRent?.status === 'paid' && '✅ Paid'}
            {currentRent?.status === 'unpaid' && '⏳ Due Soon'}
            {currentRent?.status === 'overdue' && `⚠️ ${daysOverdue} day(s) overdue`}
          </div>
          {currentRent && (
            <div className="info-sub">Due: {new Date(currentRent.due_date).toLocaleDateString('en-IN')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function TenantRentHistory({ records }) {
  return (
    <div className="rent-history">
      <table className="data-table">
        <thead>
          <tr>
            <th>Month/Year</th>
            <th>Amount</th>
            <th>Due Date</th>
            <th>Paid On</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr><td colSpan={5} className="empty-row">No rent records yet</td></tr>
          )}
          {records.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.year, r.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</td>
              <td>₹{parseFloat(r.amount).toLocaleString()}</td>
              <td>{new Date(r.due_date).toLocaleDateString('en-IN')}</td>
              <td>{r.paid_date ? new Date(r.paid_date).toLocaleDateString('en-IN') : '—'}</td>
              <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TenantElectricityHistory({ records }) {
  return (
    <div className="electricity-history">
      <table className="data-table">
        <thead>
          <tr>
            <th>Month/Year</th>
            <th>Previous</th>
            <th>Current</th>
            <th>Units</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr><td colSpan={6} className="empty-row">No electricity records yet</td></tr>
          )}
          {records.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.year, r.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</td>
              <td>{r.previous_reading}</td>
              <td>{r.current_reading}</td>
              <td>{r.units_consumed}</td>
              <td>₹{r.rate_per_unit}/unit</td>
              <td>₹{parseFloat(r.total_amount).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
