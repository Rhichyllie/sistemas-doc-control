import { useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { getErrorMessage } from '@/lib/errorUtils'
import { supabase } from '@/lib/supabase'

export interface SaveDocumentCorrectionInput {
  documentId: string
  title: string
  description?: string | null
  nextReviewAt?: string | null
  file?: File | null
}

export function useDocumentCorrection() {
  const { profile } = useAuthContext()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveCorrection(input: SaveDocumentCorrectionInput) {
    if (!profile) {
      setError('Usuário não autenticado')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      const { data: document, error: documentError } = await supabase
        .from('documents')
        .select('id, author_id, status, revision, file_path')
        .eq('id', input.documentId)
        .eq('org_id', profile.org_id)
        .single()

      if (documentError) throw documentError
      if (document.status !== 'draft') {
        throw new Error('Somente documentos em correção podem ser editados por este fluxo.')
      }
      if (document.author_id !== profile.id && !['admin', 'manager'].includes(profile.role)) {
        throw new Error('Somente o autor ou um gestor pode corrigir este documento.')
      }
      if (!input.title.trim()) throw new Error('Informe o título do documento.')
      if (input.file && document.file_path) {
        throw new Error('A substituição de arquivo existente exige versionamento formal e não está disponível nesta fase.')
      }

      let filePath: string | null = null
      let fileName: string | null = null
      let fileSize: number | null = null

      if (input.file) {
        const extension = input.file.name.split('.').pop()?.toLowerCase() || 'bin'
        const storagePath = `${profile.org_id}/${input.documentId}/correction-${Date.now()}.${extension}`
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

      const changes: Record<string, unknown> = {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        next_review_at: input.nextReviewAt || null,
        updated_at: new Date().toISOString(),
      }
      if (filePath) {
        changes.file_path = filePath
        changes.file_name = fileName
        changes.file_size = fileSize
      }

      const { data: updatedDocument, error: updateError } = await supabase
        .from('documents')
        .update(changes)
        .eq('id', input.documentId)
        .eq('org_id', profile.org_id)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle()

      if (updateError) throw updateError
      if (!updatedDocument) throw new Error('O documento não pôde ser atualizado.')

      if (filePath && fileName) {
        const { error: versionError } = await supabase.from('document_versions').insert({
          document_id: input.documentId,
          org_id: profile.org_id,
          revision: document.revision,
          file_path: filePath,
          file_name: fileName,
          file_size: fileSize,
          uploaded_by: profile.id,
          change_summary: 'Arquivo anexado durante ciclo de correção',
        })
        if (versionError) throw versionError
      }

      const { error: auditError } = await supabase.from('audit_trail').insert({
        document_id: input.documentId,
        org_id: profile.org_id,
        user_id: profile.id,
        action: filePath ? 'correction_updated_with_attachment' : 'correction_updated',
        old_status: 'draft',
        new_status: 'draft',
        metadata: {
          title_updated: true,
          description_updated: true,
          attachment_added: Boolean(filePath),
        },
      })
      if (auditError) {
        console.error('[workflow] Correção salva sem evento complementar de auditoria', auditError)
      }

      return true
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao salvar correções'))
      return false
    } finally {
      setLoading(false)
    }
  }

  return { saveCorrection, loading, error }
}
