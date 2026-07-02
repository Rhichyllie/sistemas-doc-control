import { useMemo } from "react";
import { useDocumentTramiteTemplates } from "@/hooks/useDocumentTramiteTemplates";
import type { DocumentTramiteTemplate } from "@/lib/documentTramiteModel";

interface DocumentTramiteSuggestionInput {
  docType?: string | null;
  area?: string | null;
  projectId?: string | null;
}

function matches(
  template: DocumentTramiteTemplate,
  input: DocumentTramiteSuggestionInput,
) {
  if (template.project_id && template.project_id !== input.projectId) {
    return false;
  }
  if (
    template.doc_type &&
    template.doc_type.toUpperCase() !== input.docType?.toUpperCase()
  ) {
    return false;
  }
  if (
    template.area &&
    template.area.toUpperCase() !== input.area?.toUpperCase()
  ) {
    return false;
  }
  if (template.template_scope === "project" && !template.project_id) {
    return false;
  }
  if (template.template_scope === "type" && !template.doc_type) return false;
  if (template.template_scope === "area" && !template.area) return false;
  if (
    template.template_scope === "area_type" &&
    (!template.area || !template.doc_type)
  ) {
    return false;
  }
  return true;
}

function specificity(template: DocumentTramiteTemplate) {
  return (
    (template.project_id ? 8 : 0) +
    (template.doc_type ? 4 : 0) +
    (template.area ? 2 : 0) +
    (template.is_default ? 1 : 0)
  );
}

function suggestionReason(
  template: DocumentTramiteTemplate | null,
  input: DocumentTramiteSuggestionInput,
) {
  if (!template) return null;
  const matches: string[] = [];
  if (template.project_id === input.projectId && template.project_id) {
    matches.push("projeto");
  }
  if (
    template.doc_type &&
    template.doc_type.toUpperCase() === input.docType?.toUpperCase()
  ) {
    matches.push("tipo documental");
  }
  if (
    template.area &&
    template.area.toUpperCase() === input.area?.toUpperCase()
  ) {
    matches.push("área");
  }
  if (!matches.length && template.is_default) {
    return "Modelo padrão publicado da organização.";
  }
  return matches.length
    ? `Correspondência por ${matches.join(", ")}.`
    : "Modelo publicado aplicável ao contexto informado.";
}

export function useDocumentTramiteSuggestion(
  input: DocumentTramiteSuggestionInput,
) {
  const catalog = useDocumentTramiteTemplates();
  const { docType, area, projectId } = input;
  const suggestedTramite = useMemo(
    () =>
      [...catalog.publishedTemplates]
        .filter((template) => matches(template, { docType, area, projectId }))
        .sort((left, right) => {
          const score = specificity(right) - specificity(left);
          if (score !== 0) return score;
          return left.updated_at.localeCompare(right.updated_at);
        })[0] ?? null,
    [area, catalog.publishedTemplates, docType, projectId],
  );

  return {
    suggestedTramite,
    suggestionReason: suggestionReason(suggestedTramite, {
      docType,
      area,
      projectId,
    }),
    isLoading: catalog.isLoading,
    schemaStatus: catalog.schemaStatus,
    compatibilityMessage:
      catalog.schemaStatus === "not_installed"
        ? null
        : catalog.schemaStatus === "restricted"
          ? "Os modelos de trâmite não puderam ser consultados por permissão."
          : null,
  };
}
