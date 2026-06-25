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
    .select('id, role, active, org_id')
    .eq('id', session.user.id)
    .maybeSingle()

  if (error) {
    throw redirect({
      to: '/login',
      search: { redirect: locationHref, setup: 'profile-read-error' } as never,
    })
  }

  if (!profile) {
    throw redirect({
      to: '/login',
      search: { redirect: locationHref, setup: 'missing-profile' } as never,
    })
  }

  if (profile.active === false) {
    throw redirect({
      to: '/login',
      search: { redirect: locationHref, setup: 'inactive-user' } as never,
    })
  }

  if (!profile.org_id || !profile.role) {
    throw redirect({
      to: '/login',
      search: { redirect: locationHref, setup: 'invalid-profile' } as never,
    })
  }

  return { session, profile: profile as Pick<UserProfile, 'id' | 'role' | 'active'> & { org_id: string } }
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
