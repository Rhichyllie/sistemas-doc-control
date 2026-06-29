import { useCallback, useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errorUtils'
import { isWorkflowFoundationUnavailable } from '@/lib/workflowCompatibility'

export interface ApprovalGroupRecord {
  id: string
  org_id: string
  name: string
  description: string | null
  scope: string
  project_id: string | null
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ApprovalGroupMemberRecord {
  id: string
  org_id: string
  group_id: string
  user_id: string
  role: string
  is_active: boolean
  created_at: string
}

export interface ApprovalGroupUser {
  id: string
  full_name: string
  email: string | null
  role: string
  active: boolean
}

export interface ApprovalGroupInput {
  name: string
  description?: string | null
  scope?: string
  project_id?: string | null
  is_active?: boolean
}

function compatibilityText() {
  return 'Grupos de aprovação ainda não estão disponíveis neste ambiente. Aplique a migration P-9A para habilitar a administração.'
}

export function useApprovalGroups(enabled = true) {
  const { profile } = useAuthContext()
  const [groups, setGroups] = useState<ApprovalGroupRecord[]>([])
  const [members, setMembers] = useState<ApprovalGroupMemberRecord[]>([])
  const [users, setUsers] = useState<ApprovalGroupUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canUseGroups, setCanUseGroups] = useState(false)
  const [canManageMembers, setCanManageMembers] = useState(false)
  const [compatibilityMessage, setCompatibilityMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled || !profile?.org_id) {
      setGroups([])
      setMembers([])
      setUsers([])
      setCanUseGroups(false)
      setCanManageMembers(false)
      setCompatibilityMessage(null)
      setIsLoading(false)
      return
    }

    const currentProfile = profile
    setIsLoading(true)
    setError(null)
    setCompatibilityMessage(null)

    try {
      const { data: userData, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, active')
        .eq('org_id', currentProfile.org_id)
        .eq('active', true)
        .order('full_name', { ascending: true })

      if (usersError) throw usersError
      setUsers((userData ?? []) as ApprovalGroupUser[])

      const { data: groupData, error: groupsError } = await supabase
        .from('approval_groups')
        .select('id, org_id, name, description, scope, project_id, is_active, metadata, created_at, updated_at')
        .eq('org_id', currentProfile.org_id)
        .order('is_active', { ascending: false })
        .order('name', { ascending: true })

      if (groupsError) {
        if (isWorkflowFoundationUnavailable(groupsError)) {
          setGroups([])
          setMembers([])
          setCanUseGroups(false)
          setCanManageMembers(false)
          setCompatibilityMessage(compatibilityText())
          return
        }
        throw groupsError
      }

      setGroups((groupData ?? []) as ApprovalGroupRecord[])
      setCanUseGroups(true)

      const { data: memberData, error: membersError } = await supabase
        .from('approval_group_members')
        .select('id, org_id, group_id, user_id, role, is_active, created_at')
        .eq('org_id', currentProfile.org_id)
        .order('created_at', { ascending: true })

      if (membersError) {
        if (isWorkflowFoundationUnavailable(membersError)) {
          setMembers([])
          setCanManageMembers(false)
          setCompatibilityMessage(
            'Os grupos podem ser consultados, mas a tabela de membros ainda não está disponível.',
          )
          return
        }
        throw membersError
      }

      setMembers((memberData ?? []) as ApprovalGroupMemberRecord[])
      setCanUseGroups(true)
      setCanManageMembers(true)
    } catch (err: unknown) {
      setGroups([])
      setMembers([])
      setCanUseGroups(false)
      setCanManageMembers(false)
      setError(getErrorMessage(err, 'Erro ao carregar grupos de aprovação'))
    } finally {
      setIsLoading(false)
    }
  }, [enabled, profile])

  useEffect(() => {
    refresh()
  }, [refresh])

  function requireOrganization() {
    if (!profile?.org_id) {
      setError('Perfil sem organização disponível para gerenciar grupos.')
      return null
    }
    return profile.org_id
  }

  function handleMutationError(err: unknown, fallback: string) {
    if (isWorkflowFoundationUnavailable(err)) {
      setCanUseGroups(false)
      setCanManageMembers(false)
      setCompatibilityMessage(compatibilityText())
    }
    setError(getErrorMessage(err, fallback))
  }

  async function createGroup(input: ApprovalGroupInput) {
    const orgId = requireOrganization()
    if (!orgId || !canUseGroups) return false

    setError(null)
    const { error: mutationError } = await supabase.from('approval_groups').insert({
      org_id: orgId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      scope: input.scope ?? 'organization',
      project_id: input.project_id ?? null,
      is_active: input.is_active ?? true,
      metadata: {},
    })

    if (mutationError) {
      handleMutationError(mutationError, 'Erro ao criar grupo de aprovação')
      return false
    }

    await refresh()
    return true
  }

  async function updateGroup(groupId: string, input: Partial<ApprovalGroupInput>) {
    const orgId = requireOrganization()
    if (!orgId || !canUseGroups) return false

    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) updates.name = input.name.trim()
    if (input.description !== undefined) updates.description = input.description?.trim() || null
    if (input.scope !== undefined) updates.scope = input.scope
    if (input.project_id !== undefined) updates.project_id = input.project_id
    if (input.is_active !== undefined) updates.is_active = input.is_active

    setError(null)
    const { error: mutationError } = await supabase
      .from('approval_groups')
      .update(updates)
      .eq('id', groupId)
      .eq('org_id', orgId)

    if (mutationError) {
      handleMutationError(mutationError, 'Erro ao atualizar grupo de aprovação')
      return false
    }

    await refresh()
    return true
  }

  async function deactivateGroup(groupId: string) {
    return updateGroup(groupId, { is_active: false })
  }

  async function addMember(groupId: string, userId: string, role = 'member') {
    const orgId = requireOrganization()
    if (!orgId || !canManageMembers) return false

    const existingMember = members.find(
      (member) => member.group_id === groupId && member.user_id === userId,
    )
    setError(null)

    const result = existingMember
      ? await supabase
          .from('approval_group_members')
          .update({ role, is_active: true })
          .eq('id', existingMember.id)
          .eq('org_id', orgId)
      : await supabase.from('approval_group_members').insert({
          org_id: orgId,
          group_id: groupId,
          user_id: userId,
          role,
          is_active: true,
        })

    if (result.error) {
      handleMutationError(result.error, 'Erro ao adicionar membro ao grupo')
      return false
    }

    await refresh()
    return true
  }

  async function removeMember(memberId: string) {
    const orgId = requireOrganization()
    if (!orgId || !canManageMembers) return false

    setError(null)
    const { error: mutationError } = await supabase
      .from('approval_group_members')
      .update({ is_active: false })
      .eq('id', memberId)
      .eq('org_id', orgId)

    if (mutationError) {
      handleMutationError(mutationError, 'Erro ao remover membro do grupo')
      return false
    }

    await refresh()
    return true
  }

  async function updateMemberRole(memberId: string, role: string) {
    const orgId = requireOrganization()
    if (!orgId || !canManageMembers) return false

    setError(null)
    const { error: mutationError } = await supabase
      .from('approval_group_members')
      .update({ role })
      .eq('id', memberId)
      .eq('org_id', orgId)

    if (mutationError) {
      handleMutationError(mutationError, 'Erro ao alterar papel do membro')
      return false
    }

    await refresh()
    return true
  }

  return {
    groups,
    members,
    users,
    isLoading,
    error,
    canUseGroups,
    canManageMembers,
    compatibilityMessage,
    createGroup,
    updateGroup,
    deactivateGroup,
    addMember,
    removeMember,
    updateMemberRole,
    refresh,
  }
}
