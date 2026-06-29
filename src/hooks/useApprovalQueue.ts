import { useCallback, useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { useWorkflowActors } from '@/hooks/useWorkflowActors'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errorUtils'
import {
  isWorkflowFoundationUnavailable,
  type WorkflowAssignmentType,
} from '@/lib/workflowCompatibility'
import { getDaysUntilDue, getDueStatus } from '@/lib/workflowDates'

export interface QueueItem {
  stepId: string
  step: number
  step_label: string
  required_role: string
  assignment_type: WorkflowAssignmentType
  assignee_id: string | null
  assignee_name: string | null
  assignee_user_id: string | null
  assignee_user_name: string | null
  assignee_group_id: string | null
  assignee_group_name: string | null
  instructions: string | null
  started_at: string | null
  due_at: string | null
  days_until_due: number | null
  overdue: boolean
  created_at: string
  documentId: string
  code: string | null
  title: string
  project_id: string | null
  project_name: string | null
  doc_type: string
  area: string
  doc_status: string
  author_name: string | null
  org_id: string
}

interface NamedRelation {
  full_name?: string
  name?: string
}

interface QueueDocumentRow {
  id: string
  code: string | null
  title: string
  project_id?: string | null
  doc_type: string
  area: string
  status: string
  org_id: string
  author?: NamedRelation | NamedRelation[] | null
  project?: NamedRelation | NamedRelation[] | null
}

interface QueueRow {
  id: string
  step: number
  step_label: string
  required_role: string
  assignment_type?: string | null
  assignee_id: string | null
  assignee_user_id?: string | null
  assignee_group_id?: string | null
  instructions?: string | null
  started_at?: string | null
  due_at?: string | null
  created_at: string
  assignee?: NamedRelation | NamedRelation[] | null
  assignee_user?: NamedRelation | NamedRelation[] | null
  assignee_group?: NamedRelation | NamedRelation[] | null
  documents?: QueueDocumentRow | QueueDocumentRow[] | null
}

type QueueQueryMode = 'enterprise' | 'enterprise_without_project' | 'legacy_sla' | 'legacy_base'

const ACTIVE_DOCUMENT_STATUSES = new Set(['in_review', 'pending_approval'])

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function resolveAssignmentType(row: QueueRow): WorkflowAssignmentType {
  if (row.assignee_group_id || row.assignment_type === 'group') return 'group'
  if (row.assignee_user_id || row.assignee_id || row.assignment_type === 'user') return 'user'
  return 'role'
}

function isAssignedToProfile(
  row: QueueRow,
  profile: { id: string; role: string },
  groupIds: Set<string>,
) {
  const assignmentType = resolveAssignmentType(row)
  if (assignmentType === 'user') {
    return (row.assignee_user_id ?? row.assignee_id) === profile.id
  }
  if (assignmentType === 'group') {
    return Boolean(row.assignee_group_id && groupIds.has(row.assignee_group_id))
  }
  return row.required_role === profile.role
}

const ENTERPRISE_SELECT = `
  id,
  step,
  step_label,
  required_role,
  assignment_type,
  assignee_id,
  assignee_user_id,
  assignee_group_id,
  instructions,
  started_at,
  due_at,
  created_at,
  assignee:profiles!approval_flows_assignee_id_fkey (full_name),
  assignee_user:profiles!approval_flows_assignee_user_id_fkey (full_name),
  assignee_group:approval_groups!approval_flows_assignee_group_id_fkey (name),
  documents (
    id,
    code,
    title,
    project_id,
    doc_type,
    area,
    status,
    org_id,
    author:profiles!documents_author_id_fkey (full_name),
    project:projects!documents_project_id_fkey (name)
  )
`

const ENTERPRISE_WITHOUT_PROJECT_SELECT = `
  id,
  step,
  step_label,
  required_role,
  assignment_type,
  assignee_id,
  assignee_user_id,
  assignee_group_id,
  instructions,
  started_at,
  due_at,
  created_at,
  assignee:profiles!approval_flows_assignee_id_fkey (full_name),
  assignee_user:profiles!approval_flows_assignee_user_id_fkey (full_name),
  assignee_group:approval_groups!approval_flows_assignee_group_id_fkey (name),
  documents (
    id,
    code,
    title,
    doc_type,
    area,
    status,
    org_id,
    author:profiles!documents_author_id_fkey (full_name)
  )
`

const LEGACY_SLA_SELECT = `
  id,
  step,
  step_label,
  required_role,
  assignee_id,
  started_at,
  due_at,
  created_at,
  assignee:profiles!approval_flows_assignee_id_fkey (full_name),
  documents (
    id,
    code,
    title,
    project_id,
    doc_type,
    area,
    status,
    org_id,
    author:profiles!documents_author_id_fkey (full_name),
    project:projects!documents_project_id_fkey (name)
  )
`

const LEGACY_BASE_SELECT = `
  id,
  step,
  step_label,
  required_role,
  assignee_id,
  created_at,
  assignee:profiles!approval_flows_assignee_id_fkey (full_name),
  documents (
    id,
    code,
    title,
    doc_type,
    area,
    status,
    org_id,
    author:profiles!documents_author_id_fkey (full_name)
  )
`

export function useApprovalQueue() {
  const { profile } = useAuthContext()
  const {
    users,
    groups,
    groupMembers,
    isLoading: actorsLoading,
    error: actorsError,
    canUseGroups,
    compatibilityMessage: actorsCompatibilityMessage,
  } = useWorkflowActors()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queryMode, setQueryMode] = useState<QueueQueryMode>('enterprise')

  const fetchQueue = useCallback(async () => {
    if (!profile) {
      setQueue([])
      setLoading(false)
      return
    }

    if (actorsLoading) {
      setLoading(true)
      return
    }

    const currentProfile = profile
    const isManager = ['admin', 'manager'].includes(currentProfile.role)
    const userGroupIds = new Set(
      groupMembers
        .filter((member) => member.user_id === currentProfile.id && member.is_active)
        .map((member) => member.group_id),
    )
    const usersById = new Map(users.map((user) => [user.id, user.full_name]))
    const groupsById = new Map(groups.map((group) => [group.id, group.name]))

    setLoading(true)
    setError(null)

    try {
      async function runQuery(select: string) {
        return supabase
          .from('approval_flows')
          .select(select)
          .eq('org_id', currentProfile.org_id)
          .eq('status', 'pending')
          .order('step', { ascending: true })
      }

      let mode: QueueQueryMode = 'enterprise'
      let result = await runQuery(ENTERPRISE_SELECT)

      if (result.error && isWorkflowFoundationUnavailable(result.error)) {
        mode = 'enterprise_without_project'
        result = await runQuery(ENTERPRISE_WITHOUT_PROJECT_SELECT)
      }
      if (result.error && isWorkflowFoundationUnavailable(result.error)) {
        mode = 'legacy_sla'
        result = await runQuery(LEGACY_SLA_SELECT)
      }
      if (result.error && isWorkflowFoundationUnavailable(result.error)) {
        mode = 'legacy_base'
        result = await runQuery(LEGACY_BASE_SELECT)
      }
      if (result.error) throw result.error

      const rows = (result.data ?? []) as unknown as QueueRow[]
      const currentStepByDocument = new Map<string, { step: number; started: boolean }>()
      for (const row of rows) {
        const document = first(row.documents)
        if (!document?.id || !ACTIVE_DOCUMENT_STATUSES.has(document.status)) continue
        const candidate = { step: row.step, started: Boolean(row.started_at) }
        const currentStep = currentStepByDocument.get(document.id)
        if (
          !currentStep
          || (candidate.started && !currentStep.started)
          || (candidate.started === currentStep.started && candidate.step < currentStep.step)
        ) {
          currentStepByDocument.set(document.id, candidate)
        }
      }

      const currentRows = rows.filter((row) => {
        const document = first(row.documents)
        return Boolean(
          document?.id
          && ACTIVE_DOCUMENT_STATUSES.has(document.status)
          && currentStepByDocument.get(document.id)?.step === row.step
          && currentStepByDocument.get(document.id)?.started === Boolean(row.started_at),
        )
      })

      const items: QueueItem[] = currentRows
        .filter((row) => isManager || isAssignedToProfile(row, currentProfile, userGroupIds))
        .map((row) => {
          const document = first(row.documents)
          const author = first(document?.author)
          const project = first(document?.project)
          const legacyAssignee = first(row.assignee)
          const assignedUser = first(row.assignee_user)
          const assignedGroup = first(row.assignee_group)
          const dueAt = row.due_at ?? null
          const daysUntilDue = getDaysUntilDue(dueAt)
          const assignmentType = resolveAssignmentType(row)
          const assigneeUserId = row.assignee_user_id ?? (assignmentType === 'user' ? row.assignee_id : null)

          return {
            stepId: row.id,
            step: row.step,
            step_label: row.step_label,
            required_role: row.required_role,
            assignment_type: assignmentType,
            assignee_id: row.assignee_id,
            assignee_name: legacyAssignee?.full_name ?? null,
            assignee_user_id: assigneeUserId,
            assignee_user_name:
              assignedUser?.full_name
              ?? legacyAssignee?.full_name
              ?? (assigneeUserId ? usersById.get(assigneeUserId) ?? null : null),
            assignee_group_id: row.assignee_group_id ?? null,
            assignee_group_name:
              assignedGroup?.name
              ?? (row.assignee_group_id ? groupsById.get(row.assignee_group_id) ?? null : null),
            instructions: row.instructions ?? null,
            started_at: row.started_at ?? null,
            due_at: dueAt,
            days_until_due: daysUntilDue,
            overdue: getDueStatus(dueAt) === 'overdue',
            created_at: row.created_at,
            documentId: document?.id ?? '',
            code: document?.code ?? null,
            title: document?.title ?? '',
            project_id: document?.project_id ?? null,
            project_name: project?.name ?? null,
            doc_type: document?.doc_type ?? '',
            area: document?.area ?? '',
            doc_status: document?.status ?? '',
            author_name: author?.full_name ?? null,
            org_id: document?.org_id ?? currentProfile.org_id,
          }
        })
        .filter((item) =>
          item.documentId
          && ACTIVE_DOCUMENT_STATUSES.has(item.doc_status),
        )

      setQueryMode(mode)
      setQueue(items)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao carregar fila'))
    } finally {
      setLoading(false)
    }
  }, [actorsLoading, groupMembers, groups, profile, users])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  const schemaFallback = queryMode !== 'enterprise'
  const compatibilityMessage = queryMode.startsWith('legacy')
    ? 'A fundação P-9A ainda não está aplicada neste ambiente. A fila usa atribuição legada por papel ou usuário.'
    : queryMode === 'enterprise_without_project'
      ? 'A atribuição enterprise está disponível, mas a relação de projeto não pôde ser carregada.'
      : actorsCompatibilityMessage
        ?? (actorsError ? 'Os grupos não puderam ser carregados; a fila continua operando sem atribuições por grupo.' : null)

  return {
    queue,
    loading: loading || actorsLoading,
    error,
    schemaFallback,
    queryMode,
    canUseGroups,
    compatibilityMessage,
    refetch: fetchQueue,
  }
}
