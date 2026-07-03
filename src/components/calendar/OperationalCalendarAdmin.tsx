import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Loader2,
  ShieldCheck,
  Trash2,
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
import { useOperationalCalendar } from "@/hooks/useOperationalCalendar";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { DOC_TYPES } from "@/lib/constants";
import {
  DEFAULT_OPERATIONAL_WORKWEEK,
  type OperationalWorkweek,
} from "@/lib/operationalCalendar";

const WORKWEEK_LABELS: Array<{
  key: keyof OperationalWorkweek;
  label: string;
}> = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

const STEP_TYPES = [
  { value: "review", label: "Revisão" },
  { value: "approval", label: "Aprovação" },
  { value: "evidence", label: "Evidência" },
  { value: "mandatory_reading", label: "Leitura obrigatória" },
  { value: "correction", label: "Correção" },
  { value: "publication", label: "Publicação" },
];

export function OperationalCalendarAdmin() {
  const calendar = useOperationalCalendar();
  const projectOptions = useProjectOptions();
  const [calendarName, setCalendarName] = useState("Calendário operacional");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [workweek, setWorkweek] = useState<OperationalWorkweek>(
    DEFAULT_OPERATIONAL_WORKWEEK,
  );
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayRepeats, setHolidayRepeats] = useState(false);
  const [policyName, setPolicyName] = useState("");
  const [policyKind, setPolicyKind] = useState<"review" | "step">("review");
  const [policyDays, setPolicyDays] = useState("5");
  const [warningDays, setWarningDays] = useState("3");
  const [docType, setDocType] = useState("all");
  const [area, setArea] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [stepType, setStepType] = useState("all");
  const [severity, setSeverity] = useState<
    "low" | "medium" | "high" | "critical"
  >("medium");

  useEffect(() => {
    if (!calendar.defaultCalendar) return;
    setCalendarName(calendar.defaultCalendar.name);
    setTimezone(calendar.defaultCalendar.timezone);
    setStartTime(calendar.defaultCalendar.default_start_time.slice(0, 5));
    setEndTime(calendar.defaultCalendar.default_end_time.slice(0, 5));
    setWorkweek(calendar.defaultCalendar.workweek);
  }, [calendar.defaultCalendar]);

  const sortedHolidays = useMemo(
    () =>
      [...calendar.holidays].sort((left, right) =>
        left.holiday_date.localeCompare(right.holiday_date),
      ),
    [calendar.holidays],
  );

  if (calendar.isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando calendário operacional...
      </div>
    );
  }

  if (calendar.status === "not_installed") {
    return (
      <Alert>
        <CalendarDays className="h-4 w-4" />
        <AlertTitle>Ciclo 21 ainda não instalado</AlertTitle>
        <AlertDescription>
          Aplique manualmente a migration
          <code className="mx-1 rounded bg-muted px-1">
            20260630_p24_operational_calendar_sla.sql
          </code>
          para configurar dias úteis, feriados e políticas SLA. A aplicação
          continua usando datas simples enquanto isso.
        </AlertDescription>
      </Alert>
    );
  }

  async function handleSaveCalendar() {
    const saved = await calendar.saveDefaultCalendar({
      name: calendarName,
      timezone,
      workweek,
      defaultStartTime: startTime,
      defaultEndTime: endTime,
    });
    if (saved) toast.success("Calendário operacional salvo.");
  }

  async function handleAddHoliday() {
    const saved = await calendar.addHoliday({
      calendarId: calendar.defaultCalendar?.id,
      holidayDate,
      name: holidayName,
      repeatsYearly: holidayRepeats,
    });
    if (!saved) return;
    setHolidayName("");
    setHolidayDate("");
    setHolidayRepeats(false);
    toast.success("Feriado cadastrado.");
  }

  async function handleSavePolicy() {
    const days = Number(policyDays);
    const warning = Number(warningDays);
    const saved = await calendar.savePolicy({
      name: policyName,
      docType: docType === "all" ? null : docType,
      area: area || null,
      projectId: projectId === "all" ? null : projectId,
      stepType:
        policyKind === "step" && stepType !== "all" ? stepType : null,
      calendarId: calendar.defaultCalendar?.id,
      reviewDueDays: policyKind === "review" ? days : null,
      stepDueDays: policyKind === "step" ? days : null,
      warningBeforeDays: warning,
      severity,
    });
    if (!saved) return;
    setPolicyName("");
    toast.success("Política SLA criada.");
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Calendário e SLA
          </h1>
          <Badge variant={calendar.canUseCalendar ? "default" : "secondary"}>
            {calendar.canUseCalendar ? "Calendário ativo" : "Fallback ativo"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure dias úteis, feriados e prazos operacionais. Nenhum status é
          alterado automaticamente.
        </p>
      </div>

      {(calendar.error || calendar.schemaMessage) && (
        <Alert variant={calendar.error ? "destructive" : "default"}>
          <AlertTitle>
            {calendar.error ? "Atenção ao calendário" : "Modo de cálculo"}
          </AlertTitle>
          <AlertDescription>
            {calendar.error ?? calendar.schemaMessage}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-5 w-5" />
              Calendário padrão
            </CardTitle>
            <CardDescription>
              Define a semana útil e a jornada de referência da organização.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="calendar-name">Nome</Label>
                <Input
                  id="calendar-name"
                  value={calendarName}
                  onChange={(event) => setCalendarName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calendar-timezone">Fuso horário</Label>
                <Input
                  id="calendar-timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Dias úteis</Label>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {WORKWEEK_LABELS.map((day) => (
                  <label
                    key={day.key}
                    className="flex flex-col items-center gap-2 rounded-lg border p-2 text-xs"
                  >
                    {day.label}
                    <Switch
                      checked={workweek[day.key]}
                      onCheckedChange={(checked) =>
                        setWorkweek((current) => ({
                          ...current,
                          [day.key]: checked,
                        }))
                      }
                      aria-label={`${day.label} é dia útil`}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="calendar-start">Início da jornada</Label>
                <Input
                  id="calendar-start"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calendar-end">Fim da jornada</Label>
                <Input
                  id="calendar-end"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleSaveCalendar}
              disabled={calendar.isSaving}
            >
              {calendar.isSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar calendário padrão
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Feriados
            </CardTitle>
            <CardDescription>
              Datas cadastradas são ignoradas no cálculo de dias úteis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <div className="space-y-2">
                <Label htmlFor="holiday-name">Nome</Label>
                <Input
                  id="holiday-name"
                  placeholder="Ex.: Feriado municipal"
                  value={holidayName}
                  onChange={(event) => setHolidayName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holiday-date">Data</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  value={holidayDate}
                  onChange={(event) => setHolidayDate(event.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={holidayRepeats}
                onCheckedChange={setHolidayRepeats}
              />
              Repetir anualmente
            </label>
            <Button
              variant="secondary"
              onClick={handleAddHoliday}
              disabled={calendar.isSaving || !calendar.defaultCalendar}
            >
              Adicionar feriado
            </Button>
            {!calendar.defaultCalendar && (
              <p className="text-xs text-muted-foreground">
                Salve primeiro o calendário padrão.
              </p>
            )}

            <Separator />
            <div className="max-h-64 space-y-2 overflow-auto">
              {sortedHolidays.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum feriado cadastrado.
                </p>
              ) : (
                sortedHolidays.map((holiday) => (
                  <div
                    key={holiday.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{holiday.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(
                          `${holiday.holiday_date}T12:00:00`,
                        ).toLocaleDateString("pt-BR")}
                        {holiday.repeats_yearly ? " · anual" : ""}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remover ${holiday.name}`}
                      onClick={async () => {
                        if (await calendar.deleteHoliday(holiday.id)) {
                          toast.success("Feriado removido.");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Políticas de prazo
          </CardTitle>
          <CardDescription>
            Defina prazos em dias úteis para revisões documentais ou etapas de
            trâmite. O sistema apenas calcula e sinaliza.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="policy-name">Nome da política</Label>
              <Input
                id="policy-name"
                placeholder="Ex.: Aprovação técnica em 5 dias úteis"
                value={policyName}
                onChange={(event) => setPolicyName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Aplicar a</Label>
              <Select
                value={policyKind}
                onValueChange={(value) =>
                  setPolicyKind(value as "review" | "step")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="review">Revisão documental</SelectItem>
                  <SelectItem value="step">Etapa de trâmite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-days">Prazo em dias úteis</Label>
              <Input
                id="policy-days"
                type="number"
                min={1}
                value={policyDays}
                onChange={(event) => setPolicyDays(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo documental</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {DOC_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-area">Área</Label>
              <Input
                id="policy-area"
                placeholder="Todas ou código da área"
                value={area}
                onChange={(event) => setArea(event.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label>Projeto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os projetos</SelectItem>
                  {projectOptions.projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.code ? `${project.code} · ` : ""}
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {policyKind === "step" ? (
              <div className="space-y-2">
                <Label>Tipo de etapa</Label>
                <Select value={stepType} onValueChange={setStepType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as etapas</SelectItem>
                    {STEP_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="warning-days">Avisar antes (dias úteis)</Label>
                <Input
                  id="warning-days"
                  type="number"
                  min={0}
                  value={warningDays}
                  onChange={(event) => setWarningDays(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Severidade</Label>
              <Select
                value={severity}
                onValueChange={(value) =>
                  setSeverity(
                    value as "low" | "medium" | "high" | "critical",
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {policyKind === "step" && (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="step-warning-days">
                Avisar antes (dias úteis)
              </Label>
              <Input
                id="step-warning-days"
                type="number"
                min={0}
                value={warningDays}
                onChange={(event) => setWarningDays(event.target.value)}
              />
            </div>
          )}

          <Button
            onClick={handleSavePolicy}
            disabled={calendar.isSaving || !calendar.defaultCalendar}
          >
            Criar política SLA
          </Button>

          <Separator />
          {calendar.policies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma política cadastrada. Prazos existentes continuam sendo
              lidos normalmente.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {calendar.policies.map((policy) => (
                <div
                  key={policy.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{policy.name}</p>
                      <Badge variant="outline">{policy.severity}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {policy.review_due_days
                        ? `Revisão em ${policy.review_due_days} dias úteis`
                        : `Etapa em ${policy.step_due_days} dias úteis`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[policy.doc_type, policy.area, policy.step_type]
                        .filter(Boolean)
                        .join(" · ") || "Toda a organização"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {policy.active ? "Ativa" : "Inativa"}
                    </span>
                    <Switch
                      checked={policy.active}
                      onCheckedChange={async (active) => {
                        if (await calendar.togglePolicy(policy.id, active)) {
                          toast.success(
                            active ? "Política ativada." : "Política desativada.",
                          );
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
