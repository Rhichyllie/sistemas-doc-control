const WORKFLOW_FOUNDATION_ERROR_CODES = new Set([
  '42P01',
  '42703',
  'PGRST200',
  'PGRST204',
  'PGRST205',
])

export type WorkflowAssignmentType = 'role' | 'user' | 'group'

const WORKFLOW_FOUNDATION_TERMS = [
  'approval_groups',
  'approval_group_members',
  'profile_id',
  'role_in_group',
  'is_active',
  'assignment_type',
  'assignee_user_id',
  'assignee_group_id',
  'due_at',
  'due_days',
  'started_at',
  'completed_at',
  'escalation_user_id',
  'metadata',
  'comment',
  'decided_by',
  'decided_at',
  'correction_round',
  'resubmitted_from_step_id',
  'approval_flows_decided_by_fkey',
  'approval_flows_resubmitted_from_step_id_fkey',
  'document_version_id',
  'revision_number',
  'published_version_id',
  'working_version_id',
  'created_from_version_id',
  'document_versions_status_check',
  'approval_flows_document_version_id_fkey',
  'relationship',
]

export function isWorkflowFoundationUnavailable(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as Record<string, unknown>
  const code = typeof record.code === 'string' ? record.code : ''
  const message = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()

  return WORKFLOW_FOUNDATION_ERROR_CODES.has(code)
    || WORKFLOW_FOUNDATION_TERMS.some((term) => message.includes(term))
}
