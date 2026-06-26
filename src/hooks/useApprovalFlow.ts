import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'
import { getErrorMessage } from '@/lib/errorUtils'

/*
 * P-5 workflow findings before implementation:
 * - src/routes/authenticated/fluxo-de-aprovacao.tsx rendered a large legacy approval shell backed by
 *   LocalDataProvider state, local flow/step/history arrays, and an Edge Function email call; it did
 *   not read the enterprise approval_flows table directly.
 * - src/routes/authenticated/documents.$documentId.tsx showed real document detail data, versions,
 *   file download, and a raw approval steps list, but it had no wired approve/reject, submit, or
 *   obsolete workflow actions.
 * - supabase/seed.sql creates approval_flows demo rows for document 0005 with step 1 "RevisÃ£o TÃ©cnica"
 *   assigned to the reviewer and pending, and document 0006 with step 1 approved plus step 2
 *   "AprovaÃ§Ã£o" assigned to the approver and pending.
 * - Manual flow check: draft -> submitForReview() -> in_review; in_review -> actOnStep(approve, step=1)
 *   -> pending_approval; pending_approval -> actOnStep(approve, step=2) -> published; any step ->
 *   actOnStep(reject) -> draft; published -> obsoleteDocument() -> obsolete.
 */

export type FlowAction = 'submit' | 'approve' | 'reject' | 'publish' | 'obsolete'

type FlowRole = 'reviewer' | 'approver' | 'author' | 'manager' | 'admin'

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
  assignee_id?: string | null
  due_days?: number | null
  escalation_user_id?: string | null
}

interface SubmitForReviewInput {
  documentId: string
  steps?: WorkflowStepInput[]
  reviewerId?: string
  approverId?: string
}

export function useApprovalFlow() {
  const { profile } = useAuthContext()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitForReview(input: SubmitForReviewInput): Promise<boolean> {
    if (!profile) {
      setError('UsuÃ¡rio nÃ£o autenticado')
      return false
    }

    setLoading(true)
    setError(null)

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

      const { error: deleteError } = await supabase
        .from('approval_flows')
        .delete()
        .eq('document_id', input.documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')

      if (deleteError) throw deleteError

      const { error: stepsError } = await supabase.from('approval_flows').insert(
        workflowSteps.map((step, index) => ({
          document_id: input.documentId,
          org_id: profile.org_id,
          step: step.step,
          step_label: step.step_label,
          required_role: step.required_role,
          assignee_id: step.assignee_id ?? null,
          status: 'pending',
          due_days: step.due_days ?? null,
          due_at: buildDueAt(now, step.due_days),
          started_at: index === 0 ? now : null,
          escalation_user_id: step.escalation_user_id ?? null,
          metadata: { sequential: true },
        })),
      )

      if (stepsError) throw stepsError

      await supabase.from('audit_trail').insert({
        document_id: input.documentId,
        org_id: profile.org_id,
        user_id: profile.id,
        action: 'submitted_for_review',
        old_status: 'draft',
        new_status: 'in_review',
      })

      const firstStep = workflowSteps[0]
      if (firstStep.assignee_id) {
        await notifyUsers(input.documentId, [firstStep.assignee_id], 'approval_required', `Documento aguarda ${firstStep.step_label}`)
      } else {
        await notifyByRole(input.documentId, firstStep.required_role as FlowRole, 'approval_required', `Documento aguarda ${firstStep.step_label}`)
      }

      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao submeter para revisÃ£o')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function actOnStep(input: ActOnStepInput): Promise<boolean> {
    if (!profile) {
      setError('UsuÃ¡rio nÃ£o autenticado')
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
      if (!pendingStep || pendingStep.status !== 'pending') throw new Error('Esta etapa não está pendente.')

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
        input.action === 'approve' &&
        pendingStep.required_role === 'approver' &&
        doc.author_id === profile.id &&
        !['admin', 'manager'].includes(profile.role)
      ) {
        throw new Error('O autor nÃ£o pode aprovar a etapa final do prÃ³prio documento.')
      }

      const { data: step, error: stepError } = await supabase
        .from('approval_flows')
        .update({
          status: nextStepStatus,
          comment: input.comment ?? null,
          decided_by: profile.id,
          decided_at: now,
          completed_at: now,
        })
        .eq('id', input.stepId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .select('step, document_id, required_role, status')
        .single()

      if (stepError) throw stepError

      if (input.action === 'reject') {
        await supabase
          .from('documents')
          .update({ status: 'draft', updated_at: now })
          .eq('id', input.documentId)
          .eq('org_id', profile.org_id)

        await supabase
          .from('approval_flows')
          .update({ status: 'skipped', completed_at: now })
          .eq('document_id', input.documentId)
          .eq('org_id', profile.org_id)
          .eq('status', 'pending')

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

      const { data: nextStep } = await supabase
        .from('approval_flows')
        .select('id, step, step_label, required_role, assignee_id')
        .eq('document_id', input.documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .order('step', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (nextStep) {
        await supabase
          .from('approval_flows')
          .update({ started_at: now })
          .eq('id', nextStep.id)
          .is('started_at', null)

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

        if (nextStep?.assignee_id) {
          await notifyUsers(input.documentId, [nextStep.assignee_id], 'approval_required', `Documento aguarda ${nextStep.step_label}`)
        } else {
          await notifyByRole(input.documentId, nextStep.required_role as FlowRole, 'approval_required', `Documento aguarda ${nextStep.step_label}`)
        }
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
      setError(err instanceof Error ? err.message : 'Erro ao processar aprovaÃ§Ã£o')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function obsoleteDocument(documentId: string): Promise<boolean> {
    if (!profile) {
      setError('UsuÃ¡rio nÃ£o autenticado')
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
      body: doc ? `${doc.code ?? ''} â€” ${doc.title}` : '',
    }))

    await supabase.from('notifications').insert(notifications)
  }

  return { submitForReview, actOnStep, obsoleteDocument, loading, error }
}

function normalizeWorkflowSteps(input: SubmitForReviewInput): WorkflowStepInput[] {
  const steps = input.steps?.length
    ? input.steps
    : [
        {
          step: 1,
          step_label: 'RevisÃ£o TÃ©cnica',
          required_role: 'reviewer',
          assignee_id: input.reviewerId ?? null,
        },
        {
          step: 2,
          step_label: 'AprovaÃ§Ã£o',
          required_role: 'approver',
          assignee_id: input.approverId ?? null,
        },
      ]

  const normalized = steps
    .map((step) => ({
      ...step,
      step_label: step.step_label?.trim(),
      required_role: step.required_role?.trim(),
      assignee_id: step.assignee_id || null,
      escalation_user_id: step.escalation_user_id || null,
      due_days: step.due_days ?? null,
    }))
    .sort((a, b) => a.step - b.step)

  if (!normalized.length) throw new Error('Configure pelo menos uma etapa de aprovaÃ§Ã£o.')

  for (const [index, step] of normalized.entries()) {
    if (!step.step_label) throw new Error(`Informe o nome da etapa ${index + 1}.`)
    if (!step.required_role) throw new Error(`Informe o papel obrigatÃ³rio da etapa ${index + 1}.`)
    step.step = index + 1
  }

  return normalized
}

function buildDueAt(nowIso: string, dueDays?: number | null) {
  if (!dueDays) return null
  const due = new Date(nowIso)
  due.setDate(due.getDate() + dueDays)
  return due.toISOString()
}

function documentStatusForRole(role: string) {
  if (role === 'approver') return 'pending_approval'
  return 'in_review'
}

