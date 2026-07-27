
import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";

export interface ProjectMember {
  id: string;
  project_id: string;
  profile_id: string;
  org_id: string;
  role?: string;
  created_at: string;
  updated_at: string;
}

const LOCAL_PROJECT_MEMBERS_STORAGE_PREFIX = "tramita.project_members.local.";

function getLocalProjectMembersStorageKey(orgId: string) {
  return `${LOCAL_PROJECT_MEMBERS_STORAGE_PREFIX}${orgId}`;
}

function loadLocalProjectMembers(orgId: string) {
  if (typeof window === "undefined") return [] as ProjectMember[];
  try {
    const raw = window.localStorage.getItem(getLocalProjectMembersStorageKey(orgId));
    if (!raw) return [] as ProjectMember[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [] as ProjectMember[];
  } catch {
    return [] as ProjectMember[];
  }
}

function saveLocalProjectMembers(orgId: string, members: ProjectMember[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getLocalProjectMembersStorageKey(orgId),
    JSON.stringify(members),
  );
}

export function useProjectMembers() {
  const { profile } = useAuthContext();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMode, setSchemaMode] = useState<
    "enterprise" | "missing" | "denied" | "error"
  >("enterprise");

  const canManage = profile?.role === "admin" || profile?.role === "manager";

  const refresh = useCallback(async () => {
    if (!profile?.id || !profile.org_id) {
      setMembers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Try Supabase first
    try {
      const { data, error: queryError } = await supabase
        .from("project_members")
        .select("*")
        .eq("org_id", profile.org_id);

      if (!queryError) {
        setMembers((data ?? []) as ProjectMember[]);
        setSchemaMode("enterprise");
      } else {
        // Check if it's a schema missing error
        const code = String((queryError as any)?.code ?? "").toUpperCase();
        const message = String((queryError as any)?.message ?? "").toLowerCase();
        if (
          code === "42P01" ||
          code === "PGRST205" ||
          (message.includes("project_members") &&
            (message.includes("does not exist") || message.includes("schema cache")))
        ) {
          // Use local storage
          setMembers(loadLocalProjectMembers(profile.org_id));
          setSchemaMode("missing");
        } else if (
          code === "42501" ||
          code === "PGRST301" ||
          message.includes("permission denied")
        ) {
          setSchemaMode("denied");
          setError("Acesso negado ao gerenciar membros de projeto.");
        } else {
          setSchemaMode("error");
          setError(`Erro ao carregar membros: ${getErrorMessage(queryError, "Erro desconhecido")}`);
        }
      }
    } catch {
      setMembers(loadLocalProjectMembers(profile.org_id));
      setSchemaMode("missing");
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addMember = useCallback(
    async (projectId: string, profileId: string) => {
      if (!profile?.id || !profile.org_id) return false;
      if (!canManage) {
        setError("Apenas administradores e gestores podem gerenciar membros de projeto.");
        return false;
      }

      setIsSaving(true);
      const now = new Date().toISOString();

      if (schemaMode === "missing") {
        // Use local storage
        const localMembers = loadLocalProjectMembers(profile.org_id);
        // Check if already exists
        if (
          localMembers.some(
            (m) => m.project_id === projectId && m.profile_id === profileId,
          )
        ) {
          setIsSaving(false);
          return true; // Already exists, do nothing
        }
        const newMember: ProjectMember = {
          id: `local-pm-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          project_id: projectId,
          profile_id: profileId,
          org_id: profile.org_id,
          created_at: now,
          updated_at: now,
        };
        const nextMembers = [...localMembers, newMember];
        saveLocalProjectMembers(profile.org_id, nextMembers);
        setMembers(nextMembers);
        setIsSaving(false);
        return true;
      }

      try {
        const { error: insertError } = await supabase
          .from("project_members")
          .insert({
            project_id: projectId,
            profile_id: profileId,
            org_id: profile.org_id,
          })
          .select("id")
          .single();

        if (insertError) {
          setError(`Erro ao adicionar membro: ${getErrorMessage(insertError, "Erro desconhecido")}`);
          setIsSaving(false);
          return false;
        }

        await refresh();
        setIsSaving(false);
        return true;
      } catch (err) {
        setError(`Erro ao adicionar membro: ${getErrorMessage(err, "Erro desconhecido")}`);
        setIsSaving(false);
        return false;
      }
    },
    [canManage, profile?.id, profile?.org_id, refresh, schemaMode],
  );

  const removeMember = useCallback(
    async (projectId: string, profileId: string) => {
      if (!profile?.id || !profile.org_id) return false;
      if (!canManage) {
        setError("Apenas administradores e gestores podem gerenciar membros de projeto.");
        return false;
      }

      setIsSaving(true);

      if (schemaMode === "missing") {
        const localMembers = loadLocalProjectMembers(profile.org_id);
        const nextMembers = localMembers.filter(
          (m) => !(m.project_id === projectId && m.profile_id === profileId),
        );
        saveLocalProjectMembers(profile.org_id, nextMembers);
        setMembers(nextMembers);
        setIsSaving(false);
        return true;
      }

      try {
        const { error: deleteError } = await supabase
          .from("project_members")
          .delete()
          .eq("project_id", projectId)
          .eq("profile_id", profileId)
          .eq("org_id", profile.org_id);

        if (deleteError) {
          setError(`Erro ao remover membro: ${getErrorMessage(deleteError, "Erro desconhecido")}`);
          setIsSaving(false);
          return false;
        }

        await refresh();
        setIsSaving(false);
        return true;
      } catch (err) {
        setError(`Erro ao remover membro: ${getErrorMessage(err, "Erro desconhecido")}`);
        setIsSaving(false);
        return false;
      }
    },
    [canManage, profile?.id, profile?.org_id, refresh, schemaMode],
  );

  // Helper to get projects for a specific profile
  const getProjectsForProfile = useCallback(
    (profileId: string) => {
      return members.filter((m) => m.profile_id === profileId).map((m) => m.project_id);
    },
    [members],
  );

  // Helper to get profiles for a specific project
  const getProfilesForProject = useCallback(
    (projectId: string) => {
      return members.filter((m) => m.project_id === projectId).map((m) => m.profile_id);
    },
    [members],
  );

  return {
    members,
    isLoading,
    isSaving,
    error,
    schemaMode,
    canManage,
    refresh,
    addMember,
    removeMember,
    getProjectsForProfile,
    getProfilesForProject,
  };
}
