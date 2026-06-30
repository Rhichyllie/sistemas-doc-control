import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { normalizeDocumentCreationPayload } from "@/lib/documentIntelligence";
import { isWorkflowFoundationUnavailable } from "@/lib/workflowCompatibility";

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
  title: string;
  doc_type: string;
  area: string;
  description?: string;
  project_id?: string | null;
  revision?: number;
  review_period_months?: number;
  next_review_at?: string;
  file?: File | null;
  advancedFields?: {
    confidentiality?: string;
    external_reference?: string;
    source_system?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  };
  creationContext?: {
    mode?: string;
    completenessScore?: number;
    riskLevel?: string;
  };
}

export interface CreateDocumentResult {
  id: string;
  code: string;
}

async function calculateFileHash(file: File) {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const bytes = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export function useCreateDocument() {
  const { profile } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDocument(
    input: CreateDocumentInput,
  ): Promise<CreateDocumentResult | null> {
    if (!profile) {
      setError("Usuário não autenticado");
      return null;
    }

    setLoading(true);
    setError(null);

    let uploadedPath: string | null = null;
    let createdDocumentId: string | null = null;

    try {
      let file_path: string | null = null;
      let file_name: string | null = null;
      let file_size: number | null = null;
      let file_hash: string | null = null;

      if (input.file) {
        const ext = input.file.name.split(".").pop();
        const storageId =
          globalThis.crypto?.randomUUID?.() ?? String(Date.now());
        const storagePath = `${profile.org_id}/${storageId}.${ext || "bin"}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(storagePath, input.file, {
            contentType: input.file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        uploadedPath = storagePath;
        file_path = storagePath;
        file_name = input.file.name;
        file_size = input.file.size;
        file_hash = await calculateFileHash(input.file);
      }

      const revision =
        Number.isInteger(input.revision) && (input.revision ?? 0) >= 0
          ? (input.revision ?? 0)
          : 0;
      const advancedFields = normalizeDocumentCreationPayload({
        confidentiality: input.advancedFields?.confidentiality,
        external_reference: input.advancedFields?.external_reference,
        source_system: input.advancedFields?.source_system,
        metadata: input.advancedFields?.metadata,
        tags: input.advancedFields?.tags,
      });
      const { data, error: insertError } = await supabase
        .from("documents")
        .insert(
          normalizeDocumentCreationPayload({
            org_id: profile.org_id,
            title: input.title,
            doc_type: input.doc_type,
            area: input.area,
            description: input.description ?? null,
            project_id: input.project_id || null,
            status: "draft",
            revision,
            author_id: profile.id,
            file_path,
            file_name,
            file_size,
            file_hash,
            review_period_months: input.review_period_months ?? 24,
            next_review_at: input.next_review_at ?? null,
            ...advancedFields,
          }),
        )
        .select("id, code")
        .single();

      if (insertError) throw insertError;
      createdDocumentId = data.id;

      if (file_path && file_name) {
        const enterpriseVersion = await supabase
          .from("document_versions")
          .insert({
            document_id: data.id,
            org_id: profile.org_id,
            revision,
            file_path,
            file_name,
            file_size,
            file_hash,
            uploaded_by: profile.id,
            change_summary: "Versão inicial",
            change_reason: "Criação inicial do documento",
            status: "draft",
            metadata: {
              creation_mode: input.creationContext?.mode ?? "standard",
              initial_upload: true,
            },
          });

        if (enterpriseVersion.error) {
          if (!isWorkflowFoundationUnavailable(enterpriseVersion.error)) {
            throw new Error(
              `O documento foi criado, mas a versão inicial falhou: ${getErrorMessage(enterpriseVersion.error, "erro não identificado")}`,
            );
          }

          const { error: legacyVersionError } = await supabase
            .from("document_versions")
            .insert({
              document_id: data.id,
              org_id: profile.org_id,
              revision,
              file_path,
              file_name,
              file_size,
              file_hash,
              uploaded_by: profile.id,
              change_summary: "Versão inicial",
            });
          if (legacyVersionError) {
            throw new Error(
              `O documento foi criado, mas a versão inicial falhou: ${getErrorMessage(legacyVersionError, "erro não identificado")}`,
            );
          }
        }
      }

      const { error: auditError } = await supabase.from("audit_trail").insert({
        document_id: data.id,
        org_id: profile.org_id,
        user_id: profile.id,
        action: "created",
        new_status: "draft",
        file_hash,
        metadata: {
          creation_mode: input.creationContext?.mode ?? "standard",
          completeness_score: input.creationContext?.completenessScore ?? null,
          risk_level: input.creationContext?.riskLevel ?? null,
          project_id: input.project_id ?? null,
          review_period_months: input.review_period_months ?? 24,
          next_review_at: input.next_review_at ?? null,
          has_file: Boolean(file_path),
        },
      });
      if (auditError) {
        throw new Error(
          `O documento foi criado, mas a auditoria inicial falhou: ${getErrorMessage(auditError, "erro não identificado")}`,
        );
      }

      return data as CreateDocumentResult;
    } catch (err: unknown) {
      let cleanupMessage = "";

      if (createdDocumentId) {
        const { error: deleteError } = await supabase
          .from("documents")
          .delete()
          .eq("id", createdDocumentId)
          .eq("org_id", profile.org_id);

        if (deleteError) {
          cleanupMessage =
            " O registro parcial foi preservado para não remover um arquivo ainda referenciado; revise-o antes de tentar novamente.";
        } else if (uploadedPath) {
          await supabase.storage.from("documents").remove([uploadedPath]);
        }
      } else if (uploadedPath) {
        await supabase.storage.from("documents").remove([uploadedPath]);
      }

      setError(
        `${getErrorMessage(err, "Erro ao criar documento")}${cleanupMessage}`,
      );
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { createDocument, loading, error };
}
