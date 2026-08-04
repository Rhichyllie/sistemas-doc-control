import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errorUtils'
import { useAuthContext } from '@/contexts/AuthContext'
import type { UserProfile } from '@/contexts/AuthContext'

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
    return Array.isArray(parsed) ? parsed : [] as TeamMember[];
  } catch {
    return [] as TeamMember[];
  }
}

function mergeTeamMembers(remoteMembers: TeamMember[], localMembers: TeamMember[]) {
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
  window.localStorage.setItem(getLocalTeamStorageKey(orgId), JSON.stringify(members));
}

/**
 * Classifies a Supabase error/exception as one of:
 * - "missing-schema": the `profiles` table/columns don't exist yet. Legitimate
 *   reason to fall back to the local team store.
 * - "permission": RLS or role denied the operation. NOT a reason to fall back
 *   to local — it's a real error the user needs to see.
 * - "other": anything else (network blip, constraint violation, bad payload,
 *   etc). Also NOT a reason to fall back to local.
 */
function classifySupabaseError(err: unknown): "missing-schema" | "permission" | "other" {
  const code = String((err as any)?.code ?? "").toUpperCase()
  const message = String((err as any)?.message ?? "").toLowerCase()

  if (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("profiles") &&
      (message.includes("does not exist") || message.includes("schema cache")))
  ) {
    return "missing-schema"
  }

  if (code === "42501" || code === "PGRST301" || message.includes("permission denied")) {
    return "permission"
  }

  return "other"
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
 * - P-8 fix: every mutation used to do "try Supabase, catch ANY error, silently fall back
 *   to localStorage and return true". That masked real failures (RLS denials, bad payloads,
 *   network errors) as success. Now only a genuinely missing schema falls back to local;
 *   every other error surfaces via `mutationError` and the function returns false.
 */

export interface TeamMember {
  id: string
  full_name: string
  role: UserProfile['role']
  department: string | null
  avatar_url: string | null
  active: boolean
  created_at: string
  email?: string
}

export function useTeam() {
  const { profile } = useAuthContext()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [schemaMode, setSchemaMode] = useState<"enterprise" | "missing" | "denied" | "error">("enterprise")

  const fetchTeam = useCallback(async () => {
    if (!profile) {
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id, full_name, role, department, avatar_url, active, created_at')
        .eq('org_id', profile.org_id)
        .order('full_name', { ascending: true })

      if (!queryError) {
        setMembers(
          mergeTeamMembers(
            (data ?? []) as TeamMember[],
            loadLocalTeam(profile.org_id),
          ),
        )
        setSchemaMode("enterprise")
      } else {
        const kind = classifySupabaseError(queryError)
        if (kind === "missing-schema") {
          setMembers(loadLocalTeam(profile.org_id))
          setSchemaMode("missing")
        } else if (kind === "permission") {
          setSchemaMode("denied")
          setError("Acesso negado ao carregar equipe.")
        } else {
          setSchemaMode("error")
          setError(`Erro ao carregar equipe: ${getErrorMessage(queryError, "Erro desconhecido")}`)
        }
      }
    } catch (err: unknown) {
      // Network-level exceptions on the initial load are treated the same
      // way the old code did (fall back to local so the page isn't blank),
      // but we still surface that we're in a degraded mode via schemaMode.
      setMembers(loadLocalTeam(profile.org_id))
      setSchemaMode("missing")
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    fetchTeam()
  }, [fetchTeam])

  async function updateMemberRole(memberId: string, newRole: UserProfile['role']): Promise<boolean> {
    if (!profile || profile.role !== 'admin') {
      setMutationError("Apenas administradores podem alterar o papel de um membro.")
      return false
    }

    setMutationError(null)

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id)
      const next = local.map(m => m.id === memberId ? { ...m, role: newRole } : m)
      saveLocalTeam(profile.org_id, next)
      setMembers(next)
      return true
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', memberId)
        .eq('org_id', profile.org_id)

      if (!updateError) {
        await fetchTeam()
        return true
      }

      const kind = classifySupabaseError(updateError)
      if (kind === "missing-schema") {
        setSchemaMode("missing")
        const local = loadLocalTeam(profile.org_id)
        const next = local.map(m => m.id === memberId ? { ...m, role: newRole } : m)
        saveLocalTeam(profile.org_id, next)
        setMembers(next)
        return true
      }

      setMutationError(`Erro ao atualizar papel: ${getErrorMessage(updateError, "Erro desconhecido")}`)
      return false
    } catch (err: unknown) {
      setMutationError(`Erro ao atualizar papel: ${getErrorMessage(err, "Erro de conexão")}`)
      return false
    }
  }

  async function toggleMemberActive(memberId: string, active: boolean): Promise<boolean> {
    if (!profile || profile.role !== 'admin') {
      setMutationError("Apenas administradores podem ativar ou desativar um membro.")
      return false
    }

    setMutationError(null)

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id)
      const next = local.map(m => m.id === memberId ? { ...m, active } : m)
      saveLocalTeam(profile.org_id, next)
      setMembers(next)
      return true
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('id', memberId)
        .eq('org_id', profile.org_id)

      if (!updateError) {
        await fetchTeam()
        return true
      }

      const kind = classifySupabaseError(updateError)
      if (kind === "missing-schema") {
        setSchemaMode("missing")
        const local = loadLocalTeam(profile.org_id)
        const next = local.map(m => m.id === memberId ? { ...m, active } : m)
        saveLocalTeam(profile.org_id, next)
        setMembers(next)
        return true
      }

      setMutationError(`Erro ao atualizar status: ${getErrorMessage(updateError, "Erro desconhecido")}`)
      return false
    } catch (err: unknown) {
      setMutationError(`Erro ao atualizar status: ${getErrorMessage(err, "Erro de conexão")}`)
      return false
    }
  }

  async function addMember(memberData: {
    full_name: string
    role: UserProfile['role']
    department?: string | null
    email?: string
  }): Promise<boolean> {
    if (!profile || profile.role !== 'admin') return false
    if (!memberData.email) {
      setError('Email é obrigatório para criar acesso ao sistema.')
      return false
    }

    setMutationError(null)
    const now = new Date().toISOString()

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id)
      const newMember: TeamMember = {
        id: `local-tm-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
        full_name: memberData.full_name,
        role: memberData.role,
        department: memberData.department ?? null,
        avatar_url: null,
        active: true,
        created_at: now,
        email: memberData.email,
      }
      const next = [...local, newMember]
      saveLocalTeam(profile.org_id, next)
      setMembers(next)
      return true
    }

    try {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          org_id: profile.org_id,
          full_name: memberData.full_name,
          role: memberData.role,
          department: memberData.department ?? null,
          active: true,
          email: memberData.email,
        })
        .select('id')
        .single()

      if (!insertError) {
        await fetchTeam()
        return true
      }

      const kind = classifySupabaseError(insertError)
      if (kind === "missing-schema") {
        setSchemaMode("missing")
        const local = loadLocalTeam(profile.org_id)
        const newMember: TeamMember = {
          id: `local-tm-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          full_name: memberData.full_name,
          role: memberData.role,
          department: memberData.department ?? null,
          avatar_url: null,
          active: true,
          created_at: now,
          email: memberData.email,
        }
        const next = [...local, newMember]
        saveLocalTeam(profile.org_id, next)
        setMembers(next)
        return true
      }

      setMutationError(`Erro ao adicionar membro: ${getErrorMessage(insertError, "Erro desconhecido")}`)
      return false
    } catch (err: unknown) {
      setMutationError(`Erro ao adicionar membro: ${getErrorMessage(err, "Erro de conexão")}`)
      return false
    }
  }

  async function updateMyProfile(updates: { full_name?: string; department?: string; avatar_url?: string | null }): Promise<boolean> {
    if (!profile) {
      setMutationError("Usuário não autenticado.")
      return false
    }

    setMutationError(null)

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id)
      const next = local.map(m => m.id === profile.id ? { ...m, ...updates } : m)
      saveLocalTeam(profile.org_id, next)
      setMembers(next)
      return true
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', profile.id)

      if (!updateError) {
        await fetchTeam()
        return true
      }

      const kind = classifySupabaseError(updateError)
      if (kind === "missing-schema") {
        setSchemaMode("missing")
        const local = loadLocalTeam(profile.org_id)
        const next = local.map(m => m.id === profile.id ? { ...m, ...updates } : m)
        saveLocalTeam(profile.org_id, next)
        setMembers(next)
        return true
      }

      setMutationError(`Erro ao atualizar perfil: ${getErrorMessage(updateError, "Erro desconhecido")}`)
      return false
    } catch (err: unknown) {
      setMutationError(`Erro ao atualizar perfil: ${getErrorMessage(err, "Erro de conexão")}`)
      return false
    }
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
    schemaMode
  }
}