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
    if (!libraryId) {
      setError("Selecione uma biblioteca antes de atualizar o documento.");
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

      const { error: updateError } = await supabase
        .from("documents")
        .update(basePayload)
        .eq("id", documentId)
        .eq("org_id", profile.org_id)
        .eq("library_id", libraryId);

      if (updateError && isMissingDocumentsSchema(updateError)) {
        const localDocuments = loadLocalDocuments(profile.org_id);
        const nextDocuments = localDocuments.map((document) =>
          document.id === documentId && document.library_id === libraryId
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

      const { error: optionalError } = await supabase
        .from("documents")
        .update(optionalPayload)
        .eq("id", documentId)
        .eq("org_id", profile.org_id)
        .eq("library_id", libraryId);

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
    if (!libraryId) {
      setError("Selecione uma biblioteca antes de excluir o documento.");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId)
        .eq("org_id", profile.org_id)
        .eq("library_id", libraryId);

      if (deleteError && isMissingDocumentsSchema(deleteError)) {
        const nextDocuments = loadLocalDocuments(profile.org_id).filter(
          (document) =>
            document.id !== documentId || document.library_id !== libraryId,
        );
        saveLocalDocuments(profile.org_id, nextDocuments);
        return {
          warning:
            "Documento excluído localmente neste navegador porque a tabela documents não está disponível.",
        };
      }

      if (deleteError) {
        throw deleteError;
      }

      return {};
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível excluir o documento."));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { updateDocument, deleteDocument, loading, error };
}
