import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'

export interface DashboardMetrics {
  total: number
  draft: number
  in_review: number
  pending_approval: number
  published: number
  approved: number
  rejected: number
  cancelled: number
  obsolete: number
  expiring_30_days: number
  expiring_7_days: number
  pending_my_action: number
  pending_approval_steps: number
  overdue_approval_steps: number
  recent_published: number
  recent_created: number
  by_type: { doc_type: string; count: number }[]
  by_area: { area: string; count: number }[]
  by_discipline: DashboardDisciplineRow[]
  monthly_trend: {
    month: string
    label: string
    created: number
    published: number
    review_due: number
  }[]
}

export interface DashboardDisciplineRow {
  discipline_id: string | null
  discipline: string
  total: number
  approved: number
  in_analysis: number
  rejected: number
  sla: number
  approved_pct: number
  in_analysis_pct: number
  rejected_pct: number
}

interface TypeRow { doc_type: string }
interface AreaRow { area: string }
interface DisciplineRow { discipline_id: string | null; status: string | null; created_at?: string | null; approved_at?: string | null; rejected_at?: string | null; cancelled_at?: string | null; published_at?: string | null; next_review_at?: string | null; due_at?: string | null; sent_to_analysis_at?: string | null }
interface CreatedRow { created_at: string }
interface PublishedRow { published_at: string | null }
interface ReviewRow { next_review_at: string | null }

function aggregate<T extends string>(rows: Record<T, string>[], key: T) {
  const map: Record<string, number> = {}
  for (const row of rows) {
    map[row[key]] = (map[row[key]] ?? 0) + 1
  }
  return Object.entries(map)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(date)
    .replace('.', '')
}

function buildMonthlyTrend(
  createdRows: CreatedRow[],
  publishedRows: PublishedRow[],
  reviewRows: ReviewRow[],
) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (5 - index))
    return {
      month: getMonthKey(date),
      label: formatMonthLabel(date),
      created: 0,
      published: 0,
      review_due: 0,
    }
  })

  const monthMap = Object.fromEntries(months.map((item) => [item.month, item]))

  for (const row of createdRows) {
    const date = new Date(row.created_at)
    if (Number.isNaN(date.getTime())) continue
    const month = monthMap[getMonthKey(date)]
    if (month) month.created += 1
  }

  for (const row of publishedRows) {
    if (!row.published_at) continue
    const date = new Date(row.published_at)
    if (Number.isNaN(date.getTime())) continue
    const month = monthMap[getMonthKey(date)]
    if (month) month.published += 1
  }

  for (const row of reviewRows) {
    if (!row.next_review_at) continue
    const date = new Date(`${row.next_review_at}T00:00:00`)
    if (Number.isNaN(date.getTime())) continue
    const month = monthMap[getMonthKey(date)]
    if (month) month.review_due += 1
  }

  return months
}

function buildByDiscipline(
  rows: DisciplineRow[],
  disciplineMap: Map<string | null, string>,
): DashboardDisciplineRow[] {
  const agg = new Map<string | null, DashboardDisciplineRow & { sla_on_time: number; sla_total: number }>()
  const nowTs = Date.now()

  for (const row of rows) {
    const key = row.discipline_id ?? null
    if (!agg.has(key)) {
      agg.set(key, {
        discipline_id: key,
        discipline: disciplineMap.get(key) ?? "Sem disciplina",
        total: 0,
        approved: 0,
        in_analysis: 0,
        rejected: 0,
        sla: 0,
        approved_pct: 0,
        in_analysis_pct: 0,
        rejected_pct: 0,
        sla_on_time: 0,
        sla_total: 0,
      })
    }
    const current = agg.get(key)!
    current.total += 1

    const status = (row.status ?? "").toLowerCase()
    if (status === "published" || status === "approved" || status === "aprovado") {
      current.approved += 1
    } else if (
      status === "in_review" ||
      status === "in_analysis" ||
      status === "pending_approval" ||
      status === "review" ||
      status === "analise" ||
      status === "análise"
    ) {
      current.in_analysis += 1
    } else if (
      status === "obsolete" ||
      status === "rejected" ||
      status === "reprovado" ||
      status === "cancelled" ||
      status === "cancelado"
    ) {
      current.rejected += 1
    }

    if (row.due_at) {
      const dueTs = new Date(row.due_at).getTime()
      if (!Number.isNaN(dueTs)) {
        current.sla_total += 1
        let resolvedAt: number | null = null
        if (row.approved_at) resolvedAt = new Date(row.approved_at).getTime()
        else if (row.rejected_at) resolvedAt = new Date(row.rejected_at).getTime()
        else if (row.cancelled_at) resolvedAt = new Date(row.cancelled_at).getTime()
        else if (row.published_at) resolvedAt = new Date(row.published_at).getTime()
        if (status === "draft") {
          if (!Number.isNaN(dueTs)) {
            current.sla_total += 1
            if (nowTs <= dueTs) current.sla_on_time += 1
          }
        } else if (resolvedAt !== null && !Number.isNaN(resolvedAt)) {
          if (resolvedAt <= dueTs) current.sla_on_time += 1
        } else if (nowTs <= dueTs) {
          current.sla_on_time += 1
        }
      }
    }
  }

  const result: DashboardDisciplineRow[] = []
  for (const row of agg.values()) {
    const base = row.total || 1
    row.approved_pct = Math.round((row.approved / base) * 100)
    row.in_analysis_pct = Math.round((row.in_analysis / base) * 100)
    row.rejected_pct = Math.round((row.rejected / base) * 100)
    if (row.sla_total > 0) {
      row.sla = Math.round((row.sla_on_time / row.sla_total) * 100)
    } else {
      const done = row.approved + row.in_analysis || 1
      row.sla = Math.round((row.approved / done) * 100)
    }
    const { sla_on_time: _on, sla_total: _tot, ...rest } = row
    result.push(rest)
  }

  result.sort((a, b) => b.total - a.total)
  return result
}

export function useDashboard() {
  const { profile } = useAuthContext()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) {
      setMetrics(null)
      setLoading(false)
      return
    }

    const currentProfile = profile
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const orgId = currentProfile.org_id
        const now = new Date()
        const today = now.toISOString().split('T')[0]
        const in30 = new Date(now)
        in30.setDate(in30.getDate() + 30)
        const in7 = new Date(now)
        in7.setDate(in7.getDate() + 7)
        const ago30 = new Date(now)
        ago30.setDate(ago30.getDate() - 30)
        const lastSixMonths = new Date(now)
        lastSixMonths.setDate(1)
        lastSixMonths.setMonth(lastSixMonths.getMonth() - 5)

        let myQueueQuery = supabase
          .from('approval_flows')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'pending')

        if (!['admin', 'manager'].includes(currentProfile.role)) {
          myQueueQuery = myQueueQuery
            .eq('required_role', currentProfile.role)
            .or(`assignee_id.eq.${currentProfile.id},assignee_id.is.null`)
        }

        let pendingStepsQuery = supabase
          .from('approval_flows')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'pending')

        let overdueStepsQuery = supabase
          .from('approval_flows')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'pending')
          .lt('due_at', now.toISOString())

        if (!['admin', 'manager'].includes(currentProfile.role)) {
          pendingStepsQuery = pendingStepsQuery
            .eq('required_role', currentProfile.role)
            .or(`assignee_id.eq.${currentProfile.id},assignee_id.is.null`)
          overdueStepsQuery = overdueStepsQuery
            .eq('required_role', currentProfile.role)
            .or(`assignee_id.eq.${currentProfile.id},assignee_id.is.null`)
        }

        const [
          totalRes,
          draftRes,
          reviewRes,
          pendingRes,
          publishedRes,
          approvedRes,
          rejectedRes,
          cancelledRes,
          obsoleteRes,
          exp30Res,
          exp7Res,
          myQueueRes,
          pendingStepsRes,
          overdueStepsRes,
          recentPubRes,
          recentNewRes,
          byTypeRes,
          byAreaRes,
          byDisciplineRes,
          disciplinesRes,
          createdTrendRes,
          publishedTrendRes,
          reviewTrendRes,
        ] = await Promise.all([
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'draft'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'in_review'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending_approval'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'published'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'approved'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'rejected'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'cancelled'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'obsolete'),
          supabase.from('documents').select('id', { count: 'exact', head: true })
            .eq('org_id', orgId).eq('status', 'published')
            .lte('next_review_at', in30.toISOString().split('T')[0]).gte('next_review_at', today),
          supabase.from('documents').select('id', { count: 'exact', head: true })
            .eq('org_id', orgId).eq('status', 'published')
            .lte('next_review_at', in7.toISOString().split('T')[0]).gte('next_review_at', today),
          myQueueQuery,
          pendingStepsQuery,
          overdueStepsQuery,
          supabase.from('documents').select('id', { count: 'exact', head: true })
            .eq('org_id', orgId).eq('status', 'published').gte('published_at', ago30.toISOString()),
          supabase.from('documents').select('id', { count: 'exact', head: true })
            .eq('org_id', orgId).gte('created_at', ago30.toISOString()),
          supabase.from('documents').select('doc_type').eq('org_id', orgId),
          supabase.from('documents').select('area').eq('org_id', orgId),
          supabase.from('documents').select('discipline_id,status,created_at,approved_at,rejected_at,cancelled_at,published_at,next_review_at,due_at,sent_to_analysis_at').eq('org_id', orgId),
          supabase.from('disciplines').select('id,name').eq('org_id', orgId),
          supabase.from('documents').select('created_at').eq('org_id', orgId).gte('created_at', lastSixMonths.toISOString()),
          supabase.from('documents').select('published_at').eq('org_id', orgId).not('published_at', 'is', null).gte('published_at', lastSixMonths.toISOString()),
          supabase.from('documents').select('next_review_at').eq('org_id', orgId).eq('status', 'published').not('next_review_at', 'is', null).gte('next_review_at', lastSixMonths.toISOString().split('T')[0]),
        ])

        const byType = aggregate((byTypeRes.data ?? []) as TypeRow[], 'doc_type')
          .map(({ value, count }) => ({ doc_type: value, count }))
        const byArea = aggregate((byAreaRes.data ?? []) as AreaRow[], 'area')
          .map(({ value, count }) => ({ area: value, count }))

        if (disciplinesRes.error) {
          console.warn('[useDashboard] Erro ao carregar tabela disciplines:', disciplinesRes.error)
        }
        if (byDisciplineRes.error) {
          console.warn('[useDashboard] Erro ao carregar documentos por disciplina:', byDisciplineRes.error)
        }

        const disciplineNameMap = new Map<string | null, string>()
        for (const discipline of (disciplinesRes.data ?? []) as Array<{ id: string; name: string }>) {
          if (!discipline?.id || !discipline?.name) continue
          disciplineNameMap.set(String(discipline.id).trim(), String(discipline.name).trim())
        }
        if (disciplineNameMap.size === 0 && (disciplinesRes.data ?? []).length === 0) {
          for (const row of (byDisciplineRes.data ?? []) as DisciplineRow[]) {
            if (row.discipline_id) disciplineNameMap.set(String(row.discipline_id).trim(), "Sem disciplina")
          }
        }
        const byDiscipline = buildByDiscipline(
          ((byDisciplineRes.data ?? []) as DisciplineRow[]).map((r) => ({
            ...r,
            discipline_id: r.discipline_id ? String(r.discipline_id).trim() : null,
          })),
          disciplineNameMap,
        )
        const monthlyTrend = buildMonthlyTrend(
          (createdTrendRes.data ?? []) as CreatedRow[],
          (publishedTrendRes.data ?? []) as PublishedRow[],
          (reviewTrendRes.data ?? []) as ReviewRow[],
        )

        if (!cancelled) {
          setMetrics({
            total: totalRes.count ?? 0,
            draft: draftRes.count ?? 0,
            in_review: reviewRes.count ?? 0,
            pending_approval: pendingRes.count ?? 0,
            published: publishedRes.count ?? 0,
            approved: approvedRes.count ?? 0,
            rejected: rejectedRes.count ?? 0,
            cancelled: cancelledRes.count ?? 0,
            obsolete: obsoleteRes.count ?? 0,
            expiring_30_days: exp30Res.count ?? 0,
            expiring_7_days: exp7Res.count ?? 0,
            pending_my_action: myQueueRes.count ?? 0,
            pending_approval_steps: pendingStepsRes.count ?? 0,
            overdue_approval_steps: overdueStepsRes.count ?? 0,
            recent_published: recentPubRes.count ?? 0,
            recent_created: recentNewRes.count ?? 0,
            by_type: byType,
            by_area: byArea,
            by_discipline: byDiscipline,
            monthly_trend: monthlyTrend,
          })
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar métricas')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [profile])

  return { metrics, loading, error }
}
