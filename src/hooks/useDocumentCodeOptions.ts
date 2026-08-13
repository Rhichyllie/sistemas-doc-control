import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export interface DocumentCodeOption {
  id: string;
  org_id: string;
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UseDocumentCodeOptionsOptions {
  enabled?: boolean;
  requireManagement?: boolean;
}

type OptionType = "doc_types" | "areas" | "disciplines";

function tableFor(type: OptionType) {
  return type === "doc_types"
    ? "document_code_types"
    : type === "areas"
      ? "document_code_areas"
      : "document_code_disciplines";
}

export function useDocumentCodeOptions(options: UseDocumentCodeOptionsOptions = {}) {
  const { enabled = true, requireManagement = true } = options;
  const { profile } = useAuthContext();
  const canManage = profile?.role === "admin" || profile?.role === "manager";
  const [isLoading, setIsLoading] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compatibilityMessage, setCompatibilityMessage] = useState<string | null>(null);
  const [docTypes, setDocTypes] = useState<DocumentCodeOption[]>([]);
  const [areas, setAreas] = useState<DocumentCodeOption[]>([]);
  const [disciplines, setDisciplines] = useState<DocumentCodeOption[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    if (!profile?.id || !profile.org_id) {
      setDocTypes([]);
      setAreas([]);
      setDisciplines([]);
      setError("Seu perfil ou organização ainda não está disponível.");
      setIsLoading(false);
      return;
    }
    if (requireManagement && !canManage) {
      setDocTypes([]);
      setAreas([]);
      setDisciplines([]);
      setError(null);
      setCompatibilityMessage(
        "Você não tem permissão para administrar opções de codificação.",
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCompatibilityMessage(null);
    const orgId = profile.org_id;

    async function loadTable(
      table: string,
      setState: React.Dispatch<React.SetStateAction<DocumentCodeOption[]>>,
    ) {
      const { data, error: loadError } = await supabase
        .from(table)
        .select("*")
        .eq("org_id", orgId)
        .order("label", { ascending: true });
      if (loadError) {
        setState([]);
        return { ok: false as const, table, error: loadError };
      }
      setState((data ?? []) as DocumentCodeOption[]);
      return { ok: true as const };
    }

    const loadResults = await Promise.all([
      loadTable("document_code_types", setDocTypes),
      loadTable("document_code_areas", setAreas),
      loadTable("document_code_disciplines", setDisciplines),
    ]);

    const failed = loadResults.find((r) => !r.ok);
    if (failed && !failed.ok) {
      setCompatibilityMessage(
        `Não foi possível carregar as opções de codificação (${failed.table}). Verifique se as tabelas P-? de codificação estão instaladas e as políticas de RLS corretas.`,
      );
    }

    setIsLoading(false);
  }, [canManage, enabled, requireManagement, profile?.id, profile?.org_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Mantém a tabela global `disciplines` (sem org_id, usada por outras telas
  // como useLocalData) sincronizada com a disciplina salva em
  // `document_code_disciplines` (por organização). Cria o espelho quando não
  // existe, e atualiza quando já existe.
  //
  // IMPORTANTE: antes esta função checava `existingErr` de um `.maybeSingle()`
  // para decidir se devia inserir — mas `.maybeSingle()` não retorna erro
  // quando simplesmente não encontra nenhuma linha (esse é o caso normal ao
  // criar uma disciplina nova). Isso fazia o espelho SÓ ser criado quando a
  // consulta falhava de verdade, ou seja, praticamente nunca. Disciplinas
  // novas ficavam presas em `document_code_disciplines` e nunca apareciam em
  // `disciplines`. Corrigido para checar a presença de dados, não de erro.
  async function mirrorDiscipline(saved: DocumentCodeOption) {
    const mirrorPayload = { code: saved.code || saved.label, name: saved.label };
    try {
      const existing = await supabase
        .from("disciplines")
        .select("id")
        .eq("code", mirrorPayload.code)
        .maybeSingle();

      if (existing.error) {
        console.warn(
          "[useDocumentCodeOptions] não foi possível checar espelho em `disciplines`:",
          existing.error,
        );
        return;
      }

      if (existing.data) {
        const { error: updateErr } = await supabase
          .from("disciplines")
          .update(mirrorPayload)
          .eq("id", existing.data.id);
        if (updateErr) {
          console.warn(
            "[useDocumentCodeOptions] não foi possível atualizar espelho em `disciplines`:",
            updateErr,
          );
        }
        return;
      }

      const { error: insertErr } = await supabase
        .from("disciplines")
        .insert({ ...mirrorPayload, id: saved.id });
      if (insertErr) {
        console.warn(
          "[useDocumentCodeOptions] não foi possível criar espelho em `disciplines`:",
          insertErr,
        );
      }
    } catch (err) {
      console.warn(
        "[useDocumentCodeOptions] erro inesperado ao espelhar disciplina em `disciplines`:",
        err,
      );
    }
  }

  const save = useCallback(
    async (
      type: OptionType,
      id: string | null,
      item: Omit<DocumentCodeOption, "id" | "org_id" | "created_at" | "updated_at">,
    ) => {
      if (!profile?.id || !profile.org_id) {
        setError("Seu perfil ou organização ainda não está disponível.");
        return false;
      }
      if (!canManage) {
        setError("Apenas administradores e gestores podem salvar opções.");
        return false;
      }

      setIsSaving(true);
      setError(null);
      const now = new Date().toISOString();
      const payload = {
        ...item,
        org_id: profile.org_id,
      };

      const table = tableFor(type);

      const result = id
        ? await supabase
            .from(table)
            .update({ ...payload, updated_at: now })
            .eq("id", id)
            .eq("org_id", profile.org_id)
            .select("*")
            .maybeSingle()
        : await supabase.from(table).insert(payload).select("*").single();

      if (result.error || !result.data) {
        setError(
          result.error?.message ??
            "Não foi possível salvar a opção de codificação.",
        );
        setIsSaving(false);
        return false;
      }

      const saved = result.data as DocumentCodeOption;
      if (type === "disciplines") {
        await mirrorDiscipline(saved);
      }

      setIsSaving(false);
      await refresh();
      return true;
    },
    [canManage, profile?.id, profile?.org_id, refresh],
  );

  const deleteItem = useCallback(
    async (type: OptionType, id: string) => {
      if (!profile?.id || !profile.org_id) {
        setError("Seu perfil ou organização ainda não está disponível.");
        return false;
      }
      if (!canManage) {
        setError("Apenas administradores e gestores podem excluir opções.");
        return false;
      }

      setIsSaving(true);
      setError(null);

      const table = tableFor(type);
      const result = await supabase
        .from(table)
        .delete()
        .eq("id", id)
        .eq("org_id", profile.org_id);

      if (result.error) {
        setError(result.error.message);
        setIsSaving(false);
        return false;
      }

      if (type === "disciplines") {
        const { error: mirrorDeleteErr } = await supabase
          .from("disciplines")
          .delete()
          .eq("id", id);
        if (mirrorDeleteErr) {
          console.warn(
            "[useDocumentCodeOptions] não foi possível excluir o espelho em `disciplines`:",
            mirrorDeleteErr,
          );
        }
      }

      setIsSaving(false);
      await refresh();
      return true;
    },
    [canManage, profile?.id, profile?.org_id, refresh],
  );

  return {
    isLoading,
    isSaving,
    error,
    compatibilityMessage,
    docTypes,
    areas,
    disciplines,
    canManage,
    refresh,
    saveDocType: (id: string | null, item: Omit<DocumentCodeOption, "id" | "org_id" | "created_at" | "updated_at">) =>
      save("doc_types", id, item),
    saveArea: (id: string | null, item: Omit<DocumentCodeOption, "id" | "org_id" | "created_at" | "updated_at">) =>
      save("areas", id, item),
    saveDiscipline: (id: string | null, item: Omit<DocumentCodeOption, "id" | "org_id" | "created_at" | "updated_at">) =>
      save("disciplines", id, item),
    deleteDocType: (id: string) => deleteItem("doc_types", id),
    deleteArea: (id: string) => deleteItem("areas", id),
    deleteDiscipline: (id: string) => deleteItem("disciplines", id),
  };
}