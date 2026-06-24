import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'

/*
 * P-6 findings before implementation:
 * - Authenticated route files currently include dashboard.tsx, documents.tsx, documents.$documentId.tsx,
 *   fluxo-de-aprovacao.tsx, projects.tsx, disciplines.tsx, projetistas.tsx, equipe.tsx, route.tsx,
 *   -route-guards.ts, and a test file; there was no audit/trilha route and no relatorios route.
 * - The dashboard route existed at /authenticated/dashboard, but rendered legacy LocalDataProvider-driven
 *   metrics, filters, dialogs, local notification checks, and charts derived from old document fields
 *   rather than the P-2/P-4 enterprise documents schema.
 * - package.json already includes jspdf, jspdf-autotable, xlsx, and recharts, so P-6 can implement
 *   real PDF, Excel, and chart exports without adding dependencies.
 */

export interface AuditEntry {
  id: string
  document_id: string
  org_id: string
  user_id: string
  action: string
  old_status: string | null
  new_status: string | null
  file_hash: string | null
  metadata: Record<string, unknown>
  created_at: string
  user?: { full_name: string }
  document?: { code: string | null; title: string }
}

export interface AuditFilters {
  document_id?: string
  user_id?: string
  action?: string
  date_from?: string
  date_to?: string
  search?: string
}

interface DocumentSearchRow {
  id: string
}

export function useAuditTrail(filters: AuditFilters = {}) {
  const { profile } = useAuthContext()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const fetchAudit = useCallback(async () => {
    if (!profile) {
      setEntries([])
      setTotal(0)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      let documentIds: string[] | null = null

      if (filters.search?.trim()) {
        const term = filters.search.trim()
        const { data: matchingDocuments, error: searchError } = await supabase
          .from('documents')
          .select('id')
          .eq('org_id', profile.org_id)
          .or(`code.ilike.%${term}%,title.ilike.%${term}%`)

        if (searchError) throw searchError
        documentIds = ((matchingDocuments ?? []) as DocumentSearchRow[]).map((document) => document.id)

        if (documentIds.length === 0) {
          setEntries([])
          setTotal(0)
          setLoading(false)
          return
        }
      }

      let query = supabase
        .from('audit_trail')
        .select(`
          *,
          user:profiles!audit_trail_user_id_fkey (full_name),
          document:documents!audit_trail_document_id_fkey (code, title)
        `, { count: 'exact' })
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
        .limit(200)

      if (filters.document_id) query = query.eq('document_id', filters.document_id)
      if (filters.user_id) query = query.eq('user_id', filters.user_id)
      if (filters.action) query = query.eq('action', filters.action)
      if (filters.date_from) query = query.gte('created_at', filters.date_from)
      if (filters.date_to) query = query.lte('created_at', `${filters.date_to}T23:59:59Z`)
      if (documentIds) query = query.in('document_id', documentIds)

      const { data, error: queryError, count } = await query
      if (queryError) throw queryError

      setEntries((data ?? []) as AuditEntry[])
      setTotal(count ?? 0)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar trilha de auditoria')
    } finally {
      setLoading(false)
    }
  }, [profile, filters.document_id, filters.user_id, filters.action, filters.date_from, filters.date_to, filters.search])

  useEffect(() => {
    fetchAudit()
  }, [fetchAudit])

  return { entries, loading, error, total, refetch: fetchAudit }
}
