// frontend/src/pages/OwnerDashboard.jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useBuilding } from '../hooks/useBuilding'
import { getBuildingStats, getNotifications, markAllNotificationsRead } from '../lib/supabase'
import BuildingSelector from '../components/buildings/BuildingSelector'
import BuildingManager from '../components/buildings/BuildingManager'
import RoomManager from '../components/rooms/RoomManager'
import TenantManager from '../components/tenants/TenantManager'
import RentManager from '../components/rent/RentManager'
import ElectricityManager from '../components/electricity/ElectricityManager'
import DocumentManager from '../components/documents/DocumentManager'
import NotificationPanel from '../components/notifications/NotificationPanel'
import { signOut } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'rooms', label: 'Rooms', icon: '🚪' },
  { id: 'tenants', label: 'Tenants', icon: '👥' },
  { id: 'rent', label: 'Rent', icon: '💰' },
  { id: 'electricity', label: 'Electricity', icon: '⚡' },
  { id: 'documents', label: 'Documents', icon: '📂' },
]

export default function OwnerDashboard() {
  const { profile, user } = useAuth()
  const { selectedBuilding } = useBuilding()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [showBuildingManager, setShowBuildingManager] = useState(false)

  useEffect(() => {
    if (selectedBuilding) {
      loadStats()
      loadNotifications()
    }
  }, [selectedBuilding])

  const loadStats = async () => {
    const data = await getBuildingStats(selectedBuilding.id)
    setStats(data)
  }

  const loadNotifications = async () => {
    const { data } = await getNotifications(user.id)
    setNotifications(data || [])
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div className="owner-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span>🏢</span>
          <span>RentFlow</span>
        </div>

        <BuildingSelector />

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
          <button className="nav-item" onClick={() => setShowBuildingManager(true)}>
            <span>⚙️</span> Manage Buildings
          </button>
          <div className="user-info">
            <span className="user-name">{profile?.full_name}</span>
            <span className="user-role">Owner</span>
          </div>
          <button className="btn-logout" onClick={handleSignOut}>Sign Out</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="top-bar">
          <div className="page-title">
            <h2>{TABS.find((t) => t.id === activeTab)?.icon} {TABS.find((t) => t.id === activeTab)?.label}</h2>
            {selectedBuilding && <span className="building-badge">{selectedBuilding.name}</span>}
          </div>
          <div className="top-bar-actions">
            <button className="notif-btn" onClick={() => setShowNotifications(!showNotifications)}>
              🔔 {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>
          </div>
        </header>

        {!selectedBuilding ? (
          <div className="empty-state">
            <h3>No building selected</h3>
            <p>Create a building to get started</p>
            <button className="btn-primary" onClick={() => setShowBuildingManager(true)}>
              + Add Building
            </button>
          </div>
        ) : (
          <div className="tab-content">
            {activeTab === 'dashboard' && <DashboardOverview stats={stats} building={selectedBuilding} />}
            {activeTab === 'rooms' && <RoomManager buildingId={selectedBuilding.id} />}
            {activeTab === 'tenants' && <TenantManager buildingId={selectedBuilding.id} ownerId={user.id} />}
            {activeTab === 'rent' && <RentManager buildingId={selectedBuilding.id} onRefresh={loadStats} />}
            {activeTab === 'electricity' && <ElectricityManager buildingId={selectedBuilding.id} />}
            {activeTab === 'documents' && <DocumentManager buildingId={selectedBuilding.id} isOwner={true} uploadedBy={user.id} />}
          </div>
        )}
      </main>

      {/* Notification Drawer */}
      {showNotifications && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onMarkAllRead={async () => {
            await markAllNotificationsRead(user.id)
            loadNotifications()
          }}
          onRefresh={loadNotifications}
        />
      )}

      {/* Building Manager Modal */}
      {showBuildingManager && (
        <BuildingManager onClose={() => setShowBuildingManager(false)} />
      )}
    </div>
  )
}

function DashboardOverview({ stats, building }) {
  if (!stats) return <div className="loading">Loading stats...</div>

  const cards = [
    { label: 'Total Rooms', value: stats.totalRooms, icon: '🚪', color: 'blue' },
    { label: 'Occupied', value: stats.occupiedRooms, icon: '🏠', color: 'green' },
    { label: 'Active Tenants', value: stats.totalTenants, icon: '👥', color: 'purple' },
    { label: 'Paid This Month', value: stats.paidRent, icon: '✅', color: 'green' },
    { label: 'Pending Payment', value: stats.unpaidRent, icon: '⏳', color: 'orange' },
    { label: 'Rent Collected', value: `₹${stats.totalRentCollected.toLocaleString()}`, icon: '💰', color: 'teal' },
    { label: 'Rent Pending', value: `₹${stats.totalRentDue.toLocaleString()}`, icon: '⚠️', color: 'red' },
    { label: 'Vacancy', value: stats.totalRooms - stats.occupiedRooms, icon: '🔓', color: 'gray' },
  ]

  return (
    <div className="dashboard-overview">
      <div className="stats-grid">
        {cards.map((card) => (
          <div key={card.label} className={`stat-card stat-${card.color}`}>
            <span className="stat-icon">{card.icon}</span>
            <div>
              <div className="stat-value">{card.value}</div>
              <div className="stat-label">{card.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
