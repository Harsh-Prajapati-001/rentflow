import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useBuilding } from '../hooks/useBuilding'
import ThemeToggle from '../components/ThemeToggle'
import { getBuildingStats, getNotifications, markAllNotificationsRead, autoGenerateRentRecords, signOut } from '../lib/supabase'
import BuildingSelector from '../components/buildings/BuildingSelector'
import BuildingManager from '../components/buildings/BuildingManager'
import RoomManager from '../components/rooms/RoomManager'
import TenantManager from '../components/tenants/TenantManager'
import RentManager from '../components/rent/RentManager'
import ElectricityManager from '../components/electricity/ElectricityManager'
import DocumentManager from '../components/documents/DocumentManager'
import NotificationPanel from '../components/notifications/NotificationPanel'
import { DashboardIcon, RoomsIcon, TenantsIcon, RentIcon, ElectricityIcon, DocumentsIcon, SettingsIcon, NotificationIcon, OccupiedIcon, VacantIcon, PaidIcon, PendingIcon, AlertIcon } from '../components/SvgIcons'

const playSound = (soundName) => {
  const audio = new Audio(`/sounds/${soundName}.m4a`);
  audio.play().catch(e => console.log('Audio play blocked', e));
};

const TABS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: DashboardIcon, sound: 'dashboard' },
  { id: 'rooms',       label: 'Rooms',        icon: RoomsIcon, sound: 'open room' },
  { id: 'tenants',     label: 'Tenants',      icon: TenantsIcon, sound: 'Tenants' },
  { id: 'rent',        label: 'Rent',         icon: RentIcon, sound: 'rent' },
  { id: 'electricity', label: 'Electricity',  icon: ElectricityIcon, sound: 'E shock' },
  { id: 'documents',   label: 'Documents',    icon: DocumentsIcon, sound: 'docs' },
]
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function OwnerDashboard() {
  const { profile, user } = useAuth()
  const { selectedBuilding } = useBuilding()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [stats, setStats] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [showBuildingManager, setShowBuildingManager] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  useEffect(() => {
    if (selectedBuilding) { runAutoGenAndLoad(); loadNotifications() }
  }, [selectedBuilding])

  const runAutoGenAndLoad = async () => {
    setSyncStatus('running')
    await autoGenerateRentRecords(selectedBuilding.id)
    setSyncStatus('done')
    const data = await getBuildingStats(selectedBuilding.id)
    setStats(data)
    setTimeout(() => setSyncStatus(null), 2500)
  }

  const loadNotifications = async () => {
    const { data } = await getNotifications(user.id)
    setNotifications(data || [])
  }

  const handleSignOut = async () => { await signOut(); navigate('/login') }
  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="owner-layout">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand"><img src="/logo.svg" alt="RentFlow Logo" className="brand-icon" style={{width:'28px', height:'28px', marginRight:'8px'}} /><span>RentFlow</span></div>
        <BuildingSelector />
        <nav className="sidebar-nav">
          {TABS.map(tab => {
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
          <button className="nav-item" onClick={() => setShowBuildingManager(true)}>
            <span className="nav-icon"><SettingsIcon /></span><span>Manage Buildings</span>
          </button>
          <div className="user-info">
            <span className="user-name">{profile?.full_name}</span>
            <span className="user-role">Owner</span>
          </div>
          <button className="btn-logout" onClick={handleSignOut}>Sign Out</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="page-title">
            <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} title="Toggle sidebar">
              {collapsed ? '▶' : '◀'}
            </button>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {(() => {
                const ActiveIcon = TABS.find(t => t.id === activeTab)?.icon;
                return ActiveIcon ? <ActiveIcon style={{ width: '1.2em', height: '1.2em' }} /> : null;
              })()}
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
            {selectedBuilding && <span className="building-badge">{selectedBuilding.name}</span>}
          </div>
          <div className="top-bar-right">
            {syncStatus === 'running' && <span className="autogen-pill running">⟳ Syncing…</span>}
            {syncStatus === 'done'    && <span className="autogen-pill done">✓ Up to date</span>}
            <button className="notif-btn" style={{ display: 'flex', alignItems: 'center' }} onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) playSound('notification');
            }}>
              <NotificationIcon style={{ width: '1.5em', height: '1.5em', stroke: 'currentColor' }} /> {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>
          </div>
        </header>

        {!selectedBuilding ? (
          <div className="empty-state">
            <h3>No building selected</h3>
            <p>Create a building to get started</p>
            <button className="btn-primary" onClick={() => setShowBuildingManager(true)}>+ Add Building</button>
          </div>
        ) : (
          <div className="tab-content">
            {activeTab === 'dashboard'   && <DashboardView stats={stats} />}
            {activeTab === 'rooms'       && <RoomManager buildingId={selectedBuilding.id} />}
            {activeTab === 'tenants'     && <TenantManager buildingId={selectedBuilding.id} ownerId={user.id} onTenantAdded={runAutoGenAndLoad} />}
            {activeTab === 'rent'        && <RentManager buildingId={selectedBuilding.id} onRefresh={runAutoGenAndLoad} />}
            {activeTab === 'electricity' && <ElectricityManager buildingId={selectedBuilding.id} />}
            {activeTab === 'documents'   && <DocumentManager buildingId={selectedBuilding.id} isOwner={true} uploadedBy={user.id} />}
          </div>
        )}
      </main>

      {showNotifications && (
        <NotificationPanel notifications={notifications} onClose={() => setShowNotifications(false)}
          onMarkAllRead={async () => { await markAllNotificationsRead(user.id); loadNotifications() }}
          onRefresh={loadNotifications} />
      )}
      {showBuildingManager && <BuildingManager onClose={() => { setShowBuildingManager(false); runAutoGenAndLoad() }} />}
    </div>
  )
}

function DashboardView({ stats }) {
  if (!stats) return <div className="loading">Loading dashboard…</div>

  const billingLabel = `${MONTHS[stats.billingMonth - 1]} ${stats.billingYear}`
  const dueLabel = stats.billingMonth === 12 ? `January ${stats.billingYear + 1}` : `${MONTHS[stats.billingMonth]} ${stats.billingYear}`

  return (
    <div className="dashboard-v2">
      {/* ── Billing period banner ── */}
      <div className="billing-period-label">
        📅 Billing period: <strong>{billingLabel}</strong> — payments due in <strong>{dueLabel}</strong>
        <span className="postpaid-note">(postpaid: tenant stayed last month, pays now)</span>
      </div>

      {/* ── UPPER SECTION: Room-wise ledger cards ── */}
      <div className="section-title">Room Status Overview</div>
      <div className="rooms-ledger-grid">
        {stats.roomLedger.map(room => (
          <RoomLedgerCard key={room.id} room={room} />
        ))}
        {stats.roomLedger.length === 0 && <div className="empty-state">No rooms added yet.</div>}
      </div>

      {/* ── LOWER SECTION: Summary stats ── */}
      <div className="section-title" style={{ marginTop: 32 }}>Building Summary — {billingLabel}</div>
      <div className="stats-grid">
        {[
          { label: 'Total Rooms',     value: stats.totalRooms,                                          icon: RoomsIcon, color: 'blue'   },
          { label: 'Occupied',        value: stats.occupiedRooms,                                       icon: OccupiedIcon, color: 'green'  },
          { label: 'Vacant',          value: stats.totalRooms - stats.occupiedRooms,                    icon: VacantIcon, color: 'gray'   },
          { label: 'Active Tenants',  value: stats.totalTenants,                                        icon: TenantsIcon, color: 'purple' },
          { label: 'Paid',            value: stats.paidRent,                                            icon: PaidIcon, color: 'green'  },
          { label: 'Pending/Overdue', value: stats.unpaidRent,                                          icon: PendingIcon, color: 'orange' },
          { label: 'Collected',       value: `₹${stats.totalRentCollected.toLocaleString('en-IN')}`,   icon: RentIcon, color: 'teal'   },
          { label: 'Pending Amount',  value: `₹${stats.totalRentDue.toLocaleString('en-IN')}`,         icon: AlertIcon, color: 'red'    },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`stat-card stat-${card.color}`}>
              <span className="stat-icon"><Icon style={{ width: '1.2em', height: '1.2em' }} /></span>
              <div><div className="stat-value">{card.value}</div><div className="stat-label">{card.label}</div></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RoomLedgerCard({ room }) {
  const rentColor = room.latestRentStatus === 'paid' ? 'success' : room.latestRentStatus === 'overdue' ? 'danger' : room.latestRentStatus === 'unpaid' ? 'warning' : 'neutral'
  const elecColor = room.latestElecStatus === 'paid' ? 'success' : room.latestElecStatus === 'overdue' ? 'danger' : room.latestElecStatus === 'unpaid' ? 'warning' : 'neutral'

  return (
    <div className={`room-ledger-card ${!room.is_occupied ? 'vacant' : ''}`}>
      <div className="rlc-header">
        <span className="rlc-room">Room {room.room_number}</span>
        {room.floor && <span className="rlc-floor">Floor {room.floor}</span>}
        <span className={`rlc-status ${room.is_occupied ? 'occupied' : 'vacant'}`}>
          {room.is_occupied ? '🔴 Occupied' : '🔵 Vacant'}
        </span>
      </div>

      {room.is_occupied ? (
        <>
          <div className="rlc-row">
            <div className={`rlc-badge rent ${rentColor}`}>
              💰 Rent: {room.latestRentStatus || 'not generated'}
            </div>
            <div className={`rlc-badge elec ${elecColor}`}>
              ⚡ Elec: {room.latestElecStatus || 'not billed'}
            </div>
          </div>

          {room.unpaidMonthsCount > 0 && (
            <div className="rlc-overdue-info">
              ⚠️ {room.unpaidMonthsCount} month(s) rent unpaid
              <div className="rlc-months">{room.unpaidRentMonths.join(', ')}</div>
            </div>
          )}

          <div className="rlc-amounts">
            <span>₹{parseFloat(room.rent_amount).toLocaleString('en-IN')}/mo</span>
            {room.unpaidRentAmount > 0 && <span className="amount-due">₹{room.unpaidRentAmount.toLocaleString('en-IN')} rent due</span>}
            {room.unpaidElecAmount > 0 && <span className="amount-due">₹{room.unpaidElecAmount.toLocaleString('en-IN')} elec due</span>}
          </div>
        </>
      ) : (
        <div className="rlc-vacant-label">Available for rent · ₹{parseFloat(room.rent_amount).toLocaleString('en-IN')}/mo</div>
      )}
    </div>
  )
}
