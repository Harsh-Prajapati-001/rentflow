import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Component } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { BuildingProvider } from './hooks/useBuilding'
import AuthPage from './pages/AuthPage'
import OwnerDashboard from './pages/OwnerDashboard'
import TenantDashboard from './pages/TenantDashboard'
import './styles/global.css'

// ── Error boundary: shows the actual error instead of white screen ──
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(err) { return { error: err } }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 32,
          background: '#0f1117', color: '#e2e8f0', fontFamily: 'monospace'
        }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ marginBottom: 12, color: '#ef4444' }}>Something went wrong</h2>
          <pre style={{
            background: '#1a1d27', padding: 16, borderRadius: 8, maxWidth: 600,
            overflow: 'auto', fontSize: 12, color: '#f59e0b', whiteSpace: 'pre-wrap'
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, padding: '10px 20px', background: '#4f8ef7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Reload Page
          </button>
          <p style={{ marginTop: 12, fontSize: 12, color: '#8892a4' }}>
            If this keeps happening, check that your Vercel environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) are set correctly.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Protected route ───────────────────────────────────────
function ProtectedRoute({ children, role }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="page-loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (role && profile?.role !== role) {
    return <Navigate to={profile?.role === 'owner' ? '/owner' : '/tenant'} replace />
  }
  return children
}

// ── Route definitions ─────────────────────────────────────
function AppRoutes() {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="page-loading">Loading…</div>
  return (
    <Routes>
      <Route
        path="/login"
        element={user
          ? <Navigate to={profile?.role === 'owner' ? '/owner' : '/tenant'} replace />
          : <AuthPage />
        }
      />
      <Route
        path="/owner/*"
        element={
          <ProtectedRoute role="owner">
            <BuildingProvider>
              <OwnerDashboard />
            </BuildingProvider>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tenant/*"
        element={
          <ProtectedRoute role="tenant">
            <TenantDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

// ── Root ──────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
