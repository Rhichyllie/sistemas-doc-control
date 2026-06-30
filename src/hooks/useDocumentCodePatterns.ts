import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import {
  isDocumentCodingCompatibilityError,
  normalizeCodeToken,
  rankCodePatterns,
  type DocumentCodeContext,
  type DocumentCodePattern,
  type DocumentCodePatternScope,
  type DocumentCodeSequenceReset,
} from "@/lib/documentCodePatterns";

export interface DocumentCodeProject {
  id: string;
  code: string;
  name: string;
}

export interface DocumentCodePatternMutationInput {
  name: string;
  description?: string | null;
  is_active?: boolean;
  is_default?: boolean;
  priority?: number;
  pattern_scope?: DocumentCodePatternScope;
  doc_type?: string | null;
  area?: string | null;
  project_id?: string | null;
  prefix?: string;
  pattern: string;
  separator?: string;
  sequence_padding?: number;
  sequence_reset?: DocumentCodeSequenceReset;
  sequence_start?: number;
  include_year?: boolean;
  include_month?: boolean;
  tokens?: unknown;
  example_output?: string | null;
}

interface UseDocumentCodePatternsOptions {
  enabled?: boolean;
  includeInactive?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeScope(value: unknown): DocumentCodePatternScope {
  return value === "project" ||
    value === "area" ||
    value === "type" ||
    value === "area_type"
    ? value
    : "organization";
}

function normalizeReset(value: unknown): DocumentCodeSequenceReset {
  return value === "yearly" ||
    value === "monthly" ||
    value === "project" ||
    value === "area" ||
    value === "type" ||
    value === "area_type"
    ? value
    : "never";
}

function normalizePattern(value: unknown): DocumentCodePattern | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    org_id: String(value.org_id ?? ""),
    name: String(value.name ?? "Padrão sem nome"),
    description:
      typeof value.description === "string" ? value.description : null,
    is_active: value.is_active !== false,
    is_default: value.is_default === true,
    priority: Number.isInteger(value.priority) ? Number(value.priority) : 100,
    pattern_scope: normalizeScope(value.pattern_scope),
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
    sequence_reset: normalizeReset(value.sequence_reset),
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

function mutationPayload(
  input: DocumentCodePatternMutationInput,
  orgId: string,
  actorId: string,
) {
  return {
    org_id: orgId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    is_active: input.is_active ?? true,
    is_default: input.is_default ?? false,
    priority: input.priority ?? 100,
    pattern_scope: input.pattern_scope ?? "organization",
    doc_type: normalizeCodeToken(input.doc_type) || null,
    area: normalizeCodeToken(input.area) || null,
    project_id: input.project_id || null,
    prefix: normalizeCodeToken(input.prefix || "TR") || "TR",
    pattern: input.pattern.trim().toUpperCase(),
    separator: input.separator || "-",
    sequence_padding: input.sequence_padding ?? 4,
    sequence_reset: input.sequence_reset ?? "never",
    sequence_start: input.sequence_start ?? 1,
    include_year: input.include_year ?? false,
    include_month: input.include_month ?? false,
    tokens: input.tokens ?? [],
    example_output: input.example_output?.trim() || null,
    created_by: actorId,
  };
}

export function useDocumentCodePatterns(
  options: UseDocumentCodePatternsOptions = {},
) {
  const { enabled = true, includeInactive = true } = options;
  const { profile } = useAuthContext();
  const [patterns, setPatterns] = useState<DocumentCodePattern[]>([]);
  const [projects, setProjects] = useState<DocumentCodeProject[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compatibilityMessage, setCompatibilityMessage] = useState<
    string | null
  >(null);
  const [lastMutationMessage, setLastMutationMessage] = useState<string | null>(
    null,
  );

  const canManage = profile?.role === "admin" || profile?.role === "manager";

  const refresh = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    if (!profile?.id || !profile.org_id) {
      setPatterns([]);
      setProjects([]);
      setError("Seu perfil ou organização ainda não está disponível.");
      setIsLoading(false);
      return;
    }
    if (!canManage) {
      setPatterns([]);
      setProjects([]);
      setError(null);
      setCompatibilityMessage(
        "Você não tem permissão para administrar padrões de codificação.",
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCompatibilityMessage(null);

    let query = supabase
      .from("document_code_patterns")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("priority", { ascending: true })
      .order("name", { ascending: true });
    if (!includeInactive) query = query.eq("is_active", true);

    const [patternsResult, projectsResult] = await Promise.all([
      query,
      supabase
        .from("projects")
        .select("id, code, name")
        .eq("org_id", profile.org_id)
        .order("code", { ascending: true }),
    ]);

    if (patternsResult.error) {
      setPatterns([]);
      if (isDocumentCodingCompatibilityError(patternsResult.error)) {
        setCompatibilityMessage(
          "Ciclo P-11 não instalado neste ambiente. A codificação legada continua ativa.",
        );
      } else {
        setError(
          `Não foi possível carregar os padrões de codificação. ${getErrorMessage(patternsResult.error, "Erro de acesso ao banco.")}`,
        );
      }
    } else {
      setPatterns(
        (patternsResult.data ?? [])
          .map(normalizePattern)
          .filter((item): item is DocumentCodePattern => Boolean(item)),
      );
    }

    if (projectsResult.error) {
      setProjects([]);
    } else {
      setProjects(
        (projectsResult.data ?? []).map((project) => ({
          id: String(project.id),
          code: String(project.code ?? ""),
          name: String(project.name ?? "Projeto"),
        })),
      );
    }
    setIsLoading(false);
  }, [canManage, enabled, includeInactive, profile?.id, profile?.org_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (id: string | null, input: DocumentCodePatternMutationInput) => {
      if (!profile?.id || !profile.org_id) {
        setError("Seu perfil ou organização ainda não está disponível.");
        return false;
      }
      if (!canManage) {
        setError("Apenas administradores e gestores podem salvar padrões.");
        return false;
      }

      setIsSaving(true);
      setError(null);
      setLastMutationMessage(null);
      const payload = mutationPayload(input, profile.org_id, profile.id);
      const result = id
        ? await supabase
            .from("document_code_patterns")
            .update({
              ...payload,
              created_by: undefined,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("org_id", profile.org_id)
            .select("id")
            .maybeSingle()
        : await supabase
            .from("document_code_patterns")
            .insert(payload)
            .select("id")
            .single();

      setIsSaving(false);
      if (result.error) {
        setError(
          isDocumentCodingCompatibilityError(result.error)
            ? "Ciclo P-11 não instalado. Aplique a migration antes de salvar padrões."
            : `Não foi possível salvar o padrão. ${getErrorMessage(result.error, "Erro de persistência.")}`,
        );
        return false;
      }
      if (!result.data?.id) {
        setError(
          "O banco não confirmou a gravação. Verifique RLS, organização e permissões.",
        );
        return false;
      }
      setLastMutationMessage(
        id ? "Padrão atualizado com sucesso." : "Padrão criado com sucesso.",
      );
      await refresh();
      return true;
    },
    [canManage, profile?.id, profile?.org_id, refresh],
  );

  const setPatternActive = useCallback(
    async (id: string, isActive: boolean) => {
      const current = patterns.find((pattern) => pattern.id === id);
      if (!current) return false;
      return save(id, { ...current, is_active: isActive });
    },
    [patterns, save],
  );

  const rankedPatterns = useCallback(
    (input: DocumentCodeContext) =>
      rankCodePatterns(patterns, {
        ...input,
        orgId: input.orgId ?? profile?.org_id,
      }),
    [patterns, profile?.org_id],
  );

  const diagnostic = useMemo(() => {
    if (!canManage) return "restricted" as const;
    if (compatibilityMessage) return "not_installed" as const;
    if (error) return "error" as const;
    if (!isLoading && patterns.length === 0) return "empty" as const;
    return "ready" as const;
  }, [canManage, compatibilityMessage, error, isLoading, patterns.length]);

  return {
    patterns,
    projects,
    isLoading,
    isSaving,
    error,
    compatibilityMessage,
    lastMutationMessage,
    canManage,
    canUsePatterns: diagnostic === "ready",
    diagnostic,
    refresh,
    createPattern: (input: DocumentCodePatternMutationInput) =>
      save(null, input),
    updatePattern: (id: string, input: DocumentCodePatternMutationInput) =>
      save(id, input),
    setPatternActive,
    rankPatterns: rankedPatterns,
    clearMutationFeedback: () => {
      setError(null);
      setLastMutationMessage(null);
    },
  };
}
