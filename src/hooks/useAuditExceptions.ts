import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import {
  getDefaultAuditExceptionFilters,
  isAuditExceptionsPermissionError,
  isAuditExceptionsSchemaMissing,
  normalizeAuditExceptionDetail,
  normalizeAuditReconciliationOverview,
  type AuditExceptionDetail,
  type AuditExceptionFilters,
  type AuditExceptionOption,
  type AuditExceptionStatus,
  type AuditExceptionsSchemaState,
  type AuditReconciliationOverview,
} from "@/lib/auditExceptions";
import { supabase } from "@/lib/supabase";

interface OptionState {
  documents: AuditExceptionOption[];
  projects: AuditExceptionOption[];
  types: AuditExceptionOption[];
  sources: AuditExceptionOption[];
}

const EMPTY_OPTIONS: OptionState = {
  documents: [],
  projects: [],
  types: [],
  sources: [],
};

function normalizeDocumentOption(row: Record<string, unknown>) {
  return {
    value: String(row.id ?? ""),
    label:
      [row.code, row.title].filter(Boolean).join(" — ") ||
      String(row.id ?? "Documento"),
  };
}

function normalizeProjectOption(row: Record<string, unknown>) {
  return {
    value: String(row.id ?? ""),
    label:
      [row.code, row.name].filter(Boolean).join(" — ") ||
      String(row.id ?? "Projeto"),
  };
}

function uniqueOptions(values: string[]): AuditExceptionOption[] {
  return Array.from(new Set(values.filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, "pt-BR"))
    .map((value) => ({ value, label: value.replaceAll("_", " ") }));
}

export function useAuditExceptions() {
  const { profile } = useAuthContext();
  const canViewOrganization =
    profile?.role === "admin" || profile?.role === "manager";
  const [filters, setFilters] = useState<AuditExceptionFilters>(() =>
    getDefaultAuditExceptionFilters(canViewOrganization),
  );
  const [overview, setOverview] = useState<AuditReconciliationOverview | null>(
    null,
  );
  const [detail, setDetail] = useState<AuditExceptionDetail | null>(null);
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(
    null,
  );
  const [schemaState, setSchemaState] =
    useState<AuditExceptionsSchemaState>("available");
  const [options, setOptions] = useState<OptionState>(EMPTY_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [lastRunResult, setLastRunResult] = useState<Record<
    string,
    unknown
  > | null>(null);

  useEffect(() => {
    if (!canViewOrganization && filters.scope === "org") {
      setFilters((current) => ({ ...current, scope: "mine" }));
    }
  }, [canViewOrganization, filters.scope]);

  const loadOptions = useCallback(async () => {
    if (!profile?.org_id) return;

    const [documentsResult, projectsResult] = await Promise.allSettled([
      supabase
        .from("documents")
        .select("id, code, title, project_id, author_id, created_by")
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("projects").select("id, code, name").limit(200),
    ]);

    const documentRows =
      documentsResult.status === "fulfilled" && !documentsResult.value.error
        ? ((documentsResult.value.data ?? []) as Array<
            Record<string, unknown>
          >)
        : [];
    const scopedDocuments = canViewOrganization
      ? documentRows
      : documentRows.filter(
          (document) =>
            document.author_id === profile.id ||
            document.created_by === profile.id,
        );
    const projectRows =
      projectsResult.status === "fulfilled" && !projectsResult.value.error
        ? ((projectsResult.value.data ?? []) as Array<Record<string, unknown>>)
        : [];

    setOptions((current) => ({
      ...current,
      documents: scopedDocuments.map(normalizeDocumentOption),
      projects: projectRows.map(normalizeProjectOption),
    }));
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
      "get_audit_reconciliation_overview",
      {
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_scope: filters.scope,
        p_document_id: filters.documentId || null,
        p_project_id: filters.projectId || null,
      },
    );

    if (rpcError) {
      if (isAuditExceptionsSchemaMissing(rpcError)) {
        setSchemaState("not_installed");
        setWarning(
          "O ciclo 27_TRAMITA_audit_exceptions_reconciliation ainda não foi aplicado. A tela fica em modo informativo.",
        );
      } else if (isAuditExceptionsPermissionError(rpcError)) {
        setSchemaState("restricted");
        setError(
          "Seu perfil não pode acessar o escopo solicitado. Use Minha operação ou solicite acesso administrativo.",
        );
      } else {
        setSchemaState("error");
        setError(
          getErrorMessage(
            rpcError,
            "Não foi possível carregar a reconciliação.",
          ),
        );
      }
      setOverview(null);
      setIsLoading(false);
      return;
    }

    const normalized = normalizeAuditReconciliationOverview(data);
    setOverview(normalized);
    setSchemaState("available");
    setOptions((current) => ({
      ...current,
      types: uniqueOptions(
        normalized.exceptions.map((exception) => exception.exceptionType),
      ),
      sources: uniqueOptions(
        normalized.exceptions.map((exception) => exception.source),
      ),
    }));
    setIsLoading(false);
  }, [
    filters.documentId,
    filters.from,
    filters.projectId,
    filters.scope,
    filters.to,
    profile?.org_id,
  ]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const runReconciliation = useCallback(async () => {
    if (!profile?.org_id) {
      setError("Seu perfil não possui organização válida.");
      return null;
    }

    setIsRunning(true);
    setError(null);
    setWarning(null);

    const { data, error: rpcError } = await supabase.rpc(
      "run_audit_reconciliation",
      {
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_scope: filters.scope,
        p_document_id: filters.documentId || null,
        p_project_id: filters.projectId || null,
      },
    );

    if (rpcError) {
      if (isAuditExceptionsSchemaMissing(rpcError)) {
        setSchemaState("not_installed");
        setWarning(
          "O ciclo 27_TRAMITA_audit_exceptions_reconciliation ainda não foi aplicado.",
        );
      } else if (isAuditExceptionsPermissionError(rpcError)) {
        setSchemaState("restricted");
        setError("Seu perfil não pode executar reconciliação neste escopo.");
      } else {
        setSchemaState("error");
        setError(
          getErrorMessage(rpcError, "Não foi possível executar reconciliação."),
        );
      }
      setIsRunning(false);
      return null;
    }

    setLastRunResult((data ?? {}) as Record<string, unknown>);
    setSchemaState("available");
    await loadOverview();
    setIsRunning(false);
    return data;
  }, [
    filters.documentId,
    filters.from,
    filters.projectId,
    filters.scope,
    filters.to,
    loadOverview,
    profile?.org_id,
  ]);

  const loadDetail = useCallback(async (exceptionId: string | null) => {
    setSelectedExceptionId(exceptionId);
    setDetail(null);
    if (!exceptionId) return;

    setIsDetailLoading(true);
    const { data, error: rpcError } = await supabase.rpc(
      "get_audit_exception_detail",
      {
        p_exception_id: exceptionId,
      },
    );

    if (rpcError) {
      if (isAuditExceptionsSchemaMissing(rpcError)) {
        setSchemaState("not_installed");
      } else if (isAuditExceptionsPermissionError(rpcError)) {
        setSchemaState("restricted");
        setError("Seu perfil não pode acessar o detalhe desta exceção.");
      } else {
        setError(
          getErrorMessage(rpcError, "Não foi possível carregar o detalhe."),
        );
      }
      setIsDetailLoading(false);
      return;
    }

    setDetail(normalizeAuditExceptionDetail(data));
    setIsDetailLoading(false);
  }, []);

  const updateStatus = useCallback(
    async (
      exceptionId: string,
      status: Exclude<AuditExceptionStatus, "open">,
      note: string,
    ) => {
      setIsUpdatingStatus(true);
      setError(null);
      const { error: rpcError } = await supabase.rpc(
        "update_audit_exception_status",
        {
          p_exception_id: exceptionId,
          p_status: status,
          p_note: note || null,
        },
      );

      if (rpcError) {
        setError(
          getErrorMessage(
            rpcError,
            "Não foi possível atualizar o status da exceção.",
          ),
        );
        setIsUpdatingStatus(false);
        return false;
      }

      await loadOverview();
      await loadDetail(exceptionId);
      setIsUpdatingStatus(false);
      return true;
    },
    [loadDetail, loadOverview],
  );

  const filteredExceptions = useMemo(() => {
    const exceptions = overview?.exceptions ?? [];
    return exceptions.filter((exception) => {
      if (
        filters.severity !== "all" &&
        exception.severity !== filters.severity
      ) {
        return false;
      }
      if (filters.status !== "all" && exception.status !== filters.status) {
        return false;
      }
      if (filters.type && exception.exceptionType !== filters.type) {
        return false;
      }
      if (filters.source && exception.source !== filters.source) {
        return false;
      }
      return true;
    });
  }, [
    filters.severity,
    filters.source,
    filters.status,
    filters.type,
    overview?.exceptions,
  ]);

  return {
    filters,
    setFilters,
    overview,
    detail,
    selectedExceptionId,
    filteredExceptions,
    schemaState,
    options,
    isLoading,
    isRunning,
    isDetailLoading,
    isUpdatingStatus,
    error,
    warning,
    lastRunResult,
    canViewOrganization,
    loadOverview,
    runReconciliation,
    loadDetail,
    updateStatus,
  };
}
