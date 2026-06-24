import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'

/*
 * P-5 workflow findings before implementation:
 * - src/routes/authenticated/fluxo-de-aprovacao.tsx rendered a large legacy approval shell backed by
 *   LocalDataProvider state, local flow/step/history arrays, and an Edge Function email call; it did
 *   not read the enterprise approval_flows table directly.
 * - src/routes/authenticated/documents.$documentId.tsx showed real document detail data, versions,
 *   file download, and a raw approval steps list, but it had no wired approve/reject, submit, or
 *   obsolete workflow actions.
 * - supabase/seed.sql creates approval_flows demo rows for document 0005 with step 1 "Revisão Técnica"
 *   assigned to the reviewer and pending, and document 0006 with step 1 approved plus step 2
 *   "Aprovação" assigned to the approver and pending.
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

interface SubmitForReviewInput {
  documentId: string
  reviewerId?: string
  approverId?: string
}

export function useApprovalFlow() {
  const { profile } = useAuthContext()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitForReview(input: SubmitForReviewInput): Promise<boolean> {
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

      const { error: stepsError } = await supabase.from('approval_flows').insert([
        {
          document_id: input.documentId,
          org_id: profile.org_id,
          step: 1,
          step_label: 'Revisão Técnica',
          required_role: 'reviewer',
          assignee_id: input.reviewerId ?? null,
          status: 'pending',
        },
        {
          document_id: input.documentId,
          org_id: profile.org_id,
          step: 2,
          step_label: 'Aprovação',
          required_role: 'approver',
          assignee_id: input.approverId ?? null,
          status: 'pending',
        },
      ])

      if (stepsError) throw stepsError

      await supabase.from('audit_trail').insert({
        document_id: input.documentId,
        org_id: profile.org_id,
        user_id: profile.id,
        action: 'submitted_for_review',
        old_status: 'draft',
        new_status: 'in_review',
      })

      if (input.reviewerId) {
        await notifyUsers(input.documentId, [input.reviewerId], 'approval_required', 'Documento aguarda sua revisão técnica')
      } else {
        await notifyByRole(input.documentId, 'reviewer', 'approval_required', 'Documento aguarda sua revisão técnica')
      }

      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao submeter para revisão')
      return false
    } finally {
      setLoading(false)
    }
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
      const nextStepStatus = input.action === 'approve' ? 'approved' : 'rejected'
      const { data: step, error: stepError } = await supabase
        .from('approval_flows')
        .update({
          status: nextStepStatus,
          comment: input.comment ?? null,
          decided_by: profile.id,
          decided_at: now,
        })
        .eq('id', input.stepId)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .select('step, document_id')
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
          .update({ status: 'skipped' })
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

      if (step.step === 1) {
        await supabase
          .from('documents')
          .update({ status: 'pending_approval', updated_at: now })
          .eq('id', input.documentId)
          .eq('org_id', profile.org_id)

        await supabase.from('audit_trail').insert({
          document_id: input.documentId,
          org_id: profile.org_id,
          user_id: profile.id,
          action: 'review_approved',
          old_status: 'in_review',
          new_status: 'pending_approval',
        })

        const { data: nextStep } = await supabase
          .from('approval_flows')
          .select('assignee_id')
          .eq('document_id', input.documentId)
          .eq('org_id', profile.org_id)
          .eq('step', 2)
          .eq('status', 'pending')
          .maybeSingle()

        if (nextStep?.assignee_id) {
          await notifyUsers(input.documentId, [nextStep.assignee_id], 'approval_required', 'Documento aguarda sua aprovação final')
        } else {
          await notifyByRole(input.documentId, 'approver', 'approval_required', 'Documento aguarda sua aprovação final')
        }
      } else if (step.step === 2) {
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
          old_status: 'pending_approval',
          new_status: 'published',
        })

        await notifyDocumentAuthor(input.documentId, 'document_approved', 'Seu documento foi aprovado e publicado')
      }

      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao processar aprovação')
      return false
    } finally {
      setLoading(false)
    }
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
      setError(err instanceof Error ? err.message : 'Erro ao tornar documento obsoleto')
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

    const notifications = userIds.map((userId) => ({
      org_id: profile.org_id,
      user_id: userId,
      document_id: documentId,
      type,
      title,
      body: doc ? `${doc.code ?? ''} — ${doc.title}` : '',
    }))

    await supabase.from('notifications').insert(notifications)
  }

  return { submitForReview, actOnStep, obsoleteDocument, loading, error }
}
