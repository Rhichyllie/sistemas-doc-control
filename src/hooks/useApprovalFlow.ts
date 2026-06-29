import { useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errorUtils'
import {
  isWorkflowFoundationUnavailable,
  type WorkflowAssignmentType,
} from '@/lib/workflowCompatibility'

export type FlowAction = 'submit' | 'approve' | 'reject' | 'publish' | 'obsolete'

type FlowRole = 'reviewer' | 'approver' | 'author' | 'manager' | 'admin'
type WorkflowPersistenceMode = 'enterprise' | 'legacy_sla' | 'legacy_base'

const BLOCKED_DOCUMENT_STATUSES = ['draft', 'published', 'obsolete']

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
  due_days?: number | null
  instructions?: string | null
  escalation_user_id?: string | null
}

interface NormalizedWorkflowStep extends WorkflowStepInput {
  assignment_type: WorkflowAssignmentType
  assignee_id: string | null
  assignee_user_id: string | null
  assignee_group_id: string | null
  due_days: number | null
  instructions: string | null
  escalation_user_id: string | null
}

interface SubmitForReviewInput {
  documentId: string
  steps?: WorkflowStepInput[]
  reviewerId?: string
  approverId?: string
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

    try {
      const now = new Date().toISOString()
      const workflowSteps = normalizeWorkflowSteps(input)

      const { error: updateError } = await supabase
        .from('documents')
        .update({ status: 'in_review', updated_at: now })
        .eq('id', input.documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'draft')

      if (updateError) throw updateError
      documentMovedToReview = true

      const { error: deleteError } = await supabase
        .from('approval_flows')
        .delete()
        .eq('document_id', input.documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')

      if (deleteError) throw deleteError

      const persistenceMode = await insertWorkflowSteps(input.documentId, workflowSteps, now)
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
      }

      await supabase.from('audit_trail').insert({
        document_id: input.documentId,
        org_id: profile.org_id,
        user_id: profile.id,
        action: 'submitted_for_review',
        old_status: 'draft',
        new_status: 'in_review',
        metadata: { workflow_mode: persistenceMode },
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
        await supabase
          .from('documents')
          .update({ status: 'draft', updated_at: new Date().toISOString() })
          .eq('id', input.documentId)
          .eq('org_id', profile.org_id)
          .eq('status', 'in_review')
      }
      setError(getErrorMessage(err, 'Erro ao submeter para revisão'))
      return false
    } finally {
      setLoading(false)
    }
  }

  async function insertWorkflowSteps(
    documentId: string,
    workflowSteps: NormalizedWorkflowStep[],
    now: string,
  ): Promise<WorkflowPersistenceMode> {
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
      due_at: buildDueAt(now, step.due_days),
      started_at: index === 0 ? now : null,
      escalation_user_id: step.escalation_user_id,
      instructions: step.instructions,
      metadata: { sequential: true, assignment_type: step.assignment_type },
    }))

    let result = await supabase.from('approval_flows').insert(enterpriseRows)
    if (!result.error) return 'enterprise'
    if (!isWorkflowFoundationUnavailable(result.error)) throw result.error

    const legacySlaRows = workflowSteps.map((step, index) => ({
      ...commonRows[index],
      assignee_id: step.assignment_type === 'user' ? step.assignee_user_id : null,
      due_days: step.due_days,
      due_at: buildDueAt(now, step.due_days),
      started_at: index === 0 ? now : null,
      escalation_user_id: step.escalation_user_id,
      metadata: {
        sequential: true,
        requested_assignment_type: step.assignment_type,
        requested_group_id: step.assignment_type === 'group' ? step.assignee_group_id : null,
      },
    }))

    result = await supabase.from('approval_flows').insert(legacySlaRows)
    if (!result.error) return 'legacy_sla'
    if (!isWorkflowFoundationUnavailable(result.error)) throw result.error

    const legacyBaseRows = workflowSteps.map((step, index) => ({
      ...commonRows[index],
      assignee_id: step.assignment_type === 'user' ? step.assignee_user_id : null,
    }))

    result = await supabase.from('approval_flows').insert(legacyBaseRows)
    if (result.error) throw result.error
    return 'legacy_base'
  }

  async function actOnStep(input: ActOnStepInput): Promise<boolean> {
    if (!profile) {
      setError('Usuário não autenticado')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      const now = new Date().toISOString()
      if (input.action === 'reject' && !input.comment?.trim()) {
        throw new Error('Informe o motivo da rejeição.')
      }
      const nextStepStatus = input.action === 'approve' ? 'approved' : 'rejected'

      const { data: pendingStep, error: pendingStepError } = await supabase
        .from('approval_flows')
        .select('step, document_id, required_role, status')
        .eq('id', input.stepId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .single()

      if (pendingStepError) throw pendingStepError
      if (!pendingStep || pendingStep.status !== 'pending') {
        throw new Error('Esta etapa não está pendente.')
      }

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
        await supabase
          .from('documents')
          .update({ status: 'draft', updated_at: now })
          .eq('id', input.documentId)
          .eq('org_id', profile.org_id)

        let skipResult = await supabase
          .from('approval_flows')
          .update({ status: 'skipped', completed_at: now })
          .eq('document_id', input.documentId)
          .eq('org_id', profile.org_id)
          .eq('status', 'pending')

        if (skipResult.error && isWorkflowFoundationUnavailable(skipResult.error)) {
          skipResult = await supabase
            .from('approval_flows')
            .update({ status: 'skipped' })
            .eq('document_id', input.documentId)
            .eq('org_id', profile.org_id)
            .eq('status', 'pending')
        }
        if (skipResult.error) throw skipResult.error

        await supabase.from('audit_trail').insert({
          document_id: input.documentId,
          org_id: profile.org_id,
          user_id: profile.id,
          action: 'rejected',
          new_status: 'draft',
          metadata: { comment: input.comment, step: step.step },
        })

        await notifyDocumentAuthor(
          input.documentId,
          'document_rejected',
          `Documento rejeitado na etapa ${step.step}: ${input.comment ?? ''}`,
        )

        return true
      }

      const nextStep = await fetchNextStep(input.documentId)

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
      .select('step, document_id, required_role, status')
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
        .select('step, document_id, required_role, status')
        .single()
    }

    if (result.error) throw result.error
    return result.data
  }

  async function fetchNextStep(documentId: string): Promise<NextStepRow | null> {
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
        .order('step', { ascending: true })
        .limit(1)
        .maybeSingle()
    }

    if (result.error) throw result.error
    return result.data as NextStepRow | null
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
      const { data: members, error: membersError } = await supabase
        .from('approval_group_members')
        .select('user_id')
        .eq('group_id', step.assignee_group_id)
        .eq('org_id', profile?.org_id ?? '')
        .eq('is_active', true)

      if (!membersError && members?.length) {
        await notifyUsers(documentId, members.map((member) => member.user_id), type, title)
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
        due_days: step.due_days ?? null,
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
    if (step.due_days !== null && step.due_days < 0) {
      throw new Error(`O prazo da etapa ${index + 1} não pode ser negativo.`)
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
    due_days: null,
    instructions: null,
    escalation_user_id: null,
  }
}

function buildDueAt(nowIso: string, dueDays?: number | null) {
  if (dueDays === null || dueDays === undefined) return null
  const due = new Date(nowIso)
  due.setDate(due.getDate() + dueDays)
  return due.toISOString()
}

function documentStatusForRole(role: string) {
  if (role === 'approver') return 'pending_approval'
  return 'in_review'
}
