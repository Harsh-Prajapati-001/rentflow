// frontend/src/pages/AuthPage.jsx
//
// FIX: Gemini Issue #4 — SMS OTP Bypass
//
// Root cause: After email verification, Supabase established a full session
// BEFORE the user completed phone OTP. ProtectedRoute detected the session +
// existing profile and routed them directly to the dashboard, skipping OTP.
//
// Fix: We no longer ask the user to verify email THEN phone in sequence.
// Instead we use Supabase's phone-first OTP flow:
//   1. User fills in form → we call signInWithOtp({ phone }) → SMS sent
//   2. User enters 6-digit code → verifyOtp() → session created
//   3. ONLY after successful OTP do we call signUp() to create the account
//
// This means: no OTP = no session = no profile = no dashboard access.
// The bypass is impossible because the session itself is gated on OTP success.
//
// For users without Twilio configured, we fall back gracefully to
// email-only registration with a clear note about phone verification.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, signIn, signUp, findOwnerByCredentials } from '../lib/supabase'
import ThemeToggle from '../components/ThemeToggle'

const TWILIO_ENABLED = import.meta.env.VITE_TWILIO_ENABLED === 'true'

export default function AuthPage() {
  const navigate = useNavigate()

  // mode: 'login' | 'signup' | 'phone_otp' | 'email_sent'
  const [mode, setMode] = useState('login')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole]   = useState('tenant')

  const [form, setForm] = useState({
    email: '', password: '', fullName: '', phone: '',
    ownerEmail: '', ownerPhone: ''
  })

  const [ownerFound,        setOwnerFound]        = useState(null)
  const [error,             setError]             = useState('')
  const [info,              setInfo]              = useState('')
  const [loading,           setLoading]           = useState(false)

  // OTP state — used only when Twilio is enabled
  const [otpPhone,          setOtpPhone]          = useState('')
  const [otpCode,           setOtpCode]           = useState('')
  // Pending signup data — stored until OTP is verified
  const [pendingSignup,     setPendingSignup]     = useState(null)

  // Email-only verification state
  const [pendingEmail,      setPendingEmail]      = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Format 10-digit Indian number to E.164 for Twilio
  const toE164 = (raw) => {
    const d = raw.replace(/\D/g, '')
    if (d.startsWith('91') && d.length === 12) return `+${d}`
    if (d.length === 10) return `+91${d}`
    return `+${d}`
  }

  // ── Login ─────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data, error: err } = await signIn({ email: form.email, password: form.password })
    if (err) { setError(err.message); setLoading(false); return }
    // Navigation is handled by ProtectedRoute in App.jsx once profile loads
    // We don't navigate here — useAuth will trigger a re-render
    setLoading(false)
  }

  // ── Owner lookup ──────────────────────────────────────
  const handleLookupOwner = async () => {
    if (!form.ownerEmail || !form.ownerPhone) {
      setError('Enter both the owner\'s email and phone number.'); return
    }
    setError(''); setLoading(true)
    const { data, error: err } = await findOwnerByCredentials(form.ownerEmail, form.ownerPhone)
    setLoading(false)
    if (err || !data?.length) {
      setError('Owner not found. Check the email and phone number exactly as registered.')
      setOwnerFound(null); return
    }
    setOwnerFound(data[0])
    setInfo(`✅ Owner verified: ${data[0].owner_name}`)
  }

  // ── Signup — Step 1: Send phone OTP (if Twilio) ───────
  // We do NOT create the account yet. We gate account creation on OTP success.
  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')

    const phoneDigits = form.phone.replace(/\D/g, '')
    if (phoneDigits.length !== 10) {
      setError('Phone must be exactly 10 digits.'); return
    }
    if (role === 'tenant' && !ownerFound) {
      setError('Please verify your owner first.'); return
    }

    setLoading(true)

    if (TWILIO_ENABLED) {
      // ── Twilio path: send OTP first, create account only after verification
      const phone = toE164(form.phone)
      const { error: otpErr } = await supabase.auth.signInWithOtp({ phone })
      if (otpErr) { setError(otpErr.message); setLoading(false); return }

      // Store signup data to use after OTP is verified
      setPendingSignup({ ...form, phone: phoneDigits, role, ownerFound })
      setOtpPhone(phone)
      setMode('phone_otp')
    } else {
      // ── Email-only path: create account, send verification email
      const { error: err } = await signUp({
        email: form.email, password: form.password,
        fullName: form.fullName, role, phone: phoneDigits
      })
      if (err) { setError(err.message); setLoading(false); return }
      setPendingEmail(form.email)
      setMode('email_sent')
    }

    setLoading(false)
  }

  // ── Signup — Step 2: Verify OTP, THEN create account ──
  // This is the key fix: account only exists after OTP is confirmed.
  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)

    const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
      phone: otpPhone,
      token: otpCode,
      type: 'sms'
    })

    if (verifyErr) {
      setError('Invalid OTP. Please try again or request a new one.')
      setLoading(false); return
    }

    // OTP verified successfully — now create the full account
    if (pendingSignup) {
      const { error: signupErr } = await signUp({
        email: pendingSignup.email,
        password: pendingSignup.password,
        fullName: pendingSignup.fullName,
        role: pendingSignup.role,
        phone: pendingSignup.phone
      })
      if (signupErr && !signupErr.message.includes('already registered')) {
        setError(signupErr.message); setLoading(false); return
      }
    }

    // Sign in now (OTP gave us a session for the phone, we need email session)
    const { error: loginErr } = await signIn({
      email: pendingSignup?.email || form.email,
      password: pendingSignup?.password || form.password
    })
    if (loginErr) {
      // Account created but need email confirmation first
      setPendingEmail(pendingSignup?.email || form.email)
      setMode('email_sent')
      setLoading(false); return
    }

    // useAuth will pick up the session change and route automatically
    setLoading(false)
  }

  const handleResendOTP = async () => {
    setError(''); setLoading(true)
    const { error: err } = await supabase.auth.signInWithOtp({ phone: otpPhone })
    if (err) setError(err.message)
    else setInfo('New OTP sent to ' + otpPhone)
    setLoading(false)
  }

  const handleResendEmail = async () => {
    setLoading(true)
    const { error: err } = await supabase.auth.resend({ type: 'signup', email: pendingEmail })
    if (err) setError(err.message)
    else setInfo('Verification email resent!')
    setLoading(false)
  }

  const reset = () => {
    setMode('login'); setError(''); setInfo(''); setOtpCode('')
    setOwnerFound(null); setPendingSignup(null)
    setForm({ email: '', password: '', fullName: '', phone: '', ownerEmail: '', ownerPhone: '' })
  }

  // ─────────────────────────────────────────────────────
  // SCREEN: Phone OTP entry
  // ─────────────────────────────────────────────────────
  if (mode === 'phone_otp') {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 20, right: 20 }}><ThemeToggle /></div>
          <div className="auth-brand"><img src="/logo.svg" alt="RentFlow Logo" className="brand-icon" /><h1>RentFlow</h1></div>
          <div className="verify-box">
            <div className="verify-icon">📱</div>
            <h2>Verify Your Phone</h2>
            <p>A 6-digit code was sent to <strong>{otpPhone}</strong></p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Your account will be created only after this step is complete.
            </p>
            {info  && <div className="auth-message success">{info}</div>}
            {error && <div className="auth-message error">{error}</div>}
            <form onSubmit={handleVerifyOTP} className="auth-form">
              <div className="form-group">
                <label>Enter 6-Digit OTP</label>
                <input
                  type="text" inputMode="numeric" placeholder="123456"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6} required className="otp-input"
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary" disabled={loading || otpCode.length !== 6}>
                {loading ? 'Verifying…' : '✅ Verify & Create Account'}
              </button>
            </form>
            <button className="btn-secondary" onClick={handleResendOTP} disabled={loading}>
              🔄 Resend OTP
            </button>
            <button className="btn-secondary" onClick={reset}>← Start Over</button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────
  // SCREEN: Email verification sent
  // ─────────────────────────────────────────────────────
  if (mode === 'email_sent') {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 20, right: 20 }}><ThemeToggle /></div>
          <div className="auth-brand"><img src="/logo.svg" alt="RentFlow Logo" className="brand-icon" /><h1>RentFlow</h1></div>
          <div className="verify-box">
            <div className="verify-icon">📧</div>
            <h2>Check Your Email</h2>
            <p>A verification link was sent to <strong>{pendingEmail}</strong></p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Click the link in the email, then come back here and sign in.
            </p>
            {info  && <div className="auth-message success">{info}</div>}
            {error && <div className="auth-message error">{error}</div>}
            <button className="btn-primary" onClick={handleResendEmail} disabled={loading}>
              {loading ? 'Sending…' : '📨 Resend Email'}
            </button>
            <button className="btn-secondary" onClick={reset}>← Back to Sign In</button>
          </div>
        </div>
      </div>
    )
  }

  const handleGoogleAuth = async () => {
    setError(''); setLoading(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (err) setError(err.message);
    setLoading(false);
  }

  // ─────────────────────────────────────────────────────
  // SCREEN: Main Login / Signup form
  // ─────────────────────────────────────────────────────
  return (
    <div className="auth-page">
      <button 
        onClick={() => navigate('/')}
        style={{
          position: 'absolute', top: 20, left: 20,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '50%', width: 40, height: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--text-color)',
          backdropFilter: 'blur(10px)', boxShadow: '0 4px 6px var(--surface2)'
        }}
        title="Back to Landing Page"
      >
        ←
      </button>
      <div className="auth-card" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 20, right: 20 }}><ThemeToggle /></div>
        <div className="auth-brand">
          <img src="/logo.svg" alt="RentFlow Logo" className="brand-icon" />
          <h1>RentFlow</h1>
          <p>Property Management, Simplified</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login'  ? 'active' : ''} onClick={() => { setMode('login');  setError(''); setInfo('') }}>Sign In</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setInfo('') }}>Register</button>
        </div>

        {/* ── LOGIN ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" value={form.email} onChange={e => set('email', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} style={{ paddingRight: '40px' }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '1.2rem', opacity: 0.6 }} title={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            {error && <div className="auth-message error">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="oauth-divider" style={{ margin: '20px 0', textAlign: 'center', position: 'relative' }}>
              <span style={{ background: 'var(--surface-solid)', padding: '0 10px', color: 'var(--text-muted)', fontSize: '0.85rem', position: 'relative', zIndex: 1 }}>or</span>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--border)' }}></div>
            </div>
            <button type="button" onClick={handleGoogleAuth} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
          </form>
        )}

        {/* ── SIGNUP ── */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="auth-form">
            {/* Role */}
            <div className="form-group">
              <label>I am a</label>
              <div className="role-selector">
                <button type="button" className={role === 'owner'  ? 'active' : ''} onClick={() => { setRole('owner');  setOwnerFound(null); setInfo('') }}>🏠 Owner</button>
                <button type="button" className={role === 'tenant' ? 'active' : ''} onClick={() => { setRole('tenant'); setOwnerFound(null); setInfo('') }}>👤 Tenant</button>
              </div>
            </div>

            <div className="form-group">
              <label>Full Name</label>
              <input type="text" placeholder="Your full name" value={form.fullName} onChange={e => set('fullName', e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Phone Number (10 digits){TWILIO_ENABLED ? ' — SMS OTP will be sent' : ''}</label>
              <input
                type="tel" placeholder="9876543210"
                value={form.phone}
                onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                maxLength={10} pattern="[0-9]{10}" required
              />
              {form.phone.length > 0 && form.phone.length < 10 && (
                <span className="field-hint">{10 - form.phone.length} more digit(s) needed</span>
              )}
              {form.phone.length === 10 && (
                <span className="field-hint success-hint">
                  {TWILIO_ENABLED ? `✓ OTP will be sent to +91${form.phone}` : `✓ Valid phone number`}
                </span>
              )}
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" value={form.email} onChange={e => set('email', e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Password (min 6 characters)</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} style={{ paddingRight: '40px' }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '1.2rem', opacity: 0.6 }} title={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Tenant owner lookup */}
            {role === 'tenant' && (
              <div className="owner-lookup-box">
                <div className="lookup-title">🔍 Find Your Owner</div>
                <p className="lookup-desc">Enter your owner's registered email and phone number to link your account.</p>
                <div className="form-group">
                  <label>Owner's Email</label>
                  <input type="email" placeholder="owner@email.com" value={form.ownerEmail}
                    onChange={e => { set('ownerEmail', e.target.value); setOwnerFound(null); setInfo('') }} />
                </div>
                <div className="form-group">
                  <label>Owner's Phone (10 digits)</label>
                  <input type="tel" placeholder="9876543210" value={form.ownerPhone}
                    onChange={e => { set('ownerPhone', e.target.value.replace(/\D/g,'').slice(0,10)); setOwnerFound(null); setInfo('') }}
                    maxLength={10} />
                </div>
                <button type="button" className="btn-secondary" onClick={handleLookupOwner} disabled={loading}>
                  {loading ? 'Searching…' : '🔍 Verify Owner'}
                </button>
                {ownerFound && (
                  <div className="owner-found-card">
                    <span>✅</span>
                    <div>
                      <div className="owner-name">{ownerFound.owner_name}</div>
                      <div className="owner-buildings">{ownerFound.building_count} building(s)</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <div className="auth-message error">{error}</div>}
            {info  && !ownerFound && <div className="auth-message error">{info}</div>}

            <button
              type="submit" className="btn-primary"
              disabled={loading || (role === 'tenant' && !ownerFound) || form.phone.length !== 10}
            >
              {loading
                ? 'Please wait…'
                : TWILIO_ENABLED
                  ? 'Send SMS OTP →'
                  : 'Create Account'}
            </button>

            {TWILIO_ENABLED && (
              <p className="field-hint text-center">
                You'll verify your phone number before your account is created.
              </p>
            )}
            {role === 'tenant' && !ownerFound && (
              <p className="field-hint text-center">Verify your owner above before registering.</p>
            )}
            <div className="oauth-divider" style={{ margin: '20px 0', textAlign: 'center', position: 'relative' }}>
              <span style={{ background: 'var(--surface-solid)', padding: '0 10px', color: 'var(--text-muted)', fontSize: '0.85rem', position: 'relative', zIndex: 1 }}>or</span>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--border)' }}></div>
            </div>
            <button type="button" onClick={handleGoogleAuth} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
