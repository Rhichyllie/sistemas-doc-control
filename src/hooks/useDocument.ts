import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'
import type { WorkflowAssignmentType } from '@/lib/workflowCompatibility'
import { isWorkflowFoundationUnavailable } from '@/lib/workflowCompatibility'
import type { Document } from './useDocuments'

export interface DocumentVersion {
  id: string
  revision: number
  status?: string
  file_path: string
  file_name: string
  file_size: number | null
  file_hash: string | null
  change_summary: string | null
  change_reason?: string | null
  created_from_version_id?: string | null
  submitted_at?: string | null
  approved_at?: string | null
  published_at?: string | null
  superseded_at?: string | null
  metadata?: Record<string, unknown>
  created_at?: string
  uploaded_at: string
  uploader?: { full_name: string }
}

export interface ApprovalStep {
  id: string
  assignment_type?: WorkflowAssignmentType | null
  assignee_id: string | null
  assignee_user_id?: string | null
  assignee_group_id?: string | null
  decided_by: string | null
  due_at: string | null
  due_days: number | null
  started_at: string | null
  completed_at: string | null
  escalation_user_id: string | null
  created_at: string
  step: number
  step_label: string
  required_role: string
  status: string
  comment: string | null
  instructions?: string | null
  metadata?: Record<string, unknown>
  correction_round?: number | null
  resubmitted_from_step_id?: string | null
  document_version_id?: string | null
  revision_number?: number | null
  decided_at: string | null
  assignee?: { full_name: string }
  assignee_user?: { full_name: string }
  assignee_group?: { name: string }
  decider?: { full_name: string }
}

export interface DocumentDetail extends Document {
  versions: DocumentVersion[]
  approval_steps: ApprovalStep[]
}

export function useDocument(documentId: string | undefined) {
  const { profile } = useAuthContext()
  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDocument = useCallback(async () => {
    if (!profile || !documentId) {
      setDocument(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select(`
          *,
          author:profiles!documents_author_id_fkey (full_name)
        `)
        .eq('id', documentId)
        .eq('org_id', profile.org_id)
        .single()

      if (docError) throw docError

      const { data: versions, error: versionsError } = await supabase
        .from('document_versions')
        .select(`
          *,
          uploader:profiles!document_versions_uploaded_by_fkey (full_name)
        `)
        .eq('document_id', documentId)
        .order('revision', { ascending: false })

      if (versionsError) throw versionsError

      let stepsResult = await supabase
        .from('approval_flows')
        .select(`
          *,
          assignee:profiles!approval_flows_assignee_id_fkey (full_name),
          assignee_user:profiles!approval_flows_assignee_user_id_fkey (full_name),
          assignee_group:approval_groups!approval_flows_assignee_group_id_fkey (name),
          decider:profiles!approval_flows_decided_by_fkey (full_name)
        `)
        .eq('document_id', documentId)
        .order('step', { ascending: true })

      if (stepsResult.error && isWorkflowFoundationUnavailable(stepsResult.error)) {
        stepsResult = await supabase
          .from('approval_flows')
          .select(`
            *,
            assignee:profiles!approval_flows_assignee_id_fkey (full_name),
            decider:profiles!approval_flows_decided_by_fkey (full_name)
          `)
          .eq('document_id', documentId)
          .order('step', { ascending: true })
      }

      if (stepsResult.error && isWorkflowFoundationUnavailable(stepsResult.error)) {
        stepsResult = await supabase
          .from('approval_flows')
          .select(`
            *,
            assignee:profiles!approval_flows_assignee_id_fkey (full_name)
          `)
          .eq('document_id', documentId)
          .order('step', { ascending: true })
      }

      if (stepsResult.error && isWorkflowFoundationUnavailable(stepsResult.error)) {
        stepsResult = await supabase
          .from('approval_flows')
          .select('*')
          .eq('document_id', documentId)
          .order('step', { ascending: true })
      }

      if (stepsResult.error) throw stepsResult.error

      setDocument({
        ...(doc as Document),
        versions: (versions ?? []) as DocumentVersion[],
        approval_steps: (stepsResult.data ?? []) as unknown as ApprovalStep[],
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar documento')
    } finally {
      setLoading(false)
    }
  }, [profile, documentId])

  useEffect(() => {
    fetchDocument()
  }, [fetchDocument])

  return { document, loading, error, refetch: fetchDocument }
}
