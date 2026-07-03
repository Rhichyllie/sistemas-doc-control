import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CalendarClock,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  NotebookPen,
  Paperclip,
  ShieldAlert,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  canCompleteStepLocally,
  explainStepRequirement,
  getStepDecisionOptions,
  normalizeDecisionForNodeType,
  type DocumentTramiteInstanceEvidence,
  type DocumentTramiteInstanceStep,
  type TramiteActorPermission,
  type TramiteStepDecision,
} from "@/lib/documentTramiteExecution";
import {
  getDeadlineModeLabel,
  type SuggestedDeadline,
} from "@/lib/operationalCalendar";
import { formatEvidenceFileSize } from "@/lib/tramiteEvidenceFiles";
import {
  getAbsenceTypeLabel,
  type ResolvedTeamAvailability,
} from "@/lib/teamAvailability";
import { TramiteStepAssignmentBadge } from "./TramiteStepAssignmentBadge";

const EVIDENCE_LABELS: Record<
  DocumentTramiteInstanceEvidence["evidence_type"],
  string
> = {
  note: "Nota",
  file: "Arquivo",
  link: "Link",
  external_reference: "Referência",
};

function EvidenceIcon({
  type,
}: {
  type: DocumentTramiteInstanceEvidence["evidence_type"];
}) {
  if (type === "file") return <FileText className="h-4 w-4" />;
  if (type === "link") return <Link2 className="h-4 w-4" />;
  return <NotebookPen className="h-4 w-4" />;
}

export function TramiteStepActionCard({
  step,
  evidence,
  actor,
  isCompleting,
  userName,
  groupName,
  suggestedDeadline,
  assigneeAvailability,
  substituteName,
  delegatedActionAvailable,
  onComplete,
  onAddEvidence,
  onOpenEvidence,
}: {
  step: DocumentTramiteInstanceStep;
  evidence: DocumentTramiteInstanceEvidence[];
  actor: TramiteActorPermission;
  isCompleting: boolean;
  userName?: string;
  groupName?: string;
  suggestedDeadline?: SuggestedDeadline | null;
  assigneeAvailability?: ResolvedTeamAvailability | null;
  substituteName?: string;
  delegatedActionAvailable?: boolean;
  onComplete: (input: {
    decision: TramiteStepDecision;
    comment: string | null;
  }) => Promise<void>;
  onAddEvidence: () => void;
  onOpenEvidence: (evidence: DocumentTramiteInstanceEvidence) => Promise<void>;
}) {
  const options = useMemo(
    () => getStepDecisionOptions(step.node_type),
    [step.node_type],
  );
  const [decision, setDecision] = useState<TramiteStepDecision>(
    normalizeDecisionForNodeType(step.node_type),
  );
  const [comment, setComment] = useState("");
  const [delegatedConfirmed, setDelegatedConfirmed] = useState(false);

  useEffect(() => {
    setDecision(normalizeDecisionForNodeType(step.node_type));
    setComment("");
    setDelegatedConfirmed(false);
  }, [step.id, step.node_type]);

  const isDelegatedActor = Boolean(
    actor.profileId &&
    delegatedActionAvailable &&
    actor.delegatedForUserId &&
    step.assignment_type === "specific_user" &&
    actor.delegatedForUserId === step.assignee_user_id &&
    actor.profileId !== step.assignee_user_id,
  );
  const permission = canCompleteStepLocally(step, evidence, actor);
  const isEvidenceExemptDecision = decision === "rejected";
  const blockingReasons = permission.reasons.filter(
    (reason) =>
      !(
        isEvidenceExemptDecision &&
        (reason.includes("evidência obrigatória") ||
          reason.includes("exige arquivo"))
      ),
  );
  if (step.require_comment && !comment.trim()) {
    blockingReasons.push("Informe o comentário obrigatório.");
  }
  if (isDelegatedActor && !delegatedConfirmed) {
    blockingReasons.push("Confirme a ação como substituto auditável.");
  }
  const stepEvidence = evidence.filter((item) => item.step_id === step.id);
  const evidenceCount = stepEvidence.length;

  return (
    <Card className="border-blue-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{step.label}</CardTitle>
            <CardDescription className="mt-1">
              {step.description || "Etapa ativa aguardando ação."}
            </CardDescription>
          </div>
          <TramiteStepAssignmentBadge
            step={step}
            userName={userName}
            groupName={groupName}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {explainStepRequirement(step)}
        </p>

        {assigneeAvailability?.unavailable && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>
              {assigneeAvailability.absence
                ? getAbsenceTypeLabel(assigneeAvailability.absence.absence_type)
                : "Responsável ausente"}
            </AlertTitle>
            <AlertDescription>
              {substituteName
                ? `Substituto configurado: ${substituteName}.`
                : "Nenhum substituto válido foi resolvido."}{" "}
              A etapa mantém o responsável original.
              {!delegatedActionAvailable &&
                " Aplique o ciclo 23 para habilitar conclusão delegada auditável."}
            </AlertDescription>
          </Alert>
        )}

        {isDelegatedActor && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Ação delegada auditável</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                Você está concluindo esta etapa como substituto auditável de{" "}
                {userName ?? "outro responsável"}. A trilha registrará sua ação
                e manterá o titular original.
              </p>
              <label className="flex items-center gap-2 font-medium">
                <Checkbox
                  checked={delegatedConfirmed}
                  onCheckedChange={(checked) =>
                    setDelegatedConfirmed(checked === true)
                  }
                />
                Confirmo que estou agindo como substituto.
              </label>
            </AlertDescription>
          </Alert>
        )}

        {(step.due_at || suggestedDeadline?.dueDate) && (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
            <CalendarClock className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium">
                {step.due_at ? "Prazo da etapa" : "Prazo sugerido"}
                {" · "}
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: step.due_at?.includes("T") ? "short" : undefined,
                }).format(
                  new Date(
                    step.due_at ?? `${suggestedDeadline?.dueDate}T12:00:00`,
                  ),
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {step.due_at
                  ? "Prazo persistido na execução."
                  : `${getDeadlineModeLabel(suggestedDeadline?.mode ?? "simple_date")}. Sugestão informativa; não foi gravada na etapa.`}
                {suggestedDeadline?.policy?.name
                  ? ` Política: ${suggestedDeadline.policy.name}.`
                  : ""}
              </p>
            </div>
          </div>
        )}

        {options.length > 1 && (
          <div className="space-y-2">
            <Label>Decisão</Label>
            <RadioGroup
              value={decision}
              onValueChange={(value) =>
                setDecision(value as TramiteStepDecision)
              }
              className="grid gap-2 sm:grid-cols-3"
            >
              {options.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`${step.id}-${option.value}`}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${
                    decision === option.value
                      ? option.destructive
                        ? "border-amber-300 bg-amber-50"
                        : "border-primary bg-primary/5"
                      : ""
                  }`}
                >
                  <RadioGroupItem
                    id={`${step.id}-${option.value}`}
                    value={option.value}
                  />
                  {option.label}
                </Label>
              ))}
            </RadioGroup>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={`tramite-comment-${step.id}`}>
            Comentário {step.require_comment ? "(obrigatório)" : "(opcional)"}
          </Label>
          <Textarea
            id={`tramite-comment-${step.id}`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Registre contexto objetivo para a decisão."
            rows={3}
          />
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {evidenceCount
                  ? `${evidenceCount} evidência(s) registrada(s)`
                  : "Nenhuma evidência registrada"}
              </p>
              <p className="text-xs text-muted-foreground">
                Notas, links e arquivos ficam vinculados a esta etapa.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onAddEvidence}
              disabled={isDelegatedActor}
              title={
                isDelegatedActor
                  ? "O ciclo 23 libera conclusão delegada; evidência continua com o responsável original ou gestor."
                  : undefined
              }
            >
              <Paperclip className="h-4 w-4" />
              Registrar evidência
            </Button>
          </div>
          {stepEvidence.length > 0 && (
            <div className="space-y-2">
              {stepEvidence.map((item) => {
                const fileSize = formatEvidenceFileSize(item.file_size);
                const isSafeLink =
                  item.evidence_type === "link" &&
                  Boolean(item.note && /^https?:\/\//i.test(item.note));
                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 gap-2">
                      <EvidenceIcon type={item.evidence_type} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {EVIDENCE_LABELS[item.evidence_type]}
                          </Badge>
                          {fileSize && (
                            <span className="text-xs text-muted-foreground">
                              {fileSize}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.file_name ||
                            item.note ||
                            "Evidência registrada"}
                        </p>
                      </div>
                    </div>
                    {item.evidence_type === "file" && item.file_path ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void onOpenEvidence(item)}
                      >
                        Abrir arquivo
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    ) : isSafeLink ? (
                      <Button asChild size="sm" variant="ghost">
                        <a href={item.note!} target="_blank" rel="noreferrer">
                          Abrir link
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {blockingReasons.length > 0 && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Ação indisponível</AlertTitle>
            <AlertDescription>{blockingReasons.join(" ")}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={isCompleting || blockingReasons.length > 0}
            onClick={() =>
              void onComplete({
                decision,
                comment: comment.trim() || null,
              })
            }
          >
            {isCompleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {options.find((option) => option.value === decision)?.label ??
              "Concluir etapa"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
