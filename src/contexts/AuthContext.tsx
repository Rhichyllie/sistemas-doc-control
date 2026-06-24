import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// P-3 auth findings:
// - src/hooks/useAuth.ts only tracked the Supabase session and had no profile/org state.
// - src/hooks/use-auth.ts and src/hooks/use-supabase-auth.ts each owned separate auth state.
// - src/components/auth-page.tsx already rendered the login/signup/recovery forms.
// - src/contexts/local-data-context.tsx needs user/isAuthenticated/roles to load data.
// - src/routes/authenticated/route.tsx is the shared TanStack layout for protected routes.

export interface UserProfile {
  id: string
  org_id: string
  full_name: string
  role: 'admin' | 'manager' | 'approver' | 'reviewer' | 'author' | 'viewer'
  department: string | null
  avatar_url: string | null
  active: boolean
}

export interface OrgInfo {
  id: string
  name: string
  slug: string
  sector: string
  code_prefix: string
  logo_url: string | null
}

interface LegacyResult<T = unknown> {
  success: boolean
  error?: string
  user?: T | null
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  org: OrgInfo | null
  loading: boolean
  role: UserProfile['role'] | null
  roles: UserProfile['role'][]
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  hasRole: (roles: UserProfile['role'][]) => boolean
  login: (email: string, password: string) => Promise<LegacyResult<User>>
  logout: () => Promise<void>
  signup: (email: string, fullName: string, password: string) => Promise<LegacyResult<User>>
  checkEmailExists: (email: string) => Promise<boolean>
  resetPassword: (email: string, newPassword?: string) => Promise<LegacyResult>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfileAndOrg(userId: string) {
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select(`
        id, org_id, full_name, role, department, avatar_url, active,
        organizations (
          id, name, slug, sector, code_prefix, logo_url
        )
      `)
      .eq('id', userId)
      .single()

    if (error || !profileData) {
      console.error('Failed to load profile:', error)
      setProfile(null)
      setOrg(null)
      return
    }

    setProfile({
      id: profileData.id,
      org_id: profileData.org_id,
      full_name: profileData.full_name,
      role: profileData.role as UserProfile['role'],
      department: profileData.department,
      avatar_url: profileData.avatar_url,
      active: profileData.active,
    })

    const orgData = Array.isArray(profileData.organizations)
      ? profileData.organizations[0]
      : profileData.organizations
    if (orgData) setOrg(orgData as OrgInfo)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfileAndOrg(session.user.id).finally(() => setLoading(false))
      } else {
        setProfile(null)
        setOrg(null)
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadProfileAndOrg(session.user.id)
        } else {
          setProfile(null)
          setOrg(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
    setOrg(null)
  }

  function hasRole(roles: UserProfile['role'][]): boolean {
    if (!profile) return false
    return roles.includes(profile.role)
  }

  async function login(email: string, password: string): Promise<LegacyResult<User>> {
    const { error } = await signIn(email, password)
    if (error) return { success: false, error: translateAuthError(error.message) }
    return { success: true, user }
  }

  async function signup(email: string, fullName: string, password: string): Promise<LegacyResult<User>> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) return { success: false, error: translateAuthError(error.message) }
    return { success: true, user: data.user }
  }

  async function checkEmailExists(email: string) {
    const { data } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
    return !!data
  }

  async function resetPassword(email: string, newPassword?: string): Promise<LegacyResult> {
    const { error } = newPassword
      ? await supabase.auth.updateUser({ password: newPassword })
      : await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` })
    if (error) return { success: false, error: translateAuthError(error.message) }
    return { success: true }
  }

  const role = profile?.role ?? null
  const value: AuthContextValue = {
    user,
    session,
    profile,
    org,
    loading,
    role,
    roles: role ? [role] : [],
    isAuthenticated: !!session,
    signIn,
    signOut,
    hasRole,
    login,
    logout: signOut,
    signup,
    checkEmailExists,
    resetPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}

export { useAuthContext as useAuth }

function translateAuthError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos'
  if (msg.includes('Email not confirmed')) return 'E-mail não confirmado'
  if (msg.includes('User already registered')) return 'E-mail já cadastrado'
  if (msg.includes('Password should be at least')) return 'A senha deve ter pelo menos 6 caracteres'
  return msg
}
