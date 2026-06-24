import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { file_path, org_id } = await req.json()
    if (!file_path || !org_id) {
      return new Response(JSON.stringify({ error: 'file_path and org_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents').download(file_path)

    if (downloadError || !fileData) {
      return new Response(JSON.stringify({ error: 'Failed to download file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const buffer = await fileData.arrayBuffer()
    const text = new TextDecoder('latin1').decode(new Uint8Array(buffer))
    const textMatches = text.match(/BT[\s\S]*?ET/g) ?? []
    const rawText = textMatches.join(' ')
      .replace(/\(([^)]+)\)/g, '$1')
      .replace(/[^\x20-\x7E\xC0-\xFF]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 2000)

    const suggestions: Record<string, string | null> = { title: null, area: null, doc_type: null, revision: null }

    const revMatch = rawText.match(/[Rr]ev(?:is[ao])?\.?\s*(\d+)/i)
    if (revMatch) suggestions.revision = revMatch[1]

    const areaKeywords: Record<string, string[]> = {
      SGI: ['sistema de gestão', 'SGI', 'qualidade'],
      ENG: ['engenharia', 'ENG', 'especificação técnica'],
      OPS: ['operação', 'OPS', 'processo'],
      MNT: ['manutenção', 'MNT'],
      SST: ['segurança', 'SST', 'saúde'],
      MA:  ['meio ambiente', 'ambiental'],
    }
    for (const [area, keywords] of Object.entries(areaKeywords)) {
      if (keywords.some(kw => rawText.toLowerCase().includes(kw.toLowerCase()))) {
        suggestions.area = area; break
      }
    }

    const typePatterns: Record<string, RegExp[]> = {
      PRO: [/procedimento/i, /\bPOP\b/],
      IT:  [/instrução de trabalho/i, /\bIT\b/],
      ET:  [/especificação técnica/i, /\bET\b/],
      RNC: [/não conformidade/i, /\bRNC\b/],
      PLN: [/plano de/i],
      MAN: [/manual/i],
    }
    for (const [type, patterns] of Object.entries(typePatterns)) {
      if (patterns.some(p => p.test(rawText))) {
        suggestions.doc_type = type; break
      }
    }

    const lines = rawText.split(/[.\n]/).map(l => l.trim()).filter(l => l.length > 10 && l.length < 120)
    if (lines.length > 0) {
      suggestions.title = lines.find(l => !/^\d/.test(l) && !/^[A-Z]{2}-/.test(l)) ?? lines[0]
    }

    return new Response(
      JSON.stringify({ suggestions, note: 'Sugestões automáticas. Verifique antes de salvar.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
