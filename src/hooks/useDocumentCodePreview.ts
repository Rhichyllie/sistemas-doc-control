import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import {
  isDocumentCodingCompatibilityError,
  normalizeCodeToken,
  previewLocalDocumentCode,
  rankCodePatterns,
  type DocumentCodePattern,
  type DocumentCodePreview,
} from "@/lib/documentCodePatterns";

interface UseDocumentCodePreviewInput {
  docType?: string | null;
  area?: string | null;
  projectId?: string | null;
  projectCode?: string | null;
  enabled?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRpcPreview(value: unknown): DocumentCodePreview | null {
  if (!isRecord(value)) return null;
  const mode =
    value.mode === "configured"
      ? "configured"
      : value.mode === "legacy_fallback"
        ? "legacy_fallback"
        : "unavailable";
  const rawExplanation = Array.isArray(value.explanation)
    ? value.explanation.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const rawTokens = isRecord(value.tokens) ? value.tokens : {};

  return {
    available: value.available === true && typeof value.code === "string",
    mode,
    patternId: typeof value.pattern_id === "string" ? value.pattern_id : null,
    patternName:
      typeof value.pattern_name === "string" ? value.pattern_name : null,
    code: typeof value.code === "string" ? value.code : null,
    sequenceKey:
      typeof value.sequence_key === "string" ? value.sequence_key : null,
    nextNumber:
      Number.isInteger(value.next_number) && Number(value.next_number) >= 0
        ? Number(value.next_number)
        : null,
    tokens: Object.fromEntries(
      Object.entries(rawTokens).map(([key, tokenValue]) => [
        key,
        String(tokenValue ?? ""),
      ]),
    ),
    explanation: rawExplanation,
  };
}

function normalizePattern(value: unknown): DocumentCodePattern | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const scope =
    value.pattern_scope === "project" ||
    value.pattern_scope === "area" ||
    value.pattern_scope === "type" ||
    value.pattern_scope === "area_type"
      ? value.pattern_scope
      : "organization";
  const reset =
    value.sequence_reset === "yearly" ||
    value.sequence_reset === "monthly" ||
    value.sequence_reset === "project" ||
    value.sequence_reset === "area" ||
    value.sequence_reset === "type" ||
    value.sequence_reset === "area_type"
      ? value.sequence_reset
      : "never";

  return {
    id: value.id,
    org_id: String(value.org_id ?? ""),
    name: String(value.name ?? "Padrão configurado"),
    description:
      typeof value.description === "string" ? value.description : null,
    is_active: value.is_active !== false,
    is_default: value.is_default === true,
    priority: Number.isInteger(value.priority) ? Number(value.priority) : 100,
    pattern_scope: scope,
    doc_type: typeof value.doc_type === "string" ? value.doc_type : null,
    area: typeof value.area === "string" ? value.area : null,
    project_id: typeof value.project_id === "string" ? value.project_id : null,
    prefix: typeof value.prefix === "string" ? value.prefix : "TR",
    pattern:
      typeof value.pattern === "string"
        ? value.pattern
        : "{PREFIX}-{AREA}-{TYPE}-{SEQ}",
    separator: typeof value.separator === "string" ? value.separator : "-",
    sequence_padding:
      Number.isInteger(value.sequence_padding) &&
      Number(value.sequence_padding) >= 2 &&
      Number(value.sequence_padding) <= 8
        ? Number(value.sequence_padding)
        : 4,
    sequence_reset: reset,
    sequence_start:
      Number.isInteger(value.sequence_start) &&
      Number(value.sequence_start) >= 0
        ? Number(value.sequence_start)
        : 1,
    include_year: value.include_year === true,
    include_month: value.include_month === true,
    tokens: value.tokens ?? [],
    example_output:
      typeof value.example_output === "string" ? value.example_output : null,
    created_by: typeof value.created_by === "string" ? value.created_by : null,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

function unavailablePreview(): DocumentCodePreview {
  return {
    available: false,
    mode: "unavailable",
    patternId: null,
    patternName: null,
    code: null,
    sequenceKey: null,
    nextNumber: null,
    tokens: {},
    explanation: [],
  };
}

export function useDocumentCodePreview({
  docType,
  area,
  projectId,
  projectCode,
  enabled = true,
}: UseDocumentCodePreviewInput) {
  const { profile, org } = useAuthContext();
  const [codePreview, setCodePreview] =
    useState<DocumentCodePreview>(unavailablePreview);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compatibilityMessage, setCompatibilityMessage] = useState<
    string | null
  >(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const normalizedType = normalizeCodeToken(docType);
    const normalizedArea = normalizeCodeToken(area);
    if (
      !enabled ||
      !profile?.id ||
      !profile.org_id ||
      !normalizedType ||
      !normalizedArea
    ) {
      setCodePreview(unavailablePreview());
      setError(null);
      setCompatibilityMessage(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCompatibilityMessage(null);

    const rpcResult = await supabase.rpc("preview_document_code", {
      p_doc_type: normalizedType,
      p_area: normalizedArea,
      p_project_id: projectId || null,
      p_reference_date: new Date().toISOString().slice(0, 10),
    });
    if (currentRequest !== requestId.current) return;

    if (!rpcResult.error) {
      const normalized = normalizeRpcPreview(rpcResult.data);
      setCodePreview(normalized ?? unavailablePreview());
      setIsLoading(false);
      return;
    }

    if (!isDocumentCodingCompatibilityError(rpcResult.error)) {
      setCodePreview({
        ...unavailablePreview(),
        mode: "legacy_fallback",
        explanation: [
          "O preview configurável não pôde ser consultado. O gatilho legado continuará gerando o código.",
        ],
      });
      setError(
        `Não foi possível consultar o código previsto. ${getErrorMessage(rpcResult.error, "Erro de acesso ao banco.")}`,
      );
      setIsLoading(false);
      return;
    }

    const patternsResult = await supabase
      .from("document_code_patterns")
      .select("*")
      .eq("org_id", profile.org_id)
      .eq("is_active", true);
    if (currentRequest !== requestId.current) return;

    if (!patternsResult.error) {
      const patterns = (patternsResult.data ?? [])
        .map(normalizePattern)
        .filter((item): item is DocumentCodePattern => Boolean(item));
      const match = rankCodePatterns(patterns, {
        orgId: profile.org_id,
        orgCode: org?.code_prefix,
        docType: normalizedType,
        area: normalizedArea,
        projectId,
        projectCode,
      })[0];
      if (match) {
        setCodePreview(
          previewLocalDocumentCode(match, {
            orgId: profile.org_id,
            orgCode: org?.code_prefix,
            docType: normalizedType,
            area: normalizedArea,
            projectId,
            projectCode,
          }),
        );
        setCompatibilityMessage(
          "A função de preview ainda não está disponível. Esta é uma estimativa local; o banco confirmará o código final.",
        );
      } else {
        setCodePreview({
          ...unavailablePreview(),
          mode: "legacy_fallback",
          explanation: [
            "Nenhum padrão aplicável foi encontrado. O gatilho legado gerará o código automaticamente.",
          ],
        });
        setCompatibilityMessage(
          "Sem padrão P-11 aplicável. A codificação legada permanece ativa.",
        );
      }
      setIsLoading(false);
      return;
    }

    setCodePreview({
      ...unavailablePreview(),
      mode: "legacy_fallback",
      code: `${normalizeCodeToken(org?.code_prefix || "TR")}-${normalizedArea}-${normalizedType}-????`,
      explanation: [
        isDocumentCodingCompatibilityError(patternsResult.error)
          ? "Ciclo P-11 não instalado. O valor final será gerado pelo gatilho legado."
          : "Os padrões não puderam ser consultados. O valor final será gerado pelo gatilho legado.",
      ],
    });
    if (isDocumentCodingCompatibilityError(patternsResult.error)) {
      setCompatibilityMessage(
        "Ciclo P-11 não instalado. A criação continua usando a codificação automática legada.",
      );
    } else {
      setError(
        `Não foi possível carregar padrões por permissão. ${getErrorMessage(patternsResult.error, "Verifique RLS e organização.")}`,
      );
      setCompatibilityMessage(
        "A criação continuará usando a codificação legada até o acesso aos padrões ser corrigido.",
      );
    }
    setIsLoading(false);
  }, [
    area,
    docType,
    enabled,
    org?.code_prefix,
    profile?.id,
    profile?.org_id,
    projectCode,
    projectId,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    isLoading,
    error,
    codePreview,
    mode: codePreview.mode,
    explanation: codePreview.explanation,
    compatibilityMessage,
    refresh,
  };
}
