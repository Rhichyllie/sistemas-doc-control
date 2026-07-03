import { useMemo, useState } from "react";
import {
  Activity,
  Ban,
  GitBranch,
  History,
  Play,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthContext } from "@/contexts/AuthContext";
import { useDocumentTramiteEvidence } from "@/hooks/useDocumentTramiteEvidence";
import { useDocumentTramiteExecution } from "@/hooks/useDocumentTramiteExecution";
import { useDocumentTramiteInstances } from "@/hooks/useDocumentTramiteInstances";
import { useDocumentTramiteTemplates } from "@/hooks/useDocumentTramiteTemplates";
import { useTramiteEvidenceUpload } from "@/hooks/useTramiteEvidenceUpload";
import { useWorkflowActors } from "@/hooks/useWorkflowActors";
import type { Document } from "@/hooks/useDocuments";
import {
  summarizeInstance,
  type DocumentTramiteInstanceEvidence,
  type DocumentTramiteInstanceStep,
} from "@/lib/documentTramiteExecution";
import type { DocumentTramiteTemplate } from "@/lib/documentTramiteModel";
import { StartTramiteExecutionDialog } from "./StartTramiteExecutionDialog";
import { TramiteCancelDialog } from "./TramiteCancelDialog";
import { TramiteEvidenceDialog } from "./TramiteEvidenceDialog";
import { TramiteExecutionEvents } from "./TramiteExecutionEvents";
import { TramiteExecutionStatusBadge } from "./TramiteExecutionStatusBadge";
import { TramiteInstanceTimeline } from "./TramiteInstanceTimeline";
import { TramiteStepActionCard } from "./TramiteStepActionCard";

function templateSpecificity(
  template: DocumentTramiteTemplate,
  document: Document,
) {
  let score = 0;
  if (template.project_id && template.project_id === document.project_id)
    score += 8;
  if (template.doc_type && template.doc_type === document.doc_type) score += 4;
  if (template.area && template.area === document.area) score += 2;
  if (template.is_default) score += 1;
  return score;
}

function isApplicableTemplate(
  template: DocumentTramiteTemplate,
  document: Document,
) {
  return (
    (!template.project_id || template.project_id === document.project_id) &&
    (!template.doc_type ||
      template.doc_type.toUpperCase() === document.doc_type.toUpperCase()) &&
    (!template.area ||
      template.area.toUpperCase() === document.area.toUpperCase())
  );
}

export function DocumentTramiteExecutionPanel({
  document,
  suggestedTemplateId,
  suggestedTemplateReason,
}: {
  document: Document;
  suggestedTemplateId?: string | null;
  suggestedTemplateReason?: string | null;
}) {
  const { profile } = useAuthContext();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [startOpen, setStartOpen] = useState(false);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [initialTemplateId, setInitialTemplateId] = useState<string | null>(
    null,
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [evidenceStep, setEvidenceStep] =
    useState<DocumentTramiteInstanceStep | null>(null);

  const instancesState = useDocumentTramiteInstances({
    documentId: document.id,
    instanceId: selectedInstanceId,
  });
  const execution = useDocumentTramiteExecution(instancesState.refresh);
  const evidenceActions = useDocumentTramiteEvidence(instancesState.refresh);
  const evidenceUpload = useTramiteEvidenceUpload({
    enabled: ["ready", "empty"].includes(instancesState.schemaStatus),
    refresh: instancesState.refresh,
  });
  const templateState = useDocumentTramiteTemplates();
  const actors = useWorkflowActors();

  const applicableTemplates = useMemo(
    () =>
      templateState.publishedTemplates
        .filter((template) => isApplicableTemplate(template, document))
        .sort(
          (left, right) =>
            templateSpecificity(right, document) -
              templateSpecificity(left, document) ||
            left.name.localeCompare(right.name),
        ),
    [document, templateState.publishedTemplates],
  );
  const startableTemplates = useMemo(
    () =>
      applicableTemplates.filter(
        (template) =>
          !instancesState.instances.some(
            (instance) =>
              instance.status === "active" &&
              instance.template_id === template.id &&
              instance.template_version_id === template.published_version?.id,
          ),
      ),
    [applicableTemplates, instancesState.instances],
  );
  const allStartableTemplates = useMemo(
    () =>
      templateState.publishedTemplates.filter(
        (template) =>
          !instancesState.instances.some(
            (instance) =>
              instance.status === "active" &&
              instance.template_id === template.id &&
              instance.template_version_id === template.published_version?.id,
          ),
      ),
    [instancesState.instances, templateState.publishedTemplates],
  );
  const publishedSuggestedTemplate =
    templateState.publishedTemplates.find(
      (template) => template.id === suggestedTemplateId,
    ) ??
    applicableTemplates[0] ??
    null;
  const suggestedTemplate =
    allStartableTemplates.find(
      (template) => template.id === publishedSuggestedTemplate?.id,
    ) ??
    startableTemplates[0] ??
    null;
  const contextualStartableTemplates = suggestedTemplate
    ? [
        ...allStartableTemplates.filter(
          (template) => template.id === suggestedTemplate.id,
        ),
        ...startableTemplates.filter(
          (template) => template.id !== suggestedTemplate.id,
        ),
      ]
    : startableTemplates;
  const dialogTemplates = showAllTemplates
    ? allStartableTemplates
    : contextualStartableTemplates;
  const selected = instancesState.selectedInstance;
  const summary = selected
    ? summarizeInstance(selected, instancesState.steps)
    : null;
  const canStartOrCancel =
    profile?.role === "admin" ||
    profile?.role === "manager" ||
    profile?.id === document.author_id;
  const userNames = Object.fromEntries(
    actors.users.map((user) => [user.id, user.full_name]),
  );
  const groupNames = Object.fromEntries(
    actors.groups.map((group) => [group.id, group.name]),
  );
  const activeGroupIds = actors.groupMembers
    .filter(
      (member) => member.user_id === profile?.id && member.is_active !== false,
    )
    .map((member) => member.group_id);

  async function handleStart(template: DocumentTramiteTemplate) {
    try {
      const result = await execution.startInstance({
        documentId: document.id,
        templateId: template.id,
        templateVersionId: template.published_version?.id ?? null,
        metadata: { source: "document_detail" },
      });
      if (result.instance_id) setSelectedInstanceId(result.instance_id);
      setStartOpen(false);
      toast.success("Trâmite iniciado com rastreabilidade.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao iniciar.");
    }
  }

  function openStartDialog(templateId?: string | null, showAll = false) {
    setInitialTemplateId(templateId ?? null);
    setShowAllTemplates(showAll);
    setStartOpen(true);
  }

  async function handleComplete(
    step: DocumentTramiteInstanceStep,
    input: { decision: string; comment: string | null },
  ) {
    try {
      const result = await execution.completeStep({
        stepId: step.id,
        decision: input.decision,
        comment: input.comment,
        metadata: { source: "document_detail" },
      });
      toast.success(
        result.instance_status === "completed"
          ? "Trâmite concluído."
          : "Etapa concluída e próxima etapa atualizada.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao concluir etapa.",
      );
    }
  }

  async function handleAddEvidence(input: {
    evidenceType: "note" | "link" | "external_reference" | "file";
    note: string;
    file: File | null;
  }) {
    if (!evidenceStep) return;
    try {
      if (input.evidenceType === "file") {
        if (!input.file) {
          throw new Error("Selecione o arquivo de evidência.");
        }
        const result = await evidenceUpload.uploadEvidence({
          documentId: document.id,
          instanceId: evidenceStep.instance_id,
          stepId: evidenceStep.id,
          file: input.file,
          note: input.note,
        });
        result.warnings.forEach((warning) => toast.warning(warning));
      } else {
        await evidenceActions.addEvidence({
          stepId: evidenceStep.id,
          evidenceType: input.evidenceType,
          note: input.note,
          metadata: { source: "document_detail" },
        });
      }
      setEvidenceStep(null);
      toast.success(
        "Evidência registrada. Agora você pode concluir a etapa quando os demais requisitos estiverem atendidos.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao registrar evidência.",
      );
    }
  }

  async function handleOpenEvidence(evidence: DocumentTramiteInstanceEvidence) {
    if (!evidence.file_path) return;
    try {
      await evidenceUpload.openEvidenceFile({
        filePath: evidence.file_path,
        fileName: evidence.file_name,
        storageBucket:
          typeof evidence.metadata?.storage_bucket === "string"
            ? evidence.metadata.storage_bucket
            : null,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir a evidência.",
      );
    }
  }

  async function handleCancel(reason: string) {
    if (!selected) return;
    try {
      await execution.cancelInstance({ instanceId: selected.id, reason });
      setCancelOpen(false);
      toast.success("Execução cancelada com histórico preservado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao cancelar execução.",
      );
    }
  }

  if (instancesState.isLoading && instancesState.schemaStatus === "loading") {
    return (
      <Card id="document-tramite-execution" className="scroll-mt-6">
        <CardHeader>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (instancesState.schemaStatus === "not_installed") {
    return (
      <Card id="document-tramite-execution" className="scroll-mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            Execução de Trâmite
          </CardTitle>
          <CardDescription>
            O modelador permanece disponível; a execução é um módulo separado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Execução ainda não instalada</AlertTitle>
            <AlertDescription>
              Aplique manualmente o ciclo 18 para iniciar e acompanhar
              instâncias.{" "}
              {publishedSuggestedTemplate
                ? `O modelo “${publishedSuggestedTemplate.name}” foi apenas sugerido.`
                : "Modelos publicados continuam apenas como sugestões."}{" "}
              Nenhum approval_flow foi alterado.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card id="document-tramite-execution" className="scroll-mt-6">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-primary" />
                Execução de Trâmite
              </CardTitle>
              <CardDescription className="mt-1">
                Etapas operacionais rastreáveis, separadas do fluxo de aprovação
                existente.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void instancesState.refresh()}
                disabled={instancesState.isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    instancesState.isLoading ? "animate-spin" : ""
                  }`}
                />
                Atualizar
              </Button>
              {canStartOrCancel && allStartableTemplates.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    openStartDialog(
                      suggestedTemplate?.id ?? null,
                      contextualStartableTemplates.length === 0,
                    )
                  }
                >
                  <Play className="h-4 w-4" />
                  {suggestedTemplate
                    ? "Iniciar trâmite sugerido"
                    : "Escolher trâmite"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {instancesState.error && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Não foi possível carregar a execução</AlertTitle>
              <AlertDescription>{instancesState.error}</AlertDescription>
            </Alert>
          )}
          {execution.error && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Operação de trâmite indisponível</AlertTitle>
              <AlertDescription>{execution.error}</AlertDescription>
            </Alert>
          )}

          {!selected && !instancesState.error && (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <GitBranch className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Nenhum trâmite iniciado</p>
              <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
                {applicableTemplates.length
                  ? "Há modelo publicado aplicável. Inicie somente quando o documento estiver pronto para seguir o processo."
                  : templateState.isLoading
                    ? "Verificando modelos publicados..."
                    : "Nenhum modelo publicado se aplica a este documento."}
              </p>
              {canStartOrCancel && allStartableTemplates.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {suggestedTemplate &&
                    contextualStartableTemplates.some(
                      (template) => template.id === suggestedTemplate.id,
                    ) && (
                      <Button
                        type="button"
                        onClick={() => openStartDialog(suggestedTemplate.id)}
                      >
                        <Play className="h-4 w-4" />
                        Iniciar trâmite sugerido
                      </Button>
                    )}
                  <Button
                    type="button"
                    variant={suggestedTemplate ? "outline" : "default"}
                    onClick={() =>
                      openStartDialog(
                        null,
                        contextualStartableTemplates.length === 0,
                      )
                    }
                  >
                    Escolher outro trâmite
                  </Button>
                  {allStartableTemplates.length >
                    contextualStartableTemplates.length && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => openStartDialog(null, true)}
                    >
                      Ver todos os modelos publicados
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {!selected && contextualStartableTemplates.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {contextualStartableTemplates.slice(0, 4).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`rounded-lg border p-3 text-left hover:border-primary ${
                    template.id === suggestedTemplate?.id
                      ? "border-violet-300 bg-violet-50"
                      : ""
                  }`}
                  onClick={() => openStartDialog(template.id)}
                >
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {template.name}
                    {template.id === suggestedTemplate?.id && (
                      <Badge variant="secondary">Sugerido</Badge>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Versão {template.published_version?.version_number ?? 1} ·{" "}
                    {template.published_version?.graph.nodes.length ?? 0} etapas
                  </span>
                  {template.id === suggestedTemplate?.id &&
                    suggestedTemplateReason && (
                      <span className="mt-1 block text-xs text-violet-700">
                        {suggestedTemplateReason}
                      </span>
                    )}
                </button>
              ))}
            </div>
          )}

          {instancesState.instances.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {instancesState.instances.map((instance) => (
                <Button
                  key={instance.id}
                  type="button"
                  size="sm"
                  variant={
                    selected?.id === instance.id ? "secondary" : "outline"
                  }
                  onClick={() => setSelectedInstanceId(instance.id)}
                >
                  {instance.code || "Execução"} ·{" "}
                  {new Intl.DateTimeFormat("pt-BR").format(
                    new Date(instance.started_at),
                  )}
                </Button>
              ))}
            </div>
          )}

          {selected && summary && (
            <>
              <div className="rounded-lg border bg-muted/15 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {selected.code || "Execução documental"}
                      </p>
                      <TramiteExecutionStatusBadge
                        status={selected.status}
                        activeSteps={summary.activeSteps}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Iniciada em{" "}
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(selected.started_at))}
                    </p>
                  </div>
                  {selected.status === "active" && canStartOrCancel && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setCancelOpen(true)}
                    >
                      <Ban className="h-4 w-4" />
                      Cancelar execução
                    </Button>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <Progress value={summary.progress} />
                  <span className="text-sm font-medium">
                    {summary.completedSteps}/{summary.totalSteps} etapas
                  </span>
                </div>
              </div>

              {selected.status === "active" &&
                instancesState.steps
                  .filter((step) => step.status === "active")
                  .map((step) => (
                    <TramiteStepActionCard
                      key={step.id}
                      step={step}
                      evidence={instancesState.evidence}
                      actor={{
                        profileId: profile?.id ?? null,
                        role: profile?.role ?? null,
                        documentAuthorId: document.author_id,
                        activeGroupIds,
                      }}
                      userName={
                        step.assignee_user_id
                          ? userNames[step.assignee_user_id]
                          : undefined
                      }
                      groupName={
                        step.assignee_group_id
                          ? groupNames[step.assignee_group_id]
                          : undefined
                      }
                      isCompleting={execution.isCompleting}
                      onComplete={(input) => handleComplete(step, input)}
                      onAddEvidence={() => setEvidenceStep(step)}
                      onOpenEvidence={handleOpenEvidence}
                    />
                  ))}

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.7fr)]">
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <History className="h-4 w-4" />
                    Etapas da execução
                  </h3>
                  <TramiteInstanceTimeline
                    steps={instancesState.steps}
                    edges={instancesState.edges}
                    userNames={userNames}
                    groupNames={groupNames}
                  />
                </div>
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <Activity className="h-4 w-4" />
                    Eventos
                  </h3>
                  <TramiteExecutionEvents
                    events={instancesState.events}
                    actorNames={userNames}
                  />
                </div>
              </div>
              <Separator />
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  {instancesState.evidence.length} evidência(s)
                </Badge>
                <span>
                  A execução não altera status, arquivo ou publicação do
                  documento automaticamente.
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <StartTramiteExecutionDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        templates={dialogTemplates}
        isStarting={execution.isStarting}
        initialTemplateId={initialTemplateId}
        suggestedTemplateId={suggestedTemplate?.id ?? null}
        onStart={handleStart}
      />
      <TramiteEvidenceDialog
        open={Boolean(evidenceStep)}
        onOpenChange={(open) => !open && setEvidenceStep(null)}
        step={evidenceStep}
        isSaving={evidenceActions.isAdding || evidenceUpload.isUploading}
        canUploadFiles={evidenceUpload.canUploadFiles}
        isCheckingFileSupport={evidenceUpload.isCheckingAvailability}
        fileCompatibilityMessage={evidenceUpload.compatibilityMessage}
        onSave={handleAddEvidence}
      />
      <TramiteCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        isCancelling={execution.isCancelling}
        onConfirm={handleCancel}
      />
    </>
  );
}
