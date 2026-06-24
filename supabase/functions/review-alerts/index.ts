import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const alertDays = [30, 15, 7]
  const now = new Date()
  let totalNotified = 0

  try {
    for (const days of alertDays) {
      const target = new Date(now)
      target.setDate(target.getDate() + days)
      const targetDate = target.toISOString().split('T')[0]

      const { data: docs } = await supabase
        .from('documents')
        .select('id, code, title, org_id, next_review_at')
        .eq('status', 'published')
        .eq('next_review_at', targetDate)

      if (!docs?.length) continue

      for (const doc of docs) {
        const { data: managers } = await supabase
          .from('profiles').select('id')
          .eq('org_id', doc.org_id)
          .in('role', ['admin', 'manager'])
          .eq('active', true)

        if (!managers?.length) continue

        const urgencyLabel = days <= 7 ? 'CRITICO' : days <= 15 ? 'ATENCAO' : 'AVISO'
        const today = now.toISOString().split('T')[0]

        const { data: existing } = await supabase
          .from('notifications').select('id')
          .eq('document_id', doc.id)
          .eq('type', 'review_expiring')
          .gte('created_at', `${today}T00:00:00Z`).limit(1)

        if (!existing?.length) {
          await supabase.from('notifications').insert(
            managers.map(m => ({
              org_id: doc.org_id,
              user_id: m.id,
              document_id: doc.id,
              type: 'review_expiring',
              title: `${urgencyLabel} — Revisao em ${days} dias`,
              body: `${doc.code ?? ''} — ${doc.title} vence em ${days} dias (${targetDate})`,
              read: false,
            }))
          )
          totalNotified += managers.length
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, notifications_created: totalNotified, checked_at: now.toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
