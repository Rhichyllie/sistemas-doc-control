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
}

interface TypeRow { doc_type: string }
interface AreaRow { area: string }

function aggregate<T extends string>(rows: Record<T, string>[], key: T) {
  const map: Record<string, number> = {}
  for (const row of rows) {
    map[row[key]] = (map[row[key]] ?? 0) + 1
  }
  return Object.entries(map)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
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

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const orgId = profile.org_id
        const now = new Date()
        const today = now.toISOString().split('T')[0]
        const in30 = new Date(now)
        in30.setDate(in30.getDate() + 30)
        const in7 = new Date(now)
        in7.setDate(in7.getDate() + 7)
        const ago30 = new Date(now)
        ago30.setDate(ago30.getDate() - 30)

        let myQueueQuery = supabase
          .from('approval_flows')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'pending')

        if (!['admin', 'manager'].includes(profile.role)) {
          myQueueQuery = myQueueQuery
            .eq('required_role', profile.role)
            .or(`assignee_id.eq.${profile.id},assignee_id.is.null`)
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

        if (!['admin', 'manager'].includes(profile.role)) {
          pendingStepsQuery = pendingStepsQuery
            .eq('required_role', profile.role)
            .or(`assignee_id.eq.${profile.id},assignee_id.is.null`)
          overdueStepsQuery = overdueStepsQuery
            .eq('required_role', profile.role)
            .or(`assignee_id.eq.${profile.id},assignee_id.is.null`)
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
        ])

        const byType = aggregate((byTypeRes.data ?? []) as TypeRow[], 'doc_type')
          .map(({ value, count }) => ({ doc_type: value, count }))
        const byArea = aggregate((byAreaRes.data ?? []) as AreaRow[], 'area')
          .map(({ value, count }) => ({ area: value, count }))

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
