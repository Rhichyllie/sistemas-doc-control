import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const { full_name, email, role, department } = await req.json()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Identifica quem está chamando, usando o token do próprio usuário logado
    const supabaseCaller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller } } = await supabaseCaller.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401 })
    }

    // Confirma que quem está chamando é admin da própria organização
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('org_id, role')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Apenas administradores podem cadastrar membros.' }), { status: 403 })
    }

    if (!full_name || !email || !role) {
      return new Response(JSON.stringify({ error: 'full_name, email e role são obrigatórios.' }), { status: 400 })
    }

    // 1. Cria o usuário no Auth (a trigger handle_new_user já cria a linha padrão em profiles)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID(),
    })

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), { status: 400 })
    }

    // 2. Atualiza o profile com os dados definidos pelo admin
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name,
        role,
        department: department ?? null,
        org_id: callerProfile.org_id,
        active: true,
      })
      .eq('id', newUser.user.id)

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 400 })
    }

    // 3. Envia link de redefinição de senha para o novo membro
    await supabaseAdmin.auth.resetPasswordForEmail(email)

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})