import { useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useDocumentCodePatterns } from "@/hooks/useDocumentCodePatterns";
import { useDocumentCodePreview } from "@/hooks/useDocumentCodePreview";
import {
  rankCodePatterns,
  type DocumentCodeContext,
} from "@/lib/documentCodePatterns";
import { supabase } from "@/lib/supabase";

export type DocumentCreationCodeMode =
  | "automatic"
  | "selected_pattern"
  | "manual";

interface UseDocumentCreationControlsInput {
  docType?: string | null;
  area?: string | null;
  projectId?: string | null;
  projectCode?: string | null;
  selectedPatternId?: string | null;
}

function isMissingIntegrationSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = String(record.code ?? "").toUpperCase();
  const message = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    ["42703", "PGRST204", "PGRST205"].includes(code) ||
    message.includes("code_generation_mode") ||
    message.includes("code_pattern_id") ||
    message.includes("manual_code") ||
    message.includes("external_code")
  );
}

export function useDocumentCreationControls({
  docType,
  area,
  projectId,
  projectCode,
  selectedPatternId,
}: UseDocumentCreationControlsInput) {
  const { profile, org } = useAuthContext();
  const patternCatalog = useDocumentCodePatterns({
    includeInactive: false,
    requireManagement: false,
    loadProjects: false,
  });
  const [supportsIntegrationControls, setSupportsIntegrationControls] =
    useState(false);
  const [isCheckingIntegration, setIsCheckingIntegration] = useState(true);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    async function probe() {
      if (!profile?.org_id) {
        if (active) {
          setSupportsIntegrationControls(false);
          setIsCheckingIntegration(false);
        }
        return;
      }
      setIsCheckingIntegration(true);
      const { error } = await supabase
        .from("documents")
        .select(
          "id, manual_code, external_code, code_pattern_id, code_generation_mode",
        )
        .eq("org_id", profile.org_id)
        .limit(0);
      if (!active) return;
      if (!error) {
        setSupportsIntegrationControls(true);
        setIntegrationMessage(null);
      } else {
        setSupportsIntegrationControls(false);
        setIntegrationMessage(
          isMissingIntegrationSchema(error)
            ? "Ciclo 19 não instalado. A criação continua com codificação automática; escolha de padrão e código manual estão desativados."
            : "Não foi possível confirmar os controles de codificação por permissão. A criação continuará em modo automático.",
        );
      }
      setIsCheckingIntegration(false);
    }
    void probe();
    return () => {
      active = false;
    };
  }, [profile?.org_id]);

  const context = useMemo<DocumentCodeContext>(
    () => ({
      orgId: profile?.org_id,
      orgCode: org?.code_prefix,
      docType,
      area,
      projectId,
      projectCode,
    }),
    [area, docType, org?.code_prefix, profile?.org_id, projectCode, projectId],
  );
  const applicablePatterns = useMemo(() => {
    const result = rankCodePatterns(patternCatalog.patterns, context);
    console.log("useDocumentCreationControls: patternCatalog.patterns", patternCatalog.patterns);
    console.log("useDocumentCreationControls: context", context);
    console.log("useDocumentCreationControls: applicablePatterns", result);
    return result;
  }, [context, patternCatalog.patterns]);
  const selectedPattern =
    applicablePatterns.find((pattern) => pattern.id === selectedPatternId) ??
    null;
  const preview = useDocumentCodePreview({
    docType,
    area,
    projectId,
    projectCode,
    patternId: selectedPattern?.id ?? null,
  });

  return {
    patterns: patternCatalog.patterns,
    applicablePatterns,
    selectedPattern,
    isLoading:
      patternCatalog.isLoading || preview.isLoading || isCheckingIntegration,
    patternsError: patternCatalog.error,
    patternsCompatibilityMessage: patternCatalog.compatibilityMessage,
    supportsPatternSelection: supportsIntegrationControls,
    supportsManualCode: supportsIntegrationControls,
    integrationMessage,
    codePreview: preview.codePreview,
    codePreviewError: preview.error,
    codeCompatibilityMessage: preview.compatibilityMessage,
    refreshCodePreview: preview.refresh,
  };
}
