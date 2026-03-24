// frontend/src/pages/AuthPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, signUp } from '../lib/supabase'

export default function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [role, setRole] = useState('tenant')
  const [form, setForm] = useState({ email: '', password: '', fullName: '', phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const { data, error } = await signIn({ email: form.email, password: form.password })
        if (error) throw error
        // Role-based redirect
        const userRole = data.user?.user_metadata?.role
        navigate(userRole === 'owner' ? '/owner' : '/tenant')
      } else {
        const { error } = await signUp({
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          role,
          phone: form.phone,
        })
        if (error) throw error
        setError('Check your email to confirm your account.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-icon">🏢</span>
          <h1>RentFlow</h1>
          <p>Property Management, Simplified</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign In</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Register</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <>
              <div className="form-group">
                <label>Full Name</label>
                <input name="fullName" type="text" placeholder="Your full name"
                  value={form.fullName} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input name="phone" type="tel" placeholder="+91 98765 43210"
                  value={form.phone} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>I am a</label>
                <div className="role-selector">
                  <button type="button" className={role === 'owner' ? 'active' : ''} onClick={() => setRole('owner')}>
                    🏠 Owner
                  </button>
                  <button type="button" className={role === 'tenant' ? 'active' : ''} onClick={() => setRole('tenant')}>
                    👤 Tenant
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <input name="email" type="email" placeholder="you@example.com"
              value={form.email} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input name="password" type="password" placeholder="••••••••"
              value={form.password} onChange={handleChange} required minLength={6} />
          </div>

          {error && <div className={`auth-message ${error.includes('Check') ? 'success' : 'error'}`}>{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
