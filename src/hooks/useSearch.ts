import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'

export interface SearchResult {
  id: string
  code: string | null
  title: string
  doc_type: string
  area: string
  status: string
  author_name: string | null
}

export function useSearch() {
  const { profile } = useAuthContext()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (term: string) => {
    if (!profile || !term.trim() || term.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      let q = supabase
        .from('documents')
        .select('id, code, title, doc_type, area, status, author:profiles!documents_author_id_fkey (full_name)')
        .eq('org_id', profile.org_id)
        .limit(10)

      const t = term.trim()
      if (t.length >= 3) {
        q = q.textSearch('search_vector',
          t.split(' ').filter(Boolean).map(w => w + ':*').join(' & '),
          { type: 'websearch', config: 'portuguese' }
        )
      } else {
        q = q.or(`title.ilike.%${t}%,code.ilike.%${t}%`)
      }

      const { data, error: queryError } = await q
      if (queryError) throw queryError

      setResults((data ?? []).map((d: any) => ({
        id: d.id,
        code: d.code,
        title: d.title,
        doc_type: d.doc_type,
        area: d.area,
        status: d.status,
        author_name: d.author?.full_name ?? null,
      })))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro na busca')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) search(query)
      else setResults([])
    }, 300)
    return () => clearTimeout(timer)
  }, [query, search])

  return { query, setQuery, results, loading, error }
}
