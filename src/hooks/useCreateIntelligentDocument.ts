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
import {
  validateDocumentCreation,
  validateSelectedProject,
} from "@/lib/documentCreationValidation";
import {
  DOCUMENT_RULE_FIELD_LABELS,
  type DocumentRuleField,
} from "@/lib/documentTemplateRules";

export interface CreateIntelligentDocumentInput {
  form: IntelligentDocumentFormState;
  mode: DocumentCreationMode;
  capabilities: DocumentCreationCapabilities;
  completenessScore: number;
  riskLevel: DocumentRiskLevel;
  availableProjectIds: string[];
  governance: {
    templateId: string | null;
    templateName: string | null;
    appliedRuleIds: string[];
    governanceScore: number;
    requiredFieldsMissing: DocumentRuleField[];
    enforcedReviewPeriodMonths: number | null;
  };
  coding: {
    previewCode: string | null;
    patternId: string | null;
    previewMode: string;
  };
  projectContext: {
    code: string;
    name: string;
    client: string | null;
    contract: string | null;
  } | null;
}

export function getIntelligentDocumentValidationErrors(
  input: CreateIntelligentDocumentInput,
) {
  const errors = validateDocumentCreation({
    ...input.form,
    project_id: input.capabilities.project_id ? input.form.project_id : null,
  });
  const projectError = validateSelectedProject(input.form.project_id, {
    projectCapabilityAvailable: input.capabilities.project_id,
    availableProjectIds: input.availableProjectIds,
  });
  if (projectError) errors.push(projectError);
  if (input.governance.requiredFieldsMissing.length) {
    errors.push(
      `Preencha os campos obrigatórios da política: ${input.governance.requiredFieldsMissing
        .map((field) => DOCUMENT_RULE_FIELD_LABELS[field])
        .join(", ")}.`,
    );
  }
  if (
    input.governance.enforcedReviewPeriodMonths &&
    input.form.review_period_months !==
      input.governance.enforcedReviewPeriodMonths
  ) {
    errors.push(
      `A política documental exige revisão em ${input.governance.enforcedReviewPeriodMonths} meses. Aplique a sugestão antes de criar.`,
    );
  }
  return errors;
}

export function useCreateIntelligentDocument() {
  const baseCreation = useCreateDocument();
  const [validationError, setValidationError] = useState<string | null>(null);

  async function createIntelligentDocument(
    input: CreateIntelligentDocumentInput,
  ): Promise<CreateDocumentResult | null> {
    setValidationError(null);
    const { form, capabilities } = input;
    const validationErrors = getIntelligentDocumentValidationErrors(input);
    if (validationErrors.length) {
      setValidationError(validationErrors[0]);
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
        templateId: input.governance.templateId,
        templateName: input.governance.templateName,
        appliedRuleIds: input.governance.appliedRuleIds,
        governanceScore: input.governance.governanceScore,
        requiredFieldsMissing: input.governance.requiredFieldsMissing,
        codePreview: input.coding.previewCode,
        codePatternId: input.coding.patternId,
        codePreviewMode: input.coding.previewMode,
        requestCodeAllocation: true,
        projectCode: input.projectContext?.code ?? null,
        projectName: input.projectContext?.name ?? null,
        projectClient: input.projectContext?.client ?? null,
        projectContract: input.projectContext?.contract ?? null,
      },
    });
  }

  return {
    createIntelligentDocument,
    getValidationErrors: getIntelligentDocumentValidationErrors,
    loading: baseCreation.loading,
    error: validationError ?? baseCreation.error,
  };
}
