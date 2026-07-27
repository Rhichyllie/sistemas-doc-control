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

function saveLocalTeam(orgId: string, members: TeamMember[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getLocalTeamStorageKey(orgId), JSON.stringify(members));
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
        setMembers((data ?? []) as TeamMember[])
        setSchemaMode("enterprise")
      } else {
        // Check schema errors
        const code = String((queryError as any)?.code ?? "").toUpperCase()
        const message = String((queryError as any)?.message ?? "").toLowerCase()
        if (
          code === "42P01" ||
          code === "PGRST205" ||
          (message.includes("profiles") &&
            (message.includes("does not exist") || message.includes("schema cache")))
        ) {
          setMembers(loadLocalTeam(profile.org_id))
          setSchemaMode("missing")
        } else if (
          code === "42501" ||
          code === "PGRST301" ||
          message.includes("permission denied")
        ) {
          setSchemaMode("denied")
          setError("Acesso negado ao carregar equipe.")
        } else {
          setSchemaMode("error")
          setError(`Erro ao carregar equipe: ${getErrorMessage(queryError, "Erro desconhecido")}`)
        }
      }
    } catch (err: unknown) {
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
    if (!profile || profile.role !== 'admin') return false

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id)
      const next = local.map(m => m.id === memberId ? { ...m, role: newRole } : m)
      saveLocalTeam(profile.org_id, next)
      setMembers(next)
      return true
    }

    // Try Supabase first, fallback to local on error
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
    } catch {
      // ignore
    }

    // Fallback to local
    const local = loadLocalTeam(profile.org_id)
    const next = local.map(m => m.id === memberId ? { ...m, role: newRole } : m)
    saveLocalTeam(profile.org_id, next)
    setMembers(next)
    setSchemaMode("missing")
    return true
  }

  async function toggleMemberActive(memberId: string, active: boolean): Promise<boolean> {
    if (!profile || profile.role !== 'admin') return false

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id)
      const next = local.map(m => m.id === memberId ? { ...m, active } : m)
      saveLocalTeam(profile.org_id, next)
      setMembers(next)
      return true
    }

    // Try Supabase first, fallback to local on error
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
    } catch {
      // ignore
    }

    // Fallback to local
    const local = loadLocalTeam(profile.org_id)
    const next = local.map(m => m.id === memberId ? { ...m, active } : m)
    saveLocalTeam(profile.org_id, next)
    setMembers(next)
    setSchemaMode("missing")
    return true
  }

  async function addMember(memberData: {
    full_name: string
    role: UserProfile['role']
    department?: string | null
    email?: string
  }): Promise<boolean> {
    if (!profile || profile.role !== 'admin') return false

    const now = new Date().toISOString()

    // First try Supabase, if any error (RLS or schema) fall back to local
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

      // If error, fall back to local
    } catch {
      // ignore and go to local
    }

    // Local fallback
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
    setSchemaMode("missing") // Set to missing to use local for future operations
    return true
  }

  async function updateMyProfile(updates: { full_name?: string; department?: string; avatar_url?: string | null }): Promise<boolean> {
    if (!profile) return false

    if (schemaMode === "missing") {
      const local = loadLocalTeam(profile.org_id)
      const next = local.map(m => m.id === profile.id ? { ...m, ...updates } : m)
      saveLocalTeam(profile.org_id, next)
      setMembers(next)
      return true
    }

    // Try Supabase first, fallback to local on error
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', profile.id)

      if (!updateError) {
        await fetchTeam()
        return true
      }
    } catch {
      // ignore
    }

    // Fallback to local
    const local = loadLocalTeam(profile.org_id)
    const next = local.map(m => m.id === profile.id ? { ...m, ...updates } : m)
    saveLocalTeam(profile.org_id, next)
    setMembers(next)
    setSchemaMode("missing")
    return true
  }

  return { 
    members, 
    loading, 
    error, 
    refetch: fetchTeam, 
    updateMemberRole, 
    toggleMemberActive, 
    updateMyProfile, 
    addMember,
    schemaMode 
  }
}
