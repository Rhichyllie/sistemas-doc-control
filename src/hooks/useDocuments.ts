import { useEffect, useState, useCallback } from 'react'
import { useLibraryScope } from '@/contexts/library-context'
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
  library_id?: string | null
  code: string | null
  title: string
  project_id: string | null
  discipline_id?: string | null
  doc_type: string
  area: string
  status: string
  register_status?: string | null
  revision: number
  register_revision?: string | null
  description: string | null
  file_path: string | null
  file_name: string | null
  file_size: number | null
  next_review_at: string | null
  received_at?: string | null
  analysis_days?: number | null
  analysis_deadline?: string | null
  external_link?: string | null
  author_id: string
  published_at: string | null
  created_at: string
  updated_at: string
  published_version_id?: string | null
  working_version_id?: string | null
  code_pattern_id?: string | null
  code_generation_mode?: string | null
  manual_code?: boolean
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

const LOCAL_DOCUMENTS_STORAGE_PREFIX = 'tramita.documents.local.'

function getLocalDocumentsStorageKey(orgId: string) {
  return `${LOCAL_DOCUMENTS_STORAGE_PREFIX}${orgId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeLocalDocument(row: unknown): Document | null {
  if (!isRecord(row) || typeof row.id !== 'string') return null

  return {
    id: row.id,
    org_id: typeof row.org_id === 'string' ? row.org_id : '',
    library_id: typeof row.library_id === 'string' ? row.library_id : null,
    code: typeof row.code === 'string' ? row.code : null,
    title: typeof row.title === 'string' ? row.title : 'Documento sem título',
    project_id: typeof row.project_id === 'string' ? row.project_id : null,
    discipline_id: typeof row.discipline_id === 'string' ? row.discipline_id : null,
    doc_type: typeof row.doc_type === 'string' ? row.doc_type : '',
    area: typeof row.area === 'string' ? row.area : '',
    status: typeof row.status === 'string' ? row.status : 'draft',
    register_status: typeof row.register_status === 'string' ? row.register_status : null,
    revision: Number(row.revision) || 0,
    register_revision: typeof row.register_revision === 'string' ? row.register_revision : null,
    description: typeof row.description === 'string' ? row.description : null,
    file_path: typeof row.file_path === 'string' ? row.file_path : null,
    file_name: typeof row.file_name === 'string' ? row.file_name : null,
    file_size: typeof row.file_size === 'number' ? row.file_size : null,
    next_review_at: typeof row.next_review_at === 'string' ? row.next_review_at : null,
    received_at: typeof row.received_at === 'string' ? row.received_at : null,
    analysis_days: typeof row.analysis_days === 'number' ? row.analysis_days : null,
    analysis_deadline: typeof row.analysis_deadline === 'string' ? row.analysis_deadline : null,
    external_link: typeof row.external_link === 'string' ? row.external_link : null,
    author_id: typeof row.author_id === 'string' ? row.author_id : '',
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    published_version_id: typeof row.published_version_id === 'string' ? row.published_version_id : null,
    working_version_id: typeof row.working_version_id === 'string' ? row.working_version_id : null,
    code_pattern_id: typeof row.code_pattern_id === 'string' ? row.code_pattern_id : null,
    code_generation_mode: typeof row.code_generation_mode === 'string' ? row.code_generation_mode : null,
    manual_code: row.manual_code === true,
    working_revision: isRecord(row.working_revision)
      ? {
          id: String(row.working_revision.id ?? ''),
          revision: Number(row.working_revision.revision) || 0,
          status: String(row.working_revision.status ?? 'draft'),
        }
      : null,
    published_revision: isRecord(row.published_revision)
      ? {
          id: String(row.published_revision.id ?? ''),
          revision: Number(row.published_revision.revision) || 0,
          status: String(row.published_revision.status ?? 'published'),
        }
      : null,
    correction: null,
    author: isRecord(row.author) && typeof row.author.full_name === 'string'
      ? { full_name: row.author.full_name }
      : undefined,
    project: isRecord(row.project) && typeof row.project.id === 'string'
      ? {
          id: row.project.id,
          code: typeof row.project.code === 'string' ? row.project.code : '',
          name: typeof row.project.name === 'string' ? row.project.name : '',
        }
      : null,
  }
}

export function loadLocalDocuments(orgId: string) {
  if (typeof window === 'undefined') return [] as Document[]
  try {
    const raw = window.localStorage.getItem(getLocalDocumentsStorageKey(orgId))
    if (!raw) return [] as Document[]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [] as Document[]
    return parsed
      .map(normalizeLocalDocument)
      .filter((item): item is Document => Boolean(item))
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
  } catch {
    return [] as Document[]
  }
}

export function saveLocalDocuments(orgId: string, documents: Document[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    getLocalDocumentsStorageKey(orgId),
    JSON.stringify(documents),
  )
}

function isMissingDocumentsSchema(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const code = String(error.code ?? '').toUpperCase()
  const message = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()

  return code === '42P01'
    || code === 'PGRST205'
    || (message.includes('documents') && (message.includes('does not exist') || message.includes('schema cache')))
}

function isOptionalProjectError(error: { code?: string; message?: string }) {
  return ['42703', 'PGRST200', 'PGRST204'].includes(error.code ?? '')
    || /project_id|projects|relationship/i.test(error.message ?? '')
}

export function useDocuments(filters: DocumentFilters = {}) {
  const { profile } = useAuthContext()
  const { libraryId } = useLibraryScope()
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
      async function runQuery(
        includeProject: boolean,
        opts?: {
          skipLibraryFilter?: boolean
          skipOrgFilter?: boolean
        },
      ) {
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
          .order('created_at', { ascending: false })

        if (!opts?.skipOrgFilter) {
          query = query.eq('org_id', currentProfile.org_id)
        }
        if (libraryId && !opts?.skipLibraryFilter) {
          query = query.or(`library_id.eq.${libraryId},library_id.is.null`)
        }

        return query
      }

      async function fetchWithFallbacks() {
        let includeProject = true
        let { data, error: queryError } = await runQuery(includeProject)
        if (queryError && isOptionalProjectError(queryError)) {
          const fallbackResult = await runQuery(false)
          data = fallbackResult.data
          queryError = fallbackResult.error
          if (!queryError) setSchemaFallback(true)
          includeProject = false
        }

        if (queryError) throw queryError

        const docs = (data ?? []) as unknown as Document[]
        const foundIds = new Set(docs.map((d) => d.id))

        if (libraryId) {
          const rescueResult = await runQuery(includeProject, { skipLibraryFilter: true })
          if (!rescueResult.error && rescueResult.data?.length) {
            const rescued = (rescueResult.data as unknown as Document[]).filter(
              (d) => !foundIds.has(d.id),
            )
            for (const doc of rescued) {
              doc.library_id = libraryId
            }
            docs.push(...rescued)
            if (rescued.length > 0) setSchemaFallback(true)
          }
        }

        docs.sort(
          (a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0)
            - (a.created_at ? new Date(a.created_at).getTime() : 0),
        )

        return { data: docs, error: null }
      }

      const fetched = await fetchWithFallbacks()
      const data = fetched.data
      const queryError = fetched.error

      if (queryError) {
        if (isMissingDocumentsSchema(queryError) && currentProfile.org_id) {
          let localDocuments = loadLocalDocuments(currentProfile.org_id)
          if (libraryId) {
            localDocuments = localDocuments.filter(
              (document) => document.library_id === libraryId,
            )
          }
          if (filters.status) localDocuments = localDocuments.filter((document) => document.status === filters.status)
          if (filters.doc_type) localDocuments = localDocuments.filter((document) => document.doc_type === filters.doc_type)
          if (filters.area) localDocuments = localDocuments.filter((document) => document.area === filters.area)
          if (filters.search) {
            const term = filters.search.toLowerCase()
            localDocuments = localDocuments.filter((document) =>
              `${document.title} ${document.code ?? ''}`.toLowerCase().includes(term),
            )
          }
          setDocuments(localDocuments)
          setSchemaFallback(true)
          setLoading(false)
          return
        }
        throw queryError
      }

      const loadedDocuments = ((data ?? []) as unknown as Document[]).filter(
        (document) => {
          if (filters.status && document.status !== filters.status) return false
          if (filters.doc_type && document.doc_type !== filters.doc_type) return false
          if (filters.area && document.area !== filters.area) return false
          if (filters.search) {
            const term = filters.search.toLowerCase()
            const haystack = `${document.title ?? ''} ${document.code ?? ''}`.toLowerCase()
            if (!haystack.includes(term)) return false
          }
          return true
        },
      )
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
  }, [profile, libraryId, filters.status, filters.doc_type, filters.area, filters.search])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  return { documents, loading, error, schemaFallback, refetch: fetchDocuments }
}
