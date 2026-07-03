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

function CalendarPageHeader() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Calendário e SLA</h1>
      <p className="mt-1 text-muted-foreground">
        Configure dias úteis, feriados e políticas de prazo operacional.
      </p>
    </div>
  );
}

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
  const [reviewDays, setReviewDays] = useState("");
  const [stepDays, setStepDays] = useState("5");
  const [warningDays, setWarningDays] = useState("3");
  const [priority, setPriority] = useState("100");
  const [policyActive, setPolicyActive] = useState(true);
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
  const moduleState = useMemo(() => {
    if (calendar.status === "ready") {
      if (!calendar.calendars.some((item) => item.is_default)) {
        return {
          label: "Sem calendário padrão",
          description:
            "Há calendário disponível, mas nenhum está marcado como padrão.",
          variant: "secondary" as const,
        };
      }
      return {
        label: "Instalado",
        description: "Usando calendário operacional.",
        variant: "default" as const,
      };
    }
    if (calendar.status === "empty") {
      return {
        label: "Sem calendário padrão",
        description: "Usando fallback de segunda a sexta.",
        variant: "secondary" as const,
      };
    }
    if (calendar.status === "not_installed") {
      return {
        label: "Não instalado",
        description:
          "Usando comparação simples porque o ciclo 21 não está instalado.",
        variant: "destructive" as const,
      };
    }
    return {
      label: "Atenção",
      description:
        calendar.status === "restricted"
          ? "Leitura limitada por organização ou permissão."
          : "Não foi possível confirmar o calendário operacional.",
      variant: "outline" as const,
    };
  }, [calendar.calendars, calendar.status]);
  const canConfigure =
    calendar.canManage && ["ready", "empty"].includes(calendar.status);

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
      <div className="space-y-6">
        <CalendarPageHeader />
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Estado do módulo</CardTitle>
                <CardDescription>{moduleState.description}</CardDescription>
              </div>
              <Badge variant={moduleState.variant}>{moduleState.label}</Badge>
            </div>
          </CardHeader>
        </Card>
        <Alert>
          <CalendarDays className="h-4 w-4" />
          <AlertTitle>Calendário operacional indisponível</AlertTitle>
          <AlertDescription>
            O ciclo 21_TRAMITA_operational_calendar_sla ainda não foi aplicado.
            Aplique o ciclo 21 no Supabase para habilitar esta tela. Enquanto
            isso, Home e Central continuam usando comparação simples de datas.
          </AlertDescription>
        </Alert>
      </div>
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
    const normalizedReviewDays = reviewDays.trim()
      ? Number(reviewDays)
      : null;
    const normalizedStepDays = stepDays.trim() ? Number(stepDays) : null;
    const warning = Number(warningDays);
    const saved = await calendar.savePolicy({
      name: policyName,
      docType: docType === "all" ? null : docType,
      area: area || null,
      projectId: projectId === "all" ? null : projectId,
      stepType:
        normalizedStepDays && stepType !== "all" ? stepType : null,
      calendarId: calendar.defaultCalendar?.id,
      reviewDueDays: normalizedReviewDays,
      stepDueDays: normalizedStepDays,
      warningBeforeDays: warning,
      severity,
      priority: Number(priority),
      active: policyActive,
    });
    if (!saved) return;
    setPolicyName("");
    toast.success("Política SLA criada.");
  }

  return (
    <div className="space-y-6">
      <CalendarPageHeader />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Estado do módulo</CardTitle>
              <CardDescription>{moduleState.description}</CardDescription>
            </div>
            <Badge variant={moduleState.variant}>{moduleState.label}</Badge>
          </div>
        </CardHeader>
      </Card>

      {!calendar.canManage && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Visualização somente leitura</AlertTitle>
          <AlertDescription>
            Somente administradores e gestores podem configurar calendário e
            SLA.
          </AlertDescription>
        </Alert>
      )}

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
                  disabled={!canConfigure}
                  onChange={(event) => setCalendarName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calendar-timezone">Fuso horário</Label>
                <Input
                  id="calendar-timezone"
                  value={timezone}
                  disabled={!canConfigure}
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
                      disabled={!canConfigure}
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
                  disabled={!canConfigure}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calendar-end">Fim da jornada</Label>
                <Input
                  id="calendar-end"
                  type="time"
                  value={endTime}
                  disabled={!canConfigure}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleSaveCalendar}
              disabled={calendar.isSaving || !canConfigure}
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
                  disabled={!canConfigure}
                  onChange={(event) => setHolidayName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holiday-date">Data</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  value={holidayDate}
                  disabled={!canConfigure}
                  onChange={(event) => setHolidayDate(event.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={holidayRepeats}
                disabled={!canConfigure}
                onCheckedChange={setHolidayRepeats}
              />
              Repetir anualmente
            </label>
            <Button
              variant="secondary"
              onClick={handleAddHoliday}
              disabled={
                calendar.isSaving ||
                !calendar.defaultCalendar ||
                !canConfigure
              }
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
                      disabled={!canConfigure}
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
                disabled={!canConfigure}
                onChange={(event) => setPolicyName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo documental</Label>
              <Select
                value={docType}
                onValueChange={setDocType}
                disabled={!canConfigure}
              >
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
                disabled={!canConfigure}
                onChange={(event) => setArea(event.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de etapa</Label>
              <Select
                value={stepType}
                onValueChange={setStepType}
                disabled={!canConfigure}
              >
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
            <div className="space-y-2">
              <Label htmlFor="review-days">Dias para revisão</Label>
              <Input
                id="review-days"
                type="number"
                min={1}
                placeholder="Opcional"
                value={reviewDays}
                disabled={!canConfigure}
                onChange={(event) => setReviewDays(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="step-days">Dias para etapa</Label>
              <Input
                id="step-days"
                type="number"
                min={1}
                placeholder="Opcional"
                value={stepDays}
                disabled={!canConfigure}
                onChange={(event) => setStepDays(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warning-days">Avisar antes (dias úteis)</Label>
              <Input
                id="warning-days"
                type="number"
                min={0}
                value={warningDays}
                disabled={!canConfigure}
                onChange={(event) => setWarningDays(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-priority">Prioridade</Label>
              <Input
                id="policy-priority"
                type="number"
                min={0}
                value={priority}
                disabled={!canConfigure}
                onChange={(event) => setPriority(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Severidade</Label>
              <Select
                value={severity}
                disabled={!canConfigure}
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
            <div className="space-y-2">
              <Label>Projeto</Label>
              <Select
                value={projectId}
                onValueChange={setProjectId}
                disabled={!canConfigure}
              >
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
            <div className="space-y-2">
              <Label>Estado inicial</Label>
              <label className="flex h-10 items-center gap-3 rounded-md border px-3 text-sm">
                <Switch
                  checked={policyActive}
                  disabled={!canConfigure}
                  onCheckedChange={setPolicyActive}
                />
                {policyActive ? "Política ativa" : "Política inativa"}
              </label>
            </div>
          </div>

          <Button
            onClick={handleSavePolicy}
            disabled={
              calendar.isSaving ||
              !calendar.defaultCalendar ||
              !canConfigure
            }
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
                      {[
                        policy.review_due_days
                          ? `revisão em ${policy.review_due_days} dias úteis`
                          : null,
                        policy.step_due_days
                          ? `etapa em ${policy.step_due_days} dias úteis`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[policy.doc_type, policy.area, policy.step_type]
                        .filter(Boolean)
                        .join(" · ") || "Toda a organização"}
                      {" · "}
                      prioridade {policy.priority}
                      {" · "}
                      alerta {policy.warning_before_days} dia(s) antes
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {policy.active ? "Ativa" : "Inativa"}
                    </span>
                    <Switch
                      checked={policy.active}
                      disabled={!canConfigure}
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
