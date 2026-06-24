import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'

export interface Notification {
  id: string
  document_id: string | null
  type: string
  title: string
  body: string | null
  read: boolean
  created_at: string
}

export function useNotifications() {
  const { profile } = useAuthContext()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!profile) {
      setNotifications([])
      setUnreadCount(0)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)

    const items = (data ?? []) as Notification[]
    setNotifications(items)
    setUnreadCount(items.filter((notification) => !notification.read).length)
    setLoading(false)
  }, [profile])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  async function markAllRead() {
    if (!profile) return

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', profile.id)
      .eq('read', false)

    setUnreadCount(0)
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
  }

  return { notifications, unreadCount, loading, markAllRead, refetch: fetchNotifications }
}
