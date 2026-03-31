import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, signIn, signUp, findOwnerByCredentials } from '../lib/supabase'

// ── Auth flow overview ────────────────────────────────────
//
// REGISTRATION (Owner or Tenant):
//   Step 1: Fill in name, phone, email, password
//   Step 2: (Tenant only) Verify owner via email + phone lookup
//   Step 3: Submit → Supabase sends email verification link
//   Step 4: User clicks email link → email verified
//   Step 5: Phone OTP sent to their number via Twilio (Supabase handles this)
//   Step 6: User enters 6-digit SMS OTP → fully verified, profile created
//
// LOGIN:
//   Email + password → if phone not yet verified, prompt OTP again
//   On success → redirect to /owner or /tenant based on role
//
// The phone OTP step uses Supabase's built-in phone auth with Twilio.
// Make sure Twilio is configured in Supabase Dashboard → Auth → Providers → Phone.
// ─────────────────────────────────────────────────────────

export default function AuthPage() {
  const navigate = useNavigate()

  // mode: 'login' | 'signup' | 'email_sent' | 'phone_otp'
  const [mode, setMode] = useState('login')
  const [role, setRole] = useState('tenant')

  const [form, setForm] = useState({
    email: '', password: '', fullName: '', phone: '',
    ownerEmail: '', ownerPhone: ''
  })

  const [ownerFound, setOwnerFound] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  // Phone OTP state
  const [otpPhone, setOtpPhone] = useState('')      // +91XXXXXXXXXX format
  const [otpCode, setOtpCode] = useState('')
  const [otpToken, setOtpToken] = useState('')      // Supabase OTP token
  const [pendingUserEmail, setPendingUserEmail] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const formatPhone = (raw) => {
    // Always store as +91XXXXXXXXXX for Twilio
    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('91') && digits.length === 12) return `+${digits}`
    if (digits.length === 10) return `+91${digits}`
    return `+${digits}`
  }

  // ── Login ─────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data, error: err } = await signIn({ email: form.email, password: form.password })
    if (err) { setError(err.message); setLoading(false); return }
    navigate(data.user?.user_metadata?.role === 'owner' ? '/owner' : '/tenant')
    setLoading(false)
  }

  // ── Owner lookup (tenant step) ────────────────────────
  const handleLookupOwner = async () => {
    if (!form.ownerEmail || !form.ownerPhone) { setError('Enter both owner email and phone.'); return }
    setError(''); setLoading(true)
    const { data, error: err } = await findOwnerByCredentials(form.ownerEmail, form.ownerPhone)
    setLoading(false)
    if (err || !data?.length) {
      setError('Owner not found. Double-check the email and phone number.')
      setOwnerFound(null); return
    }
    setOwnerFound(data[0])
    setInfo(`✅ Owner found: ${data[0].owner_name} (${data[0].building_count} building(s))`)
  }

  // ── Sign up → triggers email verification ─────────────
  const handleSignup = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)

    const phoneDigits = form.phone.replace(/\D/g, '')
    if (phoneDigits.length !== 10) {
      setError('Phone must be exactly 10 digits.'); setLoading(false); return
    }
    if (role === 'tenant' && !ownerFound) {
      setError('Please verify your owner first.'); setLoading(false); return
    }

    const { error: err } = await signUp({
      email: form.email,
      password: form.password,
      fullName: form.fullName,
      role,
      phone: phoneDigits
    })

    if (err) { setError(err.message); setLoading(false); return }

    setPendingUserEmail(form.email)
    setOtpPhone(formatPhone(form.phone))
    setMode('email_sent')
    setLoading(false)
  }

  // ── Send phone OTP (called after email is verified) ───
  // User clicks "I've verified my email, send me SMS OTP"
  const handleSendPhoneOTP = async () => {
    setError(''); setLoading(true)

    // Supabase sends SMS via Twilio to the phone number
    const { data, error: err } = await supabase.auth.signInWithOtp({
      phone: otpPhone
    })

    if (err) { setError(err.message); setLoading(false); return }

    setInfo(`SMS sent to ${otpPhone}`)
    setMode('phone_otp')
    setLoading(false)
  }

  // ── Verify phone OTP ──────────────────────────────────
  const handleVerifyPhoneOTP = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)

    const { data, error: err } = await supabase.auth.verifyOtp({
      phone: otpPhone,
      token: otpCode,
      type: 'sms'
    })

    if (err) { setError('Invalid OTP. Please try again.'); setLoading(false); return }

    // OTP verified — navigate based on role
    const userRole = data.user?.user_metadata?.role
    navigate(userRole === 'owner' ? '/owner' : '/tenant')
    setLoading(false)
  }

  // ── Resend phone OTP ──────────────────────────────────
  const handleResendOTP = async () => {
    setError(''); setLoading(true)
    const { error: err } = await supabase.auth.signInWithOtp({ phone: otpPhone })
    if (err) setError(err.message)
    else setInfo('OTP resent!')
    setLoading(false)
  }

  // ── Resend email verification ─────────────────────────
  const handleResendEmail = async () => {
    setLoading(true)
    const { error: err } = await supabase.auth.resend({ type: 'signup', email: pendingUserEmail })
    if (err) setError(err.message)
    else setInfo('Verification email resent!')
    setLoading(false)
  }

  const reset = () => {
    setMode('login'); setError(''); setInfo(''); setOtpCode('')
    setOwnerFound(null); setForm({ email: '', password: '', fullName: '', phone: '', ownerEmail: '', ownerPhone: '' })
  }

  // ─────────────────────────────────────────────────────
  // RENDER: Email sent screen
  // ─────────────────────────────────────────────────────
  if (mode === 'email_sent') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand"><span className="brand-icon">🏢</span><h1>RentFlow</h1></div>
          <div className="verify-box">
            <div className="verify-icon">📧</div>
            <h2>Verify Your Email</h2>
            <p>We sent a verification link to <strong>{pendingUserEmail}</strong>.</p>
            <p>Click the link, then come back here to complete phone verification.</p>
            {info && <div className="auth-message success">{info}</div>}
            {error && <div className="auth-message error">{error}</div>}
            <button className="btn-primary" onClick={handleResendEmail} disabled={loading}>
              {loading ? 'Sending…' : '📨 Resend Email'}
            </button>
            <div className="otp-divider">After clicking the email link</div>
            <button className="btn-primary" onClick={handleSendPhoneOTP} disabled={loading}>
              {loading ? 'Sending SMS…' : `📱 Send SMS OTP to ${otpPhone}`}
            </button>
            <button className="btn-secondary" onClick={reset}>← Back to Sign In</button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────
  // RENDER: Phone OTP entry screen
  // ─────────────────────────────────────────────────────
  if (mode === 'phone_otp') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand"><span className="brand-icon">🏢</span><h1>RentFlow</h1></div>
          <div className="verify-box">
            <div className="verify-icon">📱</div>
            <h2>Enter SMS OTP</h2>
            <p>A 6-digit code was sent to <strong>{otpPhone}</strong> via SMS.</p>
            {info && <div className="auth-message success">{info}</div>}
            {error && <div className="auth-message error">{error}</div>}
            <form onSubmit={handleVerifyPhoneOTP} className="auth-form">
              <div className="form-group">
                <label>6-Digit OTP</label>
                <input
                  type="text" inputMode="numeric" placeholder="123456"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6} required className="otp-input"
                />
              </div>
              <button type="submit" className="btn-primary" disabled={loading || otpCode.length !== 6}>
                {loading ? 'Verifying…' : '✅ Verify Phone'}
              </button>
            </form>
            <button className="btn-secondary" onClick={handleResendOTP} disabled={loading}>
              {loading ? 'Sending…' : '🔄 Resend OTP'}
            </button>
            <button className="btn-secondary" onClick={reset}>← Start Over</button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────
  // RENDER: Main login / signup form
  // ─────────────────────────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-icon">🏢</span>
          <h1>RentFlow</h1>
          <p>Property Management, Simplified</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setInfo('') }}>
            Sign In
          </button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setInfo('') }}>
            Register
          </button>
        </div>

        {/* ── LOGIN FORM ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" value={form.email} onChange={e => set('email', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
            </div>
            {error && <div className="auth-message error">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {/* ── SIGNUP FORM ── */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="auth-form">

            {/* Role */}
            <div className="form-group">
              <label>I am a</label>
              <div className="role-selector">
                <button type="button" className={role === 'owner' ? 'active' : ''} onClick={() => { setRole('owner'); setOwnerFound(null); setInfo('') }}>
                  🏠 Owner
                </button>
                <button type="button" className={role === 'tenant' ? 'active' : ''} onClick={() => { setRole('tenant'); setOwnerFound(null); setInfo('') }}>
                  👤 Tenant
                </button>
              </div>
            </div>

            {/* Name */}
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" placeholder="Your full name" value={form.fullName} onChange={e => set('fullName', e.target.value)} required />
            </div>

            {/* Phone */}
            <div className="form-group">
              <label>Phone Number (10 digits) — used for SMS OTP</label>
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
                <span className="field-hint success-hint">✓ SMS OTP will be sent to +91{form.phone}</span>
              )}
            </div>

            {/* Email */}
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" value={form.email} onChange={e => set('email', e.target.value)} required />
            </div>

            {/* Password */}
            <div className="form-group">
              <label>Password (min 6 characters)</label>
              <input type="password" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
            </div>

            {/* Tenant: owner lookup */}
            {role === 'tenant' && (
              <div className="owner-lookup-box">
                <div className="lookup-title">🔍 Find Your Owner</div>
                <p className="lookup-desc">
                  Enter your owner's registered email and phone number to link your account to their property.
                </p>
                <div className="form-group">
                  <label>Owner's Email</label>
                  <input type="email" placeholder="owner@email.com" value={form.ownerEmail} onChange={e => { set('ownerEmail', e.target.value); setOwnerFound(null); setInfo('') }} />
                </div>
                <div className="form-group">
                  <label>Owner's Phone (10 digits)</label>
                  <input
                    type="tel" placeholder="9876543210" value={form.ownerPhone}
                    onChange={e => { set('ownerPhone', e.target.value.replace(/\D/g, '').slice(0, 10)); setOwnerFound(null); setInfo('') }}
                    maxLength={10}
                  />
                </div>
                <button type="button" className="btn-secondary" onClick={handleLookupOwner} disabled={loading}>
                  {loading ? 'Searching…' : '🔍 Verify Owner'}
                </button>
                {info && !ownerFound && <div className="auth-message error">{error || info}</div>}
                {ownerFound && (
                  <div className="owner-found-card">
                    <span>✅</span>
                    <div>
                      <div className="owner-name">{ownerFound.owner_name}</div>
                      <div className="owner-buildings">{ownerFound.building_count} building(s) registered</div>
                    </div>
                  </div>
                )}
                {info && ownerFound && <div className="auth-message success">{info}</div>}
              </div>
            )}

            {error && <div className="auth-message error">{error}</div>}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || (role === 'tenant' && !ownerFound) || form.phone.length !== 10}
            >
              {loading ? 'Creating account…' : 'Create Account & Send Email Verification'}
            </button>

            <p className="field-hint text-center">
              After registering: verify email → then verify phone via SMS OTP
            </p>
            {role === 'tenant' && !ownerFound && (
              <p className="field-hint text-center">Verify your owner above before registering.</p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
