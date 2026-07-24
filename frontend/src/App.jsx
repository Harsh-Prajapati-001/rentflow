import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Component } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { BuildingProvider } from './hooks/useBuilding'
import AuthPage from './pages/AuthPage'
import OwnerDashboard from './pages/OwnerDashboard'
import TenantDashboard from './pages/TenantDashboard'
import LandingPage from './pages/LandingPage'
import { ThemeProvider } from './hooks/useTheme'
import { GlobalSvgDefs } from './components/SvgIcons'
import './styles/global.css'

// ── Error boundary ────────────────────────────────────────
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
            background: '#1a1d27', padding: 16, borderRadius: 8,
            maxWidth: 640, overflow: 'auto', fontSize: 12,
            color: '#f59e0b', whiteSpace: 'pre-wrap'
          }}>
            {this.state.error?.message}{'\n\n'}{this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, padding: '10px 20px', background: '#4f8ef7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Reload Page
          </button>
          <p style={{ marginTop: 12, fontSize: 12, color: '#8892a4' }}>
            Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel environment variables.
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

  // Show spinner while auth state is being resolved.
  // loading=true means we haven't heard back from Supabase yet — do NOT route.
  if (loading) return <div className="page-loading">Loading…</div>

  // Not logged in → go to login
  if (!user) return <Navigate to="/login" replace />

  // Logged in but profile not yet fetched (shouldn't happen with new useAuth,
  // but guard just in case)
  if (!profile) return <div className="page-loading">Loading…</div>

  // Wrong role for this route → redirect to correct dashboard
  if (role && profile.role !== role) {
    return <Navigate to={profile.role === 'owner' ? '/owner' : '/tenant'} replace />
  }

  return children
}

// ── Routes ────────────────────────────────────────────────
function AppRoutes() {
  const { user, profile, loading } = useAuth()

  // Block routing until auth is fully resolved
  if (loading) return <div className="page-loading">Loading…</div>

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={
          user && profile
            ? <Navigate to={profile.role === 'owner' ? '/owner' : '/tenant'} replace />
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
      <GlobalSvgDefs />
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
