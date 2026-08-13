import { useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useLibraryScope } from "@/contexts/library-context";
import { loadLocalDocuments, saveLocalDocuments } from "@/hooks/useDocuments";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";

export interface UpdateDocumentInput {
  title: string;
  doc_type: string;
  area: string;
  description?: string | null;
  project_id?: string | null;
  discipline_id?: string | null;
  revision?: number;
  register_revision?: string | null;
  register_status?: string | null;
  review_period_months?: number;
  next_review_at?: string | null;
  received_at?: string | null;
  analysis_days?: number | null;
  analysis_deadline?: string | null;
  external_link?: string | null;
}

function isMissingDocumentsSchema(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = String(record.code ?? "").toUpperCase();
  const message = [record.message, record.details, record.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("documents") &&
      (message.includes("does not exist") || message.includes("schema cache")))
  );
}

function isOptionalRegisterFieldError(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = String(record.code ?? "").toUpperCase();
  const message = [record.message, record.details, record.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (["42703", "PGRST204", "PGRST200"].includes(code)) return true;

  return [
    "discipline_id",
    "received_at",
    "analysis_days",
    "analysis_deadline",
    "external_link",
    "register_status",
    "register_revision",
  ].some((term) => message.includes(term));
}

export function useManageDocuments() {
  const { profile } = useAuthContext();
  const { libraryId } = useLibraryScope();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateDocument(
    documentId: string,
    input: UpdateDocumentInput,
  ): Promise<{ warning?: string } | null> {
    if (!profile) {
      setError("Usuário não autenticado.");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const basePayload = {
        title: input.title.trim(),
        doc_type: input.doc_type,
        area: input.area,
        description: input.description?.trim() || null,
        project_id: input.project_id || null,
        revision: input.revision ?? 0,
        review_period_months: input.review_period_months ?? 24,
        next_review_at: input.next_review_at || null,
        updated_at: now,
      };

      const baseMatch: Record<string, unknown> = {
        id: documentId,
        org_id: profile.org_id,
      };
      if (libraryId) baseMatch.library_id = libraryId;

      const buildUpdateQuery = (payload: Record<string, unknown>) => {
        const q = supabase.from("documents").update(payload);
        Object.entries(baseMatch).forEach(([key, value]) => {
          q.eq(key, value);
        });
        return q;
      };

      const { error: updateError } = await buildUpdateQuery(basePayload);

      if (updateError && isMissingDocumentsSchema(updateError)) {
        const localDocuments = loadLocalDocuments(profile.org_id);
        const nextDocuments = localDocuments.map((document) =>
          (!libraryId || document.library_id === libraryId) && document.id === documentId
            ? {
                ...document,
                ...basePayload,
                discipline_id: input.discipline_id || null,
                register_revision: input.register_revision?.trim() || null,
                register_status: input.register_status?.trim() || null,
                received_at: input.received_at || null,
                analysis_days: input.analysis_days ?? null,
                analysis_deadline: input.analysis_deadline || null,
                external_link: input.external_link?.trim() || null,
              }
            : document,
        );
        saveLocalDocuments(profile.org_id, nextDocuments);
        return {
          warning:
            "Documento atualizado localmente neste navegador porque a tabela documents não está disponível.",
        };
      }

      if (updateError) {
        throw updateError;
      }

      const optionalPayload = {
        discipline_id: input.discipline_id || null,
        register_revision: input.register_revision?.trim() || null,
        register_status: input.register_status?.trim() || null,
        received_at: input.received_at || null,
        analysis_days: input.analysis_days ?? null,
        analysis_deadline: input.analysis_deadline || null,
        external_link: input.external_link?.trim() || null,
        updated_at: now,
      };

      const { error: optionalError } = await buildUpdateQuery(optionalPayload);

      if (optionalError && !isOptionalRegisterFieldError(optionalError)) {
        throw optionalError;
      }

      return optionalError
        ? {
            warning:
              "Documento atualizado, mas alguns campos operacionais não puderam ser sincronizados neste ambiente.",
          }
        : {};
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível atualizar o documento."));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function deleteDocument(
    documentId: string,
  ): Promise<{ warning?: string } | null> {
    if (!profile) {
      setError("Usuário não autenticado.");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Validações de regra de negócio ANTES de tentar o delete.
      // 1. Carrega status do documento + vínculos para não excluir em cascata
      //    sem o usuário saber (viola regra: se está em fluxo, cancele o fluxo primeiro).
      const docCheckQ = supabase
        .from("documents")
        .select("id,status,title")
        .eq("id", documentId)
        .eq("org_id", profile.org_id)
        .maybeSingle();

      const activeInstancesQ = supabase
        .from("document_tramite_instances")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .eq("org_id", profile.org_id)
        .in("status", ["active", "pending", "started"]);

      const closedInstancesQ = supabase
        .from("document_tramite_instances")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .eq("org_id", profile.org_id)
        .in("status", ["completed", "approved", "rejected", "failed", "cancelled"])
        .limit(1);

      const [docCheckSettled, activeSettled, closedSettled] = await Promise.allSettled([
        docCheckQ,
        activeInstancesQ,
        closedInstancesQ,
      ]);

      const docCheck = docCheckSettled.status === "fulfilled" ? docCheckSettled.value : null;
      const activeInstances =
        activeSettled.status === "fulfilled"
          ? activeSettled.value
          : { data: null, count: null, error: null };
      const closedInstances =
        closedSettled.status === "fulfilled"
          ? closedSettled.value
          : { data: null, count: null, error: null };

      const docStatus = docCheck?.data?.status ? String(docCheck.data.status) : null;

      const NON_DELETABLE_STATUSES = new Set([
        "approved",
        "approved_with_comments",
        "published",
        "aprovado",
        "received",
        "in_analysis",
        "awaiting_revision",
      ]);
      if (docStatus && NON_DELETABLE_STATUSES.has(docStatus)) {
        const label = (() => {
          switch (docStatus) {
            case "approved":
            case "approved_with_comments":
            case "aprovado":
              return "aprovado";
            case "published":
              return "publicado";
            case "received":
              return "recebido";
            case "in_analysis":
              return "em análise";
            case "awaiting_revision":
              return "aguardando revisão formal";
            default:
              return docStatus;
          }
        })();
        setError(
          `Documento ${label} não pode ser excluído. Somente rascunhos, rejeitados ou cancelados são removíveis. Revogue/arquive o documento se ele já foi consolidado.`,
        );
        return null;
      }

      if ((activeInstances.count ?? 0) > 0) {
        setError(
          `Este documento está vinculado a ${activeInstances.count} fluxo(s) em andamento. Primeiro encerre (cancele) o(s) fluxo(s) de aprovação associados, e depois exclua o documento.`,
        );
        return null;
      }

      if ((closedInstances.count ?? 0) > 0) {
        setError(
          `Este documento já possui histórico de trâmites concluídos/enviados e não pode ser excluído para preservar a rastreabilidade. Em vez disso, você pode arquivá-lo ou marcá-lo como obsoleto.`,
        );
        return null;
      }

      const baseMatch: Record<string, unknown> = { id: documentId };

      const buildDeleteQuery = (match: Record<string, unknown>) => {
        const q = supabase.from("documents").delete({ count: "exact" });
        Object.entries(match).forEach(([key, value]) => {
          q.eq(key, value);
        });
        return q.select("id");
      };

      const attempts: Array<Record<string, unknown>> = [baseMatch];
      if (libraryId) {
        attempts.push({ id: documentId, library_id: libraryId });
      }
      attempts.push({ id: documentId, org_id: profile.org_id });
      if (libraryId) {
        attempts.push({
          id: documentId,
          org_id: profile.org_id,
          library_id: libraryId,
        });
      }

      let deletedRows: Array<{ id: string }> = [];
      let primaryError: unknown = null;

      for (const attempt of attempts) {
        try {
          const { data, error } = await buildDeleteQuery(attempt);
          if (Array.isArray(data) && data.length > 0) {
            deletedRows = data as Array<{ id: string }>;
            primaryError = null;
            break;
          }
          if (error && !isMissingDocumentsSchema(error)) {
            primaryError = error;
          }
        } catch (err) {
          if (!primaryError) primaryError = err;
        }
      }

      try {
        const nextLocal = loadLocalDocuments(profile.org_id).filter(
          (document) => document.id !== documentId,
        );
        saveLocalDocuments(profile.org_id, nextLocal);
      } catch {
        // ignora erros de persistência local
      }

      if (deletedRows.length > 0) {
        return {};
      }

      if (primaryError && isMissingDocumentsSchema(primaryError as { code?: string; message?: string })) {
        return {
          warning:
            "Documento excluído localmente neste navegador porque a tabela documents não está disponível.",
        };
      }

      if (primaryError) {
        throw primaryError;
      }

      return {
        warning:
          "Documento removido da lista. Atualize a página para confirmar a exclusão no banco.",
      };
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível excluir o documento."));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { updateDocument, deleteDocument, loading, error };
}
