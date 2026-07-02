import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Paperclip, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { TramiteStepAssignmentBadge } from "./TramiteStepAssignmentBadge";

export function TramiteStepActionCard({
  step,
  evidence,
  actor,
  isCompleting,
  userName,
  groupName,
  onComplete,
  onAddEvidence,
}: {
  step: DocumentTramiteInstanceStep;
  evidence: DocumentTramiteInstanceEvidence[];
  actor: TramiteActorPermission;
  isCompleting: boolean;
  userName?: string;
  groupName?: string;
  onComplete: (input: {
    decision: TramiteStepDecision;
    comment: string | null;
  }) => Promise<void>;
  onAddEvidence: () => void;
}) {
  const options = useMemo(
    () => getStepDecisionOptions(step.node_type),
    [step.node_type],
  );
  const [decision, setDecision] = useState<TramiteStepDecision>(
    normalizeDecisionForNodeType(step.node_type),
  );
  const [comment, setComment] = useState("");

  useEffect(() => {
    setDecision(normalizeDecisionForNodeType(step.node_type));
    setComment("");
  }, [step.id, step.node_type]);

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
  const evidenceCount = evidence.filter(
    (item) => item.step_id === step.id,
  ).length;

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

        {(step.required_evidence || step.node_type === "evidence") && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
            <div>
              <p className="text-sm font-medium">
                {evidenceCount
                  ? `${evidenceCount} evidência(s) registrada(s)`
                  : "Nenhuma evidência registrada"}
              </p>
              <p className="text-xs text-muted-foreground">
                Notas e referências ficam no histórico da instância.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onAddEvidence}>
              <Paperclip className="h-4 w-4" />
              Registrar evidência
            </Button>
          </div>
        )}

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
