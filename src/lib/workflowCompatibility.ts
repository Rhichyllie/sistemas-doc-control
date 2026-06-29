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
  'assignment_type',
  'assignee_user_id',
  'assignee_group_id',
  'due_at',
  'due_days',
  'started_at',
  'completed_at',
  'escalation_user_id',
  'metadata',
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
