// frontend/src/hooks/useAuth.jsx
//
// FIX: Gemini Issue #1 — The Infinite Reload Loop
//
// Root cause: When onAuthStateChange fired, user was set immediately but
// profile was still null. ProtectedRoute saw loading=false + user exists +
// profile=null → profile?.role = undefined → redirected to /tenant →
// caught by ProtectedRoute role="tenant" → undefined !== 'tenant' →
// redirected again → infinite loop.
//
// Fix: loading stays TRUE until BOTH user AND profile are fully resolved.
// We never let the app render a protected route until we have a complete
// picture: either (user + profile) or (no user). Nothing in between.

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  // loading starts TRUE — app is blocked from routing until we know everything
  const [loading, setLoading] = useState(true)

  // Prevent duplicate fetches if the listener fires multiple times rapidly
  const fetchingRef = useRef(false)

  useEffect(() => {
    // ── 1. Check for an existing session on first load ──────────
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        resolveUserAndProfile(session.user)
      } else {
        // No session — we're definitely logged out, safe to render
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    // ── 2. Listen for auth changes (login, logout, token refresh) ─
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        if (session?.user) {
          // Keep loading=true while we fetch the profile
          // This prevents ProtectedRoute from running with incomplete state
          await resolveUserAndProfile(session.user)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // ── resolveUserAndProfile ───────────────────────────────────────
  // Sets user AND profile atomically, only clears loading when both are done.
  // If called multiple times rapidly (token refresh), the ref guard prevents
  // duplicate concurrent fetches.
  const resolveUserAndProfile = async (authUser) => {
    if (fetchingRef.current) return
    fetchingRef.current = true

    // Set loading true BEFORE any state updates to block routing
    setLoading(true)

    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = "no rows" — profile may not exist yet (race with trigger)
        console.error('Profile fetch error:', error.message)
      }

      // Set user and profile TOGETHER before clearing loading
      // This ensures ProtectedRoute always sees a consistent state
      setUser(authUser)
      setProfile(profileData ?? null)
    } catch (err) {
      console.error('resolveUserAndProfile error:', err)
      setUser(authUser)
      setProfile(null)
    } finally {
      // Only NOW is it safe to let the router evaluate routes
      setLoading(false)
      fetchingRef.current = false
    }
  }

  const refreshProfile = async () => {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(data ?? null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isOwner: profile?.role === 'owner',
      isTenant: profile?.role === 'tenant',
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
