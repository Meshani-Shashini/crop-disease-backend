import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  signUp: (email: string, password: string, fullName: string, district: string, phone?: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching profile:', error)
      return null
    }
    return data as Profile | null
  }

  async function ensureProfile(authUser: User) {
    const existingProfile = await fetchProfile(authUser.id)
    if (existingProfile) return existingProfile

    const metadata = authUser.user_metadata ?? {}
    const { data, error } = await supabase.from('profiles').insert({
      id: authUser.id,
      email: authUser.email ?? '',
      fullname: metadata.full_name ?? '',
      phone: metadata.phone ?? null,
      district: metadata.district ?? '',
      role: 'user',
      is_active: true,
    }).select().maybeSingle()

    if (error) {
      console.error('Error creating profile:', error)
      return null
    }
    return data as Profile
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        ensureProfile(session.user).then((p) => {
          setProfile(p)
          setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      ;(async () => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          const p = await ensureProfile(session.user)
          setProfile(p)
        } else {
          setProfile(null)
        }
        setLoading(false)
      })()
    })
  }, [])

  const signUp: AuthContextValue['signUp'] = async (email, password, fullName, district, phone) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          district,
        },
      },
    })
    if (error) return { error: new Error(error.message) }
    if (data.user && data.session) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        fullname: fullName,
        district,
        phone: phone || null,
        role: 'user',
        is_active: true,
      })
      if (profileError) return { error: new Error(profileError.message) }
    }
    return { error: null }
  }

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: new Error(error.message) }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setUser(null)
    setSession(null)
  }

  const refreshProfile = async () => {
    if (!user) return
    const p = await ensureProfile(user)
    setProfile(p)
  }

  const resetPassword: AuthContextValue['resetPassword'] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    return { error: error ? new Error(error.message) : null }
  }

  const updateProfile: AuthContextValue['updateProfile'] = async (updates) => {
    if (!user) return { error: new Error('No user logged in') }
    const { error } = await supabase
      .from('profiles')
      .update({
        id: user.id,
        email: user.email ?? '',
        fullname: profile?.fullname || user.user_metadata?.full_name || '',
        district: profile?.district || user.user_metadata?.district || '',
        role: profile?.role || 'user',
        is_active: profile?.is_active ?? true,
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
    if (!error) setProfile((previous) => previous ? { ...previous, ...updates } : null)
    return { error: error ? new Error(error.message) : null }
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signUp, signIn, signOut, resetPassword, updateProfile, refreshProfile, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
