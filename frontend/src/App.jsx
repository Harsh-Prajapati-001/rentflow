// frontend/src/App.jsx
//
// FIX: Gemini Issue #1 Part 2 — Fatal Fallback / Infinite Loop in ProtectedRoute
//
// Root cause: ProtectedRoute evaluated role when profile was still null.
// profile?.role = undefined → undefined !== 'owner' → redirect to /tenant
// → caught again → infinite loop.
//
// Fix: ProtectedRoute now shows a loading spinner if loading is true OR
// if user exists but profile hasn't arrived yet. It only evaluates the role
// once BOTH user and profile are confirmed to be in a settled state.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Component } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { BuildingProvider } from './hooks/useBuilding'
import AuthPage from './pages/AuthPage'
import OwnerDashboard from './pages/OwnerDashboard'
import TenantDashboard from './pages/TenantDashboard'
import './styles/global.css'

// ── Error Boundary ────────────────────────────────────────
// Shows the real error on screen instead of a white blank page
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
            Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in Vercel environment variables.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Protected Route ───────────────────────────────────────
function ProtectedRoute({ children, role }) {
  const { user, profile, loading } = useAuth()

  // CRITICAL FIX: Keep showing the spinner if:
  // (a) we are still loading, OR
  // (b) user exists but profile hasn't been fetched yet
  // This is exactly the intermediate state that caused the infinite loop.
  // We must NOT evaluate role until profile is confirmed.
  if (loading || (user && profile === null)) {
    return <div className="page-loading">Loading…</div>
  }

  // No user at all → send to login
  if (!user) return <Navigate to="/login" replace />

  // User exists AND profile is loaded → now safe to check role
  if (role && profile?.role !== role) {
    // User is logged in but wrong role for this route
    // Send them to their correct dashboard
    const correctPath = profile?.role === 'owner' ? '/owner' : '/tenant'
    return <Navigate to={correctPath} replace />
  }

  return children
}

// ── App Routes ────────────────────────────────────────────
function AppRoutes() {
  const { user, profile, loading } = useAuth()

  // Same guard: don't redirect until we know both user and profile
  if (loading || (user && profile === null)) {
    return <div className="page-loading">Loading…</div>
  }

  return (
    <Routes>
      {/* Public route: login page */}
      <Route
        path="/login"
        element={
          user && profile
            ? <Navigate to={profile.role === 'owner' ? '/owner' : '/tenant'} replace />
            : <AuthPage />
        }
      />

      {/* Owner-only routes */}
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

      {/* Tenant-only routes */}
      <Route
        path="/tenant/*"
        element={
          <ProtectedRoute role="tenant">
            <TenantDashboard />
          </ProtectedRoute>
        }
      />

      {/* Catch-all → login */}
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
