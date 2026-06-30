import { useState } from "react";
import {
  useCreateDocument,
  type CreateDocumentResult,
} from "@/hooks/useCreateDocument";
import type { IntelligentDocumentFormState } from "@/hooks/useDocumentCreationIntelligence";
import {
  normalizeDocumentCreationPayload,
  type DocumentCreationCapabilities,
  type DocumentCreationMode,
  type DocumentRiskLevel,
} from "@/lib/documentIntelligence";

interface CreateIntelligentDocumentInput {
  form: IntelligentDocumentFormState;
  mode: DocumentCreationMode;
  capabilities: DocumentCreationCapabilities;
  completenessScore: number;
  riskLevel: DocumentRiskLevel;
}

export function useCreateIntelligentDocument() {
  const baseCreation = useCreateDocument();
  const [validationError, setValidationError] = useState<string | null>(null);

  async function createIntelligentDocument(
    input: CreateIntelligentDocumentInput,
  ): Promise<CreateDocumentResult | null> {
    setValidationError(null);
    const { form, capabilities } = input;

    if (!form.title.trim()) {
      setValidationError("Informe o título do documento.");
      return null;
    }
    if (!form.doc_type) {
      setValidationError(
        "Selecione ou aplique uma sugestão de tipo documental.",
      );
      return null;
    }
    if (!form.area) {
      setValidationError("Selecione ou aplique uma sugestão de área.");
      return null;
    }
    if (form.review_period_months <= 0) {
      setValidationError("Informe um período de revisão válido.");
      return null;
    }

    const metadata = capabilities.metadata
      ? normalizeDocumentCreationPayload(form.metadata)
      : undefined;
    const advancedFields = normalizeDocumentCreationPayload({
      confidentiality: capabilities.confidentiality
        ? form.confidentiality
        : undefined,
      external_reference: capabilities.external_reference
        ? form.external_reference
        : undefined,
      source_system: capabilities.source_system
        ? form.source_system
        : undefined,
      metadata:
        metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
      tags: capabilities.tags && form.tags.length ? form.tags : undefined,
    });

    return baseCreation.createDocument({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      doc_type: form.doc_type,
      area: form.area,
      project_id:
        capabilities.project_id && form.project_id ? form.project_id : null,
      revision: form.revision,
      review_period_months: form.review_period_months,
      next_review_at: form.next_review_at || undefined,
      file: form.file,
      advancedFields,
      creationContext: {
        mode: input.mode,
        completenessScore: input.completenessScore,
        riskLevel: input.riskLevel,
      },
    });
  }

  return {
    createIntelligentDocument,
    loading: baseCreation.loading,
    error: validationError ?? baseCreation.error,
  };
}
