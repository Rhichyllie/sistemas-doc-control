import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { DOC_TYPES } from "@/lib/constants";
import { useDocumentTemplatesAndRules } from "@/hooks/useDocumentTemplatesAndRules";
import {
  assessDocumentCompleteness,
  buildCreationRecommendations,
  calculateInitialRevision,
  classifyDocumentRisk,
  getDocumentCreationModeCapabilities,
  inferArea,
  inferDocumentType,
  suggestNextReviewDate,
  suggestReviewPeriod,
  type DocumentCreationCapabilities,
  type DocumentCreationMode,
  type DocumentRiskLevel,
  type DocumentTypeCode,
} from "@/lib/documentIntelligence";
import {
  buildRequiredFieldChecklist,
  calculateGovernanceScore,
  mergeTemplateAndHeuristics,
} from "@/lib/documentTemplateRules";
import { supabase } from "@/lib/supabase";

export interface IntelligentDocumentFormState {
  title: string;
  description: string;
  doc_type: string;
  area: string;
  project_id: string;
  file: File | null;
  review_period_months: number;
  next_review_at: string;
  revision: number;
  confidentiality: string;
  external_reference: string;
  source_system: string;
  tags: string[];
  metadata: Record<string, unknown>;
  importJustification: string;
}

export interface DocumentTypeOption {
  value: DocumentTypeCode;
  label: string;
  default_review_months: number;
}

export interface DocumentAreaOption {
  value: string;
  label: string;
}

export interface DocumentProjectOption {
  id: string;
  code: string;
  name: string;
}

export type DocumentSuggestionType =
  | "type"
  | "area"
  | "review"
  | "revision"
  | "all";

const FALLBACK_AREAS: DocumentAreaOption[] = [
  { value: "SGI", label: "SGI — Sistema de Gestão Integrada" },
  { value: "ENG", label: "ENG — Engenharia" },
  { value: "OPS", label: "OPS — Operações" },
  { value: "MNT", label: "MNT — Manutenção" },
  { value: "SST", label: "SST — Saúde e Segurança" },
  { value: "MA", label: "MA — Meio Ambiente" },
  { value: "QUA", label: "QUA — Qualidade" },
  { value: "ADM", label: "ADM — Administrativo" },
];

const FALLBACK_REVIEW_PERIODS: Record<DocumentTypeCode, number> = {
  RNC: 6,
  IT: 12,
  PLN: 12,
  PRO: 24,
  ET: 24,
  DRW: 36,
  REG: 60,
  MAN: 36,
};

function fallbackDocumentTypes(): DocumentTypeOption[] {
  return DOC_TYPES.map((type) => ({
    value: type.value,
    label: type.label,
    default_review_months: FALLBACK_REVIEW_PERIODS[type.value],
  }));
}

function normalizeDocumentTypes(rows: unknown[]): DocumentTypeOption[] {
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      const value = String(
        record.code ?? record.value ?? record.doc_type ?? "",
      ).toUpperCase() as DocumentTypeCode;
      if (!DOC_TYPES.some((type) => type.value === value)) return null;
      if (record.is_active === false || record.active === false) return null;

      return {
        value,
        label: String(
          record.name ??
            record.label ??
            DOC_TYPES.find((type) => type.value === value)?.label ??
            value,
        ),
        default_review_months:
          Number(record.default_review_months) ||
          FALLBACK_REVIEW_PERIODS[value],
      };
    })
    .filter((option): option is DocumentTypeOption => Boolean(option));
}

function normalizeAreas(rows: unknown[]): DocumentAreaOption[] {
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      if (record.is_active === false || record.active === false) return null;
      const value = String(record.code ?? record.value ?? record.area ?? "");
      if (!value) return null;
      return {
        value,
        label: String(record.name ?? record.label ?? value),
      };
    })
    .filter((option): option is DocumentAreaOption => Boolean(option));
}

function normalizeProjects(rows: unknown[]): DocumentProjectOption[] {
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const name = typeof record.name === "string" ? record.name : "";
      if (
        !id ||
        !name ||
        ["cancelled", "archived"].includes(String(record.status))
      ) {
        return null;
      }
      return {
        id,
        code: typeof record.code === "string" ? record.code : "",
        name,
      };
    })
    .filter((project): project is DocumentProjectOption => Boolean(project));
}

async function probeDocumentColumn(column: string) {
  const { error } = await supabase
    .from("documents")
    .select(`id, ${column}`)
    .limit(0);
  return !error;
}

export function useDocumentCreationIntelligence(
  form: IntelligentDocumentFormState,
  mode: DocumentCreationMode,
) {
  const { profile } = useAuthContext();
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>(
    fallbackDocumentTypes,
  );
  const [areas, setAreas] = useState<DocumentAreaOption[]>(FALLBACK_AREAS);
  const [projects, setProjects] = useState<DocumentProjectOption[]>([]);
  const [capabilities, setCapabilities] =
    useState<DocumentCreationCapabilities>(
      getDocumentCreationModeCapabilities(null),
    );
  const [isLoadingConfigurations, setIsLoadingConfigurations] = useState(true);
  const [configurationMessage, setConfigurationMessage] = useState<
    string | null
  >(null);
  const templateGovernance = useDocumentTemplatesAndRules();

  useEffect(() => {
    let active = true;

    async function loadConfigurations() {
      if (!profile) {
        if (active) setIsLoadingConfigurations(false);
        return;
      }

      setIsLoadingConfigurations(true);
      const optionalColumns = [
        "confidentiality",
        "external_reference",
        "source_system",
        "metadata",
        "tags",
        "project_id",
      ] as const;

      const [typesResult, areasResult, projectsResult, ...columnResults] =
        await Promise.all([
          supabase.from("document_types").select("*"),
          supabase.from("document_areas").select("*"),
          supabase
            .from("projects")
            .select("id, code, name, status")
            .order("name", { ascending: true }),
          ...optionalColumns.map((column) => probeDocumentColumn(column)),
        ]);

      if (!active) return;

      const loadedTypes = !typesResult.error
        ? normalizeDocumentTypes(typesResult.data ?? [])
        : [];
      const loadedAreas = !areasResult.error
        ? normalizeAreas(areasResult.data ?? [])
        : [];
      const loadedProjects = !projectsResult.error
        ? normalizeProjects(projectsResult.data ?? [])
        : [];

      setDocumentTypes(
        loadedTypes.length ? loadedTypes : fallbackDocumentTypes(),
      );
      setAreas(loadedAreas.length ? loadedAreas : FALLBACK_AREAS);
      setProjects(loadedProjects);

      const detectedCapabilities = Object.fromEntries(
        optionalColumns.map((column, index) => [
          column,
          columnResults[index] === true,
        ]),
      ) as Partial<DocumentCreationCapabilities>;
      detectedCapabilities.project_id =
        detectedCapabilities.project_id === true && !projectsResult.error;
      setCapabilities(
        getDocumentCreationModeCapabilities(detectedCapabilities),
      );

      const fallbacks = [
        typesResult.error ? "tipos documentais locais" : null,
        areasResult.error ? "áreas locais" : null,
        projectsResult.error ? "projeto oculto" : null,
      ].filter(Boolean);
      setConfigurationMessage(
        fallbacks.length
          ? `Configuração compatível ativa: ${fallbacks.join(", ")}.`
          : null,
      );
      setIsLoadingConfigurations(false);
    }

    loadConfigurations();
    return () => {
      active = false;
    };
  }, [profile]);

  const selectedProject = projects.find(
    (project) => project.id === form.project_id,
  );
  const inferredType = useMemo(
    () =>
      inferDocumentType({
        title: form.title,
        description: form.description,
        doc_type: form.doc_type,
      }),
    [form.description, form.doc_type, form.title],
  );
  const inferredArea = useMemo(
    () =>
      inferArea({
        title: form.title,
        description: form.description,
        projectName: selectedProject?.name,
        selectedArea: form.area,
      }),
    [form.area, form.description, form.title, selectedProject?.name],
  );
  const effectiveType = inferredType ?? (form.doc_type as DocumentTypeCode);
  const configuredReviewPeriod = documentTypes.find(
    (type) => type.value === effectiveType,
  )?.default_review_months;
  const heuristicReviewPeriod = suggestReviewPeriod({
    doc_type: effectiveType,
    default_review_months: configuredReviewPeriod,
  });
  const initialRevisionSuggestion = calculateInitialRevision({
    mode,
    initialStatus: "draft",
    importJustification: form.importJustification,
  });

  const intelligenceInput = useMemo(
    () => ({
      ...form,
      projectName: selectedProject?.name,
      author_id: profile?.id,
      mode,
      initialStatus: "draft",
      hasFile: Boolean(form.file),
      criticalMetadataComplete: Boolean(
        form.description.trim().length >= 40 &&
        form.review_period_months &&
        form.next_review_at,
      ),
    }),
    [form, mode, profile?.id, selectedProject?.name],
  );
  const completeness = assessDocumentCompleteness(intelligenceInput);
  const heuristicRiskLevel: DocumentRiskLevel =
    classifyDocumentRisk(intelligenceInput);
  const heuristicRecommendations =
    buildCreationRecommendations(intelligenceInput);
  const governanceInput = {
    ...intelligenceInput,
    org_id: profile?.org_id,
    doc_type: form.doc_type || inferredType,
    area: form.area || inferredArea,
  };
  const governanceCompletionInput = {
    ...intelligenceInput,
    org_id: profile?.org_id,
  };
  const governanceEvaluation = templateGovernance.evaluate(governanceInput);
  const governanceDecision = mergeTemplateAndHeuristics({
    heuristic: {
      reviewPeriodMonths: heuristicReviewPeriod,
      riskLevel: heuristicRiskLevel,
      recommendations: heuristicRecommendations,
    },
    template: governanceEvaluation.template,
    appliedRules: governanceEvaluation.appliedRules,
    configuredReviewMonths: configuredReviewPeriod,
  });
  const reviewPeriodSuggestion = governanceDecision.reviewPeriodMonths;
  const nextReviewSuggestion = suggestNextReviewDate({
    doc_type: effectiveType,
    review_period_months: reviewPeriodSuggestion,
  });
  const riskLevel: DocumentRiskLevel =
    governanceDecision.riskProfile === "critical"
      ? "high"
      : governanceDecision.riskProfile;
  const recommendations = governanceDecision.recommendations;
  const requiredFieldChecklist = buildRequiredFieldChecklist(
    governanceCompletionInput,
    governanceEvaluation.template,
    governanceEvaluation.appliedRules,
  );
  const requiredFieldsMissing = requiredFieldChecklist
    .filter((item) => !item.isComplete)
    .map((item) => item.field);
  const governanceScore = calculateGovernanceScore(
    governanceCompletionInput,
    governanceEvaluation.template,
    governanceEvaluation.appliedRules,
  );
  const warnings = useMemo(() => {
    const items: string[] = [];
    if (!form.file) {
      items.push(
        "Nenhum arquivo selecionado. O documento será criado como cadastro preliminar.",
      );
    }
    if (!form.next_review_at) {
      items.push("A próxima revisão ainda não está definida.");
    }
    if (form.revision !== initialRevisionSuggestion && form.revision !== 0) {
      items.push(
        "A revisão manual informada é incomum para um documento novo.",
      );
    }
    if (riskLevel === "high") {
      items.push("Revise os metadados críticos antes de criar o documento.");
    }
    if (governanceDecision.riskProfile === "critical") {
      items.push(
        "Política documental crítica aplicada. Resolva todos os requisitos antes de criar.",
      );
    }
    if (
      governanceDecision.enforcedReviewPeriodMonths &&
      form.review_period_months !==
        governanceDecision.enforcedReviewPeriodMonths
    ) {
      items.push(
        `A política exige revisão em ${governanceDecision.enforcedReviewPeriodMonths} meses.`,
      );
    }
    return items;
  }, [
    form.file,
    form.next_review_at,
    form.review_period_months,
    form.revision,
    governanceDecision.enforcedReviewPeriodMonths,
    governanceDecision.riskProfile,
    initialRevisionSuggestion,
    riskLevel,
  ]);

  const applySuggestion = useCallback(
    (type: DocumentSuggestionType): Partial<IntelligentDocumentFormState> => {
      const patch: Partial<IntelligentDocumentFormState> = {};
      if (type === "type" || type === "all") {
        if (inferredType) patch.doc_type = inferredType;
      }
      if (type === "area" || type === "all") {
        patch.area = inferredArea;
      }
      if (type === "review" || type === "all") {
        patch.review_period_months = reviewPeriodSuggestion;
        if (nextReviewSuggestion) {
          patch.next_review_at = nextReviewSuggestion;
        }
      }
      if (type === "revision" || type === "all") {
        patch.revision = initialRevisionSuggestion;
      }
      if (
        type === "all" &&
        !form.description.trim() &&
        governanceDecision.defaultDescription
      ) {
        patch.description = governanceDecision.defaultDescription;
      }
      if (
        type === "all" &&
        capabilities.metadata &&
        Object.keys(governanceDecision.defaultMetadata).length
      ) {
        patch.metadata = {
          ...governanceDecision.defaultMetadata,
          ...form.metadata,
        };
      }
      return patch;
    },
    [
      capabilities.metadata,
      form.description,
      form.metadata,
      governanceDecision.defaultDescription,
      governanceDecision.defaultMetadata,
      inferredArea,
      inferredType,
      initialRevisionSuggestion,
      nextReviewSuggestion,
      reviewPeriodSuggestion,
    ],
  );

  return {
    suggestions: {
      type: inferredType,
      area: inferredArea,
      reviewPeriod: reviewPeriodSuggestion,
      nextReviewDate: nextReviewSuggestion,
      initialRevision: initialRevisionSuggestion,
    },
    inferredType,
    inferredArea,
    reviewPeriodSuggestion,
    nextReviewSuggestion,
    completenessScore: completeness.score,
    missingItems: completeness.missingItems,
    riskLevel,
    recommendations,
    warnings,
    capabilities,
    documentTypes,
    areas,
    projects,
    isLoadingConfigurations:
      isLoadingConfigurations || templateGovernance.isLoading,
    configurationMessage: [
      configurationMessage,
      templateGovernance.compatibilityMessage,
    ]
      .filter(Boolean)
      .join(" "),
    selectedTemplate: governanceEvaluation.template,
    appliedRules: governanceEvaluation.appliedRules,
    ruleExplanations: governanceEvaluation.explanations,
    requiredFieldChecklist,
    requiredFieldsMissing,
    governanceScore,
    governanceRiskProfile: governanceDecision.riskProfile,
    enforcedReviewPeriodMonths: governanceDecision.enforcedReviewPeriodMonths,
    reviewSource: governanceDecision.reviewSource,
    canUseTemplates: templateGovernance.canUseTemplates,
    canUseRules: templateGovernance.canUseRules,
    applySuggestion,
  };
}
