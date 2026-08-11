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
  discipline?: string | null;
  projectId?: string | null;
  projectCode?: string | null;
  patternId?: string | null;
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
    collisionWarning: value.collision_warning === true,
    existingCode: value.existing_code === true,
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
    prefix: typeof value.prefix === "string" ? value.prefix : "",
    pattern:
      typeof value.pattern === "string"
        ? value.pattern
        : "{PROJECT}",
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
    collisionWarning: false,
    existingCode: false,
    tokens: {},
    explanation: [],
  };
}

export function useDocumentCodePreview({
  docType,
  area,
  discipline,
  projectId,
  projectCode,
  patternId,
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
    const normalizedDiscipline = normalizeCodeToken(discipline);
    if (
      !enabled ||
      !profile?.id ||
      !profile.org_id
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

    // Always use local preview for now, to ensure new patterns are used immediately
    let rpcResult: { data: unknown; error: unknown } | null = null;

    const patternsResult = await supabase
      .from("document_code_patterns")
      .select("*")
      .eq("org_id", profile.org_id)
      .eq("is_active", true);
    if (currentRequest !== requestId.current) return;

    console.log("useDocumentCodePreview: patternsResult", patternsResult);
    if (!patternsResult.error) {
      const patterns = (patternsResult.data ?? [])
        .map(normalizePattern)
        .filter((item): item is DocumentCodePattern => Boolean(item));
      console.log("useDocumentCodePreview: normalized patterns", patterns);
      const context = {
        orgId: profile.org_id,
        orgCode: org?.code_prefix,
        docType: normalizedType,
        area: normalizedArea,
        discipline: normalizedDiscipline,
        projectId,
        projectCode,
      };
      console.log("useDocumentCodePreview: context", context);
      const applicablePatterns = rankCodePatterns(patterns, context);
      console.log("useDocumentCodePreview: applicablePatterns", applicablePatterns);
      const match = patternId
        ? applicablePatterns.find((pattern) => pattern.id === patternId)
        : applicablePatterns[0];
      console.log("useDocumentCodePreview: selected match", match);
      if (match) {
        const localPreview = previewLocalDocumentCode(match, context);
        if (localPreview.code) {
          const existingResult = await supabase
            .from("documents")
            .select("id")
            .eq("org_id", profile.org_id)
            .eq("code", localPreview.code)
            .limit(1);
          if (currentRequest !== requestId.current) return;
          if (!existingResult.error && (existingResult.data?.length ?? 0) > 0) {
            localPreview.existingCode = true;
            localPreview.collisionWarning = true;
            localPreview.explanation.push(
              "O código estimado já existe; a alocação final avançará a sequência.",
            );
          }
        }
        setCodePreview(localPreview);
        setCompatibilityMessage(
          patternId
            ? "O ciclo 19 ainda não confirmou a escolha do padrão. Este preview é local; aplique P-18A antes de criar com um padrão específico."
            : "A função de preview ainda não está disponível. Esta é uma estimativa local; o banco confirmará o código final.",
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
    discipline,
    docType,
    enabled,
    org?.code_prefix,
    patternId,
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
