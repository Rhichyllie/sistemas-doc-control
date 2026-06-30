import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { validateDocumentCreation } from "@/lib/documentCreationValidation";
import { normalizeDocumentCreationPayload } from "@/lib/documentIntelligence";
import { isDocumentTemplateSchemaUnavailable } from "@/lib/documentTemplateRules";
import { isWorkflowFoundationUnavailable } from "@/lib/workflowCompatibility";

/*
 * STORAGE SETUP REQUIRED (manual step — cannot be done via migrations):
 * In the Supabase Dashboard > Storage, create a bucket named "documents"
 * with the following settings:
 *   - Public: NO (private bucket — access via signed URLs only)
 *   - File size limit: 50MB
 *   - Allowed MIME types: application/pdf, application/msword,
 *     application/vnd.openxmlformats-officedocument.wordprocessingml.document,
 *     application/dwg, image/vnd.dwg,
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
    templateId?: string | null;
    templateName?: string | null;
    appliedRuleIds?: string[];
    governanceScore?: number | null;
    requiredFieldsMissing?: string[];
  };
}

export interface CreateDocumentResult {
  id: string;
  code: string;
  warning?: string;
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
  const creatingRef = useRef(false);

  async function createDocument(
    input: CreateDocumentInput,
  ): Promise<CreateDocumentResult | null> {
    if (!profile) {
      setError("Usuário não autenticado");
      return null;
    }
    if (creatingRef.current) {
      setError("Já existe uma criação em andamento. Aguarde a conclusão.");
      return null;
    }

    const validationErrors = validateDocumentCreation(input);
    if (validationErrors.length) {
      setError(validationErrors[0]);
      return null;
    }

    creatingRef.current = true;
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

        if (uploadError) {
          throw new Error(
            `Não foi possível enviar o arquivo: ${getErrorMessage(uploadError, "erro não identificado")}`,
          );
        }

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

      if (insertError) {
        throw new Error(
          `Não foi possível criar o documento: ${getErrorMessage(insertError, "erro não identificado")}`,
        );
      }
      createdDocumentId = data.id;
      const creationMode = input.creationContext?.mode ?? "standard";
      const creationSource =
        input.creationContext?.mode &&
        ["quick", "guided", "expert"].includes(input.creationContext.mode)
          ? "intelligent_creation"
          : "standard_creation";

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
              creation_mode: creationMode,
              source: creationSource,
              initial_upload: true,
            },
          });

        if (enterpriseVersion.error) {
          if (!isWorkflowFoundationUnavailable(enterpriseVersion.error)) {
            throw new Error(
              `Não foi possível concluir a versão inicial: ${getErrorMessage(enterpriseVersion.error, "erro não identificado")}`,
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
              `Não foi possível concluir a versão inicial: ${getErrorMessage(legacyVersionError, "erro não identificado")}`,
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
          source: creationSource,
          completeness_score: input.creationContext?.completenessScore ?? null,
          risk_level: input.creationContext?.riskLevel ?? null,
          project_id: input.project_id ?? null,
          review_period_months: input.review_period_months ?? 24,
          next_review_at: input.next_review_at ?? null,
          has_file: Boolean(file_path),
          file_hash,
          template_id: input.creationContext?.templateId ?? null,
          template_name: input.creationContext?.templateName ?? null,
          applied_rule_ids: input.creationContext?.appliedRuleIds ?? [],
          governance_score: input.creationContext?.governanceScore ?? null,
          required_fields_missing:
            input.creationContext?.requiredFieldsMissing ?? [],
        },
      });
      if (auditError) {
        throw new Error(
          `Não foi possível concluir a auditoria inicial: ${getErrorMessage(auditError, "erro não identificado")}`,
        );
      }

      let usageLogWarning: string | undefined;
      const shouldLogTemplateUsage =
        creationSource === "intelligent_creation" &&
        (Boolean(input.creationContext?.templateId) ||
          Boolean(input.creationContext?.appliedRuleIds?.length));
      if (shouldLogTemplateUsage) {
        const { error: usageLogError } = await supabase
          .from("document_template_usage_logs")
          .insert({
            org_id: profile.org_id,
            template_id: input.creationContext?.templateId ?? null,
            document_id: data.id,
            user_id: profile.id,
            creation_mode: creationMode,
            applied_rules: input.creationContext?.appliedRuleIds ?? [],
            metadata: {
              template_name: input.creationContext?.templateName ?? null,
              governance_score: input.creationContext?.governanceScore ?? null,
              required_fields_missing:
                input.creationContext?.requiredFieldsMissing ?? [],
              source: creationSource,
            },
          });

        if (
          usageLogError &&
          !isDocumentTemplateSchemaUnavailable(usageLogError)
        ) {
          usageLogWarning =
            "Documento criado, mas o registro de uso do template não foi salvo. Revise as policies de document_template_usage_logs.";
        }
      }

      return {
        ...(data as CreateDocumentResult),
        warning: usageLogWarning,
      };
    } catch (err: unknown) {
      const cleanupMessages: string[] = [];

      if (createdDocumentId) {
        const { error: deleteError } = await supabase
          .from("documents")
          .delete()
          .eq("id", createdDocumentId)
          .eq("org_id", profile.org_id);

        if (deleteError) {
          cleanupMessages.push(
            `O documento parcial ${createdDocumentId} foi preservado porque a limpeza foi bloqueada. Revise esse registro manualmente antes de tentar novamente.`,
          );
        } else {
          cleanupMessages.push(
            "A criação parcial foi desfeita; nenhum documento incompleto foi mantido.",
          );
          if (uploadedPath) {
            const { error: storageCleanupError } = await supabase.storage
              .from("documents")
              .remove([uploadedPath]);
            if (storageCleanupError) {
              cleanupMessages.push(
                `O arquivo ${uploadedPath} pode ter permanecido no Storage. Solicite a limpeza manual.`,
              );
            }
          }
        }
      } else if (uploadedPath) {
        const { error: storageCleanupError } = await supabase.storage
          .from("documents")
          .remove([uploadedPath]);
        if (storageCleanupError) {
          cleanupMessages.push(
            `O documento não foi criado, mas o arquivo ${uploadedPath} pode ter permanecido no Storage. Solicite a limpeza manual.`,
          );
        } else {
          cleanupMessages.push(
            "O upload parcial foi removido; nenhum arquivo órfão foi mantido.",
          );
        }
      }

      setError(
        [
          getErrorMessage(err, "Erro ao criar documento"),
          ...cleanupMessages,
        ].join(" "),
      );
      return null;
    } finally {
      creatingRef.current = false;
      setLoading(false);
    }
  }

  return { createDocument, loading, error };
}
