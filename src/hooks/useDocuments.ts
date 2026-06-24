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
}

export interface DocumentFilters {
  status?: string
  doc_type?: string
  area?: string
  search?: string
}

export function useDocuments(filters: DocumentFilters = {}) {
  const { profile } = useAuthContext()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDocuments = useCallback(async () => {
    if (!profile) {
      setDocuments([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('documents')
        .select(`
          *,
          author:profiles!documents_author_id_fkey (full_name)
        `)
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })

      if (filters.status) query = query.eq('status', filters.status)
      if (filters.doc_type) query = query.eq('doc_type', filters.doc_type)
      if (filters.area) query = query.eq('area', filters.area)
      if (filters.search) query = query.ilike('title', `%${filters.search}%`)

      const { data, error: queryError } = await query

      if (queryError) throw queryError
      setDocuments((data ?? []) as Document[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar documentos')
    } finally {
      setLoading(false)
    }
  }, [profile, filters.status, filters.doc_type, filters.area, filters.search])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  return { documents, loading, error, refetch: fetchDocuments }
}
