// Caminho no seu projeto: supabase/functions/invite-team-member/index.ts
//
// Esta função roda no servidor do Supabase (Deno), não no navegador.
// Ela usa a service_role key (disponível automaticamente como variável de
// ambiente em toda Edge Function do Supabase) para:
//   1) validar que quem está chamando é um admin autenticado
//   2) convidar um novo usuário de autenticação (cria o auth.users)
//   3) criar a linha correspondente em "profiles" com o id real do convidado
//
// Deploy: supabase functions deploy invite-team-member

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Cabeçalho de autorização ausente." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Cliente "como o chamador" — só para descobrir quem está autenticado.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "Usuário não autenticado." }, 401);
    }

    // Cliente com service role — ignora RLS, só usado no servidor.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("role, org_id")
      .eq("id", userData.user.id)
      .single();

    if (callerProfileError || !callerProfile) {
      return json({ error: "Perfil do solicitante não encontrado." }, 403);
    }

    if (callerProfile.role !== "admin") {
      return json(
        { error: "Apenas administradores podem convidar novos membros." },
        403,
      );
    }

    const body = await req.json().catch(() => null);
    const email: string | undefined = body?.email?.trim();
    const full_name: string | undefined = body?.full_name?.trim();
    const role: string | undefined = body?.role;
    const department: string | null = body?.department ?? null;

    if (!email || !full_name || !role) {
      return json(
        { error: "Campos obrigatórios: email, full_name e role." },
        400,
      );
    }

    // 1) Convida o usuário — cria o registro em auth.users e dispara o e-mail.
    const { data: invited, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name },
        // TODO: ajuste para a URL da sua tela de "definir senha" após o convite
        // redirectTo: "https://seu-dominio.com/auth/definir-senha",
      });

    if (inviteError || !invited?.user) {
      return json(
        {
          error: `Falha ao convidar usuário: ${
            inviteError?.message ?? "erro desconhecido"
          }`,
        },
        400,
      );
    }

    // 2) Cria o perfil já vinculado ao mesmo id do usuário e à org do admin.
    const { error: profileInsertError } = await adminClient
      .from("profiles")
      .insert({
        id: invited.user.id,
        org_id: callerProfile.org_id,
        full_name,
        role,
        department,
        email,
        active: true,
      });

    if (profileInsertError) {
      return json(
        {
          error: `Usuário convidado, mas falha ao criar o perfil: ${profileInsertError.message}`,
        },
        500,
      );
    }

    return json({ success: true, user_id: invited.user.id }, 200);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Erro inesperado." },
      500,
    );
  }
});