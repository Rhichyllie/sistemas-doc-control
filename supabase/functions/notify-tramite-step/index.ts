// Caminho: supabase/functions/notify-tramite-step/index.ts
//
// Disparada pelo trigger Postgres "trg_notify_tramite_step_activated" em
// document_tramite_instance_steps (AFTER INSERT OR UPDATE OF status),
// via net.http_post, sempre que uma etapa vira status = 'active'.
// O trigger manda só { step_id: NEW.id } — esta função busca sozinha:
// o responsável (usuário, grupo ou papel), o documento, e então
// (a) grava a notificação interna e (b) envia o e-mail via Resend.
//
// Secrets necessárias (configure com `supabase secrets set`):
//   RESEND_API_KEY       -> chave da sua conta Resend
//   RESEND_FROM_EMAIL    -> remetente verificado, ex: "Tramita <notificacoes@seudominio.com>"
//   APP_BASE_URL         -> URL do seu app, usada no link do e-mail
//
// Deploy: supabase functions deploy notify-tramite-step

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://seu-dominio.com";

interface NotifyPayload {
  step_id: string;
}

interface StepRow {
  id: string;
  org_id: string;
  document_id: string;
  instance_id: string;
  label: string;
  status: string;
  assignment_type: string | null;
  assignee_user_id: string | null;
  assignee_group_id: string | null;
  required_role: string | null;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    let payload: NotifyPayload;
    try {
      payload = await req.json();
    } catch {
      return Response.json(
        { error: "Corpo da requisição inválido (esperado JSON)." },
        { status: 400 },
      );
    }

    const stepId = payload?.step_id;
    if (!stepId) {
      return Response.json({ error: "step_id é obrigatório." }, { status: 400 });
    }

    if (!RESEND_API_KEY) {
      return Response.json(
        { error: "RESEND_API_KEY não configurada nas secrets desta função." },
        { status: 500 },
      );
    }

    // ctx.supabaseAdmin ignora RLS — necessário porque o trigger chama essa
    // função no contexto do banco, sem sessão de usuário logado.
    const admin = ctx.supabaseAdmin;

    // 1) Busca a etapa
    const { data: step, error: stepError } = await admin
      .from("document_tramite_instance_steps")
      .select(
        "id, org_id, document_id, instance_id, label, status, assignment_type, assignee_user_id, assignee_group_id, required_role",
      )
      .eq("id", stepId)
      .maybeSingle<StepRow>();

    if (stepError) {
      return Response.json(
        { error: `Falha ao buscar a etapa: ${stepError.message}` },
        { status: 500 },
      );
    }
    if (!step) {
      return Response.json({ error: "Etapa não encontrada." }, { status: 404 });
    }

    // O trigger só deveria chamar para status = 'active', mas confere de
    // novo aqui por segurança (ex.: se alguém chamar a função manualmente).
    if (step.status !== "active") {
      return Response.json({
        success: true,
        skipped: true,
        reason: `Etapa com status "${step.status}", não é necessário notificar.`,
      });
    }

    // 2) Busca o documento (título/código para o corpo da mensagem)
    const { data: doc, error: docError } = await admin
      .from("documents")
      .select("id, title, code")
      .eq("id", step.document_id)
      .maybeSingle();

    if (docError || !doc) {
      return Response.json(
        { error: "Documento vinculado à etapa não foi encontrado." },
        { status: 404 },
      );
    }

    // 3) Resolve destinatários: usuário > grupo > papel
    let recipientIds: string[] = [];

    if (step.assignee_user_id) {
      recipientIds = [step.assignee_user_id];
    } else if (step.assignee_group_id) {
      // TODO: confirme o nome real da tabela de membros de grupo de
      // aprovação. Tentando "approval_group_members" (vista em
      // useApprovalFlow.ts) com fallback para nomes alternativos.
      const { data: members, error: membersError } = await admin
        .from("approval_group_members")
        .select("user_id")
        .eq("group_id", step.assignee_group_id)
        .eq("org_id", step.org_id)
        .eq("is_active", true);

      if (membersError) {
        return Response.json(
          {
            error: `Falha ao buscar membros do grupo responsável: ${membersError.message}. Confirme o nome real da tabela de membros de grupo.`,
          },
          { status: 500 },
        );
      }

      recipientIds = (members ?? [])
        .map((m: { user_id: string | null }) => m.user_id)
        .filter((id: string | null): id is string => Boolean(id));
    }

    if (recipientIds.length === 0 && step.required_role) {
      const { data: roleUsers } = await admin
        .from("profiles")
        .select("id")
        .eq("org_id", step.org_id)
        .eq("role", step.required_role)
        .eq("active", true);

      recipientIds = (roleUsers ?? []).map((u: { id: string }) => u.id);
    }

    if (recipientIds.length === 0) {
      return Response.json(
        { error: "Nenhum responsável ativo encontrado para esta etapa." },
        { status: 422 },
      );
    }

    recipientIds = [...new Set(recipientIds)];

    // 4) Busca nome/e-mail dos destinatários
    const { data: recipients, error: recipientsError } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", recipientIds);

    if (recipientsError) {
      return Response.json(
        { error: `Falha ao carregar destinatários: ${recipientsError.message}` },
        { status: 500 },
      );
    }

    const title = `Documento aguarda ${step.label}`;
    const body = `${doc.code ?? ""} — ${doc.title ?? ""}`.trim();

    // 5) Notificação interna (mesma tabela usada no resto do app)
    const notificationRows = recipientIds.map((userId) => ({
      org_id: step.org_id,
      user_id: userId,
      document_id: doc.id,
      type: "approval_required",
      title,
      body,
    }));

    const { error: notifyError } = await admin
      .from("notifications")
      .insert(notificationRows);

    if (notifyError) {
      return Response.json(
        { error: `Falha ao criar notificação interna: ${notifyError.message}` },
        { status: 500 },
      );
    }

    // 6) E-mail via Resend
    const emailResults: { user_id: string; email: string | null; ok: boolean; error?: string }[] = [];

    for (const recipient of recipients ?? []) {
      if (!recipient.email) {
        emailResults.push({
          user_id: recipient.id,
          email: null,
          ok: false,
          error: "Perfil sem e-mail cadastrado",
        });
        continue;
      }

      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: recipient.email,
            subject: title,
            html: `
              <div style="font-family: sans-serif; line-height: 1.6;">
                <p>Olá, ${recipient.full_name ?? ""}.</p>
                <p>${body || title}</p>
                <p>Etapa: <strong>${step.label}</strong></p>
                <p>
                  <a href="${APP_BASE_URL}/authenticated/biblioteca"
                     style="display:inline-block;padding:10px 18px;background:#2f7cf6;color:#fff;border-radius:8px;text-decoration:none;">
                    Acessar o sistema
                  </a>
                </p>
              </div>
            `,
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          emailResults.push({ user_id: recipient.id, email: recipient.email, ok: false, error: errorText });
        } else {
          emailResults.push({ user_id: recipient.id, email: recipient.email, ok: true });
        }
      } catch (err) {
        emailResults.push({
          user_id: recipient.id,
          email: recipient.email,
          ok: false,
          error: err instanceof Error ? err.message : "Erro desconhecido ao enviar e-mail",
        });
      }
    }

    return Response.json({
      success: true,
      step_id: stepId,
      document_id: doc.id,
      notified_internal: notificationRows.length,
      email_results: emailResults,
    });
  }),
};

/* Testar manualmente:

  curl -i --location --request POST 'https://ibnscyxzofgvavcwwoej.supabase.co/functions/v1/notify-tramite-step' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --header 'Content-Type: application/json' \
    --data '{"step_id":"<uuid de uma etapa com status active>"}'

*/