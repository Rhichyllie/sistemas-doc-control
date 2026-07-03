import { useMemo, useState } from "react";
import {
  CalendarOff,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserCheck,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useAuthContext } from "@/contexts/AuthContext";
import type { TeamMember } from "@/hooks/useTeam";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { useTeamAvailability } from "@/hooks/useTeamAvailability";
import {
  getAbsenceTypeLabel,
  type TeamAbsenceType,
  type TeamDelegationScope,
} from "@/lib/teamAvailability";
import { DOC_TYPES } from "@/lib/constants";

const ABSENCE_TYPES: Array<{ value: TeamAbsenceType; label: string }> = [
  { value: "vacation", label: "Férias" },
  { value: "sick_leave", label: "Licença médica" },
  { value: "leave", label: "Licença" },
  { value: "travel", label: "Viagem" },
  { value: "training", label: "Treinamento" },
  { value: "unavailable", label: "Indisponível" },
  { value: "other", label: "Outro" },
];

const DELEGATION_SCOPES: Array<{
  value: TeamDelegationScope;
  label: string;
}> = [
  { value: "all", label: "Todos os contextos" },
  { value: "project", label: "Projeto" },
  { value: "document_type", label: "Tipo documental" },
  { value: "area", label: "Área" },
  { value: "step_type", label: "Tipo de etapa" },
];

function localDateTime(daysFromNow: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatPeriod(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return `${formatter.format(new Date(startsAt))} → ${formatter.format(
    new Date(endsAt),
  )}`;
}

export function TeamAvailabilityPanel({
  members,
  compact = false,
  availabilityState,
}: {
  members: TeamMember[];
  compact?: boolean;
  availabilityState?: ReturnType<typeof useTeamAvailability>;
}) {
  const { profile } = useAuthContext();
  const internalAvailability = useTeamAvailability({
    enabled: !availabilityState,
  });
  const availability = availabilityState ?? internalAvailability;
  const projectOptions = useProjectOptions();
  const [absenceUserId, setAbsenceUserId] = useState(profile?.id ?? "");
  const [absenceType, setAbsenceType] = useState<TeamAbsenceType>("vacation");
  const [absenceStart, setAbsenceStart] = useState(localDateTime(1, 8));
  const [absenceEnd, setAbsenceEnd] = useState(localDateTime(7, 18));
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceSubstitute, setAbsenceSubstitute] = useState("none");
  const [ownerUserId, setOwnerUserId] = useState(profile?.id ?? "");
  const [delegateUserId, setDelegateUserId] = useState("");
  const [delegationScope, setDelegationScope] =
    useState<TeamDelegationScope>("all");
  const [delegationContext, setDelegationContext] = useState("");
  const [delegationStart, setDelegationStart] = useState("");
  const [delegationEnd, setDelegationEnd] = useState("");
  const [delegationPriority, setDelegationPriority] = useState("100");

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.id, member.full_name])),
    [members],
  );
  const selectableMembers = members.filter((member) => member.active);
  const canChooseOwner = availability.canManage;

  if (availability.status === "not_installed") {
    return (
      <Alert>
        <CalendarOff className="h-4 w-4" />
        <AlertTitle>Ausências e substituições não instaladas</AlertTitle>
        <AlertDescription>
          Aplique o ciclo 22_TRAMITA_calendar_enterprise_hardening para
          habilitar disponibilidade da equipe. Usuários continuam ativos pelo
          contrato atual até essa configuração existir.
        </AlertDescription>
      </Alert>
    );
  }

  if (availability.isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando disponibilidade da equipe...
      </div>
    );
  }

  async function createAbsence() {
    const saved = await availability.saveAbsence({
      userId: canChooseOwner ? absenceUserId : (profile?.id ?? ""),
      absenceType,
      startsAt: absenceStart,
      endsAt: absenceEnd,
      reason: absenceReason,
      substituteUserId: absenceSubstitute === "none" ? null : absenceSubstitute,
    });
    if (saved) {
      setAbsenceReason("");
      toast.success("Ausência registrada.");
    }
  }

  async function createDelegation() {
    const owner = canChooseOwner ? ownerUserId : (profile?.id ?? "");
    const saved = await availability.saveDelegation({
      ownerUserId: owner,
      substituteUserId: delegateUserId,
      scope: delegationScope,
      projectId:
        delegationScope === "project" ? delegationContext || null : null,
      docType:
        delegationScope === "document_type" ? delegationContext || null : null,
      area: delegationScope === "area" ? delegationContext || null : null,
      stepType:
        delegationScope === "step_type" ? delegationContext || null : null,
      startsAt: delegationStart || null,
      endsAt: delegationEnd || null,
      priority: Number(delegationPriority),
    });
    if (saved) toast.success("Regra de substituição criada.");
  }

  function contextControl() {
    if (delegationScope === "project") {
      return (
        <Select value={delegationContext} onValueChange={setDelegationContext}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o projeto" />
          </SelectTrigger>
          <SelectContent>
            {projectOptions.projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.code ? `${project.code} · ` : ""}
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (delegationScope === "document_type") {
      return (
        <Select value={delegationContext} onValueChange={setDelegationContext}>
          <SelectTrigger>
            <SelectValue placeholder="Tipo documental" />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (["area", "step_type"].includes(delegationScope)) {
      return (
        <Input
          value={delegationContext}
          onChange={(event) => setDelegationContext(event.target.value)}
          placeholder={
            delegationScope === "area" ? "Código da área" : "Ex.: approval"
          }
        />
      );
    }
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className={
              compact ? "text-lg font-semibold" : "text-xl font-semibold"
            }
          >
            Ausências e substituições
          </h2>
          <p className="text-sm text-muted-foreground">
            Registre indisponibilidade sem alterar responsáveis ou etapas.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void availability.refresh()}
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {availability.error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Disponibilidade indisponível</AlertTitle>
          <AlertDescription>{availability.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Ausentes hoje</p>
            <p className="mt-1 text-2xl font-semibold">
              {availability.activeAbsences.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Sem substituto válido
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {availability.absencesWithoutSubstitute.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Delegações ativas</p>
            <p className="mt-1 text-2xl font-semibold">
              {availability.activeSubstitutionCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova ausência</CardTitle>
            <CardDescription>
              Férias, licença, viagem, treinamento ou indisponibilidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Pessoa</Label>
                <Select
                  value={canChooseOwner ? absenceUserId : profile?.id}
                  onValueChange={setAbsenceUserId}
                  disabled={!canChooseOwner}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={absenceType}
                  onValueChange={(value) =>
                    setAbsenceType(value as TeamAbsenceType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Início</Label>
                <Input
                  type="datetime-local"
                  value={absenceStart}
                  onChange={(event) => setAbsenceStart(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={absenceEnd}
                  onChange={(event) => setAbsenceEnd(event.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Substituto</Label>
                <Select
                  value={absenceSubstitute}
                  onValueChange={setAbsenceSubstitute}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem substituto</SelectItem>
                    {selectableMembers
                      .filter(
                        (member) =>
                          member.id !==
                          (canChooseOwner ? absenceUserId : profile?.id),
                      )
                      .map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.full_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Motivo</Label>
                <Input
                  value={absenceReason}
                  onChange={(event) => setAbsenceReason(event.target.value)}
                  placeholder="Contexto opcional"
                />
              </div>
            </div>
            <Button
              onClick={createAbsence}
              disabled={
                availability.isSaving || !availability.canUseAvailability
              }
            >
              Registrar ausência
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova regra de delegação</CardTitle>
            <CardDescription>
              Define o substituto por contexto, sem reatribuição automática.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Titular</Label>
                <Select
                  value={canChooseOwner ? ownerUserId : profile?.id}
                  onValueChange={setOwnerUserId}
                  disabled={!canChooseOwner}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Substituto</Label>
                <Select
                  value={delegateUserId}
                  onValueChange={setDelegateUserId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableMembers
                      .filter(
                        (member) =>
                          member.id !==
                          (canChooseOwner ? ownerUserId : profile?.id),
                      )
                      .map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.full_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Escopo</Label>
                <Select
                  value={delegationScope}
                  onValueChange={(value) => {
                    setDelegationScope(value as TeamDelegationScope);
                    setDelegationContext("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELEGATION_SCOPES.map((scope) => (
                      <SelectItem key={scope.value} value={scope.value}>
                        {scope.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contexto</Label>
                {contextControl() ?? (
                  <Input disabled value="Toda a organização" />
                )}
              </div>
              <div className="space-y-2">
                <Label>Início opcional</Label>
                <Input
                  type="datetime-local"
                  value={delegationStart}
                  onChange={(event) => setDelegationStart(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim opcional</Label>
                <Input
                  type="datetime-local"
                  value={delegationEnd}
                  onChange={(event) => setDelegationEnd(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  min={0}
                  value={delegationPriority}
                  onChange={(event) =>
                    setDelegationPriority(event.target.value)
                  }
                />
              </div>
            </div>
            <Button
              onClick={createDelegation}
              disabled={
                availability.isSaving || !availability.canUseAvailability
              }
            >
              Criar delegação
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ausências</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {availability.absences.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma ausência registrada.
              </p>
            ) : (
              availability.absences.map((absence) => (
                <div key={absence.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{getAbsenceTypeLabel(absence.absence_type)}</Badge>
                    <p className="font-medium">
                      {memberNames.get(absence.user_id) ?? "Pessoa"}
                    </p>
                    {absence.substitute_user_id && (
                      <Badge variant="outline">
                        Substituído por{" "}
                        {memberNames.get(absence.substitute_user_id) ??
                          "usuário"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatPeriod(absence.starts_at, absence.ends_at)}
                  </p>
                  {absence.reason && (
                    <p className="mt-1 text-sm">{absence.reason}</p>
                  )}
                  {absence.status !== "cancelled" &&
                    (availability.canManage ||
                      absence.user_id === profile?.id) && (
                      <Button
                        className="mt-2"
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (await availability.cancelAbsence(absence.id)) {
                            toast.success("Ausência cancelada.");
                          }
                        }}
                      >
                        Cancelar
                      </Button>
                    )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delegações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {availability.delegations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma regra de delegação cadastrada.
              </p>
            ) : (
              availability.delegations.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {memberNames.get(rule.owner_user_id) ?? "Titular"} →{" "}
                      {memberNames.get(rule.substitute_user_id) ?? "Substituto"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Escopo {rule.scope} · prioridade {rule.priority}
                    </p>
                    {rule.active && (
                      <Badge className="mt-2" variant="secondary">
                        <UserCheck className="mr-1 h-3 w-3" />
                        Substituto ativo
                      </Badge>
                    )}
                  </div>
                  <Switch
                    checked={rule.active}
                    disabled={
                      !availability.canManage &&
                      rule.owner_user_id !== profile?.id
                    }
                    onCheckedChange={async (active) => {
                      if (
                        await availability.toggleDelegation(rule.id, active)
                      ) {
                        toast.success(
                          active ? "Delegação ativada." : "Delegação pausada.",
                        );
                      }
                    }}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Substituições são informativas nesta fase. A permissão de agir em nome
        do titular será tratada na P-25 com auditoria específica.
      </p>
    </div>
  );
}
