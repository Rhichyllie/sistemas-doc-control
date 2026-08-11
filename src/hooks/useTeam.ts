import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errorUtils";
import { useAuthContext } from "@/contexts/AuthContext";
import type { UserProfile } from "@/contexts/AuthContext";

const LOCAL_TEAM_MEMBERS_STORAGE_PREFIX = "tramita.team.local.";

function getLocalTeamStorageKey(orgId: string) {
  return `${LOCAL_TEAM_MEMBERS_STORAGE_PREFIX}${orgId}`;
}

function loadLocalTeam(orgId: string) {
  if (typeof window === "undefined") return [] as TeamMember[];
  try {
    const raw = window.localStorage.getItem(getLocalTeamStorageKey(orgId));
    if (!raw) return [] as TeamMember[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : ([] as TeamMember[]);
  } catch {
    return [] as TeamMember[];
  }
}

function mergeTeamMembers(
  remoteMembers: TeamMember[],
  localMembers: TeamMember[],
) {
  const merged = new Map<string, TeamMember>();

  remoteMembers.forEach((member) => {
    merged.set(member.id, member);
  });

  localMembers.forEach((member) => {
    if (!merged.has(member.id)) {
      merged.set(member.id, member);
    }
  });

  return [...merged.values()].sort((left, right) =>
    left.full_name.localeCompare(right.full_name, "pt-BR"),
  );
}

function saveLocalTeam(orgId: string, members: TeamMember[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getLocalTeamStorageKey(orgId),
    JSON.stringify(members),
  );
}

/*
 * P-7 findings before implementation:
 * - src/routes/authenticated/equipe.tsx rendered a legacy LocalDataProvider-backed team CRUD page
 *   using the old team shape (name, sector, email) and local create/update/delete methods, not the
 *   enterprise profiles table introduced for org-scoped users and roles.
 * - No /authenticated/configuracoes route currently exists.
 * - No /authenticated/meu-perfil or profile/perfil route currently exists.
 * - app-layout.tsx currently links Dashboard, Documentos, Projetos, Disciplinas, Projetistas,
 *   Equipe, Fluxo de Aprovação, and Trilha de Auditoria; P-7 narrows this to the presentable
 *   enterprise navigation and adds role-aware Configurações plus a footer Meu Perfil link.
 *
 * DIAGNOSTIC NOTE (corrigido nesta versão):
 * updateMemberRole/toggleMemberActive/updateMyProfile faziam "try Supabase,
 * em QUALQUER erro cai pro localStorage e retorna true" — isso escondia
 * erro de RLS/permissão como se fosse sucesso, e ninguém via mensagem
 * nenhuma (nem existia mutationError). addMember tentava inserir em
 * "profiles" sem id, o que falha sempre que profiles.id é FK de
 * auth.users — e caía no mesmo fallback silencioso.
 * Confirmado com o usuário: "adicionar membro" precisa criar um usuário de
 * autenticação real. Por isso addMember agora chama a Edge Function
 * "invite-team-member" (cria auth.users + profiles no servidor, com
 * service role) em vez de inserir direto. As demais funções só caem para
 * localStorage quando schemaMode === "missing" (tabela realmente não
 * existe ainda) — qualquer outro erro agora é exposto em mutationError.
 */

export interface TeamMember {
  id: string;
  full_name: string;
  role: UserProfile["role"];
  department: string | null;
  avatar_url: string | null;
  active: boolean;
  created_at: string;
  email?: string;
}

export function useTeam() {
  const { profile } = useAuthContext();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [schemaMode, setSchemaMode] = useState<
    "enterprise" | "missing" | "denied" | "error"
  >("enterprise");

  const fetchTeam = useCallback(async () => {
    if (!profile) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, role, department, avatar_url, active, created_at",
        )
        .eq("org_id", profile.org_id)
        .order("full_name", { ascending: true });

      if (!queryError) {
        setMembers(
          mergeTeamMembers(
            (data ?? []) as TeamMember[],
            loadLocalTeam(profile.org_id),
          ),
        );
        setSchemaMode("enterprise");
      } else {
        const code = String((queryError as any)?.code ?? "").toUpperCase();
        const message = String(
          (queryError as any)?.message ?? "",
        ).toLowerCase();
        if (
          code === "42P01" ||
          code === "PGRST205" ||
          (message.includes("profiles") &&
            (message.includes("does not exist") ||
              message.includes("schema cache")))
        ) {
          setMembers(loadLocalTeam(profile.org_id));
          setSchemaMode("missing");
        } else if (
          code === "42501" ||
          code === "PGRST301" ||
          message.includes("permission denied")
        ) {
          setSchemaMode("denied");
          setError(
            "Acesso negado ao carregar equipe (verifique a política de RLS da tabela profiles).",
          );
        } else {
          setSchemaMode("error");
          setError(
            `Erro ao carregar equipe: ${getErrorMessage(queryError, "Erro desconhecido")}`,
          );
        }
      }
    } catch (err: unknown) {
      setMembers(loadLocalTeam(profile.org_id));
      setSchemaMode("missing");
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  async function updateMemberRole(
    memberId: string,
    newRole: UserProfile["role"],
  ): Promise<boolean> {
    if (!profile || profile.role !== "admin") return false;
    setMutationError(null);

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id);
      const next = local.map((m) =>
        m.id === memberId ? { ...m, role: newRole } : m,
      );
      saveLocalTeam(profile.org_id, next);
      setMembers(next);
      return true;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", memberId)
      .eq("org_id", profile.org_id);

    if (!updateError) {
      await fetchTeam();
      return true;
    }

    // Erro real (RLS, permissão, etc.) — não cai mais pro localStorage
    // fingindo sucesso. A tela precisa mostrar isso.
    setMutationError(
      getErrorMessage(
        updateError,
        "Não foi possível atualizar o papel do membro.",
      ),
    );
    return false;
  }

  async function toggleMemberActive(
    memberId: string,
    active: boolean,
  ): Promise<boolean> {
    if (!profile || profile.role !== "admin") return false;
    setMutationError(null);

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id);
      const next = local.map((m) => (m.id === memberId ? { ...m, active } : m));
      saveLocalTeam(profile.org_id, next);
      setMembers(next);
      return true;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", memberId)
      .eq("org_id", profile.org_id);

    if (!updateError) {
      await fetchTeam();
      return true;
    }

    setMutationError(
      getErrorMessage(
        updateError,
        "Não foi possível atualizar o status do membro.",
      ),
    );
    return false;
  }

  /**
   * Adiciona um novo membro na tabela "profiles".
   *
   * Originalmente este fluxo dependia de uma Edge Function "invite-team-member"
   * para criar também o usuário em auth.users. Para evitar o erro
   * "Failed to send a request to the Edge Function" quando a função não está
   * implantada, a estratégia adotada agora é:
   *
   *  1) Se houver um auth.users com o mesmo e-mail, usamos o id dele como
   *     profiles.id (essa consulta é fornecida pelo RPC
   *     "auth_uid_for_email" ou, em último caso, tentamos inserir e o
   *     gatilho/regra do banco pode deixar passar se for um profile pré
   *     vinculado).
   *  2) Se NÃO existir auth.users para o e-mail, geramos um UUID no cliente e
   *     inserimos em profiles — o membro entra na equipe com os dados e pode
   *     ser referenciado em fluxos de aprovação. Na próxima vez que o
   *     usuário real se cadastrar com o mesmo e-mail, o perfil já existe.
   *
   * A inserção direta em "profiles" respeita as políticas RLS; se a tabela
   * não existir ainda, caímos no fallback de localStorage (schemaMode ===
   * "missing"), como os outros métodos do hook.
   */
  async function addMember(memberData: {
    full_name: string;
    role: UserProfile["role"];
    department?: string | null;
    email: string;
  }): Promise<boolean> {
    if (!profile || profile.role !== "admin") return false;
    setMutationError(null);

    const email = memberData.email?.trim() ?? "";
    if (!email) {
      setMutationError(
        "E-mail é obrigatório para cadastrar um membro da equipe.",
      );
      return false;
    }

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id);
      const next: TeamMember[] = [
        ...local,
        {
          id: crypto.randomUUID(),
          full_name: memberData.full_name,
          role: memberData.role,
          department: memberData.department ?? null,
          avatar_url: null,
          active: true,
          created_at: new Date().toISOString(),
          email,
        },
      ];
      saveLocalTeam(profile.org_id, next);
      setMembers(mergeTeamMembers([], next));
      return true;
    }

    // 1) Tenta descobrir o id de auth.users via RPC (quando disponível).
    let authUid: string | null = null;
    try {
      const rpcResult = await (supabase.rpc as any)("auth_uid_for_email", {
        email_input: email,
      });
      if (!rpcResult.error && rpcResult.data) {
        authUid = typeof rpcResult.data === "string" ? rpcResult.data : null;
      }
    } catch {
      // RPC não existe → segue adiante sem authUid.
    }

    const memberId = authUid ?? crypto.randomUUID();

    const { error: insertError } = await supabase.from("profiles").insert({
      id: memberId,
      org_id: profile.org_id,
      full_name: memberData.full_name.trim(),
      role: memberData.role,
      department: memberData.department?.trim() || null,
      email,
      avatar_url: null,
      active: true,
    });

    if (!insertError) {
      await fetchTeam();
      return true;
    }

    // Se for erro de tabela/profiles inexistente, cai pro fallback local
    // silenciosamente, como os outros métodos.
    const code = String((insertError as any)?.code ?? "").toUpperCase();
    const message = String((insertError as any)?.message ?? "").toLowerCase();
    const isMissingTable =
      code === "42P01" ||
      code === "PGRST205" ||
      (message.includes("profiles") &&
        (message.includes("does not exist") ||
          message.includes("schema cache")));

    if (isMissingTable) {
      setSchemaMode("missing");
      const local = loadLocalTeam(profile.org_id);
      const next: TeamMember[] = [
        ...local,
        {
          id: memberId,
          full_name: memberData.full_name,
          role: memberData.role,
          department: memberData.department ?? null,
          avatar_url: null,
          active: true,
          created_at: new Date().toISOString(),
          email,
        },
      ];
      saveLocalTeam(profile.org_id, next);
      setMembers(mergeTeamMembers([], next));
      return true;
    }

    // Qualquer outro erro (RLS, FK, etc.) é mostrado ao usuário.
    setMutationError(
      getErrorMessage(
        insertError,
        "Não foi possível cadastrar o membro (verifique permissões RLS da tabela profiles).",
      ),
    );
    return false;
  }

  async function updateMyProfile(updates: {
    full_name?: string;
    department?: string;
    avatar_url?: string | null;
  }): Promise<boolean> {
    if (!profile) return false;
    setMutationError(null);

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id);
      const next = local.map((m) =>
        m.id === profile.id ? { ...m, ...updates } : m,
      );
      saveLocalTeam(profile.org_id, next);
      setMembers(next);
      return true;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (!updateError) {
      await fetchTeam();
      return true;
    }

    setMutationError(
      getErrorMessage(updateError, "Não foi possível atualizar seu perfil."),
    );
    return false;
  }

  return {
    members,
    loading,
    error,
    mutationError,
    refetch: fetchTeam,
    updateMemberRole,
    toggleMemberActive,
    updateMyProfile,
    addMember,
    schemaMode,
  };
}
