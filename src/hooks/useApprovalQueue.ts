import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'

export interface QueueItem {
  stepId: string
  step: number
  step_label: string
  required_role: string
  assignee_id: string | null
  created_at: string
  documentId: string
  code: string | null
  title: string
  doc_type: string
  area: string
  doc_status: string
  author_name: string | null
  org_id: string
}

interface QueueRow {
  id: string
  step: number
  step_label: string
  required_role: string
  assignee_id: string | null
  created_at: string
  documents?: {
    id: string
    code: string | null
    title: string
    doc_type: string
    area: string
    status: string
    org_id: string
    author?: { full_name: string } | { full_name: string }[] | null
  } | {
    id: string
    code: string | null
    title: string
    doc_type: string
    area: string
    status: string
    org_id: string
    author?: { full_name: string } | { full_name: string }[] | null
  }[] | null
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function isStepActiveForDocument(step: number, documentStatus: string) {
  if (step === 1) return documentStatus === 'in_review'
  if (step === 2) return documentStatus === 'pending_approval'
  return true
}

export function useApprovalQueue() {
  const { profile } = useAuthContext()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    if (!profile) {
      setQueue([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('approval_flows')
        .select(`
          id,
          step,
          step_label,
          required_role,
          assignee_id,
          created_at,
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
        `)
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (!['admin', 'manager'].includes(profile.role)) {
        query = query
          .eq('required_role', profile.role)
          .or(`assignee_id.eq.${profile.id},assignee_id.is.null`)
      }

      const { data, error: queryError } = await query
      if (queryError) throw queryError

      const items: QueueItem[] = ((data ?? []) as QueueRow[])
        .map((row) => {
          const document = first(row.documents)
          const author = first(document?.author)

          return {
            stepId: row.id,
            step: row.step,
            step_label: row.step_label,
            required_role: row.required_role,
            assignee_id: row.assignee_id,
            created_at: row.created_at,
            documentId: document?.id ?? '',
            code: document?.code ?? null,
            title: document?.title ?? '',
            doc_type: document?.doc_type ?? '',
            area: document?.area ?? '',
            doc_status: document?.status ?? '',
            author_name: author?.full_name ?? null,
            org_id: document?.org_id ?? profile.org_id,
          }
        })
        .filter((item) => item.documentId && isStepActiveForDocument(item.step, item.doc_status))

      setQueue(items)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar fila')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  return { queue, loading, error, refetch: fetchQueue }
}
