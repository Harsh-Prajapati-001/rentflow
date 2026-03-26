// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { BuildingProvider } from './hooks/useBuilding'
import AuthPage from './pages/AuthPage'
import OwnerDashboard from './pages/OwnerDashboard'
import TenantDashboard from './pages/TenantDashboard'
import './styles/global.css'

function ProtectedRoute({ children, role }) {
  const { user, profile, loading } = useAuth()
  
  // FIX: If we have a user, wait until their profile data arrives before making routing decisions
  if (loading || (user && !profile)) return <div className="page-loading">Loading...</div>
  
  if (!user) return <Navigate to="/login" replace />
  
  if (role && profile?.role !== role) {
    return <Navigate to={profile?.role === 'owner' ? '/owner' : '/tenant'} replace />
  }
  
  return children
}

function AppRoutes() {
  const { user, profile, loading } = useAuth()

  // FIX: If we have a user, wait until their profile data arrives before making routing decisions
  if (loading || (user && !profile)) return <div className="page-loading">Loading...</div>

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to={profile?.role === 'owner' ? '/owner' : '/tenant'} replace /> : <AuthPage />
      } />

      <Route path="/owner/*" element={
        <ProtectedRoute role="owner">
          <BuildingProvider>
            <OwnerDashboard />
          </BuildingProvider>
        </ProtectedRoute>
      } />

      <Route path="/tenant/*" element={
        <ProtectedRoute role="tenant">
          <TenantDashboard />
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}