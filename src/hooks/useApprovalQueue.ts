import { useCallback, useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { useLibraryScope } from '@/contexts/library-context'
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
  library_id?: string | null
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
    library_id,
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
    library_id,
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
    library_id,
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
    library_id,
    code,
    title,
    doc_type,
    area,
    status,
    org_id,
    author:profiles!documents_author_id_fkey (full_name)
  )
`

interface TramiteStepRow {
  id: string
  node_key: string
  node_type: string
  label: string
  description: string | null
  status: string
  assignment_type: string | null
  assignee_user_id: string | null
  assignee_group_id: string | null
  required_role: string | null
  due_days: number | null
  due_at: string | null
  decision: string | null
  started_at: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  metadata: { instructions?: string | null; activation_count?: number | null } | null
  document: {
    id: string
    library_id: string | null
    code: string | null
    title: string
    project_id: string | null
    doc_type: string
    area: string
    status: string
    org_id: string
    author_id?: string | null
    author?: NamedRelation | NamedRelation[] | null
    project?: NamedRelation | NamedRelation[] | null
  }
  assignee_user?: NamedRelation | NamedRelation[] | null
  assignee_group?: NamedRelation | NamedRelation[] | null
  completed_by_profile?: NamedRelation | NamedRelation[] | null
}

const TRAMITE_STEP_SELECT = `
  id,
  node_key,
  node_type,
  label,
  description,
  status,
  assignment_type,
  assignee_user_id,
  assignee_group_id,
  required_role,
  due_days,
  due_at,
  decision,
  started_at,
  completed_at,
  completed_by,
  created_at,
  metadata,
  document:documents!document_tramite_instance_steps_document_id_fkey (
    id,
    library_id,
    code,
    title,
    project_id,
    doc_type,
    area,
    status,
    org_id,
    author_id,
    author:profiles!documents_author_id_fkey (full_name),
    project:projects!documents_project_id_fkey (name)
  ),
  assignee_user:profiles!document_tramite_instance_steps_assignee_user_id_fkey (full_name),
  assignee_group:approval_groups!document_tramite_instance_steps_assignee_group_id_fkey (name),
  completed_by_profile:profiles!document_tramite_instance_steps_completed_by_fkey (full_name)
`

export function useApprovalQueue() {
  const { profile } = useAuthContext()
  const { libraryId } = useLibraryScope()
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
  const [tramiteAvailable, setTramiteAvailable] = useState(false)

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
      async function runLegacyQuery(select: string) {
        let query = supabase
          .from('approval_flows')
          .select(select)
          .eq('org_id', currentProfile.org_id)
          .eq('status', 'pending')
          .order('step', { ascending: true })
        if (libraryId) query = query.eq('documents.library_id', libraryId)
        return query
      }

      let mode: QueueQueryMode = 'enterprise'
      let legacyResult = await runLegacyQuery(ENTERPRISE_SELECT)

      if (legacyResult.error && isWorkflowFoundationUnavailable(legacyResult.error)) {
        mode = 'enterprise_without_project'
        legacyResult = await runLegacyQuery(ENTERPRISE_WITHOUT_PROJECT_SELECT)
      }
      if (legacyResult.error && isWorkflowFoundationUnavailable(legacyResult.error)) {
        mode = 'legacy_sla'
        legacyResult = await runLegacyQuery(LEGACY_SLA_SELECT)
      }
      if (legacyResult.error && isWorkflowFoundationUnavailable(legacyResult.error)) {
        mode = 'legacy_base'
        legacyResult = await runLegacyQuery(LEGACY_BASE_SELECT)
      }
      const legacyRows = (legacyResult.error ? [] : (legacyResult.data ?? [])) as unknown as QueueRow[]

      const currentStepByDocument = new Map<string, {
        step: number
        started: boolean
        createdAt: number
      }>()
      for (const row of legacyRows) {
        const document = first(row.documents)
        if (!document?.id || !ACTIVE_DOCUMENT_STATUSES.has(document.status)) continue
        const candidate = {
          step: row.step,
          started: Boolean(row.started_at),
          createdAt: new Date(row.created_at).getTime(),
        }
        const currentStep = currentStepByDocument.get(document.id)
        if (
          !currentStep
          || (candidate.started && !currentStep.started)
          || (
            candidate.started === currentStep.started
            && candidate.createdAt > currentStep.createdAt
          )
          || (
            candidate.started === currentStep.started
            && candidate.createdAt === currentStep.createdAt
            && candidate.step < currentStep.step
          )
        ) {
          currentStepByDocument.set(document.id, candidate)
        }
      }

      const currentRows = legacyRows.filter((row) => {
        const document = first(row.documents)
        return Boolean(
          document?.id
          && ACTIVE_DOCUMENT_STATUSES.has(document.status)
          && currentStepByDocument.get(document.id)?.step === row.step
          && currentStepByDocument.get(document.id)?.started === Boolean(row.started_at)
          && currentStepByDocument.get(document.id)?.createdAt === new Date(row.created_at).getTime()
        )
      })

      const legacyItems: QueueItem[] = currentRows
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

      let tramiteRows: TramiteStepRow[] = []
      try {
        let tramiteQuery = supabase
          .from('document_tramite_instance_steps')
          .select(TRAMITE_STEP_SELECT)
          .eq('org_id', currentProfile.org_id)
          .in('status', ['pending', 'active', 'completed'])
          .in('node_type', ['review', 'approval', 'correction', 'evidence', 'mandatory_reading', 'custom', 'draft', 'publication'])
          .order('created_at', { ascending: false })
        if (libraryId) tramiteQuery = tramiteQuery.eq('document.library_id', libraryId)
        const tramiteResult = await tramiteQuery
        if (!tramiteResult.error) {
          setTramiteAvailable(true)
          tramiteRows = (tramiteResult.data ?? []) as unknown as TramiteStepRow[]
        } else {
          setTramiteAvailable(false)
        }
      } catch {
        setTramiteAvailable(false)
      }

      const tramiteItems: QueueItem[] = tramiteRows
        .filter((row) => {
          if (!row.document?.id) return false
          if (row.status === 'completed') {
            return row.completed_by === currentProfile.id
          }
          const isActiveStep = row.status === 'active'
            || (row.status === 'pending' && (
              row.assignee_user_id === currentProfile.id
              || (row.assignee_group_id && userGroupIds.has(row.assignee_group_id))
            ))
          if (isManager && isActiveStep) return true
          const assignmentType = row.assignment_type ?? (
            row.assignee_user_id ? 'specific_user'
              : row.assignee_group_id ? 'approval_group'
                : row.required_role ? 'role'
                  : 'none'
          )
          if (assignmentType === 'specific_user' || row.assignee_user_id) {
            if (row.assignee_user_id === currentProfile.id && isActiveStep) return true
          }
          if (assignmentType === 'approval_group' || row.assignee_group_id) {
            if (row.assignee_group_id && userGroupIds.has(row.assignee_group_id) && isActiveStep) return true
          }
          if (assignmentType === 'role' || row.required_role) {
            if (row.required_role === currentProfile.role && isActiveStep) return true
          }
          if (assignmentType === 'author' || assignmentType === 'document_owner') {
            if (row.document.author_id === currentProfile.id && isActiveStep) return true
          }
          return row.completed_by === currentProfile.id
        })
        .map((row, idx) => {
          const document = row.document
          const author = first(document?.author)
          const project = first(document?.project)
          const assignedUser = first(row.assignee_user)
          const assignedGroup = first(row.assignee_group)
          const dueAt = row.due_at ?? null
          const daysUntilDue = getDaysUntilDue(dueAt)
          const rawAssignment = row.assignment_type ?? (
            row.assignee_user_id ? 'specific_user'
              : row.assignee_group_id ? 'approval_group'
                : row.required_role ? 'role'
                  : 'none'
          )
          const assignmentType: WorkflowAssignmentType = (
            rawAssignment === 'approval_group' ? 'group'
              : (rawAssignment === 'specific_user' || rawAssignment === 'author' || rawAssignment === 'document_owner') ? 'user'
                : 'role'
          )
          const assigneeUserId = (
            rawAssignment === 'specific_user' ? row.assignee_user_id
              : rawAssignment === 'author' || rawAssignment === 'document_owner' ? (document.author_id ?? null)
                : row.assignee_user_id
          )
          const isOverdue = (
            dueAt !== null
            && row.status !== 'completed'
            && getDueStatus(dueAt) === 'overdue'
          )
          const stepIndex = idx + 1

          return {
            stepId: row.id,
            step: stepIndex,
            step_label: row.label,
            required_role: row.required_role ?? '',
            assignment_type: assignmentType,
            assignee_id: assigneeUserId,
            assignee_name: assignedUser?.full_name ?? null,
            assignee_user_id: assigneeUserId,
            assignee_user_name:
              assignedUser?.full_name
              ?? (assigneeUserId ? usersById.get(assigneeUserId) ?? null : null),
            assignee_group_id: row.assignee_group_id ?? null,
            assignee_group_name:
              assignedGroup?.name
              ?? (row.assignee_group_id ? groupsById.get(row.assignee_group_id) ?? null : null),
            instructions: row.description ?? row.metadata?.instructions ?? null,
            started_at: row.started_at ?? null,
            due_at: dueAt,
            days_until_due: daysUntilDue,
            overdue: isOverdue,
            created_at: row.created_at,
            documentId: document?.id ?? '',
            code: document?.code ?? null,
            title: document?.title ?? '',
            project_id: document?.project_id ?? null,
            project_name: project?.name ?? null,
            doc_type: document?.doc_type ?? '',
            area: document?.area ?? '',
            doc_status: row.status === 'completed'
              ? (row.decision === 'approved' ? 'approved'
                : row.decision === 'rejected' ? 'rejected'
                  : row.decision === 'needs_correction' ? 'rejected'
                    : 'completed')
              : (document?.status ?? 'pending'),
            author_name: author?.full_name ?? null,
            org_id: document?.org_id ?? currentProfile.org_id,
          }
        })
        .filter((item) => item.documentId)

      const seenLegacy = new Set(legacyItems.map((i) => `legacy-${i.documentId}-${i.stepId}`))
      const merged: QueueItem[] = [...legacyItems]
      for (const item of tramiteItems) {
        const key = `tramite-${item.documentId}-${item.stepId}`
        if (!seenLegacy.has(`legacy-${item.documentId}-${item.stepId}`)) {
          merged.push(item)
        }
        seenLegacy.add(key)
      }

      setQueryMode(mode)
      setQueue(merged)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao carregar fila'))
    } finally {
      setLoading(false)
    }
  }, [actorsLoading, groupMembers, groups, libraryId, profile, users])

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
