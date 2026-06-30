import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import { isWorkflowRpcUnavailable } from "@/lib/workflowCompatibility";

export type SchemaDoctorOverallStatus = "ok" | "warning" | "critical";
export type SchemaDoctorCheckStatus = "ok" | "missing";
export type SchemaDoctorCheckType = "table" | "column" | "rpc" | "policy";

export interface SchemaDoctorCheck {
  module: string;
  type: SchemaDoctorCheckType;
  table: string | null;
  name: string;
  status: SchemaDoctorCheckStatus;
  cycle: string;
  impact: string;
  severity: "warning" | "critical";
}

export interface SchemaDoctorCapabilities {
  canUseWorkflowEnterprise: boolean;
  canUseGroups: boolean;
  canUseCorrectionCycle: boolean;
  canUseFormalRevision: boolean;
  canUseTransactionalPublish: boolean;
}

export interface SchemaDoctorReport {
  overallStatus: SchemaDoctorOverallStatus;
  generatedAt: string;
  checks: SchemaDoctorCheck[];
  missingItems: SchemaDoctorCheck[];
  capabilities: SchemaDoctorCapabilities;
  recommendations: string[];
}

const INSTALLATION_MESSAGE =
  "Schema Doctor ainda não foi instalado neste ambiente. Aplique o ciclo P-10A.3 ou use as queries em docs/SUPABASE_SCHEMA_SEQUENCE.md.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOverallStatus(value: unknown): value is SchemaDoctorOverallStatus {
  return value === "ok" || value === "warning" || value === "critical";
}

function normalizeCheck(value: unknown): SchemaDoctorCheck | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.module !== "string" ||
    !["table", "column", "rpc", "policy"].includes(String(value.type)) ||
    typeof value.name !== "string" ||
    !["ok", "missing"].includes(String(value.status)) ||
    typeof value.cycle !== "string" ||
    typeof value.impact !== "string"
  ) {
    return null;
  }

  return {
    module: value.module,
    type: value.type as SchemaDoctorCheckType,
    table: typeof value.table === "string" ? value.table : null,
    name: value.name,
    status: value.status as SchemaDoctorCheckStatus,
    cycle: value.cycle,
    impact: value.impact,
    severity: value.severity === "critical" ? "critical" : "warning",
  };
}

function normalizeReport(value: unknown): SchemaDoctorReport | null {
  if (!isRecord(value) || !isOverallStatus(value.overallStatus)) return null;
  const checks = Array.isArray(value.checks)
    ? value.checks
        .map(normalizeCheck)
        .filter((check): check is SchemaDoctorCheck => Boolean(check))
    : [];
  const missingItems = checks.filter((check) => check.status === "missing");
  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};

  return {
    overallStatus: value.overallStatus,
    generatedAt:
      typeof value.generatedAt === "string"
        ? value.generatedAt
        : new Date().toISOString(),
    checks,
    missingItems,
    capabilities: {
      canUseWorkflowEnterprise: capabilities.canUseWorkflowEnterprise === true,
      canUseGroups: capabilities.canUseGroups === true,
      canUseCorrectionCycle: capabilities.canUseCorrectionCycle === true,
      canUseFormalRevision: capabilities.canUseFormalRevision === true,
      canUseTransactionalPublish:
        capabilities.canUseTransactionalPublish === true,
    },
    recommendations: Array.isArray(value.recommendations)
      ? value.recommendations.filter(
          (recommendation): recommendation is string =>
            typeof recommendation === "string",
        )
      : [],
  };
}

export function useSchemaDoctor(enabled = true) {
  const [report, setReport] = useState<SchemaDoctorReport | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setReport(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_schema_doctor_report",
      );

      if (rpcError) {
        if (isWorkflowRpcUnavailable(rpcError)) {
          setReport(null);
          setError(INSTALLATION_MESSAGE);
          return;
        }
        throw rpcError;
      }

      const normalizedReport = normalizeReport(data);
      if (!normalizedReport) {
        throw new Error(
          "O Schema Doctor retornou um relatório inválido ou incompleto.",
        );
      }

      setReport(normalizedReport);
    } catch (err: unknown) {
      setReport(null);
      setError(
        getErrorMessage(
          err,
          "Não foi possível executar o diagnóstico do schema.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    isLoading,
    error,
    report,
    overallStatus: report?.overallStatus ?? null,
    checks: report?.checks ?? [],
    missingItems: report?.missingItems ?? [],
    recommendations: report?.recommendations ?? [],
    capabilities: report?.capabilities ?? null,
    refresh,
  };
}
