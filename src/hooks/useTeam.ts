import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'
import type { UserProfile } from '@/contexts/AuthContext'

/*
 * P-7 findings before implementation:
 * - src/routes/authenticated/equipe.tsx rendered a legacy LocalDataProvider-backed team CRUD page
 *   using the old team shape (name, sector, email) and local create/update/delete methods, not the
 *   enterprise profiles table introduced for org-scoped users and roles.
 * - No /authenticated/configuracoes route currently exists.
 * - No /authenticated/meu-perfil or profile/perfil route currently exists.
 * - app-layout.tsx currently links Dashboard, Documentos, Projetos, Disciplinas, Projetistas,
 *   Equipe, Fluxo de Aprovação, and Trilha de Auditoria; P-7 narrows this to the presentable
 *   enterprise navigation and adds role-aware Configurações plus a footer Meu Perfil link.
 */

export interface TeamMember {
  id: string
  full_name: string
  role: UserProfile['role']
  department: string | null
  avatar_url: string | null
  active: boolean
  created_at: string
  email?: string
}

export function useTeam() {
  const { profile } = useAuthContext()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTeam = useCallback(async () => {
    if (!profile) {
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id, full_name, role, department, avatar_url, active, created_at')
        .eq('org_id', profile.org_id)
        .order('full_name', { ascending: true })

      if (queryError) throw queryError
      setMembers((data ?? []) as TeamMember[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar equipe')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    fetchTeam()
  }, [fetchTeam])

  async function updateMemberRole(memberId: string, newRole: UserProfile['role']): Promise<boolean> {
    if (!profile || profile.role !== 'admin') return false

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', memberId)
      .eq('org_id', profile.org_id)

    if (updateError) {
      setError(updateError.message)
      return false
    }

    await fetchTeam()
    return true
  }

  async function toggleMemberActive(memberId: string, active: boolean): Promise<boolean> {
    if (!profile || profile.role !== 'admin') return false

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', memberId)
      .eq('org_id', profile.org_id)

    if (updateError) {
      setError(updateError.message)
      return false
    }

    await fetchTeam()
    return true
  }

  async function updateMyProfile(updates: { full_name?: string; department?: string }): Promise<boolean> {
    if (!profile) return false

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', profile.id)

    if (updateError) {
      setError(updateError.message)
      return false
    }

    await fetchTeam()
    return true
  }

  return { members, loading, error, refetch: fetchTeam, updateMemberRole, toggleMemberActive, updateMyProfile }
}
