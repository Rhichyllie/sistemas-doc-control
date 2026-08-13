import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import {
  buildManualTextPages,
  isDocumentOcrPermissionError,
  isDocumentOcrSchemaMissing,
  normalizeDocumentOcrJob,
  normalizeDocumentOcrJobDetail,
  normalizeDocumentOcrOverview,
  type DocumentOcrCreateJobInput,
  type DocumentOcrJob,
  type DocumentOcrJobDetail,
  type DocumentOcrJobStatus,
  type DocumentOcrMethod,
  type DocumentOcrOption,
  type DocumentOcrOverview,
  type DocumentOcrSchemaState,
} from "@/lib/documentOcr";
import { supabase } from "@/lib/supabase";

interface DocumentOption extends DocumentOcrOption {
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileHash: string | null;
}

function normalizeDocumentOption(row: Record<string, unknown>): DocumentOption {
  const id = String(row.id ?? "");
  return {
    value: id,
    label:
      [row.code, row.title].filter(Boolean).join(" — ") ||
      String(row.title ?? id),
    filePath: typeof row.file_path === "string" ? row.file_path : null,
    fileName: typeof row.file_name === "string" ? row.file_name : null,
    fileSize:
      typeof row.file_size === "number"
        ? row.file_size
        : Number.isFinite(Number(row.file_size))
          ? Number(row.file_size)
          : null,
    fileHash: typeof row.file_hash === "string" ? row.file_hash : null,
  };
}

export function useDocumentOcr() {
  const { profile } = useAuthContext();
  const canViewOrganization =
    profile?.role === "admin" || profile?.role === "manager";

  const [schemaState, setSchemaState] =
    useState<DocumentOcrSchemaState>("available");
  const [overview, setOverview] = useState<DocumentOcrOverview | null>(null);
  const [selectedJob, setSelectedJob] = useState<DocumentOcrJobDetail | null>(
    null,
  );
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | DocumentOcrJobStatus
  >("all");
  const [defaultMethod, setDefaultMethod] =
    useState<DocumentOcrMethod>("unavailable");
  const [isLoading, setIsLoading] = useState(true);
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isStoringManualText, setIsStoringManualText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const selectedDocument = useMemo(
    () =>
      documents.find((document) => document.value === selectedDocumentId) ??
      null,
    [documents, selectedDocumentId],
  );

  const loadDocuments = useCallback(async () => {
    if (!profile?.org_id) {
      setDocuments([]);
      setIsDocumentsLoading(false);
      return;
    }

    setIsDocumentsLoading(true);
    const { data, error: documentsError } = await supabase
      .from("documents")
      .select("id, code, title, file_path, file_name, file_size, file_hash, author_id")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(250);

    if (documentsError) {
      setWarning(
        getErrorMessage(
          documentsError,
          "Não foi possível carregar documentos para leitura.",
        ),
      );
      setDocuments([]);
      setIsDocumentsLoading(false);
      return;
    }

    const rows = ((data ?? []) as Array<Record<string, unknown>>).filter(
      (row) =>
        canViewOrganization ||
        !profile?.id ||
        row.author_id === profile.id,
    );
    setDocuments(rows.map(normalizeDocumentOption));
    setIsDocumentsLoading(false);
  }, [canViewOrganization, profile?.id, profile?.org_id]);

  const loadOverview = useCallback(async () => {
    if (!profile?.org_id) {
      setOverview(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarning(null);

    const { data, error: rpcError } = await supabase.rpc(
      "get_document_ocr_overview",
      {
        p_document_id: selectedDocumentId || null,
        p_status: selectedStatus === "all" ? null : selectedStatus,
        p_limit: 50,
      },
    );

    if (rpcError) {
      if (isDocumentOcrSchemaMissing(rpcError)) {
        setSchemaState("not_installed");
        setWarning(
          "O ciclo 29_TRAMITA_document_ocr_base ainda não foi aplicado. A tela fica em modo informativo.",
        );
      } else if (isDocumentOcrPermissionError(rpcError)) {
        setSchemaState("restricted");
        setError(
          "Seu perfil não pode consultar OCR no escopo solicitado.",
        );
      } else {
        setSchemaState("error");
        setError(
          getErrorMessage(
            rpcError,
            "Não foi possível carregar a leitura documental.",
          ),
        );
      }
      setOverview(null);
      setIsLoading(false);
      return;
    }

    const normalized = normalizeDocumentOcrOverview(data);
    setOverview(normalized);
    setSchemaState("available");
    setIsLoading(false);
  }, [profile?.org_id, selectedDocumentId, selectedStatus]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const loadJob = useCallback(async (jobId: string | null) => {
    setSelectedJobId(jobId);
    setSelectedJob(null);
    if (!jobId) return null;

    setIsDetailLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "get_document_ocr_job",
      {
        p_job_id: jobId,
      },
    );

    if (rpcError) {
      if (isDocumentOcrSchemaMissing(rpcError)) {
        setSchemaState("not_installed");
      } else if (isDocumentOcrPermissionError(rpcError)) {
        setSchemaState("restricted");
        setError("Seu perfil não pode acessar este job OCR.");
      } else {
        setError(
          getErrorMessage(rpcError, "Não foi possível carregar o job OCR."),
        );
      }
      setIsDetailLoading(false);
      return null;
    }

    const normalized = normalizeDocumentOcrJobDetail(data);
    setSelectedJob(normalized);
    setSchemaState("available");
    setIsDetailLoading(false);
    return normalized;
  }, []);

  const createJob = useCallback(
    async (input: DocumentOcrCreateJobInput) => {
      if (!input.documentId) {
        setError("Selecione um documento para solicitar leitura.");
        return null;
      }

      setIsCreating(true);
      setError(null);
      setWarning(null);

      const { data, error: rpcError } = await supabase.rpc(
        "create_document_ocr_job",
        {
          p_document_id: input.documentId,
          p_document_version_id: input.documentVersionId || null,
          p_source_table: input.sourceTable || null,
          p_source_id: input.sourceId || null,
          p_source_storage_bucket: input.sourceStorageBucket || null,
          p_source_storage_path: input.sourceStoragePath || null,
          p_source_file_name: input.sourceFileName || null,
          p_source_mime_type: input.sourceMimeType || null,
          p_source_size_bytes: input.sourceSizeBytes ?? null,
          p_source_checksum: input.sourceChecksum || null,
          p_method: input.method,
          p_language_hint: input.languageHint || "pt-BR",
        },
      );

      if (rpcError) {
        if (isDocumentOcrSchemaMissing(rpcError)) {
          setSchemaState("not_installed");
          setWarning(
            "O ciclo 29_TRAMITA_document_ocr_base ainda não foi aplicado.",
          );
        } else if (isDocumentOcrPermissionError(rpcError)) {
          setSchemaState("restricted");
          setError("Seu perfil não pode criar job OCR para este documento.");
        } else {
          setSchemaState("error");
          setError(
            getErrorMessage(rpcError, "Não foi possível criar o job OCR."),
          );
        }
        setIsCreating(false);
        return null;
      }

      const jobRow = (data as Record<string, unknown> | null)?.job;
      const normalized = jobRow
        ? normalizeDocumentOcrJob(jobRow)
        : null;
      await loadOverview();
      if (normalized?.id) {
        await loadJob(normalized.id);
      }
      setIsCreating(false);
      return normalized;
    },
    [loadJob, loadOverview],
  );

  const createJobForSelectedDocument = useCallback(async () => {
    if (!selectedDocument) {
      setError("Selecione um documento antes de criar a solicitação.");
      return null;
    }

    return createJob({
      documentId: selectedDocument.value,
      sourceTable: selectedDocument.filePath ? "documents" : "storage",
      sourceStorageBucket: selectedDocument.filePath ? "documents" : null,
      sourceStoragePath: selectedDocument.filePath,
      sourceFileName: selectedDocument.fileName,
      sourceSizeBytes: selectedDocument.fileSize,
      sourceChecksum: selectedDocument.fileHash,
      method: defaultMethod,
      languageHint: "pt-BR",
    });
  }, [createJob, defaultMethod, selectedDocument]);

  const storeManualTextResult = useCallback(
    async (job: DocumentOcrJob, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setError("Informe o texto observado para registrar como manual_text.");
        return false;
      }

      setIsStoringManualText(true);
      setError(null);

      const pages = buildManualTextPages(trimmed);
      const { error: rpcError } = await supabase.rpc(
        "store_document_ocr_result",
        {
          p_job_id: job.id,
          p_status: "completed_with_warnings",
          p_method: "manual_text",
          p_page_count: 1,
          p_pages: pages,
          p_average_confidence: null,
          p_warnings: [
            "Texto registrado manualmente. Deve ser conferido contra o arquivo original.",
          ],
          p_limitations: [
            "Leitura manual não é OCR automático.",
            "O sistema não interpreta, corrige ou infere conteúdo.",
          ],
          p_metadata: {
            source: "manual_text_panel",
            does_not_interpret_content: true,
          },
          p_error_code: null,
          p_error_message: null,
        },
      );

      if (rpcError) {
        if (isDocumentOcrSchemaMissing(rpcError)) {
          setSchemaState("not_installed");
        } else if (isDocumentOcrPermissionError(rpcError)) {
          setSchemaState("restricted");
          setError(
            "Seu perfil não pode armazenar resultado OCR nesta fase.",
          );
        } else {
          setError(
            getErrorMessage(
              rpcError,
              "Não foi possível armazenar o texto OCR.",
            ),
          );
        }
        setIsStoringManualText(false);
        return false;
      }

      await loadOverview();
      await loadJob(job.id);
      setIsStoringManualText(false);
      return true;
    },
    [loadJob, loadOverview],
  );

  return {
    canViewOrganization,
    documents,
    selectedDocument,
    selectedDocumentId,
    setSelectedDocumentId,
    selectedStatus,
    setSelectedStatus,
    defaultMethod,
    setDefaultMethod,
    overview,
    selectedJob,
    selectedJobId,
    schemaState,
    isLoading,
    isDocumentsLoading,
    isDetailLoading,
    isCreating,
    isStoringManualText,
    error,
    warning,
    loadOverview,
    loadDocuments,
    loadJob,
    createJob,
    createJobForSelectedDocument,
    storeManualTextResult,
  };
}
