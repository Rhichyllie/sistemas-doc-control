import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'

/*
 * STORAGE SETUP REQUIRED (manual step — cannot be done via migrations):
 * In the Supabase Dashboard > Storage, create a bucket named "documents"
 * with the following settings:
 *   - Public: NO (private bucket — access via signed URLs only)
 *   - File size limit: 50MB
 *   - Allowed MIME types: application/pdf, application/msword,
 *     application/vnd.openxmlformats-officedocument.wordprocessingml.document,
 *     application/vnd.ms-excel,
 *     application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
 *     image/png, image/jpeg
 *
 * Then add this RLS policy to the storage.objects table:
 *   CREATE POLICY "documents_bucket_org_access"
 *   ON storage.objects FOR ALL
 *   USING (
 *     bucket_id = 'documents'
 *     AND (storage.foldername(name))[1] IN (
 *       SELECT org_id::text FROM public.profiles WHERE id = auth.uid()
 *     )
 *   );
 *
 * This ensures each org can only access their own files.
 */

export interface CreateDocumentInput {
  title: string
  doc_type: string
  area: string
  description?: string
  review_period_months?: number
  next_review_at?: string
  file?: File | null
}

export interface CreateDocumentResult {
  id: string
  code: string
}

export function useCreateDocument() {
  const { profile } = useAuthContext()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createDocument(input: CreateDocumentInput): Promise<CreateDocumentResult | null> {
    if (!profile) {
      setError('Usuário não autenticado')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      let file_path: string | null = null
      let file_name: string | null = null
      let file_size: number | null = null

      if (input.file) {
        const ext = input.file.name.split('.').pop()
        const storagePath = `${profile.org_id}/${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, input.file, {
            contentType: input.file.type,
            upsert: false,
          })

        if (uploadError) throw uploadError

        file_path = storagePath
        file_name = input.file.name
        file_size = input.file.size
      }

      const { data, error: insertError } = await supabase
        .from('documents')
        .insert({
          org_id: profile.org_id,
          title: input.title,
          doc_type: input.doc_type,
          area: input.area,
          description: input.description ?? null,
          status: 'draft',
          revision: 0,
          author_id: profile.id,
          file_path,
          file_name,
          file_size,
          review_period_months: input.review_period_months ?? 24,
          next_review_at: input.next_review_at ?? null,
        })
        .select('id, code')
        .single()

      if (insertError) throw insertError

      await supabase.from('audit_trail').insert({
        document_id: data.id,
        org_id: profile.org_id,
        user_id: profile.id,
        action: 'created',
        new_status: 'draft',
      })

      if (file_path && file_name) {
        await supabase.from('document_versions').insert({
          document_id: data.id,
          org_id: profile.org_id,
          revision: 0,
          file_path,
          file_name,
          file_size,
          uploaded_by: profile.id,
          change_summary: 'Versão inicial',
        })
      }

      return data as CreateDocumentResult
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar documento')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { createDocument, loading, error }
}
