import { redirect } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'
import type { UserProfile } from '@/contexts/AuthContext'
import { can, type Permission } from '@/lib/permissions'

// P-3 route findings: all private screens are children of /authenticated,
// so this file centralizes Supabase session/profile checks for beforeLoad guards.
export async function requireAuthenticated(locationHref: string) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw redirect({
      to: '/login',
      search: { redirect: locationHref } as never,
    })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', session.user.id)
    .single()

  if (error || !profile?.active) {
    await supabase.auth.signOut()
    throw redirect({
      to: '/login',
      search: { redirect: locationHref } as never,
    })
  }

  return { session, profile: profile as Pick<UserProfile, 'id' | 'role' | 'active'> }
}

export async function requireRole(locationHref: string, roles: UserProfile['role'][]) {
  const { profile } = await requireAuthenticated(locationHref)
  if (!roles.includes(profile.role)) {
    throw redirect({ to: '/authenticated/dashboard' })
  }
}

export async function requirePermission(locationHref: string, permission: Permission) {
  const { profile } = await requireAuthenticated(locationHref)
  if (!can(profile.role, permission)) {
    throw redirect({ to: '/authenticated/dashboard' })
  }
}
