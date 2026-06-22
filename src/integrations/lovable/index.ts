// supabase/functions/send-approval-email/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// URL base do sistema. Troque pela URL de produção depois do deploy no Vercel.
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "http://localhost:5173";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { stepId, type } = await req.json();
    // type: "initial" (clique manual do Document Controller) ou "reminder" (lembrete automático)
    const notificationType = type === "reminder" ? "reminder" : "initial";

    if (!stepId) {
      return new Response(JSON.stringify({ error: "stepId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Buscar a etapa
    const { data: step, error: stepError } = await supabase
      .from("approval_steps")
      .select("*")
      .eq("id", stepId)
      .single();

    if (stepError || !step) {
      console.error("Erro ao buscar etapa:", stepError);
      return new Response(JSON.stringify({ error: "Etapa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!step.responsible_team_id) {
      return new Response(
        JSON.stringify({ error: "Esta etapa não tem um responsável vinculado à equipe" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar o membro da equipe (para pegar o e-mail)
    const { data: member, error: memberError } = await supabase
      .from("team")
      .select("*")
      .eq("id", step.responsible_team_id)
      .single();

    if (memberError || !member || !member.email) {
      console.error("Erro ao buscar membro da equipe:", memberError);
      return new Response(
        JSON.stringify({ error: "Responsável não encontrado ou sem e-mail cadastrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Buscar o fluxo e o documento
    const { data: flow, error: flowError } = await supabase
      .from("approval_flows")
      .select("*")
      .eq("id", step.flow_id)
      .single();

    if (flowError || !flow) {
      console.error("Erro ao buscar fluxo:", flowError);
      return new Response(JSON.stringify({ error: "Fluxo não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", flow.document_id)
      .single();

    if (docError || !document) {
      console.error("Erro ao buscar documento:", docError);
      return new Response(JSON.stringify({ error: "Documento não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Calcular prazo final
    const startedAt = step.started_at ? new Date(step.started_at) : new Date();
    const deadlineDate = new Date(startedAt);
    deadlineDate.setDate(deadlineDate.getDate() + (step.deadline_days || 5));
    const deadlineFormatted = deadlineDate.toLocaleDateString("pt-BR");

    // 5. Montar o link para o analista acessar o documento.
    // Prioridade: link externo cadastrado no documento (SharePoint, GED, ECM...).
    // Se não houver, cai no link do próprio sistema (Fluxo de Aprovação).
    const analysisLink = document.external_link
      ? document.external_link
      : `${APP_BASE_URL}/authenticated/fluxo-de-aprovacao?documentId=${document.id}&stepId=${step.id}`;
    const buttonLabel = document.external_link ? "Acessar Documento" : "Acessar no Sistema";

    // 6. Montar conteúdo do e-mail
    const isReminder = notificationType === "reminder";
    const subject = isReminder
      ? `Lembrete: Análise pendente — ${document.code}`
      : `Documento para análise — ${document.code}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #1d4ed8;">${isReminder ? "Lembrete de Análise Pendente" : "Novo Documento para Análise"}</h2>
        <p>Olá, ${member.name},</p>
        <p>
          ${isReminder
            ? "Este é um lembrete: o documento abaixo ainda aguarda o seu parecer."
            : "Você foi designado(a) como responsável pela análise do documento abaixo."}
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 4px 0; color: #6b7280;">Código</td><td style="padding: 4px 0; font-weight: bold;">${document.code}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Título</td><td style="padding: 4px 0; font-weight: bold;">${document.title}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Setor / Etapa</td><td style="padding: 4px 0; font-weight: bold;">${step.sector}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Prazo final</td><td style="padding: 4px 0; font-weight: bold; color: #dc2626;">${deadlineFormatted}</td></tr>
        </table>
        <p>
          <a href="${analysisLink}" style="display: inline-block; background-color: #1d4ed8; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            ${buttonLabel}
          </a>
        </p>
        <p style="font-size: 13px; color: #6b7280; margin-top: 24px;">
          Você continuará recebendo lembretes periódicos até que o parecer seja registrado no sistema.
        </p>
      </div>
    `;

    // 7. Enviar via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Doc Control <onboarding@resend.dev>",
        to: [member.email],
        subject,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Erro ao enviar e-mail via Resend:", resendData);
      return new Response(JSON.stringify({ error: "Falha ao enviar e-mail", details: resendData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Registrar a notificação enviada (histórico, base para os lembretes)
    const { error: notifError } = await supabase.from("approval_notifications").insert({
      step_id: step.id,
      sent_to_email: member.email,
      type: notificationType,
    });

    if (notifError) {
      console.error("Erro ao registrar notificação:", notifError);
      // Não falha a resposta por isso, o e-mail já foi enviado
    }

    return new Response(JSON.stringify({ success: true, sentTo: member.email }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro inesperado na função send-approval-email:", err);
    return new Response(JSON.stringify({ error: "Erro interno", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
