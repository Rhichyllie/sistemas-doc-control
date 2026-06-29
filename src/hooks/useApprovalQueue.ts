import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'
import { getErrorMessage } from '@/lib/errorUtils'

export interface QueueItem {
  stepId: string
  step: number
  step_label: string
  required_role: string
  assignee_id: string | null
  assignee_name: string | null
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

interface QueueRow {
  id: string
  step: number
  step_label: string
  required_role: string
  assignee_id: string | null
  due_at?: string | null
  created_at: string
  assignee?: { full_name: string } | { full_name: string }[] | null
  documents?: {
    id: string
    code: string | null
    title: string
    project_id?: string | null
    doc_type: string
    area: string
    status: string
    org_id: string
    author?: { full_name: string } | { full_name: string }[] | null
    project?: { name: string } | { name: string }[] | null
  } | {
    id: string
    code: string | null
    title: string
    project_id?: string | null
    doc_type: string
    area: string
    status: string
    org_id: string
    author?: { full_name: string } | { full_name: string }[] | null
    project?: { name: string } | { name: string }[] | null
  }[] | null
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function getDaysUntilDue(value: string | null) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return ['42703', 'PGRST200', 'PGRST204'].includes(error.code ?? '')
    || /due_at|projects|relationship/i.test(error.message ?? '')
}

const QUEUE_SELECT = `
  id,
  step,
  step_label,
  required_role,
  assignee_id,
  due_at,
  created_at,
  assignee:profiles!approval_flows_assignee_id_fkey (full_name),
  documents (
    id,
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

const QUEUE_FALLBACK_SELECT = `
  id,
  step,
  step_label,
  required_role,
  assignee_id,
  created_at,
  assignee:profiles!approval_flows_assignee_id_fkey (full_name),
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
`

export function useApprovalQueue() {
  const { profile } = useAuthContext()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [schemaFallback, setSchemaFallback] = useState(false)

  const fetchQueue = useCallback(async () => {
    if (!profile) {
      setQueue([])
      setLoading(false)
      return
    }

    const currentProfile = profile
    setLoading(true)
    setError(null)
    setSchemaFallback(false)

    try {
      async function runQuery(select: string) {
        let query = supabase
          .from('approval_flows')
          .select(select)
          .eq('org_id', currentProfile.org_id)
          .eq('status', 'pending')
          .order('step', { ascending: true })

        if (!['admin', 'manager'].includes(currentProfile.role)) {
          query = query
            .eq('required_role', currentProfile.role)
            .or(`assignee_id.eq.${currentProfile.id},assignee_id.is.null`)
        }

        return query
      }

      let { data, error: queryError } = await runQuery(QUEUE_SELECT)
      if (queryError && isOptionalSchemaError(queryError)) {
        const fallbackResult = await runQuery(QUEUE_FALLBACK_SELECT)
        data = fallbackResult.data
        queryError = fallbackResult.error
        if (!queryError) setSchemaFallback(true)
      }
      if (queryError) throw queryError

      const items: QueueItem[] = ((data ?? []) as unknown as QueueRow[])
        .map((row) => {
          const document = first(row.documents)
          const author = first(document?.author)
          const project = first(document?.project)
          const assignee = first(row.assignee)
          const dueAt = row.due_at ?? null
          const daysUntilDue = getDaysUntilDue(dueAt)

          return {
            stepId: row.id,
            step: row.step,
            step_label: row.step_label,
            required_role: row.required_role,
            assignee_id: row.assignee_id,
            assignee_name: assignee?.full_name ?? null,
            due_at: dueAt,
            days_until_due: daysUntilDue,
            overdue: daysUntilDue !== null && daysUntilDue < 0,
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
        .filter((item) => item.documentId)

      setQueue(items)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao carregar fila'))
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  return { queue, loading, error, schemaFallback, refetch: fetchQueue }
}

