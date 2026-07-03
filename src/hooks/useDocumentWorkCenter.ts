import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useApprovalQueue } from "@/hooks/useApprovalQueue";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import { useDocuments, type Document } from "@/hooks/useDocuments";
import { useOperationalCalendar } from "@/hooks/useOperationalCalendar";
import { useTeamAvailability } from "@/hooks/useTeamAvailability";
import { useDocumentTramiteInstances } from "@/hooks/useDocumentTramiteInstances";
import { useDocumentTramiteTemplates } from "@/hooks/useDocumentTramiteTemplates";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { useWorkflowActors } from "@/hooks/useWorkflowActors";
import {
  buildWorkItemAction,
  calculateWorkItemPriority,
  daysUntilWorkItem,
  groupWorkItems,
  normalizeWorkItemStatus,
  sortWorkItemsByUrgency,
  type DocumentWorkItem,
} from "@/lib/documentWorkCenter";
import {
  summarizeInstance,
  type DocumentTramiteInstance,
  type DocumentTramiteInstanceStep,
} from "@/lib/documentTramiteExecution";
import type { DocumentTramiteTemplate } from "@/lib/documentTramiteModel";
import { getAbsenceTypeLabel } from "@/lib/teamAvailability";
import { supabase } from "@/lib/supabase";

export type WorkCenterSchemaStatus = "ready" | "not_installed" | "restricted";

export interface DocumentWorkCenterInstance {
  id: string;
  documentId: string;
  documentCode: string | null;
  documentTitle: string;
  projectId: string | null;
  projectName: string | null;
  templateName: string;
  instanceCode: string | null;
  activeStepLabels: string[];
  progress: number;
  dueAt: string | null;
  dueAtSuggested: boolean;
  deadlineMode: "operational_calendar" | "simple_date";
  isOverdue: boolean;
  isMine: boolean;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMissingCodingSchema(error: unknown) {
  if (!isRecord(error)) return false;
  const code = String(error.code ?? "").toUpperCase();
  const message = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    ["42703", "PGRST204", "PGRST205"].includes(code) ||
    message.includes("code_generation_mode") ||
    message.includes("manual_code") ||
    message.includes("code_pattern_id")
  );
}

function templateApplies(
  template: DocumentTramiteTemplate,
  document: Document,
) {
  return (
    template.is_active &&
    template.status === "published" &&
    (!template.project_id || template.project_id === document.project_id) &&
    (!template.doc_type ||
      template.doc_type.toUpperCase() === document.doc_type.toUpperCase()) &&
    (!template.area ||
      template.area.toUpperCase() === document.area.toUpperCase())
  );
}

function templateSpecificity(
  template: DocumentTramiteTemplate,
  document: Document,
) {
  return (
    (template.project_id === document.project_id && template.project_id
      ? 8
      : 0) +
    (template.doc_type === document.doc_type && template.doc_type ? 4 : 0) +
    (template.area === document.area && template.area ? 2 : 0) +
    (template.is_default ? 1 : 0)
  );
}

function isStepAssignedToProfile(
  step: DocumentTramiteInstanceStep,
  document: Document | undefined,
  profile: { id: string; role: string } | null,
  groupIds: Set<string>,
) {
  if (!profile) return false;
  const assignment = step.assignment_type ?? "none";
  if (
    assignment === "none" ||
    assignment === "author" ||
    assignment === "document_owner"
  ) {
    return document?.author_id === profile.id;
  }
  if (assignment === "specific_user") {
    return step.assignee_user_id === profile.id;
  }
  if (assignment === "approval_group") {
    return Boolean(
      step.assignee_group_id && groupIds.has(step.assignee_group_id),
    );
  }
  return assignment === "role" && step.required_role === profile.role;
}

export function useDocumentWorkCenter() {
  const { profile } = useAuthContext();
  const documentsState = useDocuments();
  const approvalState = useApprovalQueue();
  const tramiteState = useDocumentTramiteInstances({
    loadAllSteps: true,
    recentLimit: 500,
  });
  const templatesState = useDocumentTramiteTemplates();
  const actorsState = useWorkflowActors();
  const auditState = useAuditTrail();
  const projectsState = useProjectOptions();
  const calendarState = useOperationalCalendar();
  const availabilityState = useTeamAvailability();
  const [codingStatus, setCodingStatus] =
    useState<WorkCenterSchemaStatus>("ready");
  const [codingMessage, setCodingMessage] = useState<string | null>(null);
  const [codingLoading, setCodingLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function probeCoding() {
      if (!profile?.org_id) {
        if (active) {
          setCodingStatus("restricted");
          setCodingMessage("Seu perfil não possui organização válida.");
          setCodingLoading(false);
        }
        return;
      }
      setCodingLoading(true);
      const { error } = await supabase
        .from("documents")
        .select("id, manual_code, code_pattern_id, code_generation_mode")
        .eq("org_id", profile.org_id)
        .limit(0);
      if (!active) return;
      if (!error) {
        setCodingStatus("ready");
        setCodingMessage(null);
      } else if (isMissingCodingSchema(error)) {
        setCodingStatus("not_installed");
        setCodingMessage(
          "Controles avançados de criação/codificação ainda não instalados.",
        );
      } else {
        setCodingStatus("restricted");
        setCodingMessage(
          "Não foi possível confirmar os controles avançados de codificação por permissão.",
        );
      }
      setCodingLoading(false);
    }
    void probeCoding();
    return () => {
      active = false;
    };
  }, [profile?.org_id]);

  const result = useMemo(() => {
    const documentsById = new Map(
      documentsState.documents.map((document) => [document.id, document]),
    );
    const instancesByDocument = new Map<string, DocumentTramiteInstance[]>();
    for (const instance of tramiteState.instances) {
      const current = instancesByDocument.get(instance.document_id) ?? [];
      current.push(instance);
      instancesByDocument.set(instance.document_id, current);
    }
    const stepsByInstance = new Map<string, DocumentTramiteInstanceStep[]>();
    for (const step of tramiteState.steps) {
      const current = stepsByInstance.get(step.instance_id) ?? [];
      current.push(step);
      stepsByInstance.set(step.instance_id, current);
    }
    const templatesById = new Map(
      templatesState.templates.map((template) => [template.id, template]),
    );
    const usersById = new Map(
      actorsState.users.map((user) => [user.id, user.full_name]),
    );
    const groupsById = new Map(
      actorsState.groups.map((group) => [group.id, group.name]),
    );
    const profileGroupIds = new Set(
      actorsState.groupMembers
        .filter(
          (member) =>
            member.user_id === profile?.id && member.is_active !== false,
        )
        .map((member) => member.group_id),
    );
    const isManager = profile?.role === "admin" || profile?.role === "manager";
    const workItems: DocumentWorkItem[] = [];

    function deadlineFields(
      dueAt: string | null,
      suggested = false,
      policyName: string | null = null,
    ) {
      const businessDaysRemaining = dueAt
        ? calendarState.canUseCalendar
          ? calendarState.getBusinessDaysUntil(dueAt.slice(0, 10))
          : daysUntilWorkItem(dueAt)
        : null;
      return {
        dueAt,
        dueAtSuggested: suggested,
        deadlineMode: calendarState.canUseCalendar
          ? ("operational_calendar" as const)
          : ("simple_date" as const),
        businessDaysRemaining,
        slaPolicyName: policyName,
      };
    }

    function documentFields(document: Document) {
      return {
        documentId: document.id,
        documentCode: document.code,
        documentTitle: document.title,
        projectId: document.project_id,
        projectName: document.project?.name ?? null,
        docType: document.doc_type,
        area: document.area,
        documentStatus: document.status,
      };
    }

    function stepResponsible(
      step: DocumentTramiteInstanceStep,
      document: Document | undefined,
    ) {
      if (step.assignment_type === "specific_user") {
        return step.assignee_user_id
          ? (usersById.get(step.assignee_user_id) ?? "Usuário atribuído")
          : null;
      }
      if (step.assignment_type === "approval_group") {
        return step.assignee_group_id
          ? (groupsById.get(step.assignee_group_id) ?? "Grupo atribuído")
          : null;
      }
      if (step.assignment_type === "role") {
        return step.required_role ? `Papel: ${step.required_role}` : null;
      }
      if (
        step.assignment_type === "author" ||
        step.assignment_type === "document_owner" ||
        step.assignment_type === "none" ||
        !step.assignment_type
      ) {
        return document?.author?.full_name ?? "Autor do documento";
      }
      return null;
    }

    for (const step of tramiteState.steps.filter(
      (item) => item.status === "active",
    )) {
      const document = documentsById.get(step.document_id);
      if (!document) continue;
      const suggestedDeadline = step.due_at
        ? null
        : calendarState.suggestDeadline(
            (step.started_at ?? step.created_at).slice(0, 10),
            {
              kind: "tramite_step",
              docType: document.doc_type,
              area: document.area,
              projectId: document.project_id,
              stepType: step.node_type,
            },
          );
      const effectiveDueAt = step.due_at ?? suggestedDeadline?.dueDate ?? null;
      const deadline = deadlineFields(
        effectiveDueAt,
        !step.due_at && Boolean(suggestedDeadline?.dueDate),
        suggestedDeadline?.policy?.name ?? null,
      );
      const assigneeAvailability = step.assignee_user_id
        ? availabilityState.getAvailability(step.assignee_user_id, {
            projectId: document.project_id,
            docType: document.doc_type,
            area: document.area,
            stepType: step.node_type,
          })
        : null;
      const substituteName = assigneeAvailability?.substituteUserId
        ? (usersById.get(assigneeAvailability.substituteUserId) ??
          "Substituto configurado")
        : null;
      const responsibleName = stepResponsible(step, document);
      const isMine = isStepAssignedToProfile(
        step,
        document,
        profile ? { id: profile.id, role: profile.role } : null,
        profileGroupIds,
      );
      workItems.push({
        id: `tramite-step-${step.id}`,
        type: "tramite_step",
        origin: "tramite",
        priority: calculateWorkItemPriority({
          type: "tramite_step",
          dueAt: effectiveDueAt,
          hasResponsible: Boolean(responsibleName),
          remainingDays: deadline.businessDaysRemaining,
        }),
        title: step.label,
        description: step.description || "Etapa ativa de trâmite documental.",
        ...documentFields(document),
        ...deadline,
        assigneeUnavailable: assigneeAvailability?.unavailable ?? false,
        substitutionActive: Boolean(substituteName),
        substituteName,
        absenceLabel: assigneeAvailability?.absence
          ? getAbsenceTypeLabel(assigneeAvailability.absence.absence_type)
          : null,
        responsibleName,
        isMine,
        createdAt: step.started_at ?? step.created_at,
        statusLabel: normalizeWorkItemStatus(step.status, effectiveDueAt),
        actionLabel: buildWorkItemAction("tramite_step"),
      });
    }

    for (const approval of approvalState.queue) {
      const document = documentsById.get(approval.documentId);
      if (!document) continue;
      const responsibleName =
        approval.assignment_type === "group"
          ? approval.assignee_group_name
          : approval.assignment_type === "user"
            ? approval.assignee_user_name
            : `Papel: ${approval.required_role}`;
      const approvalIsMine =
        approval.assignment_type === "group"
          ? Boolean(
              approval.assignee_group_id &&
              profileGroupIds.has(approval.assignee_group_id),
            )
          : approval.assignment_type === "user"
            ? (approval.assignee_user_id ?? approval.assignee_id) ===
              profile?.id
            : approval.required_role === profile?.role;
      workItems.push({
        id: `approval-${approval.stepId}`,
        type: "approval",
        origin: "approval",
        priority: calculateWorkItemPriority({
          type: "approval",
          dueAt: approval.due_at,
          hasResponsible: Boolean(responsibleName),
          remainingDays: approval.due_at
            ? deadlineFields(approval.due_at).businessDaysRemaining
            : null,
        }),
        title: approval.step_label,
        description: "Etapa pendente no fluxo formal de aprovação.",
        ...documentFields(document),
        ...deadlineFields(approval.due_at),
        responsibleName,
        isMine: approvalIsMine,
        createdAt: approval.created_at,
        statusLabel: normalizeWorkItemStatus("pending", approval.due_at),
        actionLabel: buildWorkItemAction("approval"),
      });
    }

    for (const document of documentsState.documents) {
      const owned = document.author_id === profile?.id;
      if (document.status === "draft") {
        workItems.push({
          id: `draft-${document.id}`,
          type: "draft",
          origin: "creation",
          priority: "low",
          title: document.correction
            ? "Correção documental pendente"
            : "Documento em rascunho",
          description:
            document.correction?.reason ??
            "Documento criado e ainda sem submissão formal.",
          ...documentFields(document),
          dueAt: null,
          responsibleName: document.author?.full_name ?? null,
          isMine: owned,
          createdAt: document.updated_at,
          statusLabel: document.correction ? "Correção necessária" : "Rascunho",
          actionLabel: buildWorkItemAction("draft"),
        });
      }

      if (
        document.working_revision &&
        ["draft", "rejected"].includes(document.working_revision.status)
      ) {
        workItems.push({
          id: `formal-revision-${document.working_revision.id}`,
          type: "formal_revision",
          origin: "revision",
          priority: calculateWorkItemPriority({ type: "formal_revision" }),
          title: `Revisão ${document.working_revision.revision} em preparação`,
          description:
            document.working_revision.status === "rejected"
              ? "A revisão formal precisa de correção antes do reenvio."
              : "Existe uma revisão formal ainda não enviada.",
          ...documentFields(document),
          dueAt: null,
          responsibleName: document.author?.full_name ?? null,
          isMine: owned,
          createdAt: document.updated_at,
          statusLabel: normalizeWorkItemStatus(
            document.working_revision.status,
          ),
          actionLabel: buildWorkItemAction("formal_revision"),
        });
      }

      const suggestedReview = document.next_review_at
        ? null
        : calendarState.suggestDeadline(
            (document.published_at ?? document.created_at).slice(0, 10),
            {
              kind: "document_review",
              docType: document.doc_type,
              area: document.area,
              projectId: document.project_id,
            },
          );
      const effectiveReviewAt =
        document.next_review_at ?? suggestedReview?.dueDate ?? null;
      const reviewDeadline = deadlineFields(
        effectiveReviewAt,
        !document.next_review_at && Boolean(suggestedReview?.dueDate),
        suggestedReview?.policy?.name ?? null,
      );
      const reviewDays = reviewDeadline.businessDaysRemaining;
      const reviewOverdue = effectiveReviewAt
        ? (daysUntilWorkItem(effectiveReviewAt) ?? 0) < 0
        : false;
      if (
        document.status === "published" &&
        reviewDays !== null &&
        reviewDays <= 30
      ) {
        workItems.push({
          id: `review-${document.id}`,
          type: "review_due",
          origin: "revision",
          priority: calculateWorkItemPriority({
            type: "review_due",
            dueAt: effectiveReviewAt,
            remainingDays: reviewDays,
          }),
          title: reviewOverdue
            ? "Revisão documental atrasada"
            : "Próxima revisão documental",
          description: reviewOverdue
            ? "A data programada para revisão já passou."
            : reviewDays === 0
              ? "A revisão está prevista para hoje."
              : `A revisão está prevista para daqui a ${reviewDays} dias úteis.`,
          ...documentFields(document),
          ...reviewDeadline,
          responsibleName: document.author?.full_name ?? null,
          isMine: owned,
          createdAt: document.updated_at,
          statusLabel: normalizeWorkItemStatus("published", effectiveReviewAt),
          actionLabel: buildWorkItemAction("review_due"),
        });
      }

      if (!document.code) {
        workItems.push({
          id: `attention-code-${document.id}`,
          type: "attention",
          origin: "creation",
          priority: "high",
          title: "Documento sem código",
          description:
            "O documento não possui código oficial legível e precisa ser revisado.",
          ...documentFields(document),
          dueAt: null,
          responsibleName: document.author?.full_name ?? null,
          isMine: owned,
          createdAt: document.updated_at,
          statusLabel: "Atenção",
          actionLabel: buildWorkItemAction("attention"),
        });
      }
    }

    const suggestedTemplateByDocument = new Map<
      string,
      DocumentTramiteTemplate
    >();
    for (const entry of auditState.entries) {
      const templateId = entry.metadata?.suggested_tramite_template_id;
      if (
        entry.action !== "created" ||
        typeof templateId !== "string" ||
        suggestedTemplateByDocument.has(entry.document_id)
      ) {
        continue;
      }
      const template = templatesById.get(templateId);
      if (template?.status === "published" && template.is_active) {
        suggestedTemplateByDocument.set(entry.document_id, template);
      }
    }

    for (const document of documentsState.documents) {
      if (instancesByDocument.has(document.id)) continue;
      const suggested =
        suggestedTemplateByDocument.get(document.id) ??
        [...templatesState.publishedTemplates]
          .filter((template) => templateApplies(template, document))
          .sort(
            (left, right) =>
              templateSpecificity(right, document) -
                templateSpecificity(left, document) ||
              left.name.localeCompare(right.name),
          )[0];
      if (!suggested) continue;
      workItems.push({
        id: `suggested-tramite-${document.id}-${suggested.id}`,
        type: "suggested_tramite",
        origin: "tramite",
        priority: calculateWorkItemPriority({ type: "suggested_tramite" }),
        title: "Trâmite aplicável ainda não iniciado",
        description: `Modelo sugerido: ${suggested.name}.`,
        ...documentFields(document),
        dueAt: null,
        responsibleName: document.author?.full_name ?? null,
        isMine: document.author_id === profile?.id,
        createdAt: document.updated_at,
        statusLabel: "Aguardando próximo passo",
        actionLabel: buildWorkItemAction("suggested_tramite"),
      });
    }

    const activeInstances: DocumentWorkCenterInstance[] = tramiteState.instances
      .filter((instance) => instance.status === "active")
      .map((instance) => {
        const document = documentsById.get(instance.document_id);
        const instanceSteps = stepsByInstance.get(instance.id) ?? [];
        const activeSteps = instanceSteps.filter(
          (step) => step.status === "active",
        );
        const summary = summarizeInstance(instance, instanceSteps);
        const suggestedDueDates = activeSteps
          .map((step) => {
            if (step.due_at || !document) return null;
            return calendarState.suggestDeadline(
              (step.started_at ?? step.created_at).slice(0, 10),
              {
                kind: "tramite_step",
                docType: document.doc_type,
                area: document.area,
                projectId: document.project_id,
                stepType: step.node_type,
              },
            ).dueDate;
          })
          .filter((value): value is string => Boolean(value))
          .sort();
        const effectiveInstanceDueAt =
          summary.nextDueAt ?? suggestedDueDates[0] ?? null;
        const mine = activeSteps.some((step) =>
          isStepAssignedToProfile(
            step,
            document,
            profile ? { id: profile.id, role: profile.role } : null,
            profileGroupIds,
          ),
        );
        return {
          id: instance.id,
          documentId: instance.document_id,
          documentCode: document?.code ?? null,
          documentTitle: document?.title ?? "Documento não encontrado",
          projectId: document?.project_id ?? null,
          projectName: document?.project?.name ?? null,
          templateName:
            templatesById.get(instance.template_id)?.name ??
            "Modelo de trâmite",
          instanceCode: instance.code,
          activeStepLabels: activeSteps.map((step) => step.label),
          progress: summary.progress,
          dueAt: effectiveInstanceDueAt,
          dueAtSuggested: !summary.nextDueAt && Boolean(effectiveInstanceDueAt),
          deadlineMode: calendarState.canUseCalendar
            ? "operational_calendar"
            : "simple_date",
          isOverdue: effectiveInstanceDueAt
            ? (daysUntilWorkItem(effectiveInstanceDueAt) ?? 0) < 0
            : summary.isOverdue,
          isMine: mine,
          updatedAt: instance.updated_at,
        };
      });

    const sortedItems = sortWorkItemsByUrgency(workItems);
    const accessibleItems = isManager
      ? sortedItems
      : sortedItems.filter((item) => item.isMine);
    const accessibleInstances = isManager
      ? activeInstances
      : activeInstances.filter((instance) => instance.isMine);
    const accessibleRecentDocuments = isManager
      ? documentsState.documents
      : documentsState.documents.filter(
          (document) => document.author_id === profile?.id,
        );
    return {
      workItems: accessibleItems,
      groups: groupWorkItems(accessibleItems),
      activeInstances: accessibleInstances.sort(
        (left, right) =>
          Number(right.isOverdue) - Number(left.isOverdue) ||
          new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
      ),
      recentDocuments: [...accessibleRecentDocuments]
        .sort(
          (left, right) =>
            new Date(right.updated_at).getTime() -
            new Date(left.updated_at).getTime(),
        )
        .slice(0, 8),
      documentsWithoutSlaPolicy: ["ready", "empty"].includes(
        calendarState.status,
      )
        ? accessibleRecentDocuments.filter(
            (document) =>
              document.status === "published" &&
              !calendarState.suggestDeadline(document.created_at.slice(0, 10), {
                kind: "document_review",
                docType: document.doc_type,
                area: document.area,
                projectId: document.project_id,
              }).policy,
          ).length
        : 0,
      absentWithoutSubstitute:
        availabilityState.absencesWithoutSubstitute.length,
      activeSubstitutions: availabilityState.activeSubstitutionCount,
      deadlinesWithAbsentAssignee: accessibleItems.filter(
        (item) =>
          item.type === "tramite_step" &&
          item.assigneeUnavailable &&
          Boolean(item.dueAt),
      ).length,
    };
  }, [
    actorsState.groupMembers,
    actorsState.groups,
    actorsState.users,
    approvalState.queue,
    availabilityState.absencesWithoutSubstitute.length,
    availabilityState.activeSubstitutionCount,
    availabilityState.getAvailability,
    auditState.entries,
    calendarState.canUseCalendar,
    calendarState.getBusinessDaysUntil,
    calendarState.status,
    calendarState.suggestDeadline,
    documentsState.documents,
    profile,
    templatesState.publishedTemplates,
    templatesState.templates,
    tramiteState.instances,
    tramiteState.steps,
  ]);

  const warnings = [
    tramiteState.schemaStatus === "not_installed"
      ? "Execução de trâmites ainda não instalada. A Central mostra documentos e revisões disponíveis."
      : tramiteState.schemaStatus === "restricted"
        ? tramiteState.error
        : null,
    codingMessage,
    approvalState.error
      ? "Aprovações formais não puderam ser carregadas e foram ocultadas."
      : approvalState.compatibilityMessage,
    documentsState.schemaFallback
      ? "Projetos ou revisões formais estão em modo de compatibilidade."
      : null,
    templatesState.schemaStatus === "not_installed"
      ? "Modelos de trâmite não estão instalados; sugestões de próximo passo foram ocultadas."
      : null,
    projectsState.compatibilityMessage,
    calendarState.status === "not_installed"
      ? "Calendário operacional ainda não instalado. Prazos usam comparação simples de data."
      : calendarState.status === "restricted" ||
          calendarState.status === "error"
        ? calendarState.error
        : calendarState.status === "empty"
          ? "Nenhum calendário operacional configurado. O fallback considera segunda a sexta."
          : null,
    availabilityState.status === "not_installed"
      ? "Ausências e substituições ainda não instaladas; responsáveis são exibidos pelo contrato original."
      : availabilityState.status === "restricted" ||
          availabilityState.status === "error"
        ? availabilityState.error
        : null,
    auditState.error
      ? "Sugestões auditadas não puderam ser consultadas; a Central usa os modelos aplicáveis atuais."
      : null,
  ].filter(
    (warning, index, values): warning is string =>
      Boolean(warning) && values.indexOf(warning) === index,
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      documentsState.refetch(),
      approvalState.refetch(),
      tramiteState.refresh(),
      templatesState.refresh(),
      actorsState.refetch(),
      auditState.refetch(),
      projectsState.refresh(),
      calendarState.refresh(),
      availabilityState.refresh(),
    ]);
  }, [
    actorsState,
    approvalState,
    auditState,
    documentsState,
    projectsState,
    calendarState,
    availabilityState,
    templatesState,
    tramiteState,
  ]);

  return {
    profile,
    canViewOrganization:
      profile?.role === "admin" || profile?.role === "manager",
    isLoading:
      documentsState.loading ||
      approvalState.loading ||
      tramiteState.isLoading ||
      templatesState.isLoading ||
      actorsState.isLoading ||
      auditState.loading ||
      projectsState.isLoading ||
      calendarState.isLoading ||
      availabilityState.isLoading ||
      codingLoading,
    error: documentsState.error,
    warnings,
    codingStatus,
    tramiteStatus: tramiteState.schemaStatus,
    approvalAvailable: !approvalState.error,
    projectsAvailable: projectsState.canUseProjects,
    projectSchemaMode: projectsState.schemaMode,
    calendarStatus: calendarState.status,
    calendarAvailable: calendarState.canUseCalendar,
    availabilityStatus: availabilityState.status,
    projects: projectsState.projects,
    documents: documentsState.documents,
    publishedTramiteTemplatesCount: templatesState.publishedTemplates.length,
    tramiteModelingStatus: templatesState.schemaStatus,
    refresh,
    ...result,
  };
}
