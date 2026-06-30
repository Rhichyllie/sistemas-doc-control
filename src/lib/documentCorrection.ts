export interface CorrectionStepLike {
  id: string
  status: string
  comment?: string | null
  correction_round?: number | null
  resubmitted_from_step_id?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  decided_at?: string | null
  completed_at?: string | null
}

export interface CorrectionDocumentLike {
  status: string
  author_id: string
  approval_steps?: CorrectionStepLike[]
}

export interface CorrectionProfileLike {
  id: string
  role: string
}

export interface DocumentCorrectionSummary {
  rejectedStepId: string
  reason: string
  decidedAt: string | null
  correctionRound: number
}

function timestamp(step: CorrectionStepLike) {
  const value = step.decided_at ?? step.completed_at ?? step.created_at
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

export function getStepCorrectionRound(step: CorrectionStepLike) {
  if (typeof step.correction_round === 'number') return step.correction_round
  const metadataRound = step.metadata?.correction_round
  return typeof metadataRound === 'number' ? metadataRound : 0
}

export function getLatestRejectedStep<T extends CorrectionStepLike>(steps: T[] = []): T | null {
  return [...steps]
    .filter((step) => step.status === 'rejected' && Boolean(step.comment?.trim()))
    .sort((left, right) => timestamp(right) - timestamp(left))[0] ?? null
}

export function isDocumentInCorrection(document: CorrectionDocumentLike) {
  if (document.status !== 'draft') return false
  const steps = document.approval_steps ?? []
  const rejectedStep = getLatestRejectedStep(steps)
  if (!rejectedStep) return false

  const rejectedAt = timestamp(rejectedStep)
  return !steps.some((step) =>
    step.status === 'pending'
    && timestamp(step) > rejectedAt,
  )
}

export function getCorrectionReason(document: CorrectionDocumentLike) {
  if (!isDocumentInCorrection(document)) return null
  return getLatestRejectedStep(document.approval_steps)?.comment?.trim() || null
}

export function canEditDocumentInCorrection(
  document: CorrectionDocumentLike,
  profile: CorrectionProfileLike | null | undefined,
) {
  if (!profile || !isDocumentInCorrection(document)) return false
  return document.author_id === profile.id || ['admin', 'manager'].includes(profile.role)
}

export function getNextCorrectionRound(steps: CorrectionStepLike[] = []) {
  return steps.reduce(
    (highest, step) => Math.max(highest, getStepCorrectionRound(step)),
    0,
  ) + 1
}

export function getDocumentCorrectionSummary(
  document: CorrectionDocumentLike,
): DocumentCorrectionSummary | null {
  if (!isDocumentInCorrection(document)) return null
  const rejectedStep = getLatestRejectedStep(document.approval_steps)
  if (!rejectedStep?.comment?.trim()) return null
  return {
    rejectedStepId: rejectedStep.id,
    reason: rejectedStep.comment.trim(),
    decidedAt: rejectedStep.decided_at ?? rejectedStep.completed_at ?? rejectedStep.created_at ?? null,
    correctionRound: getStepCorrectionRound(rejectedStep),
  }
}
