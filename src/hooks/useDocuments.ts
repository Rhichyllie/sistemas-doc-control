import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  getDocumentCorrectionSummary,
  type CorrectionStepLike,
  type DocumentCorrectionSummary,
} from '@/lib/documentCorrection'
import { isWorkflowFoundationUnavailable } from '@/lib/workflowCompatibility'

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
  published_version_id?: string | null
  working_version_id?: string | null
  working_revision?: {
    id: string
    revision: number
    status: string
  } | null
  published_revision?: {
    id: string
    revision: number
    status: string
  } | null
  correction?: DocumentCorrectionSummary | null
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

      const loadedDocuments = (data ?? []) as unknown as Document[]
      const documentIds = loadedDocuments.map((document) => document.id)
      if (documentIds.length) {
        const { data: versionStates, error: versionStateError } = await supabase
          .from('document_versions')
          .select('id, document_id, revision, status')
          .eq('org_id', currentProfile.org_id)
          .in('document_id', documentIds)
          .in('status', ['draft', 'in_review', 'pending_approval', 'rejected', 'published'])

        if (!versionStateError) {
          for (const document of loadedDocuments) {
            const documentVersions = (versionStates ?? [])
              .filter((version) => version.document_id === document.id)
              .sort((left, right) => right.revision - left.revision)
            const working = documentVersions.find((version) =>
              ['draft', 'in_review', 'pending_approval', 'rejected'].includes(version.status),
            )
            const published = documentVersions.find((version) => version.status === 'published')
            document.working_revision = working
              ? { id: working.id, revision: working.revision, status: working.status }
              : null
            document.published_revision = published
              ? { id: published.id, revision: published.revision, status: published.status }
              : null
          }
        } else if (isWorkflowFoundationUnavailable(versionStateError)) {
          setSchemaFallback(true)
        }
      }

      const draftDocumentIds = loadedDocuments
        .filter((document) => document.status === 'draft')
        .map((document) => document.id)

      if (draftDocumentIds.length) {
        const enterpriseCorrectionResult = await supabase
          .from('approval_flows')
          .select('id, document_id, status, comment, correction_round, metadata, created_at, decided_at, completed_at')
          .eq('org_id', currentProfile.org_id)
          .in('document_id', draftDocumentIds)
          .in('status', ['rejected', 'pending'])

        let correctionData = enterpriseCorrectionResult.data as unknown[] | null
        let correctionError = enterpriseCorrectionResult.error

        if (correctionError && isWorkflowFoundationUnavailable(correctionError)) {
          const metadataCorrectionResult = await supabase
            .from('approval_flows')
            .select('id, document_id, status, comment, metadata, created_at, decided_at, completed_at')
            .eq('org_id', currentProfile.org_id)
            .in('document_id', draftDocumentIds)
            .in('status', ['rejected', 'pending'])
          correctionData = metadataCorrectionResult.data as unknown[] | null
          correctionError = metadataCorrectionResult.error
          if (!correctionError) setSchemaFallback(true)
        }

        if (correctionError && isWorkflowFoundationUnavailable(correctionError)) {
          const baseCorrectionResult = await supabase
            .from('approval_flows')
            .select('id, document_id, status, comment, created_at, decided_at')
            .eq('org_id', currentProfile.org_id)
            .in('document_id', draftDocumentIds)
            .in('status', ['rejected', 'pending'])
          correctionData = baseCorrectionResult.data as unknown[] | null
          correctionError = baseCorrectionResult.error
          if (!correctionError) setSchemaFallback(true)
        }

        if (!correctionError) {
          const stepsByDocument = new Map<string, CorrectionStepLike[]>()
          for (const rawRow of correctionData ?? []) {
            const row = rawRow as CorrectionStepLike & { document_id: string }
            const rows = stepsByDocument.get(row.document_id) ?? []
            rows.push(row)
            stepsByDocument.set(row.document_id, rows)
          }

          for (const document of loadedDocuments) {
            if (document.status !== 'draft') continue
            document.correction = getDocumentCorrectionSummary({
              status: document.status,
              author_id: document.author_id,
              approval_steps: stepsByDocument.get(document.id) ?? [],
            })
          }
        }
      }

      setDocuments(loadedDocuments)
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
