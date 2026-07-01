import { useCallback, useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errorUtils'
import {
  normalizeApprovalGroupCode,
  suggestApprovalGroupCode,
  validateApprovalGroupInput,
} from '@/lib/approvalGroupUtils'
import { isWorkflowFoundationUnavailable } from '@/lib/workflowCompatibility'

export type ApprovalGroupsSchemaStatus =
  | 'schema_missing'
  | 'schema_partial'
  | 'schema_incompatible'
  | 'available'
  | 'rls_blocked'
  | 'empty'
  | 'legacy_repair_needed'

export interface ApprovalGroupRecord {
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
  code: string
  description?: string | null
  scope?: string
  project_id?: string | null
  is_active?: boolean
}

type ApprovalGroupSchema = 'enterprise' | 'legacy' | 'without_code' | 'partial'
type ApprovalGroupMemberSchema = 'enterprise' | 'legacy'

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

interface GroupLoadResult {
  rows: ApprovalGroupCompatibilityRow[]
  schema: ApprovalGroupSchema
}

function normalizeGroup(
  group: ApprovalGroupCompatibilityRow,
): ApprovalGroupRecord {
  const createdAt = group.created_at ?? new Date(0).toISOString()

  return {
    id: group.id,
    org_id: group.org_id,
    code: normalizeApprovalGroupCode(group.code ?? '') || suggestApprovalGroupCode(group.name),
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

function normalizeGroupMember(
  member: ApprovalGroupMemberCompatibilityRow,
): ApprovalGroupMemberRecord | null {
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

function errorText(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const record = error as Record<string, unknown>
  return [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const code = (error as Record<string, unknown>).code
  return typeof code === 'string' ? code : ''
}

function isRlsOrPermissionError(error: unknown) {
  const text = errorText(error)
  return errorCode(error) === '42501'
    || text.includes('row-level security')
    || text.includes('permission denied')
    || text.includes('violates row-level security')
}

function isMissingApprovalGroupsTable(error: unknown) {
  const text = errorText(error)
  return (
    errorCode(error) === '42P01'
    || errorCode(error) === 'PGRST205'
    || (
      text.includes('approval_groups')
      && (text.includes('does not exist') || text.includes('schema cache'))
    )
  )
}

function isDuplicateGroupCode(error: unknown) {
  const text = errorText(error)
  return errorCode(error) === '23505'
    || (text.includes('duplicate key') && text.includes('code'))
}

function groupDiagnosticMessage(
  status: ApprovalGroupsSchemaStatus,
  usedLegacyMembers = false,
) {
  if (status === 'schema_missing') {
    return 'As tabelas de grupos não foram encontradas. Revise os ciclos P-9A/08 antes de administrar grupos.'
  }
  if (status === 'schema_partial') {
    return 'O cadastro de grupos existe, mas o contrato de membros está incompleto. Grupos continuam opcionais e o roteamento por papel ou usuário permanece disponível.'
  }
  if (status === 'schema_incompatible') {
    return 'O cadastro de grupos existe, mas falta o contrato mínimo de código obrigatório. Aplique o repair P-9A.1 para habilitar novas gravações.'
  }
  if (status === 'rls_blocked') {
    return 'As tabelas existem, mas a leitura foi bloqueada por política de acesso. Verifique organização, papel e policies de grupos.'
  }
  if (status === 'legacy_repair_needed') {
    return usedLegacyMembers
      ? 'Grupos disponíveis em schema legado. Os aliases de membros e o código obrigatório são tratados por compatibilidade; aplique o repair P-9A.1 para defesa adicional no banco.'
      : 'Grupos disponíveis em schema legado. Esta versão já envia o código obrigatório; o repair P-9A.1 adiciona defesa no banco.'
  }
  return null
}

export function useApprovalGroups(enabled = true) {
  const { profile } = useAuthContext()
  const [groups, setGroups] = useState<ApprovalGroupRecord[]>([])
  const [members, setMembers] = useState<ApprovalGroupMemberRecord[]>([])
  const [users, setUsers] = useState<ApprovalGroupUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canUseGroups, setCanUseGroups] = useState(false)
  const [canCreateGroups, setCanCreateGroups] = useState(false)
  const [canManageMembers, setCanManageMembers] = useState(false)
  const [groupSchema, setGroupSchema] = useState<ApprovalGroupSchema>('enterprise')
  const [memberSchema, setMemberSchema] = useState<ApprovalGroupMemberSchema>('enterprise')
  const [schemaStatus, setSchemaStatus] = useState<ApprovalGroupsSchemaStatus>('schema_missing')
  const [compatibilityMessage, setCompatibilityMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled || !profile?.org_id) {
      setGroups([])
      setMembers([])
      setUsers([])
      setCanUseGroups(false)
      setCanCreateGroups(false)
      setCanManageMembers(false)
      setSchemaStatus(profile ? 'schema_incompatible' : 'schema_missing')
      setCompatibilityMessage(
        profile && !profile.org_id
          ? 'Seu perfil não possui organização. A administração de grupos não pode ser iniciada.'
          : null,
      )
      setIsLoading(false)
      return
    }

    const currentProfile = profile
    setIsLoading(true)
    setError(null)
    setCompatibilityMessage(null)

    try {
      let loadedGroups: GroupLoadResult | null = null

      const enterpriseResult = await supabase
        .from('approval_groups')
        .select('id, org_id, code, name, description, scope, project_id, is_active, metadata, created_at, updated_at')
        .eq('org_id', currentProfile.org_id)
        .order('is_active', { ascending: false })
        .order('name', { ascending: true })

      if (!enterpriseResult.error) {
        loadedGroups = {
          rows: (enterpriseResult.data ?? []) as ApprovalGroupCompatibilityRow[],
          schema: 'enterprise',
        }
      } else if (isRlsOrPermissionError(enterpriseResult.error)) {
        setSchemaStatus('rls_blocked')
        setCompatibilityMessage(groupDiagnosticMessage('rls_blocked'))
        setGroups([])
        setMembers([])
        setCanUseGroups(false)
        setCanCreateGroups(false)
        setCanManageMembers(false)
        return
      }

      if (!loadedGroups) {
        const legacyResult = await supabase
          .from('approval_groups')
          .select('id, org_id, code, name, description, active, created_at')
          .eq('org_id', currentProfile.org_id)
          .order('active', { ascending: false })
          .order('name', { ascending: true })

        if (!legacyResult.error) {
          loadedGroups = {
            rows: (legacyResult.data ?? []) as ApprovalGroupCompatibilityRow[],
            schema: 'legacy',
          }
        } else if (isRlsOrPermissionError(legacyResult.error)) {
          setSchemaStatus('rls_blocked')
          setCompatibilityMessage(groupDiagnosticMessage('rls_blocked'))
          setGroups([])
          setMembers([])
          setCanUseGroups(false)
          setCanCreateGroups(false)
          setCanManageMembers(false)
          return
        }
      }

      if (!loadedGroups) {
        const withoutCodeResult = await supabase
          .from('approval_groups')
          .select('id, org_id, name, description, scope, project_id, is_active, metadata, created_at, updated_at')
          .eq('org_id', currentProfile.org_id)
          .order('is_active', { ascending: false })
          .order('name', { ascending: true })

        if (!withoutCodeResult.error) {
          loadedGroups = {
            rows: (withoutCodeResult.data ?? []) as ApprovalGroupCompatibilityRow[],
            schema: 'without_code',
          }
        }
      }

      if (!loadedGroups) {
        const minimalResult = await supabase
          .from('approval_groups')
          .select('id, org_id, name, created_at')
          .eq('org_id', currentProfile.org_id)
          .order('name', { ascending: true })

        if (!minimalResult.error) {
          loadedGroups = {
            rows: (minimalResult.data ?? []) as ApprovalGroupCompatibilityRow[],
            schema: 'partial',
          }
        } else if (isRlsOrPermissionError(minimalResult.error)) {
          setSchemaStatus('rls_blocked')
          setCompatibilityMessage(groupDiagnosticMessage('rls_blocked'))
          setGroups([])
          setMembers([])
          setCanUseGroups(false)
          setCanCreateGroups(false)
          setCanManageMembers(false)
          return
        } else if (isMissingApprovalGroupsTable(minimalResult.error)) {
          setSchemaStatus('schema_missing')
          setCompatibilityMessage(groupDiagnosticMessage('schema_missing'))
          setGroups([])
          setMembers([])
          setCanUseGroups(false)
          setCanCreateGroups(false)
          setCanManageMembers(false)
          return
        } else {
          throw minimalResult.error
        }
      }

      const normalizedGroups = loadedGroups.rows.map(normalizeGroup)
      const supportsCode = loadedGroups.schema === 'enterprise' || loadedGroups.schema === 'legacy'
      setGroups(normalizedGroups)
      setGroupSchema(loadedGroups.schema)
      setCanCreateGroups(supportsCode)

      const enterpriseMembersResult = await supabase
        .from('approval_group_members')
        .select('id, org_id, group_id, user_id, role, is_active, created_at')
        .eq('org_id', currentProfile.org_id)
        .order('created_at', { ascending: true })

      let memberData = enterpriseMembersResult.data as ApprovalGroupMemberCompatibilityRow[] | null
      let resolvedMemberSchema: ApprovalGroupMemberSchema = 'enterprise'

      if (enterpriseMembersResult.error && isWorkflowFoundationUnavailable(enterpriseMembersResult.error)) {
        const legacyMembersResult = await supabase
          .from('approval_group_members')
          .select('id, org_id, group_id, profile_id, role_in_group, active, created_at')
          .eq('org_id', currentProfile.org_id)
          .order('created_at', { ascending: true })

        if (!legacyMembersResult.error) {
          memberData = legacyMembersResult.data as ApprovalGroupMemberCompatibilityRow[] | null
          resolvedMemberSchema = 'legacy'
        } else if (isRlsOrPermissionError(legacyMembersResult.error)) {
          setMembers([])
          setCanUseGroups(false)
          setCanManageMembers(false)
          setSchemaStatus('rls_blocked')
          setCompatibilityMessage(groupDiagnosticMessage('rls_blocked'))
          return
        } else if (isWorkflowFoundationUnavailable(legacyMembersResult.error)) {
          setMembers([])
          setCanUseGroups(false)
          setCanManageMembers(false)
          setSchemaStatus('schema_partial')
          setCompatibilityMessage(groupDiagnosticMessage('schema_partial'))
          return
        } else {
          throw legacyMembersResult.error
        }
      } else if (enterpriseMembersResult.error) {
        if (isRlsOrPermissionError(enterpriseMembersResult.error)) {
          setMembers([])
          setCanUseGroups(false)
          setCanManageMembers(false)
          setSchemaStatus('rls_blocked')
          setCompatibilityMessage(groupDiagnosticMessage('rls_blocked'))
          return
        }
        throw enterpriseMembersResult.error
      }

      setMembers(
        (memberData ?? [])
          .map(normalizeGroupMember)
          .filter((member): member is ApprovalGroupMemberRecord => Boolean(member)),
      )
      setMemberSchema(resolvedMemberSchema)
      setCanUseGroups(true)
      setCanManageMembers(true)

      let nextStatus: ApprovalGroupsSchemaStatus
      if (!supportsCode || loadedGroups.schema === 'partial') {
        nextStatus = 'schema_incompatible'
      } else if (normalizedGroups.length === 0) {
        nextStatus = 'empty'
      } else if (loadedGroups.schema === 'legacy' || resolvedMemberSchema === 'legacy') {
        nextStatus = 'legacy_repair_needed'
      } else {
        nextStatus = 'available'
      }
      setSchemaStatus(nextStatus)
      setCompatibilityMessage(
        groupDiagnosticMessage(nextStatus, resolvedMemberSchema === 'legacy'),
      )

      const { data: userData, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, active')
        .eq('org_id', currentProfile.org_id)
        .eq('active', true)
        .order('full_name', { ascending: true })

      if (usersError) {
        setUsers([])
        setError(
          isRlsOrPermissionError(usersError)
            ? 'Os grupos foram carregados, mas a lista de usuários foi bloqueada por política de acesso.'
            : getErrorMessage(usersError, 'Não foi possível carregar os usuários da organização.'),
        )
      } else {
        setUsers((userData ?? []) as ApprovalGroupUser[])
      }
    } catch (err: unknown) {
      setGroups([])
      setMembers([])
      setCanUseGroups(false)
      setCanCreateGroups(false)
      setCanManageMembers(false)
      setError(getErrorMessage(err, 'Erro ao carregar grupos de aprovação'))
    } finally {
      setIsLoading(false)
    }
  }, [enabled, profile])

  useEffect(() => {
    refresh()
  }, [refresh])

  const clearError = useCallback(() => setError(null), [])

  function requireOrganization() {
    if (!profile?.org_id) {
      setError('Perfil sem organização disponível para gerenciar grupos.')
      return null
    }
    return profile.org_id
  }

  function handleMutationError(err: unknown, fallback: string) {
    if (isDuplicateGroupCode(err)) {
      setError('Já existe um grupo com este código na organização. Escolha outro código.')
      return
    }
    if (isRlsOrPermissionError(err)) {
      setSchemaStatus('rls_blocked')
      setCompatibilityMessage(groupDiagnosticMessage('rls_blocked'))
      setError('A operação foi bloqueada pela política de acesso. Confirme seu papel e organização.')
      return
    }
    if (isWorkflowFoundationUnavailable(err)) {
      setSchemaStatus('schema_incompatible')
      setCompatibilityMessage(groupDiagnosticMessage('schema_incompatible'))
    }
    setError(getErrorMessage(err, fallback))
  }

  function validateGroupForMutation(input: ApprovalGroupInput, groupId?: string) {
    const validation = validateApprovalGroupInput(input)
    if (!validation.isValid) {
      setError(validation.errors.name ?? validation.errors.code ?? 'Revise os dados do grupo.')
      return null
    }

    const duplicate = groups.some(
      (group) =>
        group.id !== groupId
        && normalizeApprovalGroupCode(group.code) === validation.normalizedCode,
    )
    if (duplicate) {
      setError('Já existe um grupo com este código na organização. Escolha outro código.')
      return null
    }

    return validation.normalizedCode
  }

  async function createGroup(input: ApprovalGroupInput) {
    const orgId = requireOrganization()
    if (!orgId || !canCreateGroups) return false

    setError(null)
    const code = validateGroupForMutation(input)
    if (!code) return false

    const mutationResult = groupSchema === 'legacy'
      ? await supabase.from('approval_groups').insert({
          org_id: orgId,
          code,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          active: input.is_active ?? true,
        })
      : await supabase.from('approval_groups').insert({
          org_id: orgId,
          code,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          scope: input.scope ?? 'organization',
          project_id: input.project_id ?? null,
          is_active: input.is_active ?? true,
          metadata: {},
        })
    const mutationError = mutationResult.error

    if (mutationError) {
      handleMutationError(mutationError, 'Erro ao criar grupo de aprovação')
      return false
    }

    await refresh()
    return true
  }

  async function updateGroup(groupId: string, input: Partial<ApprovalGroupInput>) {
    const orgId = requireOrganization()
    if (!orgId || !canCreateGroups) return false

    const currentGroup = groups.find((group) => group.id === groupId)
    if (!currentGroup) {
      setError('Grupo não encontrado para atualização.')
      return false
    }

    const completeInput: ApprovalGroupInput = {
      name: input.name ?? currentGroup.name,
      code: input.code ?? currentGroup.code,
      description: input.description ?? currentGroup.description,
      scope: input.scope ?? currentGroup.scope,
      project_id: input.project_id ?? currentGroup.project_id,
      is_active: input.is_active ?? currentGroup.is_active,
    }
    const code = validateGroupForMutation(completeInput, groupId)
    if (!code) return false

    const updates: Record<string, unknown> = {
      code,
      name: completeInput.name.trim(),
      description: completeInput.description?.trim() || null,
    }
    if (groupSchema === 'legacy') {
      updates.active = completeInput.is_active
    } else {
      updates.scope = completeInput.scope
      updates.project_id = completeInput.project_id
      updates.is_active = completeInput.is_active
    }

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
          .update(
            memberSchema === 'enterprise'
              ? { role, is_active: true }
              : { role_in_group: role, active: true },
          )
          .eq('id', existingMember.id)
          .eq('org_id', orgId)
      : await supabase.from('approval_group_members').insert(
          memberSchema === 'enterprise'
            ? {
                org_id: orgId,
                group_id: groupId,
                user_id: userId,
                role,
                is_active: true,
              }
            : {
                org_id: orgId,
                group_id: groupId,
                profile_id: userId,
                role_in_group: role,
                active: true,
              },
        )

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
      .update(memberSchema === 'enterprise' ? { is_active: false } : { active: false })
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
      .update(memberSchema === 'enterprise' ? { role } : { role_in_group: role })
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
    canCreateGroups,
    canManageMembers,
    schemaStatus,
    compatibilityMessage,
    createGroup,
    updateGroup,
    deactivateGroup,
    addMember,
    removeMember,
    updateMemberRole,
    clearError,
    refresh,
  }
}
