import { useRef, useState } from "react";
import { useLibraryScope } from "@/contexts/library-context";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import {
  isTransactionalDocumentCreationUnavailable,
  normalizeTransactionalDocumentCreationResult,
} from "@/lib/documentCreationTransaction";
import {
  validateDocumentCreation,
  type DocumentValidationOverrides,
} from "@/lib/documentCreationValidation";
import { isDocumentCodingCompatibilityError } from "@/lib/documentCodePatterns";
import { normalizeDocumentCreationPayload } from "@/lib/documentIntelligence";
import { isDocumentTemplateSchemaUnavailable } from "@/lib/documentTemplateRules";
import { isWorkflowFoundationUnavailable } from "@/lib/workflowCompatibility";
import type { DocumentCreationCodeMode } from "@/hooks/useDocumentCreationControls";
import {
  loadLocalDocuments,
  saveLocalDocuments,
  type Document,
} from "@/hooks/useDocuments";

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
  discipline_id?: string | null;
  revision?: number;
  register_revision?: string | null;
  register_status?: string | null;
  review_period_months?: number;
  next_review_at?: string;
  received_at?: string | null;
  analysis_days?: number | null;
  analysis_deadline?: string | null;
  external_link?: string | null;
  file?: File | null;
  advancedFields?: {
    confidentiality?: string;
    external_reference?: string;
    source_system?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  };
  coding?: {
    mode: DocumentCreationCodeMode;
    patternId?: string | null;
    manualCode?: string | null;
    manualReason?: string | null;
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
    codePreview?: string | null;
    codePatternId?: string | null;
    codePreviewMode?: string | null;
    requestCodeAllocation?: boolean;
    projectCode?: string | null;
    projectName?: string | null;
    projectClient?: string | null;
    projectContract?: string | null;
    suggestedTramiteId?: string | null;
    suggestedTramiteName?: string | null;
    suggestedTramiteVersionId?: string | null;
    suggestedTramiteReason?: string | null;
  };
  validationOverrides?: DocumentValidationOverrides;
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

function isOptionalRegisterFieldError(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = String(record.code ?? "").toUpperCase();
  const message = [record.message, record.details, record.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (["42703", "PGRST204", "PGRST200"].includes(code)) return true;

  return [
    "discipline_id",
    "received_at",
    "analysis_days",
    "analysis_deadline",
    "external_link",
    "register_status",
    "register_revision",
  ].some((term) => message.includes(term));
}

function isMissingDocumentsSchema(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = String(record.code ?? "").toUpperCase();
  const message = [record.message, record.details, record.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("documents") &&
      (message.includes("does not exist") || message.includes("schema cache")))
  );
}

export function useCreateDocument() {
  const { profile } = useAuthContext();
  const { libraryId } = useLibraryScope();
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
    if (!libraryId) {
      setError("Selecione uma biblioteca antes de criar o documento.");
      return null;
    }
    const currentProfile = profile;
    if (creatingRef.current) {
      setError("Já existe uma criação em andamento. Aguarde a conclusão.");
      return null;
    }

    const validationErrors = validateDocumentCreation(input, input.validationOverrides);
    if (input.coding?.mode === "selected_pattern" && !input.coding.patternId) {
      validationErrors.push("Escolha o padrão de codificação.");
    }
    if (
      input.coding?.mode === "manual" &&
      (!input.coding.manualCode?.trim() || !input.coding.manualReason?.trim())
    ) {
      validationErrors.push(
        "Informe o código oficial e o motivo da codificação manual.",
      );
    }
    if (validationErrors.length) {
      setError(validationErrors[0]);
      return null;
    }

    creatingRef.current = true;
    setLoading(true);
    setError(null);

    let uploadedPath: string | null = null;
    let createdDocumentId: string | null = null;
    let preserveUploadForReconciliation = false;
    const creationMode = input.creationContext?.mode ?? "standard";
    const creationSource =
      input.creationContext?.mode &&
      ["quick", "guided", "expert"].includes(input.creationContext.mode)
        ? "intelligent_creation"
        : "standard_creation";

    async function registerTemplateUsage(documentId: string) {
      const shouldLogTemplateUsage =
        creationSource === "intelligent_creation" &&
        (Boolean(input.creationContext?.templateId) ||
          Boolean(input.creationContext?.appliedRuleIds?.length));
      if (!shouldLogTemplateUsage) return undefined;

      try {
        const { error: usageLogError } = await supabase
          .from("document_template_usage_logs")
          .insert({
            org_id: currentProfile.org_id,
            template_id: input.creationContext?.templateId ?? null,
            document_id: documentId,
            user_id: currentProfile.id,
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
          return "Documento criado, mas o registro de uso do template não foi salvo. Revise as policies de document_template_usage_logs.";
        }
        return undefined;
      } catch {
        return "Documento criado, mas o registro de uso do template não foi salvo. Revise as policies de document_template_usage_logs.";
      }
    }

    async function syncDocumentRegisterFields(documentId: string) {
      const payload: Record<string, unknown> = {};

      if (input.discipline_id !== undefined) {
        payload.discipline_id = input.discipline_id || null;
      }
      if (input.received_at !== undefined) {
        payload.received_at = input.received_at || null;
      }
      if (input.analysis_days !== undefined) {
        payload.analysis_days = input.analysis_days ?? null;
      }
      if (input.analysis_deadline !== undefined) {
        payload.analysis_deadline = input.analysis_deadline || null;
      }
      if (input.external_link !== undefined) {
        payload.external_link = input.external_link?.trim() || null;
      }
      if (input.register_status !== undefined) {
        payload.register_status = input.register_status?.trim() || null;
      }
      if (input.register_revision !== undefined) {
        payload.register_revision = input.register_revision?.trim() || null;
      }

      if (Object.keys(payload).length === 0) return undefined;

      const { error: registerFieldError } = await supabase
        .from("documents")
        .update(payload)
        .eq("id", documentId)
        .eq("org_id", currentProfile.org_id)
        .eq("library_id", libraryId);

      if (registerFieldError && !isOptionalRegisterFieldError(registerFieldError)) {
        return `Documento criado, mas os campos operacionais do cadastro não puderam ser sincronizados: ${getErrorMessage(registerFieldError, "erro não identificado")}`;
      }

      return undefined;
    }

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
      const requestedCodeMode = input.coding?.mode ?? "automatic";
      const creationMetadata = {
        document_metadata: input.advancedFields?.metadata ?? {},
        document_register: {
          discipline_id: input.discipline_id ?? null,
          register_revision: input.register_revision ?? null,
          register_status: input.register_status ?? null,
          received_at: input.received_at ?? null,
          analysis_days: input.analysis_days ?? null,
          analysis_deadline: input.analysis_deadline ?? null,
          external_link: input.external_link ?? null,
        },
        creation_mode: creationMode,
        source: creationSource,
        library_id: libraryId,
        completeness_score: input.creationContext?.completenessScore ?? null,
        risk_level: input.creationContext?.riskLevel ?? null,
        project_id: input.project_id ?? null,
        project_code: input.creationContext?.projectCode ?? null,
        project_name: input.creationContext?.projectName ?? null,
        project_client: input.creationContext?.projectClient ?? null,
        project_contract: input.creationContext?.projectContract ?? null,
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
        code_preview: input.creationContext?.codePreview ?? null,
        requested_code_mode: requestedCodeMode,
        requested_code_pattern_id: input.coding?.patternId ?? null,
        suggested_tramite_template_id:
          input.creationContext?.suggestedTramiteId ?? null,
        suggested_tramite_template_name:
          input.creationContext?.suggestedTramiteName ?? null,
        suggested_tramite_template_version_id:
          input.creationContext?.suggestedTramiteVersionId ?? null,
        suggested_tramite_reason:
          input.creationContext?.suggestedTramiteReason ?? null,
      };
      const transactionalResult = await supabase.rpc(
        "create_document_transactional",
        {
          p_title: input.title.trim(),
          p_description: input.description?.trim() || null,
          p_doc_type: input.doc_type,
          p_area: input.area,
          p_library_id: libraryId,
          p_project_id: input.project_id || null,
          p_revision: revision,
          p_review_period_months: input.review_period_months ?? 24,
          p_next_review_at: input.next_review_at || null,
          p_confidentiality:
            input.advancedFields?.confidentiality?.trim() || null,
          p_external_reference:
            input.advancedFields?.external_reference?.trim() || null,
          p_source_system: input.advancedFields?.source_system?.trim() || null,
          p_tags: input.advancedFields?.tags ?? [],
          p_file_metadata:
            file_path && file_name
              ? {
                  file_path,
                  file_name,
                  file_size,
                  file_hash,
                  content_type: input.file?.type || null,
                }
              : null,
          p_code_mode: requestedCodeMode,
          p_code_pattern_id: input.coding?.patternId ?? null,
          p_manual_code: input.coding?.manualCode?.trim() || null,
          p_manual_code_reason: input.coding?.manualReason?.trim() || null,
          p_creation_metadata: creationMetadata,
        },
      );

      if (!transactionalResult.error) {
        const created = normalizeTransactionalDocumentCreationResult(
          transactionalResult.data,
        );
        if (!created) {
          const rawResult =
            transactionalResult.data &&
            typeof transactionalResult.data === "object"
              ? (transactionalResult.data as Record<string, unknown>)
              : null;
          createdDocumentId =
            typeof rawResult?.document_id === "string"
              ? rawResult.document_id
              : null;
          preserveUploadForReconciliation = !createdDocumentId;
          throw new Error(
            "A criação transacional retornou uma resposta inválida. Nenhum resultado seguro pôde ser confirmado.",
          );
        }

        const usageLogWarning = await registerTemplateUsage(created.documentId);
        const registerFieldWarning = await syncDocumentRegisterFields(
          created.documentId,
        );
        return {
          id: created.documentId,
          code: created.code,
          warning:
            [...created.warnings, usageLogWarning, registerFieldWarning]
              .filter(Boolean)
              .join(" ") || undefined,
        };
      }

      if (
        !isTransactionalDocumentCreationUnavailable(transactionalResult.error)
      ) {
        throw new Error(
          `Não foi possível concluir a criação transacional: ${getErrorMessage(transactionalResult.error, "erro não identificado")}`,
        );
      }

      const transactionalFallbackWarning =
        "Ciclo 20 não instalado. O documento foi criado pelo fluxo compatível do cliente.";

      const { data, error: insertError } = await supabase
        .from("documents")
        .insert(
          normalizeDocumentCreationPayload({
            org_id: profile.org_id,
            library_id: libraryId,
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
            discipline_id: input.discipline_id ?? null,
            received_at: input.received_at ?? null,
            analysis_days: input.analysis_days ?? null,
            analysis_deadline: input.analysis_deadline ?? null,
            external_link: input.external_link?.trim() || null,
            register_status: input.register_status?.trim() || null,
            register_revision: input.register_revision?.trim() || null,
            ...advancedFields,
          }),
        )
        .select("id, code")
        .single();

      if (insertError && isMissingDocumentsSchema(insertError)) {
        const now = new Date().toISOString();
        const nextId =
          globalThis.crypto?.randomUUID?.() ?? `local-document-${Date.now()}`;
        const localCode =
          input.creationContext?.codePreview?.trim() ||
          `DOC-${Date.now().toString().slice(-6)}`;
        const localDocuments = loadLocalDocuments(profile.org_id);
        const nextDocument: Document = {
          id: nextId,
          org_id: profile.org_id,
          library_id: libraryId,
          code: localCode,
          title: input.title.trim(),
          project_id: input.project_id || null,
          discipline_id: input.discipline_id || null,
          doc_type: input.doc_type,
          area: input.area,
          status: "draft",
          register_status: input.register_status?.trim() || null,
          revision,
          register_revision: input.register_revision?.trim() || null,
          description: input.description?.trim() || null,
          file_path,
          file_name,
          file_size,
          next_review_at: input.next_review_at || null,
          received_at: input.received_at || null,
          analysis_days: input.analysis_days ?? null,
          analysis_deadline: input.analysis_deadline || null,
          external_link: input.external_link?.trim() || null,
          author_id: profile.id,
          published_at: null,
          created_at: now,
          updated_at: now,
          published_version_id: null,
          working_version_id: null,
          code_pattern_id: input.creationContext?.codePatternId ?? null,
          code_generation_mode:
            input.creationContext?.codePreviewMode ?? "local_fallback",
          manual_code: requestedCodeMode === "manual",
          working_revision: null,
          published_revision: null,
          correction: null,
          author: { full_name: currentProfile.full_name || "Usuário" },
          project: null,
        };
        saveLocalDocuments(profile.org_id, [nextDocument, ...localDocuments]);
        return {
          id: nextId,
          code: localCode,
          warning:
            "Tabela documents indisponível. O documento foi salvo localmente neste navegador para permitir testes.",
        };
      }

      if (insertError) {
        throw new Error(
          `Não foi possível criar o documento: ${getErrorMessage(insertError, "erro não identificado")}`,
        );
      }
      createdDocumentId = data.id;
      let finalCode = String(data.code ?? "");
      let codePatternId = input.creationContext?.codePatternId ?? null;
      let codeGenerationMode =
        input.creationContext?.codePreviewMode ?? "legacy";
      let codeGenerationWarning: string | undefined;
      let codeCollisionWarning = false;
      let codeCollisionSkips = 0;

      if (requestedCodeMode === "manual") {
        const manualResult = await supabase.rpc("assign_manual_document_code", {
          p_document_id: data.id,
          p_code: input.coding?.manualCode?.trim() ?? "",
          p_reason: input.coding?.manualReason?.trim() ?? "",
        });
        if (manualResult.error) {
          throw new Error(
            isDocumentCodingCompatibilityError(manualResult.error)
              ? "Código manual exige o ciclo 19. O documento não foi mantido para evitar codificação divergente."
              : `Não foi possível aplicar o código manual: ${getErrorMessage(manualResult.error, "erro não identificado")}`,
          );
        }
        const manual = manualResult.data as Record<string, unknown> | null;
        if (typeof manual?.code === "string" && manual.code) {
          finalCode = manual.code;
        }
        codePatternId = null;
        codeGenerationMode = "manual";
      } else if (
        input.creationContext?.requestCodeAllocation ||
        input.coding?.mode === "automatic" ||
        input.coding?.mode === "selected_pattern"
      ) {
        const allocationParams = {
          p_document_id: data.id,
          p_doc_type: input.doc_type,
          p_area: input.area,
          p_project_id: input.project_id || null,
          p_reference_date: new Date().toISOString().slice(0, 10),
        };
        let allocationResult;
        if (requestedCodeMode === "selected_pattern") {
          allocationResult = await supabase.rpc(
            "allocate_document_code_for_pattern",
            {
              ...allocationParams,
              p_pattern_id: input.coding?.patternId,
            },
          );
        } else {
          allocationResult = await supabase.rpc(
            "allocate_document_code_automatic",
            allocationParams,
          );
          if (
            allocationResult.error &&
            isDocumentCodingCompatibilityError(allocationResult.error)
          ) {
            allocationResult = await supabase.rpc(
              "allocate_document_code",
              allocationParams,
            );
          }
        }

        if (allocationResult.error) {
          if (requestedCodeMode === "selected_pattern") {
            throw new Error(
              isDocumentCodingCompatibilityError(allocationResult.error)
                ? "A escolha explícita de padrão exige o ciclo 19. O documento não foi mantido para evitar aplicar outro padrão silenciosamente."
                : `O padrão escolhido não pôde ser alocado: ${getErrorMessage(allocationResult.error, "erro não identificado")}`,
            );
          }
          codeGenerationMode = "legacy";
          codePatternId = null;
          const reconciliation = await supabase
            .from("documents")
            .select("code")
            .eq("id", data.id)
            .eq("org_id", profile.org_id)
            .maybeSingle();
          if (
            !reconciliation.error &&
            reconciliation.data?.code &&
            reconciliation.data.code !== finalCode
          ) {
            finalCode = reconciliation.data.code;
            codeGenerationMode = "configured_reconciled";
          }
          if (!isDocumentCodingCompatibilityError(allocationResult.error)) {
            codeGenerationWarning =
              codeGenerationMode === "configured_reconciled"
                ? "O código final foi confirmado no documento, mas a resposta da alocação P-11 não retornou normalmente. Revise o evento de codificação."
                : "Documento criado com o código legado, pois a alocação P-11 não pôde ser concluída. Revise as permissões e os padrões de codificação.";
          }
        } else if (
          allocationResult.data &&
          typeof allocationResult.data === "object"
        ) {
          const allocation = allocationResult.data as Record<string, unknown>;
          if (typeof allocation.code === "string" && allocation.code) {
            finalCode = allocation.code;
          }
          codePatternId =
            typeof allocation.pattern_id === "string"
              ? allocation.pattern_id
              : null;
          codeGenerationMode =
            typeof allocation.mode === "string" ? allocation.mode : "allocated";
          codeCollisionWarning = allocation.collision_warning === true;
          codeCollisionSkips =
            Number.isInteger(allocation.collision_skips) &&
            Number(allocation.collision_skips) > 0
              ? Number(allocation.collision_skips)
              : 0;
          if (codeCollisionWarning) {
            codeGenerationWarning = `O código previsto já estava em uso. A sequência avançou ${codeCollisionSkips} ${codeCollisionSkips === 1 ? "posição" : "posições"} e o código final é ${finalCode}.`;
          }
        }
      }
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

      const registerFieldWarning = await syncDocumentRegisterFields(data.id);

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
          project_code: input.creationContext?.projectCode ?? null,
          project_name: input.creationContext?.projectName ?? null,
          project_client: input.creationContext?.projectClient ?? null,
          project_contract: input.creationContext?.projectContract ?? null,
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
          code_preview: input.creationContext?.codePreview ?? null,
          code_final: finalCode,
          code_pattern_id: codePatternId,
          code_generation_mode: codeGenerationMode,
          requested_code_mode: requestedCodeMode,
          requested_code_pattern_id: input.coding?.patternId ?? null,
          manual_code_reason:
            requestedCodeMode === "manual"
              ? input.coding?.manualReason?.trim() || null
              : null,
          code_collision_warning: codeCollisionWarning,
          code_collision_skips: codeCollisionSkips,
          suggested_tramite_template_id:
            input.creationContext?.suggestedTramiteId ?? null,
          suggested_tramite_name:
            input.creationContext?.suggestedTramiteName ?? null,
          suggested_tramite_version_id:
            input.creationContext?.suggestedTramiteVersionId ?? null,
          suggested_tramite_reason:
            input.creationContext?.suggestedTramiteReason ?? null,
        },
      });
      const auditWarning = auditError
        ? `Documento criado, mas o evento inicial da trilha de auditoria não pôde ser salvo: ${getErrorMessage(auditError, "erro não identificado")}`
        : undefined;

      const usageLogWarning = await registerTemplateUsage(data.id);

      return {
        id: data.id,
        code: finalCode,
        warning:
          [
            transactionalFallbackWarning,
            codeGenerationWarning,
            registerFieldWarning,
            auditWarning,
            usageLogWarning,
          ]
            .filter(Boolean)
            .join(" ") || undefined,
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
      } else if (uploadedPath && !preserveUploadForReconciliation) {
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
      } else if (uploadedPath) {
        cleanupMessages.push(
          `Não foi possível confirmar se a transação criou o documento. O arquivo ${uploadedPath} foi preservado para reconciliação manual.`,
        );
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
