// frontend/src/components/notifications/NotificationPanel.jsx
import { markNotificationRead } from '../../lib/supabase'

const TYPE_ICONS = {
  info: 'ℹ️', warning: '⚠️', overdue: '🔴', payment: '💰',
}

export default function NotificationPanel({ notifications, onClose, onMarkAllRead, onRefresh }) {
  const handleRead = async (id) => {
    await markNotificationRead(id)
    onRefresh()
  }

  const unread = notifications.filter((n) => !n.is_read)

  return (
    <div className="notif-drawer">
      <div className="notif-header">
        <h3>🔔 Notifications {unread.length > 0 && <span className="badge-count">{unread.length}</span>}</h3>
        <div className="notif-actions">
          {unread.length > 0 && (
            <button className="btn-text" onClick={onMarkAllRead}>Mark all read</button>
          )}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="notif-list">
        {notifications.length === 0 && (
          <div className="empty-state">All caught up! No notifications.</div>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`notif-item ${n.is_read ? 'read' : 'unread'} notif-${n.type}`}
            onClick={() => !n.is_read && handleRead(n.id)}
          >
            <span className="notif-icon">{TYPE_ICONS[n.type] || 'ℹ️'}</span>
            <div className="notif-content">
              <div className="notif-title">{n.title}</div>
              <div className="notif-message">{n.message}</div>
              <div className="notif-time">{timeAgo(n.created_at)}</div>
            </div>
            {!n.is_read && <span className="unread-dot" />}
          </div>
        ))}
      </div>
    </div>
  )
}

function timeAgo(dateStr) {
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
