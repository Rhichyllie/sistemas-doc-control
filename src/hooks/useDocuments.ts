import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'

/*
 * P-4 document findings before implementation:
 * - src/routes/authenticated/documents.tsx renders the document list today.
 * - Each row is currently rendered inline inside DocumentsPage with shadcn Table rows.
 * - The same DocumentsPage has an inline "Novo Documento" dialog/form for creation.
 * - There was no single-document route; P-4 adds /authenticated/documents/$documentId.
 * - Existing form fields included code, title, project/discipline/doc type, revision,
 *   origin/status, received/deadline/responsible fields; P-4 makes code read-only
 *   because the database trigger generates it and maps creation to the enterprise schema.
 */

export interface Document {
  id: string
  org_id: string
  code: string | null
  title: string
  project_id: string | null
  doc_type: string
  area: string
  status: string
  revision: number
  description: string | null
  file_path: string | null
  file_name: string | null
  file_size: number | null
  next_review_at: string | null
  author_id: string
  published_at: string | null
  created_at: string
  updated_at: string
  author?: { full_name: string }
  project?: { id: string; code: string; name: string } | null
}

export interface DocumentFilters {
  status?: string
  doc_type?: string
  area?: string
  search?: string
}

function isOptionalProjectError(error: { code?: string; message?: string }) {
  return ['42703', 'PGRST200', 'PGRST204'].includes(error.code ?? '')
    || /project_id|projects|relationship/i.test(error.message ?? '')
}

export function useDocuments(filters: DocumentFilters = {}) {
  const { profile } = useAuthContext()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [schemaFallback, setSchemaFallback] = useState(false)

  const fetchDocuments = useCallback(async () => {
    if (!profile) {
      setDocuments([])
      setLoading(false)
      return
    }

    const currentProfile = profile
    setLoading(true)
    setError(null)
    setSchemaFallback(false)

    try {
      async function runQuery(includeProject: boolean) {
        let query = supabase
          .from('documents')
          .select(includeProject ? `
            *,
            author:profiles!documents_author_id_fkey (full_name),
            project:projects!documents_project_id_fkey (id, code, name)
          ` : `
            *,
            author:profiles!documents_author_id_fkey (full_name)
          `)
          .eq('org_id', currentProfile.org_id)
          .order('created_at', { ascending: false })

        if (filters.status) query = query.eq('status', filters.status)
        if (filters.doc_type) query = query.eq('doc_type', filters.doc_type)
        if (filters.area) query = query.eq('area', filters.area)
        if (filters.search) query = query.ilike('title', `%${filters.search}%`)

        return query
      }

      let { data, error: queryError } = await runQuery(true)
      if (queryError && isOptionalProjectError(queryError)) {
        const fallbackResult = await runQuery(false)
        data = fallbackResult.data
        queryError = fallbackResult.error
        if (!queryError) setSchemaFallback(true)
      }

      if (queryError) throw queryError
      setDocuments((data ?? []) as unknown as Document[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar documentos')
    } finally {
      setLoading(false)
    }
  }, [profile, filters.status, filters.doc_type, filters.area, filters.search])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  return { documents, loading, error, schemaFallback, refetch: fetchDocuments }
}
