import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'
import type { Document } from './useDocuments'

export function useExpiringDocuments(days = 30) {
  const { profile } = useAuthContext()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) {
      setDocuments([])
      setLoading(false)
      return
    }

    setLoading(true)
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + days)

    supabase
      .from('documents')
      .select('*, author:profiles!documents_author_id_fkey (full_name)')
      .eq('org_id', profile.org_id)
      .eq('status', 'published')
      .lte('next_review_at', deadline.toISOString().split('T')[0])
      .gte('next_review_at', new Date().toISOString().split('T')[0])
      .order('next_review_at', { ascending: true })
      .then(({ data }) => {
        setDocuments((data ?? []) as Document[])
        setLoading(false)
      })
  }, [profile, days])

  return { documents, loading }
}
