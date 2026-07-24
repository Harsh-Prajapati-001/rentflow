import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import ThemeToggle from '../components/ThemeToggle'
import {
  getTenantByUserId, getTenantRentRecords, getTenantElectricityRecords,
  getNotifications, markAllNotificationsRead, signOut,
  getOwnerBuildings, getMyRoomRequests, createRoomRequest, updateRoomRequest,
  findOwnerByCredentials
} from '../lib/supabase'
import DocumentManager from '../components/documents/DocumentManager'
import NotificationPanel from '../components/notifications/NotificationPanel'
import { DashboardIcon, BrowseIcon, RentIcon, ElectricityIcon, DocumentsIcon, SettingsIcon, NotificationIcon } from '../components/SvgIcons'

const playSound = (soundName) => {
  const audio = new Audio(`/sounds/${soundName}.m4a`);
  audio.play().catch(e => console.log('Audio play blocked', e));
};

const TABS = [
  { id: 'overview',     label: 'Overview',     icon: DashboardIcon, sound: 'dashboard' },
  { id: 'browse',       label: 'Browse Rooms',  icon: BrowseIcon, sound: 'open room' },
  { id: 'rent',         label: 'Rent History',  icon: RentIcon, sound: 'rent' },
  { id: 'electricity',  label: 'Electricity',   icon: ElectricityIcon, sound: 'E shock' },
  { id: 'documents',    label: 'Documents',     icon: DocumentsIcon, sound: 'docs' },
]
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function TenantDashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [rentRecords, setRentRecords] = useState([])
  const [elecRecords, setElecRecords] = useState([])
  const [notifications, setNotifications] = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [showNotifications, setShowNotifications] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [user])

  const loadAll = async () => {
    setLoading(true)
    const [tenantRes, notifRes, reqRes] = await Promise.all([
      getTenantByUserId(user.id),
      getNotifications(user.id),
      getMyRoomRequests(user.id)
    ])
    if (tenantRes.data) {
      setTenant(tenantRes.data)
      const [rentRes, elecRes] = await Promise.all([
        getTenantRentRecords(tenantRes.data.id),
        getTenantElectricityRecords(tenantRes.data.id)
      ])
      setRentRecords(rentRes.data || [])
      setElecRecords(elecRes.data || [])
    }
    setNotifications(notifRes.data || [])
    setMyRequests(reqRes.data || [])
    setLoading(false)
  }

  const handleSignOut = async () => { await signOut(); navigate('/login') }
  const unreadCount = notifications.filter(n => !n.is_read).length

  const currentRent = rentRecords[0]
  const daysOverdue = currentRent?.status === 'overdue'
    ? Math.floor((new Date() - new Date(currentRent.due_date)) / 86400000) : 0

  if (loading) return <div className="page-loading">Loading your dashboard…</div>

  const isLinked = !!tenant

  return (
    <div className="tenant-layout">
      <aside className="sidebar">
        <div className="sidebar-brand"><img src="/logo.svg" alt="RentFlow Logo" className="brand-icon" style={{width:'28px', height:'28px', marginRight:'8px'}} /><span>RentFlow</span></div>
        {isLinked && (
          <div className="tenant-room-info">
            <div className="room-badge">Room {tenant.rooms?.room_number}</div>
            <div className="building-name">{tenant.buildings?.name}</div>
          </div>
        )}
        <nav className="sidebar-nav">
          {TABS.filter(t => isLinked || t.id === 'browse').map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={`nav-item ${activeTab === tab.id ? 'active' : ''}`} onClick={() => {
                setActiveTab(tab.id);
                playSound(tab.sound);
              }}>
                <span className="nav-icon"><Icon /></span><span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          <ThemeToggle />
          <div className="user-info">
            <span className="user-name">{profile?.full_name}</span>
            <span className="user-role">Tenant</span>
          </div>
          <button className="btn-logout" onClick={handleSignOut}>Sign Out</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="page-title">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {(() => {
                const ActiveIcon = TABS.find(t => t.id === activeTab)?.icon;
                return ActiveIcon ? <ActiveIcon style={{ width: '1.2em', height: '1.2em' }} /> : null;
              })()}
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
            {tenant && <span className="building-badge">{tenant.building?.name} - {tenant.room?.room_number}</span>}
          </div>
          <div className="top-bar-right">
            <button className="notif-btn" style={{ display: 'flex', alignItems: 'center' }} onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) playSound('notification');
            }}>
              <NotificationIcon style={{ width: '1.5em', height: '1.5em', stroke: 'currentColor' }} /> {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>
          </div>
        </header>

        <div className="tab-content">
          {activeTab === 'overview' && isLinked && (
            <TenantOverview tenant={tenant} currentRent={currentRent} daysOverdue={daysOverdue} />
          )}
          {activeTab === 'browse' && (
            <RoomBrowser userId={user.id} profile={profile} myRequests={myRequests} onRefresh={loadAll} />
          )}
          {activeTab === 'rent' && isLinked && <TenantRentHistory records={rentRecords} />}
          {activeTab === 'electricity' && isLinked && <TenantElectricityHistory records={elecRecords} />}
          {activeTab === 'documents' && isLinked && (
            <DocumentManager buildingId={tenant.building_id} tenantId={tenant.id} isOwner={false} uploadedBy={user.id} />
          )}
          {!isLinked && activeTab !== 'browse' && (
            <div className="empty-state">
              <h3>Account Not Yet Linked</h3>
              <p>Your owner hasn't assigned you a room yet, or your request is pending approval.</p>
              <button className="btn-primary" onClick={() => setActiveTab('browse')}>🏠 Browse Available Rooms</button>
            </div>
          )}
        </div>
      </main>

      {showNotifications && (
        <NotificationPanel notifications={notifications} onClose={() => setShowNotifications(false)}
          onMarkAllRead={async () => { await markAllNotificationsRead(user.id); loadAll() }}
          onRefresh={loadAll} />
      )}
    </div>
  )
}

function TenantOverview({ tenant, currentRent, daysOverdue }) {
  return (
    <div className="info-cards">
      <div className="info-card"><div className="info-label">Building</div><div className="info-value">{tenant.buildings?.name}</div><div className="info-sub">{tenant.buildings?.address}</div></div>
      <div className="info-card"><div className="info-label">Room</div><div className="info-value">Room {tenant.rooms?.room_number}</div>{tenant.rooms?.floor && <div className="info-sub">Floor: {tenant.rooms.floor}</div>}</div>
      <div className="info-card"><div className="info-label">Monthly Rent</div><div className="info-value">₹{parseFloat(tenant.rooms?.rent_amount || 0).toLocaleString('en-IN')}</div></div>
      <div className={`info-card ${currentRent?.status === 'paid' ? 'card-success' : currentRent?.status === 'overdue' ? 'card-danger' : 'card-warning'}`}>
        <div className="info-label">Latest Bill Status</div>
        <div className="info-value">
          {!currentRent && 'No bill yet'}
          {currentRent?.status === 'paid' && '✅ Paid'}
          {currentRent?.status === 'unpaid' && '⏳ Pending'}
          {currentRent?.status === 'overdue' && `⚠️ ${daysOverdue} day(s) overdue`}
        </div>
        {currentRent && <div className="info-sub">Period: {new Date(currentRent.period_start).toLocaleDateString('en-IN')} → {new Date(currentRent.period_end).toLocaleDateString('en-IN')}</div>}
        {currentRent && <div className="info-sub">Due: {new Date(currentRent.due_date).toLocaleDateString('en-IN')}</div>}
      </div>
    </div>
  )
}

function TenantRentHistory({ records }) {
  return (
    <div>
      <div className="info-banner" style={{ marginBottom: 16 }}>📋 Rent history — format: paid from DD-MM-YYYY to DD-MM-YYYY (postpaid)</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Period (Stay)</th><th>Amount</th><th>Due Date</th><th>Paid On</th><th>Method</th><th>Status</th></tr></thead>
          <tbody>
            {records.length === 0 && <tr><td colSpan={6} className="empty-row">No rent records yet.</td></tr>}
            {records.map(r => (
              <tr key={r.id} className={r.status==='overdue'?'row-danger':r.status==='paid'?'row-success':''}>
                <td className="period-cell">
                  {r.period_start ? new Date(r.period_start).toLocaleDateString('en-IN') : '—'}
                  {' → '}
                  {r.period_end ? new Date(r.period_end).toLocaleDateString('en-IN') : '—'}
                </td>
                <td>₹{parseFloat(r.amount).toLocaleString('en-IN')}</td>
                <td>{new Date(r.due_date).toLocaleDateString('en-IN')}</td>
                <td>{r.paid_date ? new Date(r.paid_date).toLocaleDateString('en-IN') : '—'}</td>
                <td>{r.payment_method || '—'}</td>
                <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TenantElectricityHistory({ records }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Period</th><th>Prev</th><th>Current</th><th>Units</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          {records.length === 0 && <tr><td colSpan={7} className="empty-row">No electricity records yet.</td></tr>}
          {records.map(r => (
            <tr key={r.id} className={r.status==='overdue'?'row-danger':r.status==='paid'?'row-success':''}>
              <td className="period-cell">
                {r.period_start ? new Date(r.period_start).toLocaleDateString('en-IN') : '—'} → {r.period_end ? new Date(r.period_end).toLocaleDateString('en-IN') : '—'}
              </td>
              <td>{r.previous_reading}</td><td>{r.current_reading}</td>
              <td>{r.units_consumed}</td><td>₹{r.rate_per_unit}/unit</td>
              <td>₹{parseFloat(r.total_amount).toLocaleString('en-IN')}</td>
              <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Room Browser for tenants ──────────────────────────────
function RoomBrowser({ userId, profile, myRequests, onRefresh }) {
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerData, setOwnerData] = useState(null)
  const [buildings, setBuildings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const [requesting, setRequesting] = useState(null) // roomId being requested

  const activePendingRequest = myRequests.find(r => r.status === 'pending')

  const handleFindOwner = async () => {
    if (!ownerEmail || !ownerPhone) { setError('Enter both email and phone'); return }
    setError(''); setLoading(true)
    const { data: owners } = await findOwnerByCredentials(ownerEmail, ownerPhone)
    if (!owners?.length) { setError('Owner not found. Check credentials.'); setLoading(false); return }
    const owner = owners[0]
    setOwnerData(owner)
    const { data: bldgs } = await getOwnerBuildings(owner.owner_id)
    setBuildings(bldgs || [])
    setLoading(false)
  }

  const handleRequestRoom = async (room, buildingId, ownerId) => {
    if (activePendingRequest) { alert('You already have a pending request. Withdraw it first.'); return }
    setRequesting(room.id)
    await createRoomRequest({ tenantUserId: userId, roomId: room.id, buildingId, ownerId, message: requestMessage })
    setRequesting(null); setRequestMessage(''); onRefresh()
  }

  const handleWithdraw = async (requestId) => {
    await updateRoomRequest(requestId, 'withdrawn')
    onRefresh()
  }

  return (
    <div className="room-browser">
      <div className="info-banner" style={{ marginBottom: 16 }}>
        🏠 Browse available rooms. Enter your owner's credentials to see their buildings and apply for a vacant room.
      </div>

      {/* My requests */}
      {myRequests.length > 0 && (
        <div className="my-requests-section">
          <h4>My Room Requests</h4>
          {myRequests.map(req => (
            <div key={req.id} className={`request-card status-${req.status}`}>
              <div className="request-header">
                <div>
                  <div className="request-room">Room {req.rooms?.room_number} · {req.buildings?.name}</div>
                  <div className="request-date">{new Date(req.created_at).toLocaleDateString('en-IN')}</div>
                </div>
                <span className={`badge badge-${req.status}`}>{req.status}</span>
              </div>
              {req.status === 'pending' && (
                <button className="btn-sm btn-danger-outline" onClick={() => handleWithdraw(req.id)}>Withdraw Request</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Owner lookup */}
      <div className="card-form">
        <h4>Find Owner's Buildings</h4>
        <div className="form-row">
          <div className="form-group">
            <label>Owner's Email</label>
            <input type="email" placeholder="owner@email.com" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Owner's Phone</label>
            <input type="tel" placeholder="9876543210" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value.replace(/\D/g,'').slice(0,10))} maxLength={10} />
          </div>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" onClick={handleFindOwner} disabled={loading}>{loading ? 'Searching…' : '🔍 Find Owner'}</button>
      </div>

      {/* Buildings + rooms */}
      {ownerData && (
        <div className="buildings-browse">
          <h4>Buildings by {ownerData.owner_name}</h4>
          {buildings.map(building => (
            <div key={building.id} className="building-browse-card">
              <div className="building-browse-header">
                <span className="building-name">{building.name}</span>
                {building.address && <span className="building-address">{building.address}</span>}
              </div>
              <div className="rooms-browse-grid">
                {(building.rooms || []).map(room => {
                  const myReqForRoom = myRequests.find(r => r.room_id === room.id && r.status === 'pending')
                  return (
                    <div key={room.id} className={`room-browse-card ${room.is_occupied ? 'occupied' : 'vacant'}`}>
                      <div className="rb-room">Room {room.room_number}</div>
                      {room.floor && <div className="rb-floor">Floor {room.floor}</div>}
                      <div className="rb-rent">₹{parseFloat(room.rent_amount).toLocaleString('en-IN')}/mo</div>
                      <div className={`rb-status ${room.is_occupied ? 'occupied' : 'vacant'}`}>
                        {room.is_occupied ? '🔴 Occupied' : '🟢 Vacant'}
                      </div>
                      {!room.is_occupied && !myReqForRoom && (
                        <div className="rb-request">
                          <input placeholder="Message (optional)" value={requesting === room.id ? requestMessage : ''} onChange={e => setRequestMessage(e.target.value)} className="rb-msg-input" />
                          <button className="btn-sm btn-success" onClick={() => handleRequestRoom(room, building.id, ownerData.owner_id)} disabled={requesting === room.id || !!activePendingRequest}>
                            {requesting === room.id ? 'Sending…' : 'Apply for Room'}
                          </button>
                          {activePendingRequest && <div className="field-hint">Withdraw existing request first</div>}
                        </div>
                      )}
                      {myReqForRoom && <div className="rb-pending">⏳ Request Pending</div>}
                    </div>
                  )
                })}
                {(!building.rooms || building.rooms.length === 0) && <div className="text-muted">No rooms added yet.</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
