import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(undefined) // undefined = not yet known
  const [profile, setProfile] = useState(undefined) // undefined = not yet known
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // onAuthStateChange fires immediately with the current session state
    // (event = 'INITIAL_SESSION'). We use ONLY this — no separate getSession()
    // call — to avoid the race condition where both fire concurrently and
    // fetchingRef causes one to return early leaving loading=true forever.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!session) {
          // No session — definitively logged out
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        // Session exists — fetch the profile before unblocking the router
        setLoading(true)
        const authUser = session.user

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authUser.id)
            .single()

          if (error && error.code !== 'PGRST116') {
            // PGRST116 = no rows found — not a real error
            console.error('Profile fetch error:', error.message)
          }

          // Set both together — router never sees user without profile
          setUser(authUser)
          setProfile(data ?? null)
        } catch (err) {
          console.error('Profile fetch failed:', err.message)
          setUser(authUser)
          setProfile(null)
        } finally {
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

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
      isOwner:  profile?.role === 'owner',
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
