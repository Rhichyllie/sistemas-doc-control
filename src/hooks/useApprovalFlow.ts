import { useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errorUtils'
import {
  isWorkflowFoundationUnavailable,
  isWorkflowRpcUnavailable,
  type WorkflowAssignmentType,
} from '@/lib/workflowCompatibility'
import {
  calculateDueAtFromDays,
  normalizeDateInputToDueAt,
} from '@/lib/workflowDates'

export type FlowAction = 'submit' | 'approve' | 'reject' | 'publish' | 'obsolete'

type FlowRole = 'reviewer' | 'approver' | 'author' | 'manager' | 'admin'
type WorkflowPersistenceMode = 'enterprise' | 'legacy_sla' | 'legacy_base'
export type WorkflowDueMode = 'days' | 'date'
export type WorkflowFlowContext = 'document' | 'formal_revision'

const BLOCKED_DOCUMENT_STATUSES = ['draft', 'published', 'obsolete']

interface WorkflowInsertResult {
  mode: WorkflowPersistenceMode
  correctionFieldsPersisted: boolean
  revisionFieldsPersisted: boolean
}

interface CorrectionRoundContext {
  correctionRound?: number
  rejectedStepId?: string
  responseComment?: string | null
  flowContext?: WorkflowFlowContext
  documentVersionId?: string | null
  revisionNumber?: number | null
}

interface ActOnStepInput {
  documentId: string
  stepId: string
  action: 'approve' | 'reject'
  comment?: string
}

export interface WorkflowStepInput {
  step: number
  step_label: string
  required_role: string
  assignment_type?: WorkflowAssignmentType
  assignee_id?: string | null
  assignee_user_id?: string | null
  assignee_group_id?: string | null
  due_mode?: WorkflowDueMode
  due_days?: number | null
  due_at?: string | null
  instructions?: string | null
  escalation_user_id?: string | null
}

interface NormalizedWorkflowStep extends WorkflowStepInput {
  assignment_type: WorkflowAssignmentType
  assignee_id: string | null
  assignee_user_id: string | null
  assignee_group_id: string | null
  due_mode: WorkflowDueMode
  due_days: number | null
  due_at: string | null
  instructions: string | null
  escalation_user_id: string | null
}

export interface SubmitForReviewInput {
  documentId: string
  steps?: WorkflowStepInput[]
  reviewerId?: string
  approverId?: string
  documentVersionId?: string | null
  revisionNumber?: number | null
  flowContext?: WorkflowFlowContext
}

interface ResubmitAfterCorrectionInput extends SubmitForReviewInput {
  rejectedStepId: string
  responseComment?: string
}

interface NextStepRow {
  id: string
  step: number
  step_label: string
  required_role: string
  assignment_type?: string | null
  assignee_id?: string | null
  assignee_user_id?: string | null
  assignee_group_id?: string | null
  document_version_id?: string | null
  revision_number?: number | null
  metadata?: Record<string, unknown> | null
}

interface RejectedStepRow {
  id: string
  step: number
  comment: string | null
  correction_round?: number | null
  metadata?: Record<string, unknown> | null
  document_version_id?: string | null
  revision_number?: number | null
}

interface PublishFormalRevisionRpcResult {
  success?: boolean
  document_id?: string
  published_version_id?: string
  previous_version_id?: string | null
  revision?: number
  idempotent?: boolean
}

export function useApprovalFlow() {
  const { profile } = useAuthContext()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [compatibilityMode, setCompatibilityMode] = useState<WorkflowPersistenceMode>('enterprise')
  const [compatibilityMessage, setCompatibilityMessage] = useState<string | null>(null)

  async function submitForReview(input: SubmitForReviewInput): Promise<boolean> {
    if (!profile) {
      setError('Usuário não autenticado')
      return false
    }

    setLoading(true)
    setError(null)
    setCompatibilityMessage(null)
    let documentMovedToReview = false
    let workflowPersisted = false
    let initialDocumentStatus = 'in_review'
    const formalRevision = input.flowContext === 'formal_revision' && Boolean(input.documentVersionId)

    try {
      const now = new Date().toISOString()
      const workflowSteps = normalizeWorkflowSteps(input)
      initialDocumentStatus = documentStatusForRole(workflowSteps[0].required_role)

      const { data: updatedDocument, error: updateError } = await supabase
        .from('documents')
        .update({ status: initialDocumentStatus, updated_at: now })
        .eq('id', input.documentId)
        .eq('org_id', profile.org_id)
        .eq('status', formalRevision ? 'published' : 'draft')
        .select('id, status')
        .maybeSingle()

      if (updateError) throw updateError
      if (!updatedDocument || updatedDocument.status !== initialDocumentStatus) {
        throw new Error('O documento não pôde ser movido de rascunho para revisão.')
      }
      documentMovedToReview = true

      if (formalRevision && input.documentVersionId) {
        const { data: updatedVersion, error: versionError } = await supabase
          .from('document_versions')
          .update({
            status: initialDocumentStatus,
            submitted_at: now,
          })
          .eq('id', input.documentVersionId)
          .eq('document_id', input.documentId)
          .eq('org_id', profile.org_id)
          .eq('status', 'draft')
          .select('id')
          .maybeSingle()
        if (versionError) throw versionError
        if (!updatedVersion) throw new Error('A revisão formal não pôde ser enviada para aprovação.')
      }

      await closeOpenPendingSteps(input.documentId, now)

      const insertion = await insertWorkflowSteps(
        input.documentId,
        workflowSteps,
        now,
        formalRevision
          ? {
              flowContext: 'formal_revision',
              documentVersionId: input.documentVersionId,
              revisionNumber: input.revisionNumber,
            }
          : undefined,
      )
      const persistenceMode = insertion.mode
      workflowPersisted = true
      setCompatibilityMode(persistenceMode)

      if (persistenceMode === 'legacy_sla') {
        setCompatibilityMessage(
          'O banco ainda não possui os atores P-9A. O fluxo foi salvo no modelo atual, com SLA e fallback de grupo para papel.',
        )
      } else if (persistenceMode === 'legacy_base') {
        setCompatibilityMessage(
          'O banco ainda não possui a fundação P-9A nem os campos de SLA. O fluxo foi salvo no modelo básico por papel ou usuário.',
        )
      } else if (formalRevision && !insertion.revisionFieldsPersisted) {
        setCompatibilityMessage(
          'A revisão foi vinculada por metadata. Aplique a migration P-10A para persistir document_version_id formalmente.',
        )
      }

      await supabase.from('audit_trail').insert({
        document_id: input.documentId,
        org_id: profile.org_id,
        user_id: profile.id,
        action: formalRevision ? 'formal_revision_submitted' : 'submitted_for_review',
        old_status: formalRevision ? 'published' : 'draft',
        new_status: initialDocumentStatus,
        metadata: {
          workflow_mode: persistenceMode,
          flow_context: formalRevision ? 'formal_revision' : 'document',
          document_version_id: input.documentVersionId ?? null,
          previous_revision: formalRevision ? (input.revisionNumber ?? 1) - 1 : null,
          new_revision: input.revisionNumber ?? null,
          actor: profile.id,
        },
      })

      await notifyStepAssignment(
        input.documentId,
        workflowSteps[0],
        'approval_required',
        `Documento aguarda ${workflowSteps[0].step_label}`,
        persistenceMode,
      )

      return true
    } catch (err: unknown) {
      if (documentMovedToReview && !workflowPersisted) {
        if (formalRevision && input.documentVersionId) {
          await supabase
            .from('document_versions')
            .update({ status: 'draft', submitted_at: null })
            .eq('id', input.documentVersionId)
            .eq('org_id', profile.org_id)
        }
        await supabase
          .from('documents')
          .update({
            status: formalRevision ? 'published' : 'draft',
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.documentId)
          .eq('org_id', profile.org_id)
          .eq('status', initialDocumentStatus)
      }
      setError(getErrorMessage(err, 'Erro ao submeter para revisão'))
      return false
    } finally {
      setLoading(false)
    }
  }

  async function resubmitAfterCorrection(
    input: ResubmitAfterCorrectionInput,
  ): Promise<boolean> {
    if (!profile) {
      setError('Usuário não autenticado')
      return false
    }

    setLoading(true)
    setError(null)
    setCompatibilityMessage(null)
    let documentMovedToReview = false
    let workflowPersisted = false
    let initialDocumentStatus = 'in_review'
    let formalRevision = false
    let documentVersionId: string | null = input.documentVersionId ?? null
    let revisionNumber: number | null = input.revisionNumber ?? null

    try {
      const now = new Date().toISOString()
      const workflowSteps = normalizeWorkflowSteps(input)
      initialDocumentStatus = documentStatusForRole(workflowSteps[0].required_role)

      const { data: document, error: documentError } = await supabase
        .from('documents')
        .select('id, author_id, status')
        .eq('id', input.documentId)
        .eq('org_id', profile.org_id)
        .single()

      if (documentError) throw documentError
      if (document.status !== 'draft') {
        throw new Error('O documento não está disponível para correção e reenvio.')
      }
      if (document.author_id !== profile.id && !['admin', 'manager'].includes(profile.role)) {
        throw new Error('Somente o autor ou um gestor pode reenviar este documento.')
      }

      const rejectedStep = await fetchRejectedStep(input.documentId, input.rejectedStepId)
      if (!rejectedStep?.comment?.trim()) {
        throw new Error('A etapa rejeitada e seu motivo não foram encontrados.')
      }

      const metadataRound = rejectedStep.metadata?.correction_round
      const previousRound = typeof rejectedStep.correction_round === 'number'
        ? rejectedStep.correction_round
        : typeof metadataRound === 'number'
          ? metadataRound
          : 0
      const correctionRound = previousRound + 1
      const responseComment = input.responseComment?.trim() || null
      formalRevision = input.flowContext === 'formal_revision'
        && Boolean(input.documentVersionId ?? rejectedStep.document_version_id)
      documentVersionId = input.documentVersionId ?? rejectedStep.document_version_id ?? null
      revisionNumber = input.revisionNumber ?? rejectedStep.revision_number ?? null

      const { data: updatedDocument, error: updateError } = await supabase
        .from('documents')
        .update({ status: initialDocumentStatus, updated_at: now })
        .eq('id', input.documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'draft')
        .select('id, status')
        .maybeSingle()

      if (updateError) throw updateError
      if (!updatedDocument || updatedDocument.status !== initialDocumentStatus) {
        throw new Error('O documento não pôde ser reenviado para aprovação.')
      }
      documentMovedToReview = true

      if (formalRevision && documentVersionId) {
        const { data: updatedVersion, error: versionError } = await supabase
          .from('document_versions')
          .update({
            status: initialDocumentStatus,
            submitted_at: now,
          })
          .eq('id', documentVersionId)
          .eq('document_id', input.documentId)
          .eq('org_id', profile.org_id)
          .in('status', ['draft', 'rejected'])
          .select('id')
          .maybeSingle()
        if (versionError) throw versionError
        if (!updatedVersion) throw new Error('A revisão formal corrigida não pôde ser reenviada.')
      }

      await closeOpenPendingSteps(input.documentId, now)

      const insertion = await insertWorkflowSteps(
        input.documentId,
        workflowSteps,
        now,
        {
          correctionRound,
          rejectedStepId: rejectedStep.id,
          responseComment,
          flowContext: formalRevision ? 'formal_revision' : 'document',
          documentVersionId,
          revisionNumber,
        },
      )
      workflowPersisted = true
      setCompatibilityMode(insertion.mode)

      if (!insertion.correctionFieldsPersisted) {
        setCompatibilityMessage(
          'O reenvio foi salvo, mas correction_round e resubmitted_from_step_id ficaram em metadata até a migration P-9C.1 ser aplicada.',
        )
      }

      const { error: auditError } = await supabase.from('audit_trail').insert({
        document_id: input.documentId,
        org_id: profile.org_id,
        user_id: profile.id,
        action: 'resubmitted_after_correction',
        old_status: 'draft',
        new_status: initialDocumentStatus,
        metadata: {
          correction_round: correctionRound,
          previous_rejected_step_id: rejectedStep.id,
          response_comment: responseComment,
          workflow_mode: insertion.mode,
          correction_fields_persisted: insertion.correctionFieldsPersisted,
          document_version_id: documentVersionId,
          revision_number: revisionNumber,
          flow_context: formalRevision ? 'formal_revision' : 'document',
        },
      })
      if (auditError) throw auditError

      await notifyStepAssignment(
        input.documentId,
        workflowSteps[0],
        'approval_required',
        `Documento corrigido aguarda ${workflowSteps[0].step_label}`,
        insertion.mode,
      )

      return true
    } catch (err: unknown) {
      if (documentMovedToReview) {
        if (workflowPersisted) {
          await closeOpenPendingSteps(input.documentId, new Date().toISOString())
        }
        await supabase
          .from('documents')
          .update({ status: 'draft', updated_at: new Date().toISOString() })
          .eq('id', input.documentId)
          .eq('org_id', profile.org_id)
          .eq('status', initialDocumentStatus)
        if (formalRevision && documentVersionId) {
          await supabase
            .from('document_versions')
            .update({ status: 'rejected' })
            .eq('id', documentVersionId)
            .eq('org_id', profile.org_id)
        }
      }
      setError(getErrorMessage(err, 'Erro ao reenviar documento corrigido'))
      return false
    } finally {
      setLoading(false)
    }
  }

  async function insertWorkflowSteps(
    documentId: string,
    workflowSteps: NormalizedWorkflowStep[],
    now: string,
    correctionContext?: CorrectionRoundContext,
  ): Promise<WorkflowInsertResult> {
    if (!profile) throw new Error('Usuário não autenticado')

    const commonRows = workflowSteps.map((step) => ({
      document_id: documentId,
      org_id: profile.org_id,
      step: step.step,
      step_label: step.step_label,
      required_role: step.required_role,
      status: 'pending',
    }))

    const enterpriseRows = workflowSteps.map((step, index) => ({
      ...commonRows[index],
      assignment_type: step.assignment_type,
      assignee_id: step.assignment_type === 'user' ? step.assignee_user_id : null,
      assignee_user_id: step.assignment_type === 'user' ? step.assignee_user_id : null,
      assignee_group_id: step.assignment_type === 'group' ? step.assignee_group_id : null,
      due_days: step.due_days,
      due_at: resolveStepDueAt(step, now),
      started_at: index === 0 ? now : null,
      escalation_user_id: step.escalation_user_id,
      instructions: step.instructions,
      metadata: {
        sequential: true,
        active_step: index === 0,
        assignment_type: step.assignment_type,
        due_mode: step.due_mode,
        correction_round: correctionContext?.correctionRound ?? 0,
        resubmitted_from_step_id: correctionContext?.rejectedStepId ?? null,
        response_comment: index === 0 ? correctionContext?.responseComment ?? null : null,
        flow_context: correctionContext?.flowContext ?? 'document',
        document_version_id: correctionContext?.documentVersionId ?? null,
        revision_number: correctionContext?.revisionNumber ?? null,
      },
    }))

    let result = correctionContext
      ? await supabase
          .from('approval_flows')
          .insert(enterpriseRows.map((row) => ({
            ...row,
            correction_round: correctionContext.correctionRound ?? 0,
            resubmitted_from_step_id: correctionContext.rejectedStepId ?? null,
            document_version_id: correctionContext.documentVersionId ?? null,
            revision_number: correctionContext.revisionNumber ?? null,
          })))
          .select('id')
      : await supabase.from('approval_flows').insert(enterpriseRows).select('id')

    if (!result.error) {
      assertInsertedStepCount(result.data, workflowSteps.length)
      return {
        mode: 'enterprise',
        correctionFieldsPersisted: correctionContext?.correctionRound !== undefined,
        revisionFieldsPersisted: Boolean(correctionContext?.documentVersionId),
      }
    }
    if (correctionContext && isWorkflowFoundationUnavailable(result.error)) {
      result = await supabase.from('approval_flows').insert(enterpriseRows).select('id')
      if (!result.error) {
        assertInsertedStepCount(result.data, workflowSteps.length)
        return {
          mode: 'enterprise',
          correctionFieldsPersisted: false,
          revisionFieldsPersisted: false,
        }
      }
    }
    if (!isWorkflowFoundationUnavailable(result.error)) throw result.error

    const legacySlaRows = workflowSteps.map((step, index) => ({
      ...commonRows[index],
      assignee_id: step.assignment_type === 'user' ? step.assignee_user_id : null,
      due_days: step.due_days,
      due_at: resolveStepDueAt(step, now),
      started_at: index === 0 ? now : null,
      escalation_user_id: step.escalation_user_id,
      metadata: {
        sequential: true,
        requested_assignment_type: step.assignment_type,
        requested_group_id: step.assignment_type === 'group' ? step.assignee_group_id : null,
        due_mode: step.due_mode,
        correction_round: correctionContext?.correctionRound ?? 0,
        resubmitted_from_step_id: correctionContext?.rejectedStepId ?? null,
        response_comment: index === 0 ? correctionContext?.responseComment ?? null : null,
        flow_context: correctionContext?.flowContext ?? 'document',
        document_version_id: correctionContext?.documentVersionId ?? null,
        revision_number: correctionContext?.revisionNumber ?? null,
      },
    }))

    result = await supabase.from('approval_flows').insert(legacySlaRows).select('id')
    if (!result.error) {
      assertInsertedStepCount(result.data, workflowSteps.length)
      return {
        mode: 'legacy_sla',
        correctionFieldsPersisted: false,
        revisionFieldsPersisted: false,
      }
    }
    if (!isWorkflowFoundationUnavailable(result.error)) throw result.error

    const legacyBaseRows = workflowSteps.map((step, index) => ({
      ...commonRows[index],
      assignee_id: step.assignment_type === 'user' ? step.assignee_user_id : null,
    }))

    result = await supabase.from('approval_flows').insert(legacyBaseRows).select('id')
    if (result.error) throw result.error
    assertInsertedStepCount(result.data, workflowSteps.length)
    return {
      mode: 'legacy_base',
      correctionFieldsPersisted: false,
      revisionFieldsPersisted: false,
    }
  }

  async function actOnStep(input: ActOnStepInput): Promise<boolean> {
    if (!profile) {
      setError('Usuário não autenticado')
      return false
    }

    setLoading(true)
    setError(null)
    setCompatibilityMessage(null)

    try {
      const now = new Date().toISOString()
      if (input.action === 'reject' && !input.comment?.trim()) {
        throw new Error('Informe o motivo da rejeição.')
      }
      const nextStepStatus = input.action === 'approve' ? 'approved' : 'rejected'

      let pendingStepResult = await supabase
        .from('approval_flows')
        .select(`
          step,
          document_id,
          required_role,
          status,
          created_at,
          document_version_id,
          revision_number,
          metadata
        `)
        .eq('id', input.stepId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .single()

      if (pendingStepResult.error && isWorkflowFoundationUnavailable(pendingStepResult.error)) {
        pendingStepResult = await supabase
          .from('approval_flows')
          .select('step, document_id, required_role, status, created_at, metadata')
          .eq('id', input.stepId)
          .eq('org_id', profile.org_id)
          .eq('status', 'pending')
          .single()
      }

      if (pendingStepResult.error) throw pendingStepResult.error
      const pendingStep = pendingStepResult.data
      if (!pendingStep || pendingStep.status !== 'pending') {
        throw new Error('Esta etapa não está pendente.')
      }
      const pendingMetadata = (pendingStep.metadata ?? {}) as Record<string, unknown>
      const documentVersionId =
        pendingStep.document_version_id
        ?? (typeof pendingMetadata.document_version_id === 'string'
          ? pendingMetadata.document_version_id
          : null)
      const revisionNumber =
        pendingStep.revision_number
        ?? (typeof pendingMetadata.revision_number === 'number'
          ? pendingMetadata.revision_number
          : null)
      const formalRevision = Boolean(documentVersionId)

      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('author_id, status')
        .eq('id', input.documentId)
        .eq('org_id', profile.org_id)
        .single()

      if (docError) throw docError
      if (!doc || BLOCKED_DOCUMENT_STATUSES.includes(doc.status)) {
        throw new Error('Este documento não está em fluxo de aprovação ativo.')
      }

      if (
        input.action === 'approve'
        && pendingStep.required_role === 'approver'
        && doc.author_id === profile.id
        && !['admin', 'manager'].includes(profile.role)
      ) {
        throw new Error('O autor não pode aprovar a etapa final do próprio documento.')
      }

      const step = await updateCurrentStep(
        input.stepId,
        nextStepStatus,
        input.comment ?? null,
        now,
      )

      if (input.action === 'reject') {
        const { data: returnedDocument, error: returnError } = await supabase
          .from('documents')
          .update({ status: 'draft', updated_at: now })
          .eq('id', input.documentId)
          .eq('org_id', profile.org_id)
          .select('id')
          .maybeSingle()

        if (returnError) throw returnError
        if (!returnedDocument) throw new Error('O documento não pôde retornar para correção.')

        if (formalRevision && documentVersionId) {
          const { error: versionRejectError } = await supabase
            .from('document_versions')
            .update({ status: 'rejected' })
            .eq('id', documentVersionId)
            .eq('document_id', input.documentId)
            .eq('org_id', profile.org_id)
          if (versionRejectError) throw versionRejectError
        }

        await closeOpenPendingSteps(input.documentId, now)

        const { error: auditError } = await supabase.from('audit_trail').insert({
          document_id: input.documentId,
          org_id: profile.org_id,
          user_id: profile.id,
          action: 'correction_requested',
          old_status: doc.status,
          new_status: 'draft',
          metadata: {
            comment: input.comment,
            rejected_step: step.step,
            rejected_step_id: input.stepId,
            correction_required: true,
            previous_status: doc.status,
            returned_to_author: true,
            flow_context: formalRevision ? 'formal_revision' : 'document',
            document_version_id: documentVersionId,
            revision_number: revisionNumber,
          },
        })
        if (auditError) {
          setCompatibilityMessage(
            `A correção foi solicitada, mas o registro complementar de auditoria falhou: ${getErrorMessage(auditError, 'erro não identificado')}`,
          )
        }

        if (formalRevision) {
          await supabase.from('audit_trail').insert({
            document_id: input.documentId,
            org_id: profile.org_id,
            user_id: profile.id,
            action: 'formal_revision_rejected',
            old_status: doc.status,
            new_status: 'draft',
            metadata: {
              document_id: input.documentId,
              document_version_id: documentVersionId,
              previous_revision: revisionNumber ? revisionNumber - 1 : null,
              new_revision: revisionNumber,
              actor: profile.id,
              comment: input.comment,
            },
          })
        }

        await notifyDocumentAuthor(
          input.documentId,
          'correction_requested',
          `Correção solicitada na etapa ${step.step}: ${input.comment ?? ''}`,
        )

        return true
      }

      const nextStep = await fetchNextStep(
        input.documentId,
        pendingStep.step,
        pendingStep.created_at,
      )

      if (nextStep) {
        const startResult = await supabase
          .from('approval_flows')
          .update({ started_at: now })
          .eq('id', nextStep.id)
          .is('started_at', null)

        if (startResult.error && !isWorkflowFoundationUnavailable(startResult.error)) {
          throw startResult.error
        }

        const nextDocumentStatus = documentStatusForRole(nextStep.required_role)
        await supabase
          .from('documents')
          .update({ status: nextDocumentStatus, updated_at: now })
          .eq('id', input.documentId)
          .eq('org_id', profile.org_id)

        if (formalRevision && documentVersionId) {
          const { error: versionStatusError } = await supabase
            .from('document_versions')
            .update({ status: nextDocumentStatus })
            .eq('id', documentVersionId)
            .eq('org_id', profile.org_id)
          if (versionStatusError) throw versionStatusError
        }

        await supabase.from('audit_trail').insert({
          document_id: input.documentId,
          org_id: profile.org_id,
          user_id: profile.id,
          action: 'step_approved',
          old_status: doc.status,
          new_status: nextDocumentStatus,
          metadata: { step: step.step, next_step: nextStep.step },
        })

        await notifyStepAssignment(
          input.documentId,
          normalizePersistedStep(nextStep),
          'approval_required',
          `Documento aguarda ${nextStep.step_label}`,
          nextStep.assignment_type ? 'enterprise' : compatibilityMode,
        )
      } else if (formalRevision && documentVersionId && revisionNumber !== null) {
        await publishFormalRevision(
          input.documentId,
          documentVersionId,
          revisionNumber,
          now,
        )
      } else {
        await supabase
          .from('documents')
          .update({ status: 'published', published_at: now, updated_at: now })
          .eq('id', input.documentId)
          .eq('org_id', profile.org_id)

        await supabase.from('audit_trail').insert({
          document_id: input.documentId,
          org_id: profile.org_id,
          user_id: profile.id,
          action: 'approved_and_published',
          old_status: doc.status,
          new_status: 'published',
          metadata: { step: step.step },
        })

        await notifyDocumentAuthor(input.documentId, 'document_approved', 'Seu documento foi aprovado e publicado')
      }

      return true
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao processar aprovação'))
      return false
    } finally {
      setLoading(false)
    }
  }

  async function updateCurrentStep(
    stepId: string,
    status: 'approved' | 'rejected',
    comment: string | null,
    now: string,
  ) {
    if (!profile) throw new Error('Usuário não autenticado')

    let result = await supabase
      .from('approval_flows')
      .update({
        status,
        comment,
        decided_by: profile.id,
        decided_at: now,
        completed_at: now,
      })
      .eq('id', stepId)
      .eq('org_id', profile.org_id)
      .eq('status', 'pending')
      .select('id, step, document_id, required_role, status')
      .single()

    if (result.error && isWorkflowFoundationUnavailable(result.error)) {
      result = await supabase
        .from('approval_flows')
        .update({
          status,
          comment,
          decided_by: profile.id,
          decided_at: now,
        })
        .eq('id', stepId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .select('id, step, document_id, required_role, status')
        .single()
    }

    if (result.error && isWorkflowFoundationUnavailable(result.error)) {
      result = await supabase
        .from('approval_flows')
        .update({ status })
        .eq('id', stepId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .select('id, step, document_id, required_role, status')
        .single()
    }

    if (result.error) throw result.error
    return result.data
  }

  async function closeOpenPendingSteps(documentId: string, now: string) {
    if (!profile) throw new Error('Usuário não autenticado')

    let result = await supabase
      .from('approval_flows')
      .update({ status: 'cancelled', completed_at: now })
      .eq('document_id', documentId)
      .eq('org_id', profile.org_id)
      .eq('status', 'pending')

    if (result.error) {
      result = await supabase
        .from('approval_flows')
        .update({ status: 'skipped', completed_at: now })
        .eq('document_id', documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
    }

    if (result.error && isWorkflowFoundationUnavailable(result.error)) {
      result = await supabase
        .from('approval_flows')
        .update({ status: 'skipped' })
        .eq('document_id', documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
    }

    if (result.error) throw result.error
  }

  async function fetchRejectedStep(documentId: string, stepId: string) {
    if (!profile) return null

    let result = await supabase
      .from('approval_flows')
      .select(`
        id,
        step,
        comment,
        correction_round,
        metadata,
        document_version_id,
        revision_number
      `)
      .eq('id', stepId)
      .eq('document_id', documentId)
      .eq('org_id', profile.org_id)
      .eq('status', 'rejected')
      .maybeSingle()

    if (result.error && isWorkflowFoundationUnavailable(result.error)) {
      result = await supabase
        .from('approval_flows')
        .select('id, step, comment, metadata')
        .eq('id', stepId)
        .eq('document_id', documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'rejected')
        .maybeSingle()
    }

    if (result.error && isWorkflowFoundationUnavailable(result.error)) {
      result = await supabase
        .from('approval_flows')
        .select('id, step, comment')
        .eq('id', stepId)
        .eq('document_id', documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'rejected')
        .maybeSingle()
    }

    if (result.error) throw result.error
    return result.data as RejectedStepRow | null
  }

  async function fetchNextStep(
    documentId: string,
    currentStep: number,
    currentRoundCreatedAt: string,
  ): Promise<NextStepRow | null> {
    if (!profile) return null

    let result = await supabase
      .from('approval_flows')
      .select(`
        id,
        step,
        step_label,
        required_role,
        assignment_type,
        assignee_id,
        assignee_user_id,
        assignee_group_id
      `)
      .eq('document_id', documentId)
      .eq('org_id', profile.org_id)
      .eq('status', 'pending')
      .gt('step', currentStep)
      .gte('created_at', currentRoundCreatedAt)
      .order('step', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (result.error && isWorkflowFoundationUnavailable(result.error)) {
      result = await supabase
        .from('approval_flows')
        .select('id, step, step_label, required_role, assignee_id')
        .eq('document_id', documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .gt('step', currentStep)
        .gte('created_at', currentRoundCreatedAt)
        .order('step', { ascending: true })
        .limit(1)
        .maybeSingle()
    }

    if (result.error) throw result.error
    return result.data as NextStepRow | null
  }

  async function publishFormalRevision(
    documentId: string,
    documentVersionId: string,
    revisionNumber: number,
    now: string,
  ) {
    if (!profile) throw new Error('Usuário não autenticado')

    const rpcResult = await supabase.rpc('publish_formal_revision', {
      p_document_id: documentId,
      p_document_version_id: documentVersionId,
      p_actor_id: profile.id,
    })

    if (rpcResult.error) {
      if (isWorkflowRpcUnavailable(rpcResult.error)) {
        setCompatibilityMessage(
          'A RPC transacional de revisão formal não está disponível neste ambiente. A publicação usou o fallback compatível do cliente.',
        )
      } else {
        throw new Error(
          `A publicação transacional da revisão foi recusada: ${getErrorMessage(rpcResult.error, 'erro não identificado')}`,
        )
      }
    } else {
      const result = rpcResult.data as PublishFormalRevisionRpcResult | null
      if (
        !result
        || result.success !== true
        || result.document_id !== documentId
        || result.published_version_id !== documentVersionId
        || typeof result.revision !== 'number'
      ) {
        throw new Error('A RPC de publicação retornou um resultado inválido ou incompleto.')
      }

      await notifyDocumentAuthor(
        documentId,
        'formal_revision_published',
        `Revisão ${result.revision} aprovada e publicada`,
      )
      return
    }

    const { data: version, error: versionError } = await supabase
      .from('document_versions')
      .select('id, revision, file_path, file_name, file_size, file_hash, change_reason, metadata')
      .eq('id', documentVersionId)
      .eq('document_id', documentId)
      .eq('org_id', profile.org_id)
      .single()
    if (versionError) throw versionError

    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('revision, published_version_id, working_version_id')
      .eq('id', documentId)
      .eq('org_id', profile.org_id)
      .single()
    if (documentError) throw documentError

    if (document.published_version_id && document.published_version_id !== documentVersionId) {
      const { data: supersededVersion, error: supersedeError } = await supabase
        .from('document_versions')
        .update({
          status: 'superseded',
          superseded_at: now,
        })
        .eq('id', document.published_version_id)
        .eq('org_id', profile.org_id)
        .eq('status', 'published')
        .select('id')
        .maybeSingle()
      if (supersedeError) throw supersedeError
      if (!supersededVersion) {
        throw new Error('A revisão publicada anterior não pôde ser marcada como superada.')
      }

      await supabase.from('audit_trail').insert({
        document_id: documentId,
        org_id: profile.org_id,
        user_id: profile.id,
        action: 'formal_revision_superseded',
        old_status: 'published',
        new_status: 'superseded',
        metadata: {
          document_id: documentId,
          document_version_id: document.published_version_id,
          previous_revision: document.revision,
          new_revision: revisionNumber,
          actor: profile.id,
        },
      })
    }

    const { data: publishedVersion, error: publishVersionError } = await supabase
      .from('document_versions')
      .update({
        status: 'published',
        approved_at: now,
        published_at: now,
        superseded_at: null,
      })
      .eq('id', documentVersionId)
      .eq('org_id', profile.org_id)
      .select('id')
      .maybeSingle()
    if (publishVersionError) throw publishVersionError
    if (!publishedVersion) throw new Error('A nova revisão não pôde ser publicada.')

    const metadata = (version.metadata ?? {}) as Record<string, unknown>
    const nextReviewAt = typeof metadata.next_review_at === 'string'
      ? metadata.next_review_at
      : null
    const { data: updatedDocument, error: updateDocumentError } = await supabase
      .from('documents')
      .update({
        revision: revisionNumber,
        file_path: version.file_path,
        file_name: version.file_name,
        file_size: version.file_size,
        file_hash: version.file_hash,
        status: 'published',
        published_at: now,
        published_version_id: documentVersionId,
        working_version_id: null,
        ...(nextReviewAt ? { next_review_at: nextReviewAt } : {}),
      })
      .eq('id', documentId)
      .eq('org_id', profile.org_id)
      .select('id, revision, status')
      .maybeSingle()
    if (updateDocumentError) throw updateDocumentError
    if (
      !updatedDocument
      || updatedDocument.status !== 'published'
      || updatedDocument.revision !== revisionNumber
    ) {
      throw new Error('O documento mestre não pôde ser atualizado para a nova revisão.')
    }

    await supabase.from('audit_trail').insert({
      document_id: documentId,
      org_id: profile.org_id,
      user_id: profile.id,
      action: 'formal_revision_published',
      old_status: 'pending_approval',
      new_status: 'published',
      metadata: {
        document_id: documentId,
        document_version_id: documentVersionId,
        previous_revision: document.revision,
        new_revision: revisionNumber,
        change_reason: version.change_reason,
        actor: profile.id,
        file_name: version.file_name,
      },
    })

    await notifyDocumentAuthor(
      documentId,
      'formal_revision_published',
      `Revisão ${revisionNumber} aprovada e publicada`,
    )
  }

  async function obsoleteDocument(documentId: string): Promise<boolean> {
    if (!profile) {
      setError('Usuário não autenticado')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('documents')
        .update({ status: 'obsolete', obsoleted_at: now, updated_at: now })
        .eq('id', documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'published')

      if (updateError) throw updateError

      await supabase.from('audit_trail').insert({
        document_id: documentId,
        org_id: profile.org_id,
        user_id: profile.id,
        action: 'obsoleted',
        old_status: 'published',
        new_status: 'obsolete',
      })

      return true
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao tornar documento obsoleto'))
      return false
    } finally {
      setLoading(false)
    }
  }

  async function notifyStepAssignment(
    documentId: string,
    step: NormalizedWorkflowStep,
    type: string,
    title: string,
    persistenceMode: WorkflowPersistenceMode,
  ) {
    if (step.assignment_type === 'user' && step.assignee_user_id) {
      await notifyUsers(documentId, [step.assignee_user_id], type, title)
      return
    }

    if (
      step.assignment_type === 'group'
      && step.assignee_group_id
      && persistenceMode === 'enterprise'
    ) {
      const { data: enterpriseMembers, error: enterpriseMembersError } = await supabase
        .from('approval_group_members')
        .select('user_id')
        .eq('group_id', step.assignee_group_id)
        .eq('org_id', profile?.org_id ?? '')
        .eq('is_active', true)

      let memberUserIds = (enterpriseMembers ?? [])
        .map((member) => member.user_id)
        .filter((userId): userId is string => Boolean(userId))

      if (
        enterpriseMembersError
        && isWorkflowFoundationUnavailable(enterpriseMembersError)
      ) {
        const { data: legacyMembers, error: legacyMembersError } = await supabase
          .from('approval_group_members')
          .select('profile_id')
          .eq('group_id', step.assignee_group_id)
          .eq('org_id', profile?.org_id ?? '')
          .eq('active', true)

        if (!legacyMembersError) {
          memberUserIds = (legacyMembers ?? [])
            .map((member) => member.profile_id)
            .filter((userId): userId is string => Boolean(userId))
        }
      }

      if (memberUserIds.length) {
        await notifyUsers(documentId, memberUserIds, type, title)
        return
      }
    }

    await notifyByRole(documentId, step.required_role as FlowRole, type, title)
  }

  async function notifyByRole(documentId: string, role: FlowRole, type: string, title: string) {
    if (!profile) return

    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .eq('org_id', profile.org_id)
      .eq('role', role)
      .eq('active', true)

    await notifyUsers(documentId, (users ?? []).map((user) => user.id), type, title)
  }

  async function notifyDocumentAuthor(documentId: string, type: string, title: string) {
    if (!profile) return

    const { data: doc } = await supabase
      .from('documents')
      .select('author_id')
      .eq('id', documentId)
      .eq('org_id', profile.org_id)
      .single()

    if (doc?.author_id) {
      await notifyUsers(documentId, [doc.author_id], type, title)
    }
  }

  async function notifyUsers(documentId: string, userIds: string[], type: string, title: string) {
    if (!profile || !userIds.length) return

    const { data: doc } = await supabase
      .from('documents')
      .select('title, code')
      .eq('id', documentId)
      .eq('org_id', profile.org_id)
      .single()

    const notifications = [...new Set(userIds)].map((userId) => ({
      org_id: profile.org_id,
      user_id: userId,
      document_id: documentId,
      type,
      title,
      body: doc ? `${doc.code ?? ''} — ${doc.title}` : '',
    }))

    await supabase.from('notifications').insert(notifications)
  }

  return {
    submitForReview,
    resubmitAfterCorrection,
    actOnStep,
    obsoleteDocument,
    loading,
    error,
    compatibilityMode,
    compatibilityMessage,
  }
}

function normalizeWorkflowSteps(input: SubmitForReviewInput): NormalizedWorkflowStep[] {
  const steps = input.steps?.length
    ? input.steps
    : [
        {
          step: 1,
          step_label: 'Revisão Técnica',
          required_role: 'reviewer',
          assignment_type: input.reviewerId ? 'user' as const : 'role' as const,
          assignee_id: input.reviewerId ?? null,
          assignee_user_id: input.reviewerId ?? null,
        },
        {
          step: 2,
          step_label: 'Aprovação',
          required_role: 'approver',
          assignment_type: input.approverId ? 'user' as const : 'role' as const,
          assignee_id: input.approverId ?? null,
          assignee_user_id: input.approverId ?? null,
        },
      ]

  const normalized = steps
    .map((step) => {
      const assignmentType = inferAssignmentType(step)
      const assigneeUserId = assignmentType === 'user'
        ? step.assignee_user_id || step.assignee_id || null
        : null

      return {
        ...step,
        step_label: step.step_label?.trim(),
        required_role: step.required_role?.trim(),
        assignment_type: assignmentType,
        assignee_id: assigneeUserId,
        assignee_user_id: assigneeUserId,
        assignee_group_id: assignmentType === 'group' ? step.assignee_group_id || null : null,
        escalation_user_id: step.escalation_user_id || null,
        due_mode: step.due_mode ?? (step.due_at ? 'date' : 'days'),
        due_days: (step.due_mode ?? (step.due_at ? 'date' : 'days')) === 'days'
          ? step.due_days ?? null
          : null,
        due_at: (step.due_mode ?? (step.due_at ? 'date' : 'days')) === 'date'
          ? step.due_at || null
          : null,
        instructions: step.instructions?.trim() || null,
      }
    })
    .sort((left, right) => left.step - right.step)

  if (!normalized.length) throw new Error('Configure pelo menos uma etapa de aprovação.')

  for (const [index, step] of normalized.entries()) {
    if (!step.step_label) throw new Error(`Informe o nome da etapa ${index + 1}.`)
    if (!step.required_role) throw new Error(`Informe o papel obrigatório da etapa ${index + 1}.`)
    if (step.assignment_type === 'user' && !step.assignee_user_id) {
      throw new Error(`Selecione o usuário responsável pela etapa ${index + 1}.`)
    }
    if (step.assignment_type === 'group' && !step.assignee_group_id) {
      throw new Error(`Selecione o grupo responsável pela etapa ${index + 1}.`)
    }
    if (
      step.due_mode === 'days'
      && step.due_days !== null
      && (!Number.isInteger(step.due_days) || step.due_days < 0)
    ) {
      throw new Error(`O prazo da etapa ${index + 1} deve ser um número inteiro não negativo.`)
    }
    if (step.due_mode === 'date' && !normalizeManualDueAt(step.due_at)) {
      throw new Error(`Selecione uma data de prazo válida para a etapa ${index + 1}.`)
    }
    step.step = index + 1
  }

  return normalized as NormalizedWorkflowStep[]
}

function inferAssignmentType(step: WorkflowStepInput): WorkflowAssignmentType {
  if (step.assignment_type === 'group' || step.assignee_group_id) return 'group'
  if (step.assignment_type === 'user' || step.assignee_user_id || step.assignee_id) return 'user'
  return 'role'
}

function normalizePersistedStep(step: NextStepRow): NormalizedWorkflowStep {
  const assignmentType = inferAssignmentType({
    ...step,
    assignment_type:
      step.assignment_type === 'user' || step.assignment_type === 'group'
        ? step.assignment_type
        : 'role',
  })

  return {
    step: step.step,
    step_label: step.step_label,
    required_role: step.required_role,
    assignment_type: assignmentType,
    assignee_id: step.assignee_id ?? null,
    assignee_user_id: step.assignee_user_id ?? step.assignee_id ?? null,
    assignee_group_id: step.assignee_group_id ?? null,
    due_mode: 'days',
    due_days: null,
    due_at: null,
    instructions: null,
    escalation_user_id: null,
  }
}

function normalizeManualDueAt(value?: string | null) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return normalizeDateInputToDueAt(value)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function resolveStepDueAt(step: NormalizedWorkflowStep, nowIso: string) {
  if (step.due_mode === 'date') return normalizeManualDueAt(step.due_at)
  if (step.due_days === null) return null
  return calculateDueAtFromDays(step.due_days, new Date(nowIso))
}

function assertInsertedStepCount(data: { id?: string }[] | null, expected: number) {
  if (!data || data.length !== expected) {
    throw new Error('As etapas do workflow não foram persistidas integralmente.')
  }
}

function documentStatusForRole(role: string) {
  if (role === 'approver') return 'pending_approval'
  return 'in_review'
}
