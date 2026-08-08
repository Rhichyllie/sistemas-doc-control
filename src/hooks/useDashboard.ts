import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'

export interface DashboardMetrics {
  total: number
  draft: number
  in_review: number
  pending_approval: number
  published: number
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
  monthly_trend: {
    month: string
    label: string
    created: number
    published: number
    review_due: number
  }[]
}

interface TypeRow { doc_type: string }
interface AreaRow { area: string }
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
          createdTrendRes,
          publishedTrendRes,
          reviewTrendRes,
        ] = await Promise.all([
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'draft'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'in_review'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending_approval'),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'published'),
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
          supabase.from('documents').select('created_at').eq('org_id', orgId).gte('created_at', lastSixMonths.toISOString()),
          supabase.from('documents').select('published_at').eq('org_id', orgId).not('published_at', 'is', null).gte('published_at', lastSixMonths.toISOString()),
          supabase.from('documents').select('next_review_at').eq('org_id', orgId).eq('status', 'published').not('next_review_at', 'is', null).gte('next_review_at', lastSixMonths.toISOString().split('T')[0]),
        ])

        const byType = aggregate((byTypeRes.data ?? []) as TypeRow[], 'doc_type')
          .map(({ value, count }) => ({ doc_type: value, count }))
        const byArea = aggregate((byAreaRes.data ?? []) as AreaRow[], 'area')
          .map(({ value, count }) => ({ area: value, count }))
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
