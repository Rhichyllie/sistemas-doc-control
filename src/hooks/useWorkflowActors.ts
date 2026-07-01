import { useCallback, useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { USER_ROLES } from '@/lib/constants'
import { getErrorMessage } from '@/lib/errorUtils'
import { isWorkflowFoundationUnavailable } from '@/lib/workflowCompatibility'

export interface WorkflowActorUser {
  id: string
  full_name: string
  role: string
  department: string | null
  active: boolean
}

export interface ApprovalGroup {
  id: string
  org_id: string
  code: string
  name: string
  description: string | null
  scope: string
  project_id: string | null
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface ApprovalGroupCompatibilityRow {
  id: string
  org_id: string
  code?: string | null
  name: string
  description?: string | null
  scope?: string | null
  project_id?: string | null
  is_active?: boolean | null
  active?: boolean | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

export interface ApprovalGroupMember {
  id: string
  org_id: string
  group_id: string
  user_id: string
  role: string
  is_active: boolean
  created_at: string
}

interface ApprovalGroupMemberCompatibilityRow {
  id: string
  org_id: string
  group_id: string
  user_id?: string | null
  profile_id?: string | null
  role?: string | null
  role_in_group?: string | null
  is_active?: boolean | null
  active?: boolean | null
  created_at: string
}

function normalizeGroupMember(
  member: ApprovalGroupMemberCompatibilityRow,
): ApprovalGroupMember | null {
  const userId = member.user_id ?? member.profile_id
  if (!userId) return null

  return {
    id: member.id,
    org_id: member.org_id,
    group_id: member.group_id,
    user_id: userId,
    role: member.role ?? member.role_in_group ?? 'member',
    is_active: member.is_active ?? member.active ?? true,
    created_at: member.created_at,
  }
}

function normalizeApprovalGroup(group: ApprovalGroupCompatibilityRow): ApprovalGroup {
  const createdAt = group.created_at ?? new Date(0).toISOString()
  return {
    id: group.id,
    org_id: group.org_id,
    code: group.code ?? '',
    name: group.name,
    description: group.description ?? null,
    scope: group.scope ?? 'organization',
    project_id: group.project_id ?? null,
    is_active: group.is_active ?? group.active ?? true,
    metadata: group.metadata ?? {},
    created_at: createdAt,
    updated_at: group.updated_at ?? createdAt,
  }
}

export const WORKFLOW_ROLES = USER_ROLES.filter((role) =>
  ['reviewer', 'approver', 'manager', 'admin'].includes(role.value),
)

export function useWorkflowActors() {
  const { profile } = useAuthContext()
  const [users, setUsers] = useState<WorkflowActorUser[]>([])
  const [groups, setGroups] = useState<ApprovalGroup[]>([])
  const [groupMembers, setGroupMembers] = useState<ApprovalGroupMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canUseGroups, setCanUseGroups] = useState(false)
  const [compatibilityMessage, setCompatibilityMessage] = useState<string | null>(null)

  const fetchActors = useCallback(async () => {
    if (!profile) {
      setUsers([])
      setGroups([])
      setGroupMembers([])
      setCanUseGroups(false)
      setCompatibilityMessage(null)
      setIsLoading(false)
      return
    }

    const currentProfile = profile
    setIsLoading(true)
    setError(null)
    setUsers([])
    setGroups([])
    setGroupMembers([])
    setCanUseGroups(false)
    setCompatibilityMessage(null)

    try {
      const { data: userData, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, role, department, active')
        .eq('org_id', currentProfile.org_id)
        .eq('active', true)
        .order('full_name', { ascending: true })

      if (usersError) throw usersError
      setUsers((userData ?? []) as WorkflowActorUser[])

      const enterpriseGroupsResult = await supabase
        .from('approval_groups')
        .select('id, org_id, code, name, description, scope, project_id, is_active, metadata, created_at, updated_at')
        .eq('org_id', currentProfile.org_id)
        .eq('is_active', true)
        .order('name', { ascending: true })

      let groupData = enterpriseGroupsResult.data as ApprovalGroupCompatibilityRow[] | null
      let usedLegacyGroupSchema = false

      if (enterpriseGroupsResult.error && isWorkflowFoundationUnavailable(enterpriseGroupsResult.error)) {
        const legacyGroupsResult = await supabase
          .from('approval_groups')
          .select('id, org_id, code, name, description, active, created_at')
          .eq('org_id', currentProfile.org_id)
          .eq('active', true)
          .order('name', { ascending: true })

        if (!legacyGroupsResult.error) {
          groupData = legacyGroupsResult.data as ApprovalGroupCompatibilityRow[] | null
          usedLegacyGroupSchema = true
        } else if (isWorkflowFoundationUnavailable(legacyGroupsResult.error)) {
          const p9aGroupsResult = await supabase
            .from('approval_groups')
            .select('id, org_id, name, description, scope, project_id, is_active, metadata, created_at, updated_at')
            .eq('org_id', currentProfile.org_id)
            .eq('is_active', true)
            .order('name', { ascending: true })

          if (!p9aGroupsResult.error) {
            groupData = p9aGroupsResult.data as ApprovalGroupCompatibilityRow[] | null
          } else if (isWorkflowFoundationUnavailable(p9aGroupsResult.error)) {
            setGroups([])
            setGroupMembers([])
            setCanUseGroups(false)
            setCompatibilityMessage(
              'Grupos de aprovação não estão disponíveis. O workflow continua operando por papel ou usuário.',
            )
            return
          } else {
            throw p9aGroupsResult.error
          }
        } else {
          throw legacyGroupsResult.error
        }
      } else if (enterpriseGroupsResult.error) {
        throw enterpriseGroupsResult.error
      }

      const { data: enterpriseMemberData, error: enterpriseMembersError } = await supabase
        .from('approval_group_members')
        .select('id, org_id, group_id, user_id, role, is_active, created_at')
        .eq('org_id', currentProfile.org_id)
        .eq('is_active', true)

      let memberData = enterpriseMemberData as ApprovalGroupMemberCompatibilityRow[] | null
      let usedLegacyMemberSchema = false

      if (enterpriseMembersError && isWorkflowFoundationUnavailable(enterpriseMembersError)) {
        const { data: legacyMemberData, error: legacyMembersError } = await supabase
          .from('approval_group_members')
          .select('id, org_id, group_id, profile_id, role_in_group, active, created_at')
          .eq('org_id', currentProfile.org_id)
          .eq('active', true)

        if (!legacyMembersError) {
          memberData = legacyMemberData as ApprovalGroupMemberCompatibilityRow[] | null
          usedLegacyMemberSchema = true
        } else if (isWorkflowFoundationUnavailable(legacyMembersError)) {
          setGroups((groupData ?? []).map(normalizeApprovalGroup))
          setGroupMembers([])
          setCanUseGroups(false)
          setCompatibilityMessage(
            'Os grupos existem, mas seus membros ainda não estão disponíveis. Atribuições por grupo foram desativadas.',
          )
          return
        } else {
          throw legacyMembersError
        }
      } else if (enterpriseMembersError) {
        throw enterpriseMembersError
      }

      setGroups((groupData ?? []).map(normalizeApprovalGroup))
      setGroupMembers(
        (memberData ?? [])
          .map(normalizeGroupMember)
          .filter((member): member is ApprovalGroupMember => Boolean(member)),
      )
      setCanUseGroups(true)
      if (usedLegacyGroupSchema || usedLegacyMemberSchema) {
        setCompatibilityMessage(
          'Grupos disponíveis em schema legado compatível. Papel e usuário continuam alternativas independentes no roteamento.',
        )
      }
    } catch (err: unknown) {
      setGroups([])
      setGroupMembers([])
      setCanUseGroups(false)
      setError(getErrorMessage(err, 'Erro ao carregar atores do workflow'))
    } finally {
      setIsLoading(false)
    }
  }, [profile])

  useEffect(() => {
    fetchActors()
  }, [fetchActors])

  return {
    users,
    groups,
    groupMembers,
    roles: WORKFLOW_ROLES,
    isLoading,
    error,
    canUseGroups,
    compatibilityMessage,
    refetch: fetchActors,
  }
}
