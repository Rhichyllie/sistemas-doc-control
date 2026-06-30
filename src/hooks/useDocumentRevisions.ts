import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { getErrorMessage } from '@/lib/errorUtils'
import { supabase } from '@/lib/supabase'
import { isWorkflowFoundationUnavailable } from '@/lib/workflowCompatibility'
import {
  useApprovalFlow,
  type WorkflowStepInput,
} from '@/hooks/useApprovalFlow'

export type DocumentVersionStatus =
  | 'draft'
  | 'in_review'
  | 'pending_approval'
  | 'published'
  | 'rejected'
  | 'superseded'
  | 'obsolete'

export interface FormalDocumentVersion {
  id: string
  document_id: string
  org_id: string
  revision: number
  status: DocumentVersionStatus
  file_path: string
  file_name: string
  file_size: number | null
  file_hash: string | null
  change_summary: string | null
  change_reason: string | null
  created_from_version_id: string | null
  submitted_at: string | null
  approved_at: string | null
  published_at: string | null
  superseded_at: string | null
  metadata: Record<string, unknown>
  uploaded_by: string
  uploaded_at: string
  created_at: string
  uploader?: { full_name: string }
}

interface RevisionDocumentRow {
  id: string
  org_id: string
  author_id: string
  status: string
  revision: number
  file_path: string | null
  file_name: string | null
  file_size: number | null
  published_at: string | null
  published_version_id?: string | null
  working_version_id?: string | null
}

export interface StartRevisionInput {
  changeReason: string
  changeSummary?: string
  file?: File | null
  nextReviewAt?: string | null
}

export interface UploadRevisionFileInput {
  versionId: string
  file: File
  changeSummary?: string
}

export interface SubmitRevisionInput {
  versionId: string
  revisionNumber: number
  steps: WorkflowStepInput[]
}

const WORKING_STATUSES = new Set<DocumentVersionStatus>([
  'draft',
  'in_review',
  'pending_approval',
  'rejected',
])

export function useDocumentRevisions(documentId: string | undefined) {
  const { profile } = useAuthContext()
  const approvalFlow = useApprovalFlow()
  const [document, setDocument] = useState<RevisionDocumentRow | null>(null)
  const [versions, setVersions] = useState<FormalDocumentVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canUseFormalRevisions, setCanUseFormalRevisions] = useState(true)

  const refresh = useCallback(async () => {
    if (!profile || !documentId) {
      setDocument(null)
      setVersions([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const enterpriseDocumentResult = await supabase
        .from('documents')
        .select(`
          id,
          org_id,
          author_id,
          status,
          revision,
          file_path,
          file_name,
          file_size,
          published_at,
          published_version_id,
          working_version_id
        `)
        .eq('id', documentId)
        .eq('org_id', profile.org_id)
        .single()

      let documentData = enterpriseDocumentResult.data as RevisionDocumentRow | null
      let documentError = enterpriseDocumentResult.error

      if (documentError && isWorkflowFoundationUnavailable(documentError)) {
        const fallback = await supabase
          .from('documents')
          .select('id, org_id, author_id, status, revision, file_path, file_name, file_size, published_at')
          .eq('id', documentId)
          .eq('org_id', profile.org_id)
          .single()
        documentData = fallback.data as RevisionDocumentRow | null
        documentError = fallback.error
        setCanUseFormalRevisions(false)
      } else {
        setCanUseFormalRevisions(true)
      }
      if (documentError) throw documentError

      let versionsResult = await supabase
        .from('document_versions')
        .select(`
          *,
          uploader:profiles!document_versions_uploaded_by_fkey (full_name)
        `)
        .eq('document_id', documentId)
        .eq('org_id', profile.org_id)
        .order('revision', { ascending: false })

      if (versionsResult.error && isWorkflowFoundationUnavailable(versionsResult.error)) {
        versionsResult = await supabase
          .from('document_versions')
          .select(`
            *,
            uploader:profiles!document_versions_uploaded_by_fkey (full_name)
          `)
          .eq('document_id', documentId)
          .eq('org_id', profile.org_id)
          .order('revision', { ascending: false })
        setCanUseFormalRevisions(false)
      }
      if (versionsResult.error) throw versionsResult.error

      setDocument(documentData)
      setVersions((versionsResult.data ?? []).map((version) => ({
        ...version,
        status: (version.status ?? 'draft') as DocumentVersionStatus,
        change_reason: version.change_reason ?? null,
        created_from_version_id: version.created_from_version_id ?? null,
        submitted_at: version.submitted_at ?? null,
        approved_at: version.approved_at ?? null,
        published_at: version.published_at ?? null,
        superseded_at: version.superseded_at ?? null,
        metadata: version.metadata ?? {},
        created_at: version.created_at ?? version.uploaded_at,
      })) as FormalDocumentVersion[])
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao carregar revisões do documento'))
    } finally {
      setLoading(false)
    }
  }, [documentId, profile])

  useEffect(() => {
    refresh()
  }, [refresh])

  const currentPublishedVersion = useMemo(() => {
    if (document?.published_version_id) {
      const pointed = versions.find((version) => version.id === document.published_version_id)
      if (pointed) return pointed
    }
    return versions.find((version) => version.status === 'published')
      ?? versions.find((version) => version.revision === document?.revision)
      ?? null
  }, [document, versions])

  const workingVersion = useMemo(() => {
    if (document?.working_version_id) {
      const pointed = versions.find((version) => version.id === document.working_version_id)
      if (pointed && WORKING_STATUSES.has(pointed.status)) return pointed
    }
    return versions.find((version) => WORKING_STATUSES.has(version.status)) ?? null
  }, [document, versions])

  const canManageRevision = Boolean(
    profile
    && document
    && (document.author_id === profile.id || ['admin', 'manager'].includes(profile.role)),
  )
  const canStartRevision = Boolean(
    canUseFormalRevisions
    && canManageRevision
    && document?.status === 'published'
    && !workingVersion,
  )

  async function startRevision(input: StartRevisionInput) {
    if (!profile || !document) {
      setError('Documento ou usuário não disponível.')
      return null
    }
    if (!canUseFormalRevisions) {
      setError('A migration P-10A ainda não está aplicada neste ambiente.')
      return null
    }
    if (!canManageRevision || document.status !== 'published') {
      setError('Somente o autor ou um gestor pode subir revisão de um documento publicado.')
      return null
    }
    if (workingVersion) {
      setError('Já existe uma revisão em andamento.')
      return null
    }
    if (!input.changeReason.trim()) {
      setError('Informe o motivo da revisão.')
      return null
    }

    setMutating(true)
    setError(null)

    try {
      let sourceVersion = currentPublishedVersion
      if (!sourceVersion && document.file_path && document.file_name) {
        const { data: baselineVersion, error: baselineError } = await supabase
          .from('document_versions')
          .insert({
            document_id: document.id,
            org_id: profile.org_id,
            revision: document.revision,
            status: 'published',
            file_path: document.file_path,
            file_name: document.file_name,
            file_size: document.file_size,
            uploaded_by: profile.id,
            published_at: document.published_at,
            change_summary: 'Versão publicada anterior incorporada ao ciclo formal',
            metadata: { backfilled_from_document_pointer: true },
          })
          .select('*')
          .single()
        if (baselineError) throw baselineError
        sourceVersion = baselineVersion as FormalDocumentVersion

        const { error: baselinePointerError } = await supabase
          .from('documents')
          .update({ published_version_id: baselineVersion.id })
          .eq('id', document.id)
          .eq('org_id', profile.org_id)
        if (baselinePointerError) throw baselinePointerError
      }

      let filePath = sourceVersion?.file_path ?? document.file_path
      let fileName = sourceVersion?.file_name ?? document.file_name
      let fileSize = sourceVersion?.file_size ?? document.file_size

      if (input.file) {
        const extension = input.file.name.split('.').pop()?.toLowerCase() || 'bin'
        const storagePath = `${profile.org_id}/${document.id}/revision-${document.revision + 1}-${Date.now()}.${extension}`
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, input.file, {
            contentType: input.file.type,
            upsert: false,
          })
        if (uploadError) throw uploadError
        filePath = storagePath
        fileName = input.file.name
        fileSize = input.file.size
      }

      if (!filePath || !fileName) {
        throw new Error('Anexe um arquivo para iniciar a nova revisão.')
      }

      const newRevision = document.revision + 1
      const { data: version, error: insertError } = await supabase
        .from('document_versions')
        .insert({
          document_id: document.id,
          org_id: profile.org_id,
          revision: newRevision,
          status: 'draft',
          file_path: filePath,
          file_name: fileName,
          file_size: fileSize,
          uploaded_by: profile.id,
          change_reason: input.changeReason.trim(),
          change_summary: input.changeSummary?.trim() || null,
          created_from_version_id: sourceVersion?.id ?? null,
          metadata: {
            next_review_at: input.nextReviewAt || null,
            file_reused_from_published: !input.file,
          },
        })
        .select('*')
        .single()

      if (insertError) {
        if (insertError.code === '23505') throw new Error('Já existe uma revisão em andamento.')
        throw insertError
      }

      const { data: updatedDocument, error: pointerError } = await supabase
        .from('documents')
        .update({ working_version_id: version.id })
        .eq('id', document.id)
        .eq('org_id', profile.org_id)
        .eq('status', 'published')
        .select('id')
        .maybeSingle()

      if (pointerError || !updatedDocument) {
        await supabase
          .from('document_versions')
          .update({ status: 'obsolete' })
          .eq('id', version.id)
          .eq('org_id', profile.org_id)
        throw pointerError ?? new Error('A revisão foi criada, mas não pôde ser vinculada ao documento.')
      }

      await supabase.from('audit_trail').insert({
        document_id: document.id,
        org_id: profile.org_id,
        user_id: profile.id,
        action: 'formal_revision_started',
        old_status: 'published',
        new_status: 'published',
        metadata: {
          document_id: document.id,
          document_version_id: version.id,
          previous_revision: document.revision,
          new_revision: newRevision,
          change_reason: input.changeReason.trim(),
          actor: profile.id,
          file_name: fileName,
        },
      })

      await refresh()
      return version as FormalDocumentVersion
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao iniciar revisão formal'))
      return null
    } finally {
      setMutating(false)
    }
  }

  async function uploadRevisionFile(input: UploadRevisionFileInput) {
    if (!profile || !document || !canManageRevision) {
      setError('Somente o autor ou um gestor pode alterar o arquivo da revisão.')
      return false
    }

    const version = versions.find((item) => item.id === input.versionId)
    if (!version || !['draft', 'rejected'].includes(version.status)) {
      setError('O arquivo só pode ser alterado enquanto a revisão está em preparação ou correção.')
      return false
    }

    setMutating(true)
    setError(null)
    try {
      const extension = input.file.name.split('.').pop()?.toLowerCase() || 'bin'
      const storagePath = `${profile.org_id}/${document.id}/revision-${version.revision}-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, input.file, {
          contentType: input.file.type,
          upsert: false,
        })
      if (uploadError) throw uploadError

      const { error: updateError } = await supabase
        .from('document_versions')
        .update({
          file_path: storagePath,
          file_name: input.file.name,
          file_size: input.file.size,
          uploaded_by: profile.id,
          uploaded_at: new Date().toISOString(),
          change_summary: input.changeSummary?.trim() || version.change_summary,
        })
        .eq('id', version.id)
        .eq('org_id', profile.org_id)
        .in('status', ['draft', 'rejected'])
      if (updateError) throw updateError

      await supabase.from('audit_trail').insert({
        document_id: document.id,
        org_id: profile.org_id,
        user_id: profile.id,
        action: 'formal_revision_file_updated',
        metadata: {
          document_id: document.id,
          document_version_id: version.id,
          previous_revision: document.revision,
          new_revision: version.revision,
          actor: profile.id,
          file_name: input.file.name,
        },
      })

      await refresh()
      return true
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao atualizar arquivo da revisão'))
      return false
    } finally {
      setMutating(false)
    }
  }

  async function submitRevisionForApproval(input: SubmitRevisionInput) {
    const success = await approvalFlow.submitForReview({
      documentId: documentId ?? '',
      documentVersionId: input.versionId,
      revisionNumber: input.revisionNumber,
      flowContext: 'formal_revision',
      steps: input.steps,
    })
    if (success) await refresh()
    return success
  }

  return {
    versions,
    currentPublishedVersion,
    workingVersion,
    loading: loading || approvalFlow.loading,
    error: error ?? approvalFlow.error,
    compatibilityMessage: approvalFlow.compatibilityMessage,
    canUseFormalRevisions,
    canStartRevision,
    canManageRevision,
    startRevision,
    uploadRevisionFile,
    submitRevisionForApproval,
    refresh,
    mutating,
  }
}
