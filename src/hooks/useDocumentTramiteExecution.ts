import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  buildExecutionErrorMessage,
  stripTramiteUuid,
} from "@/lib/documentTramiteExecution";

interface StartTramiteInput {
  documentId: string;
  templateId?: string | null;
  templateVersionId?: string | null;
  metadata?: Record<string, unknown>;
}

interface CompleteTramiteStepInput {
  stepId: string;
  decision?: string;
  comment?: string | null;
  metadata?: Record<string, unknown>;
}

interface CancelTramiteInput {
  instanceId: string;
  reason: string;
}

export interface TramiteExecutionRpcResult {
  success: boolean;
  instance_id?: string;
  template_id?: string;
  template_version_id?: string;
  completed_step_id?: string;
  active_steps?: string[];
  activated_steps?: string[];
  current_node_keys?: string[];
  instance_status?: string;
  status?: string;
  message?: string;
  delegated?: boolean;
  delegated_from_user_id?: string | null;
}

export function useDocumentTramiteExecution(
  refresh?: () => Promise<unknown> | unknown,
) {
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startInstance = useCallback(
    async (input: StartTramiteInput) => {
      setIsStarting(true);
      setError(null);
      const documentId = stripTramiteUuid(input.documentId) ?? input.documentId;
      const templateId = stripTramiteUuid(input.templateId) ?? input.templateId ?? null;
      const templateVersionId = stripTramiteUuid(input.templateVersionId) ?? input.templateVersionId ?? null;
      const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!documentId || !UUID_ANY.test(String(documentId))) {
        const message = `O documento selecionado é inválido ou não está disponível nesta organização (documentId=${String(documentId)}).`;
        setError(message);
        setIsStarting(false);
        throw new Error(message);
      }
      if (templateId && !UUID_ANY.test(String(templateId))) {
        const message = `O modelo de fluxo selecionado é inválido nesta organização (templateId=${String(templateId)}).`;
        setError(message);
        setIsStarting(false);
        throw new Error(message);
      }
      if (templateVersionId && !UUID_ANY.test(String(templateVersionId))) {
        const message = `A versão do modelo de fluxo selecionada é inválida (templateVersionId=${String(templateVersionId)}).`;
        setError(message);
        setIsStarting(false);
        throw new Error(message);
      }
      const { data: docCheck, error: docCheckError } = await supabase
        .from("documents")
        .select("id, org_id, code, title")
        .eq("id", documentId)
        .limit(1)
        .maybeSingle();
      if (docCheckError) {
        const isRlsPolicy =
          (docCheckError as { code?: string })?.code === "PGRST106" ||
          String(docCheckError.message ?? "").toLowerCase().includes("row-level security") ||
          String(docCheckError.message ?? "").toLowerCase().includes("policy") ||
          String(docCheckError.details ?? "").toLowerCase().includes("policy");
        const prefix = isRlsPolicy
          ? "A política de segurança (RLS) bloqueou o acesso a este documento nesta organização."
          : "Não foi possível validar o documento para iniciar o fluxo.";
        const message = buildExecutionErrorMessage(
          docCheckError,
          prefix,
          { p_document_id: documentId },
        );
        setError(message);
        setIsStarting(false);
        throw new Error(message);
      }
      if (!docCheck) {
        const message = `Documento não encontrado nesta organização. Verifique o UUID enviado e tente novamente. (p_document_id=${documentId} · templateId=${String(templateId ?? "null")})`;
        setError(message);
        setIsStarting(false);
        throw new Error(message);
      }
      if (templateId) {
        const { data: tplCheck, error: tplCheckError } = await supabase
          .from("document_tramite_templates")
          .select("id, org_id, status, is_active")
          .eq("id", templateId)
          .limit(1)
          .maybeSingle();
        if (tplCheckError) {
          const isRlsPolicy =
            (tplCheckError as { code?: string })?.code === "PGRST106" ||
            String(tplCheckError.message ?? "").toLowerCase().includes("row-level security");
          const prefix = isRlsPolicy
            ? "A política de segurança (RLS) bloqueou o acesso a este modelo de fluxo."
            : "Não foi possível validar o modelo para iniciar o fluxo.";
          const message = buildExecutionErrorMessage(
            tplCheckError,
            prefix,
            { p_template_id: templateId },
          );
          setError(message);
          setIsStarting(false);
          throw new Error(message);
        }
        if (!tplCheck) {
          const message = `Modelo de fluxo não encontrado nesta organização. (p_template_id=${templateId})`;
          setError(message);
          setIsStarting(false);
          throw new Error(message);
        }
      }
      const { data, error: rpcError } = await supabase.rpc(
        "start_document_tramite_instance",
        {
          p_document_id: documentId,
          p_template_id: templateId,
          p_template_version_id: templateVersionId,
          p_metadata: input.metadata ?? {},
        },
      );
      setIsStarting(false);
      if (rpcError) {
        const message = buildExecutionErrorMessage(
          rpcError,
          "Não foi possível iniciar o trâmite.",
          {
            p_document_id: documentId,
            p_template_id: templateId ?? "null",
            p_template_version_id: templateVersionId ?? "null",
            doc_org_id: docCheck.org_id ?? "null",
            doc_code: docCheck.code ?? "null",
          },
        );
        setError(message);
        throw new Error(message);
      }
      const result = data as TramiteExecutionRpcResult;
      if (result.success === false) {
        const message =
          result.message || "O banco recusou o início do trâmite.";
        setError(message);
        throw new Error(message);
      }
      await refresh?.();
      return result;
    },
    [refresh],
  );

  const completeStep = useCallback(
    async (input: CompleteTramiteStepInput) => {
      setIsCompleting(true);
      setError(null);
      const stepId = stripTramiteUuid(input.stepId) ?? input.stepId;
      const { data, error: rpcError } = await supabase.rpc(
        "complete_document_tramite_step",
        {
          p_step_id: stepId,
          p_decision: input.decision ?? "completed",
          p_comment: input.comment?.trim() || null,
          p_metadata: input.metadata ?? {},
        },
      );
      setIsCompleting(false);
      if (rpcError) {
        const message = buildExecutionErrorMessage(
          rpcError,
          "Não foi possível concluir a etapa.",
          {
            p_step_id: stepId,
            p_decision: input.decision ?? "completed",
          },
        );
        setError(message);
        throw new Error(message);
      }
      const result = data as TramiteExecutionRpcResult;
      await refresh?.();
      if (result.success === false) {
        const message =
          result.message ||
          "A etapa foi registrada, mas a execução ficou sem caminho aplicável.";
        setError(message);
        throw new Error(message);
      }
      return result;
    },
    [refresh],
  );

  const cancelInstance = useCallback(
    async (input: CancelTramiteInput) => {
      setIsCancelling(true);
      setError(null);
      const instanceId = stripTramiteUuid(input.instanceId) ?? input.instanceId;
      const { data, error: rpcError } = await supabase.rpc(
        "cancel_document_tramite_instance",
        {
          p_instance_id: instanceId,
          p_reason: input.reason.trim(),
        },
      );
      setIsCancelling(false);
      if (rpcError) {
        const message = buildExecutionErrorMessage(
          rpcError,
          "Não foi possível cancelar o trâmite.",
          { p_instance_id: instanceId },
        );
        setError(message);
        throw new Error(message);
      }
      const result = data as TramiteExecutionRpcResult;
      if (result.success === false) {
        const message =
          result.message || "O banco recusou o cancelamento do trâmite.";
        setError(message);
        throw new Error(message);
      }
      await refresh?.();
      return result;
    },
    [refresh],
  );

  return {
    startInstance,
    completeStep,
    cancelInstance,
    isStarting,
    isCompleting,
    isCancelling,
    error,
    clearError: () => setError(null),
  };
}
