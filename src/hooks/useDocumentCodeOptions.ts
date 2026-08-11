import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";

const LOCAL_PREFIX = "tramita.document_code_options.local.";

function getLocalKey(orgId: string, type: "doc_types" | "areas" | "disciplines") {
  return `${LOCAL_PREFIX}${orgId}.${type}`;
}

function loadLocal<T extends { id: string }>(orgId: string, type: "doc_types" | "areas" | "disciplines"): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getLocalKey(orgId, type));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal<T extends { id: string }>(orgId: string, type: "doc_types" | "areas" | "disciplines", items: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getLocalKey(orgId, type), JSON.stringify(items));
}

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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
    console.log("useDocumentCodeOptions refresh called", { enabled, requireManagement, profile, canManage });
    if (!enabled) {
      console.log("useDocumentCodeOptions: not enabled");
      setIsLoading(false);
      return;
    }
    if (!profile?.id || !profile.org_id) {
      console.log("useDocumentCodeOptions: no profile or org_id");
      setDocTypes([]);
      setAreas([]);
      setDisciplines([]);
      setError("Seu perfil ou organização ainda não está disponível.");
      setIsLoading(false);
      return;
    }
    if (requireManagement && !canManage) {
      console.log("useDocumentCodeOptions: requireManagement and no canManage");
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
      localType: "doc_types" | "areas" | "disciplines",
    ) {
      console.log("useDocumentCodeOptions loading table:", table, "for orgId:", orgId);
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("org_id", orgId)
        .order("label", { ascending: true });
      console.log("useDocumentCodeOptions table load result:", { table, data, error });
      if (error) {
        console.warn("useDocumentCodeOptions table load error, using local storage:", table, error.message);
        const localItems = loadLocal<DocumentCodeOption>(orgId, localType);
        setState(localItems);
        return { usedLocal: true, count: localItems.length };
      }
      const dbItems = (data || []) as DocumentCodeOption[];
      const localItems = loadLocal<DocumentCodeOption>(orgId, localType);

      // Merge: prefer DB items, then local items not yet synced (id starts with "local-")
      const syncedIds = new Set(dbItems.map(i => i.id));
      const pendingLocal = localItems.filter(i => i.id.startsWith("local-") && !syncedIds.has(i.id));
      const merged = [...dbItems, ...pendingLocal];
      setState(merged);

      // If there are pending local items, try to persist them to the DB
      let syncedAnyLocal = false;
      for (const pending of pendingLocal) {
        const { id, org_id, created_at, updated_at, ...toInsert } = pending;
        try {
          const insertResult = await supabase
            .from(table)
            .insert({ ...toInsert, org_id: orgId, created_at, updated_at: new Date().toISOString() })
            .select("*")
            .single();
          if (!insertResult.error && insertResult.data) {
            syncedAnyLocal = true;
            // Replace local-only id with server-assigned id in local storage
            const refreshed = loadLocal<DocumentCodeOption>(orgId, localType).map(i =>
              i.id === id ? { ...(insertResult.data as DocumentCodeOption) } : i,
            );
            saveLocal(orgId, localType, refreshed);
          }
        } catch (syncErr) {
          console.warn("useDocumentCodeOptions failed to sync local item:", pending.code, syncErr);
        }
      }

      if (syncedAnyLocal) {
        // Re-read after syncing local items
        const reread = await supabase
          .from(table)
          .select("*")
          .eq("org_id", orgId)
          .order("label", { ascending: true });
        if (!reread.error && reread.data) {
          setState(reread.data as DocumentCodeOption[]);
        }
      }

      return { usedLocal: false, count: dbItems.length, mergedCount: merged.length, syncedAnyLocal };
    }

    const loadResults = await Promise.all([
      loadTable("document_code_types", setDocTypes, "doc_types"),
      loadTable("document_code_areas", setAreas, "areas"),
      loadTable("document_code_disciplines", setDisciplines, "disciplines"),
    ]);

    if (loadResults.some(r => r && "usedLocal" in r && (r as { usedLocal: boolean }).usedLocal)) {
      setCompatibilityMessage(
        "Tabelas de opções de codificação não encontradas. Os dados estão sendo mantidos localmente neste navegador.",
      );
    }

    setIsLoading(false);
  }, [canManage, enabled, requireManagement, profile?.id, profile?.org_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (
      type: "doc_types" | "areas" | "disciplines",
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

      const table = type === "doc_types" ? "document_code_types" : type === "areas" ? "document_code_areas" : "document_code_disciplines";
      const setItems = type === "doc_types" ? setDocTypes : type === "areas" ? setAreas : setDisciplines;

      const result = id
        ? await supabase.from(table).update({ ...payload, updated_at: now }).eq("id", id).eq("org_id", profile.org_id).select("*").maybeSingle()
        : await supabase.from(table).insert(payload).select("*").single();

      let saved: DocumentCodeOption | null = null;
      if (result.error) {
        // Fallback to local storage
        const localItems = loadLocal<DocumentCodeOption>(profile.org_id, type);
        const nextItem: DocumentCodeOption = {
          ...payload,
          id: id ?? createLocalId(),
          created_at: id ? localItems.find(i => i.id === id)?.created_at ?? now : now,
          updated_at: now,
        };
        const nextItems = id ? localItems.map(i => i.id === id ? nextItem : i) : [...localItems, nextItem];
        saveLocal(profile.org_id, type, nextItems);
        setItems(nextItems);
        saved = nextItem;
      } else if (result.data) {
        saved = result.data as DocumentCodeOption;
      }

      if (saved && type === "disciplines") {
        try {
          const mirrorPayload = { code: saved.code || saved.label, name: saved.label };
          if (id && !id.startsWith("local-")) {
            await supabase
              .from("disciplines")
              .update(mirrorPayload)
              .eq("id", id);
          } else {
            const { error: existingErr } = await supabase
              .from("disciplines")
              .select("id")
              .eq("code", mirrorPayload.code)
              .maybeSingle();
            if (existingErr) {
              const { error: insertErr } = await supabase
                .from("disciplines")
                .insert({ ...mirrorPayload, id: saved!.id })
                .select("id")
                .maybeSingle();
              if (insertErr) {
                // best effort — just insert without explicit id
                await supabase.from("disciplines").insert(mirrorPayload);
              }
            }
          }
        } catch (err) {
          console.warn("[useDocumentCodeOptions] não foi possível espelhar disciplina em `disciplines`: ", err);
        }
      }

      setIsSaving(false);
      if (!result.error) await refresh();
      return true;
    },
    [canManage, profile?.id, profile?.org_id, refresh],
  );

  const deleteItem = useCallback(
    async (type: "doc_types" | "areas" | "disciplines", id: string) => {
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

      const table = type === "doc_types" ? "document_code_types" : type === "areas" ? "document_code_areas" : "document_code_disciplines";
      const setItems = type === "doc_types" ? setDocTypes : type === "areas" ? setAreas : setDisciplines;

      const result = await supabase.from(table).delete().eq("id", id).eq("org_id", profile.org_id);

      if (result.error) {
        // Fallback to local storage
        const localItems = loadLocal<DocumentCodeOption>(profile.org_id, type);
        const nextItems = localItems.filter(i => i.id !== id);
        saveLocal(profile.org_id, type, nextItems);
        setItems(nextItems);
      }

      if (type === "disciplines") {
        try {
          await supabase.from("disciplines").delete().eq("id", id);
        } catch (err) {
          console.warn("[useDocumentCodeOptions] não foi possível excluir o espelho em `disciplines`: ", err);
        }
      }

      setIsSaving(false);
      if (!result.error) await refresh();
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
