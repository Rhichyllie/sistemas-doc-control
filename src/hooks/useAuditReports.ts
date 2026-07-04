import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import {
  calculateAuditPackageHash,
  getDefaultAuditReportFilters,
  isAuditReportsPermissionError,
  isAuditReportsSchemaMissing,
  normalizeAuditReportPackage,
  type AuditExportHistoryEntry,
  type AuditReportFilters,
  type AuditReportFormat,
  type AuditReportOption,
  type AuditReportPackage,
  type AuditReportsSchemaState,
} from "@/lib/auditReports";
import { supabase } from "@/lib/supabase";

interface OptionState {
  documents: AuditReportOption[];
  projects: AuditReportOption[];
  docTypes: AuditReportOption[];
  areas: AuditReportOption[];
  statuses: AuditReportOption[];
}

const EMPTY_OPTIONS: OptionState = {
  documents: [],
  projects: [],
  docTypes: [],
  areas: [],
  statuses: [],
};

function uniqueOptions(
  values: Array<string | null | undefined>,
): AuditReportOption[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  )
    .sort((left, right) => left.localeCompare(right, "pt-BR"))
    .map((value) => ({ value, label: value }));
}

function normalizeHistoryRow(value: unknown): AuditExportHistoryEntry {
  const row = value as Record<string, unknown>;
  const manifest =
    row.manifest && typeof row.manifest === "object"
      ? (row.manifest as Record<string, unknown>)
      : {};
  const generatedBy =
    manifest.generated_by && typeof manifest.generated_by === "object"
      ? (manifest.generated_by as Record<string, unknown>)
      : {};
  const document =
    manifest.document && typeof manifest.document === "object"
      ? (manifest.document as Record<string, unknown>)
      : {};
  return {
    id: String(row.id ?? ""),
    reportType:
      row.report_type === "document" ||
      row.report_type === "sla" ||
      row.report_type === "evidence_workflow"
        ? row.report_type
        : "operational",
    reportFormat:
      row.report_format === "csv" ||
      row.report_format === "pdf" ||
      row.report_format === "summary"
        ? row.report_format
        : "json",
    scope: row.scope === "org" ? "org" : "mine",
    periodFrom: typeof row.period_from === "string" ? row.period_from : null,
    periodTo: typeof row.period_to === "string" ? row.period_to : null,
    documentId: typeof row.document_id === "string" ? row.document_id : null,
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    filters:
      row.filters && typeof row.filters === "object"
        ? (row.filters as Record<string, unknown>)
        : {},
    manifest,
    recordCounts:
      row.record_counts && typeof row.record_counts === "object"
        ? (row.record_counts as Record<string, unknown>)
        : {},
    integrityHash:
      typeof row.integrity_hash === "string" ? row.integrity_hash : null,
    fileName: typeof row.file_name === "string" ? row.file_name : null,
    generatedAt: String(row.generated_at ?? row.created_at ?? ""),
    requestedBy: String(row.requested_by ?? ""),
    requestedByName:
      typeof generatedBy.full_name === "string" ? generatedBy.full_name : null,
    documentLabel: typeof document.label === "string" ? document.label : null,
  };
}

export function useAuditReports() {
  const { profile } = useAuthContext();
  const canViewOrganization =
    profile?.role === "admin" || profile?.role === "manager";
  const [filters, setFilters] = useState<AuditReportFilters>(() =>
    getDefaultAuditReportFilters(canViewOrganization),
  );
  const [report, setReport] = useState<AuditReportPackage | null>(null);
  const [integrityHash, setIntegrityHash] = useState<string | null>(null);
  const [hashError, setHashError] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [schemaState, setSchemaState] =
    useState<AuditReportsSchemaState>("available");
  const [registrationAvailable, setRegistrationAvailable] = useState(true);
  const [history, setHistory] = useState<AuditExportHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [options, setOptions] = useState<OptionState>(EMPTY_OPTIONS);

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
        .select(
          "id, code, title, doc_type, area, status, project_id, author_id, created_by",
        )
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("projects")
        .select("id, code, name")
        .order("name", { ascending: true })
        .limit(200),
    ]);

    const documentRows =
      documentsResult.status === "fulfilled" && !documentsResult.value.error
        ? ((documentsResult.value.data ?? []) as Array<
            Record<string, string | null>
          >)
        : [];
    const scopedDocumentRows = canViewOrganization
      ? documentRows
      : documentRows.filter(
          (document) =>
            document.author_id === profile.id ||
            document.created_by === profile.id,
        );
    const projectRows =
      projectsResult.status === "fulfilled" && !projectsResult.value.error
        ? ((projectsResult.value.data ?? []) as Array<
            Record<string, string | null>
          >)
        : [];

    setOptions({
      documents: scopedDocumentRows.map((document) => ({
        value: String(document.id),
        label: [document.code, document.title].filter(Boolean).join(" — "),
      })),
      projects: projectRows.map((project) => ({
        value: String(project.id),
        label: [project.code, project.name].filter(Boolean).join(" — "),
      })),
      docTypes: uniqueOptions(scopedDocumentRows.map((row) => row.doc_type)),
      areas: uniqueOptions(scopedDocumentRows.map((row) => row.area)),
      statuses: uniqueOptions(scopedDocumentRows.map((row) => row.status)),
    });
  }, [canViewOrganization, profile?.id, profile?.org_id]);

  const loadHistory = useCallback(async () => {
    if (!profile?.org_id) {
      setHistory([]);
      setIsHistoryLoading(false);
      return;
    }
    setIsHistoryLoading(true);
    const { data, error: historyError } = await supabase
      .from("audit_report_exports")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("generated_at", { ascending: false })
      .limit(30);

    if (historyError) {
      if (isAuditReportsSchemaMissing(historyError)) {
        setRegistrationAvailable(false);
        setSchemaState("not_installed");
        setHistory([]);
      } else if (isAuditReportsPermissionError(historyError)) {
        setSchemaState("restricted");
        setHistory([]);
      } else {
        setSchemaState("error");
        setWarning(
          getErrorMessage(
            historyError,
            "O histórico de exportações não pôde ser lido.",
          ),
        );
      }
    } else {
      setRegistrationAvailable(true);
      setHistory((data ?? []).map(normalizeHistoryRow));
    }
    setIsHistoryLoading(false);
  }, [profile?.org_id]);

  useEffect(() => {
    void loadOptions();
    void loadHistory();
  }, [loadHistory, loadOptions]);

  useEffect(() => {
    let active = true;
    setIntegrityHash(null);
    setHashError(null);
    if (!report) return;
    setIsHashing(true);
    void calculateAuditPackageHash(report.raw)
      .then((hash) => {
        if (active) setIntegrityHash(hash);
      })
      .catch((hashFailure) => {
        if (active) {
          setHashError(
            getErrorMessage(
              hashFailure,
              "Não foi possível calcular o hash técnico.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setIsHashing(false);
      });
    return () => {
      active = false;
    };
  }, [report]);

  const generate = useCallback(async () => {
    if (!profile?.org_id) {
      setError("Seu perfil não possui organização válida.");
      setSchemaState("restricted");
      return null;
    }
    if (filters.reportType === "document" && !filters.documentId) {
      setError("Selecione um documento para o relatório documental.");
      return null;
    }
    setIsGenerating(true);
    setError(null);
    setWarning(null);

    const { data, error: rpcError } = await supabase.rpc(
      "get_audit_report_package",
      {
        p_report_type: filters.reportType,
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_scope: filters.scope,
        p_document_id: filters.documentId || null,
        p_project_id: filters.projectId || null,
        p_doc_type: filters.docType || null,
        p_area: filters.area || null,
        p_status: filters.status || null,
      },
    );

    if (rpcError) {
      if (isAuditReportsSchemaMissing(rpcError)) {
        setSchemaState("not_installed");
        setRegistrationAvailable(false);
        setWarning(
          "O ciclo 26_TRAMITA_audit_reports_export ainda não foi aplicado. A trilha atual continua disponível, mas não será rotulada como pacote formal.",
        );
      } else if (isAuditReportsPermissionError(rpcError)) {
        setSchemaState("restricted");
        setError(
          "Seu perfil não pode gerar o escopo solicitado. Use o escopo pessoal ou solicite acesso administrativo.",
        );
      } else {
        setSchemaState("error");
        setError(
          getErrorMessage(
            rpcError,
            "Não foi possível gerar o pacote de auditoria.",
          ),
        );
      }
      setIsGenerating(false);
      return null;
    }

    const normalized = normalizeAuditReportPackage(data);
    setReport(normalized);
    setSchemaState("available");
    setIsGenerating(false);
    return normalized;
  }, [filters, profile?.org_id]);

  const registerExport = useCallback(
    async (format: AuditReportFormat, fileName: string | null) => {
      if (!report || !integrityHash) {
        return {
          id: null,
          warning: "Hash ou pacote indisponível para registro append-only.",
        };
      }
      const selectedDocument = options.documents.find(
        (option) => option.value === filters.documentId,
      );
      const manifest = {
        ...report.manifest,
        organization: report.organization,
        generated_by: report.generatedBy,
        document: selectedDocument
          ? {
              id: selectedDocument.value,
              label: selectedDocument.label,
            }
          : null,
      };
      const { data, error: registerError } = await supabase.rpc(
        "register_audit_report_export",
        {
          p_report_type: report.reportType,
          p_report_format: format,
          p_scope: filters.scope,
          p_period_from: report.reportPeriod.from || null,
          p_period_to: report.reportPeriod.to || null,
          p_document_id: filters.documentId || null,
          p_project_id: filters.projectId || null,
          p_filters: report.filters,
          p_manifest: manifest,
          p_record_counts: report.recordCounts,
          p_source_coverage: Object.fromEntries(
            report.sourceCoverage.map((source) => [
              source.key,
              {
                status: source.status,
                canonical: source.canonical,
                records: source.records,
                note: source.note,
              },
            ]),
          ),
          p_limitations: report.limitations,
          p_integrity_hash: integrityHash,
          p_file_name: fileName,
        },
      );

      if (registerError) {
        if (isAuditReportsSchemaMissing(registerError)) {
          setRegistrationAvailable(false);
          return {
            id: null,
            warning:
              "Exportação concluída localmente, mas o registro append-only não está instalado.",
          };
        }
        return {
          id: null,
          warning: getErrorMessage(
            registerError,
            "Exportação local concluída; falhou o registro no histórico.",
          ),
        };
      }

      setRegistrationAvailable(true);
      await loadHistory();
      return { id: String(data ?? ""), warning: null };
    },
    [
      filters.documentId,
      filters.projectId,
      filters.scope,
      integrityHash,
      loadHistory,
      options.documents,
      report,
    ],
  );

  const selectedDocument = useMemo(
    () =>
      options.documents.find((option) => option.value === filters.documentId) ??
      null,
    [filters.documentId, options.documents],
  );

  return {
    filters,
    setFilters,
    report,
    integrityHash,
    hashError,
    isHashing,
    isGenerating,
    error,
    warning,
    schemaState,
    registrationAvailable,
    history,
    isHistoryLoading,
    options,
    selectedDocument,
    canViewOrganization,
    generate,
    registerExport,
    refreshHistory: loadHistory,
  };
}
