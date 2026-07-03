import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamAvailabilityPanel } from "@/components/team/TeamAvailabilityPanel";
import { useOperationalCalendar } from "@/hooks/useOperationalCalendar";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { useTeam } from "@/hooks/useTeam";
import { useTeamAvailability } from "@/hooks/useTeamAvailability";
import { DOC_TYPES } from "@/lib/constants";
import {
  buildBrazilHolidayPack,
  fetchNagerDateHolidays,
  HOLIDAY_COUNTRIES,
  type HolidayProviderId,
} from "@/lib/holidayProviders";
import {
  DEFAULT_OPERATIONAL_WORKWEEK,
  type OperationalWorkweek,
} from "@/lib/operationalCalendar";
import {
  formatTimeZoneLabel,
  getSupportedTimeZones,
  isValidTimeZone,
} from "@/lib/timeZones";

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

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  br_local_pack: "Brasil local",
  nager_date_api: "Nager.Date",
};

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function OperationalCalendarAdmin() {
  const calendar = useOperationalCalendar();
  const availability = useTeamAvailability();
  const team = useTeam();
  const projectOptions = useProjectOptions();
  const timeZones = useMemo(() => getSupportedTimeZones(), []);
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
  const [manualCountry, setManualCountry] = useState("BR");
  const [importCountry, setImportCountry] = useState("BR");
  const [importYear, setImportYear] = useState(
    String(new Date().getFullYear()),
  );
  const [importSubdivision, setImportSubdivision] = useState("");
  const [provider, setProvider] = useState<HolidayProviderId>("br_local_pack");
  const [includeOptional, setIncludeOptional] = useState(false);
  const [includeNational, setIncludeNational] = useState(true);
  const [includeSubdivisions, setIncludeSubdivisions] = useState(true);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    warnings: string[];
  } | null>(null);
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

  const timezoneValid = isValidTimeZone(timezone, timeZones);
  const canConfigure =
    calendar.canManage && ["ready", "empty"].includes(calendar.status);
  const sortedHolidays = useMemo(
    () =>
      [...calendar.holidays].sort((left, right) =>
        left.holiday_date.localeCompare(right.holiday_date),
      ),
    [calendar.holidays],
  );
  const nextHoliday = sortedHolidays.find(
    (holiday) =>
      holiday.observed &&
      new Date(`${holiday.holiday_date}T23:59:59`).getTime() >= Date.now(),
  );
  const activePolicies = calendar.policies.filter(
    (policy) => policy.active,
  ).length;
  const hasExplicitDefault = calendar.calendars.some((item) => item.is_default);
  const cycle21Label =
    calendar.status === "ready" || calendar.status === "empty"
      ? "Instalado"
      : calendar.status === "not_installed"
        ? "Não instalado"
        : "Atenção";
  const cycle22Label =
    calendar.enterpriseStatus === "ready"
      ? "Instalado"
      : calendar.enterpriseStatus === "not_installed"
        ? "Não instalado"
        : calendar.enterpriseStatus === "loading"
          ? "Verificando"
          : "Atenção";
  const calculationMode =
    calendar.status === "ready"
      ? "Calendário operacional"
      : calendar.status === "empty"
        ? "Fallback segunda a sexta"
        : "Comparação simples";

  if (calendar.isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando Calendário e SLA...
      </div>
    );
  }

  async function saveCalendar() {
    if (!timezoneValid) {
      toast.error("Escolha um fuso horário IANA válido.");
      return;
    }
    if (
      await calendar.saveDefaultCalendar({
        name: calendarName,
        timezone,
        workweek,
        defaultStartTime: startTime,
        defaultEndTime: endTime,
      })
    ) {
      toast.success("Calendário operacional salvo.");
    }
  }

  function applyPreset(preset: "br_standard" | "six_by_one" | "always") {
    if (preset === "br_standard") {
      setTimezone("America/Sao_Paulo");
      setWorkweek(DEFAULT_OPERATIONAL_WORKWEEK);
      setStartTime("08:00");
      setEndTime("18:00");
    } else if (preset === "six_by_one") {
      setWorkweek({ ...DEFAULT_OPERATIONAL_WORKWEEK, sat: true });
      setStartTime("08:00");
      setEndTime("18:00");
    } else {
      setWorkweek({
        mon: true,
        tue: true,
        wed: true,
        thu: true,
        fri: true,
        sat: true,
        sun: true,
      });
      setStartTime("00:00");
      setEndTime("23:59");
    }
  }

  async function addManualHoliday() {
    if (
      await calendar.addHoliday({
        calendarId: calendar.defaultCalendar?.id,
        holidayDate,
        name: holidayName,
        repeatsYearly: holidayRepeats,
        countryCode: manualCountry,
      })
    ) {
      setHolidayName("");
      setHolidayDate("");
      setHolidayRepeats(false);
      toast.success("Feriado cadastrado.");
    }
  }

  async function importHolidays() {
    const year = Number(importYear);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      toast.error("Informe um ano entre 1900 e 2200.");
      return;
    }
    try {
      let candidates =
        provider === "br_local_pack"
          ? buildBrazilHolidayPack(year, includeOptional)
          : await fetchNagerDateHolidays({
              countryCode: importCountry,
              year,
              subdivisionCode: importSubdivision || null,
              includeOptional,
              includeNational,
              includeSubdivisions,
            });
      if (provider === "br_local_pack" && !includeNational) {
        candidates = candidates.filter((holiday) => holiday.optional);
      }
      const result = await calendar.importHolidays({
        candidates,
        provider,
        countryCode: importCountry,
        subdivisionCode: importSubdivision || null,
        year,
      });
      if (!result) return;
      setImportResult(result);
      toast.success(
        `${result.imported} feriado(s) importado(s); ${result.skipped} ignorado(s).`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível importar os feriados.",
      );
    }
  }

  async function savePolicy() {
    const normalizedStepDays = stepDays.trim() ? Number(stepDays) : null;
    if (
      await calendar.savePolicy({
        name: policyName,
        docType: docType === "all" ? null : docType,
        area: area || null,
        projectId: projectId === "all" ? null : projectId,
        stepType: normalizedStepDays && stepType !== "all" ? stepType : null,
        calendarId: calendar.defaultCalendar?.id,
        reviewDueDays: reviewDays.trim() ? Number(reviewDays) : null,
        stepDueDays: normalizedStepDays,
        warningBeforeDays: Number(warningDays),
        severity,
        priority: Number(priority),
        active: policyActive,
      })
    ) {
      setPolicyName("");
      toast.success("Política SLA criada.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Badge variant="outline" className="mb-3">
            Governança de prazo
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">
            Calendário e SLA
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Calendários operacionais, feriados, disponibilidade da equipe e
            políticas de prazo.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            void Promise.all([calendar.refresh(), availability.refresh()])
          }
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar diagnóstico
        </Button>
      </div>

      {calendar.status === "not_installed" && (
        <Alert>
          <CalendarDays className="h-4 w-4" />
          <AlertTitle>Ciclo 21 não instalado</AlertTitle>
          <AlertDescription>
            Aplique 21_TRAMITA_operational_calendar_sla. Home e Central
            continuam usando comparação simples de datas.
          </AlertDescription>
        </Alert>
      )}
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
      {calendar.error && (
        <Alert variant="destructive">
          <AlertTitle>Falha no calendário</AlertTitle>
          <AlertDescription>{calendar.error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="calendar">Calendário padrão</TabsTrigger>
          <TabsTrigger value="holidays">Feriados</TabsTrigger>
          <TabsTrigger value="sla">Políticas SLA</TabsTrigger>
          <TabsTrigger value="availability">
            Ausências e substituições
          </TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnóstico</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Ciclo 21"
              value={cycle21Label}
              detail="Calendário e políticas SLA"
            />
            <MetricCard
              label="Ciclo 22"
              value={cycle22Label}
              detail="Importação e disponibilidade"
            />
            <MetricCard
              label="Políticas ativas"
              value={activePolicies}
              detail="Revisões e etapas"
            />
            <MetricCard
              label="Modo de cálculo"
              value={calculationMode}
              detail={
                hasExplicitDefault
                  ? "Calendário padrão definido"
                  : "Sem calendário padrão explícito"
              }
            />
            <MetricCard
              label="Próximo feriado"
              value={
                nextHoliday
                  ? new Intl.DateTimeFormat("pt-BR").format(
                      new Date(`${nextHoliday.holiday_date}T12:00:00`),
                    )
                  : "Não cadastrado"
              }
              detail={nextHoliday?.name ?? "Nenhuma data futura"}
            />
            <MetricCard
              label="Pessoas ausentes hoje"
              value={availability.activeAbsences.length}
              detail="Ausências dentro do período atual"
            />
            <MetricCard
              label="Substituições ativas"
              value={availability.activeSubstitutionCount}
              detail="Ausências e regras válidas"
            />
            <MetricCard
              label="Sem substituto"
              value={availability.absencesWithoutSubstitute.length}
              detail="Risco operacional"
            />
          </div>
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Datas persistidas continuam prioritárias</AlertTitle>
            <AlertDescription>
              Sugestões calculadas não alteram documentos, etapas, responsáveis
              ou status automaticamente.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5" />
                Calendário padrão
              </CardTitle>
              <CardDescription>
                Configure semana, jornada e fuso IANA da organização.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => applyPreset("br_standard")}
                  disabled={!canConfigure}
                >
                  Usar Brasil padrão
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyPreset("six_by_one")}
                  disabled={!canConfigure}
                >
                  Usar operação 6x1
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyPreset("always")}
                  disabled={!canConfigure}
                >
                  Usar operação 24/7
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={calendarName}
                    onChange={(event) => setCalendarName(event.target.value)}
                    disabled={!canConfigure}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fuso horário IANA</Label>
                  <Select
                    value={timezoneValid ? timezone : undefined}
                    onValueChange={setTimezone}
                    disabled={!canConfigure}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha um fuso válido" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {timeZones.map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {formatTimeZoneLabel(zone)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!timezoneValid && (
                    <p className="text-sm text-destructive">
                      Fuso inválido salvo. Escolha um fuso válido para
                      continuar.
                    </p>
                  )}
                  {timezoneValid && (
                    <p className="text-xs text-muted-foreground">
                      Atual: {formatTimeZoneLabel(timezone)}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Dias úteis</Label>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {WORKWEEK_LABELS.map((day) => (
                    <label
                      key={day.key}
                      className="flex flex-col items-center gap-2 rounded-lg border p-3 text-xs"
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
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Início da jornada</Label>
                  <Input
                    type="time"
                    value={startTime}
                    disabled={!canConfigure}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fim da jornada</Label>
                  <Input
                    type="time"
                    value={endTime}
                    disabled={!canConfigure}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                As horas ficam preparadas para cálculo fino futuro. Nesta fase,
                os prazos continuam calculados por dia útil.
              </p>
              <Button
                onClick={saveCalendar}
                disabled={!canConfigure || calendar.isSaving || !timezoneValid}
              >
                Salvar calendário padrão
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Novo feriado manual</CardTitle>
                <CardDescription>
                  Cadastros manuais continuam suportados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={holidayName}
                      disabled={!canConfigure}
                      onChange={(event) => setHolidayName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={holidayDate}
                      disabled={!canConfigure}
                      onChange={(event) => setHolidayDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>País</Label>
                    <Select
                      value={manualCountry}
                      onValueChange={setManualCountry}
                      disabled={!canConfigure}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOLIDAY_COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.code} · {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-end gap-3 pb-2 text-sm">
                    <Switch
                      checked={holidayRepeats}
                      disabled={!canConfigure}
                      onCheckedChange={setHolidayRepeats}
                    />
                    Repetir anualmente
                  </label>
                </div>
                <Button
                  onClick={addManualHoliday}
                  disabled={!canConfigure || !calendar.defaultCalendar}
                >
                  Adicionar feriado
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe2 className="h-5 w-5" />
                  Importar feriados
                </CardTitle>
                <CardDescription>
                  Importação manual; os dados ficam salvos localmente no banco.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {calendar.enterpriseStatus !== "ready" && (
                  <Alert>
                    <AlertDescription>
                      Aplique o ciclo 22 para habilitar importação rastreável.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>País</Label>
                    <Select
                      value={importCountry}
                      onValueChange={(value) => {
                        setImportCountry(value);
                        if (value !== "BR") setProvider("nager_date_api");
                      }}
                      disabled={!canConfigure}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOLIDAY_COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.code} · {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Ano</Label>
                    <Input
                      type="number"
                      min={1900}
                      max={2200}
                      value={importYear}
                      disabled={!canConfigure}
                      onChange={(event) => setImportYear(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select
                      value={provider}
                      onValueChange={(value) =>
                        setProvider(value as HolidayProviderId)
                      }
                      disabled={!canConfigure}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {importCountry === "BR" && (
                          <SelectItem value="br_local_pack">
                            Brasil local
                          </SelectItem>
                        )}
                        <SelectItem value="nager_date_api">
                          Nager.Date · fonte externa
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Região/subdivisão</Label>
                    <Input
                      value={importSubdivision}
                      disabled={!canConfigure}
                      onChange={(event) =>
                        setImportSubdivision(event.target.value)
                      }
                      placeholder="Opcional, ex.: BR-SP"
                    />
                  </div>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={includeNational}
                      disabled={!canConfigure}
                      onCheckedChange={setIncludeNational}
                    />
                    Nacionais
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={includeOptional}
                      disabled={!canConfigure}
                      onCheckedChange={setIncludeOptional}
                    />
                    Observâncias
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={includeSubdivisions}
                      disabled={!canConfigure}
                      onCheckedChange={setIncludeSubdivisions}
                    />
                    Subdivisões
                  </label>
                </div>
                <Button
                  onClick={importHolidays}
                  disabled={
                    !canConfigure ||
                    calendar.enterpriseStatus !== "ready" ||
                    calendar.isSaving
                  }
                >
                  {calendar.isSaving && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Importar feriados
                </Button>
                {importResult && (
                  <Alert>
                    <AlertTitle>Importação concluída</AlertTitle>
                    <AlertDescription>
                      {importResult.imported} adicionado(s),{" "}
                      {importResult.skipped} ignorado(s).
                      {importResult.warnings.length
                        ? ` ${importResult.warnings.length} aviso(s).`
                        : ""}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Feriados cadastrados</CardTitle>
              <CardDescription>
                {sortedHolidays.length} data(s) no calendário.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {sortedHolidays.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum feriado cadastrado.
                </p>
              ) : (
                sortedHolidays.map((holiday) => (
                  <div
                    key={holiday.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{holiday.name}</p>
                        <Badge variant="outline">
                          {SOURCE_LABELS[holiday.source ?? "manual"] ??
                            "Manual"}
                        </Badge>
                        {holiday.optional && (
                          <Badge variant="secondary">Opcional</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("pt-BR").format(
                          new Date(`${holiday.holiday_date}T12:00:00`),
                        )}
                        {holiday.country_code
                          ? ` · ${holiday.country_code}`
                          : ""}
                        {holiday.subdivision_code
                          ? ` · ${holiday.subdivision_code}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
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
            </CardContent>
          </Card>

          {calendar.importRuns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Histórico de importação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {calendar.importRuns.map((run) => (
                  <div key={run.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      {run.country_code} · {run.year} ·{" "}
                      {SOURCE_LABELS[run.provider]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.imported_count} importado(s), {run.skipped_count}{" "}
                      ignorado(s) · {run.status}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sla">
          <Card>
            <CardHeader>
              <CardTitle>Políticas SLA</CardTitle>
              <CardDescription>
                Prazos em dias úteis por documento, projeto ou etapa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>Nome</Label>
                  <Input
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
                      <SelectItem value="all">Todos</SelectItem>
                      {DOC_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Área</Label>
                  <Input
                    value={area}
                    disabled={!canConfigure}
                    onChange={(event) =>
                      setArea(event.target.value.toUpperCase())
                    }
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
                      <SelectItem value="all">Todas</SelectItem>
                      {STEP_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Dias para revisão</Label>
                  <Input
                    type="number"
                    min={1}
                    value={reviewDays}
                    disabled={!canConfigure}
                    onChange={(event) => setReviewDays(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dias para etapa</Label>
                  <Input
                    type="number"
                    min={1}
                    value={stepDays}
                    disabled={!canConfigure}
                    onChange={(event) => setStepDays(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Alerta antes</Label>
                  <Input
                    type="number"
                    min={0}
                    value={warningDays}
                    disabled={!canConfigure}
                    onChange={(event) => setWarningDays(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Input
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
                      <SelectItem value="all">Todos</SelectItem>
                      {projectOptions.projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.code ? `${project.code} · ` : ""}
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Switch
                    checked={policyActive}
                    disabled={!canConfigure}
                    onCheckedChange={setPolicyActive}
                  />
                  Política ativa
                </label>
              </div>
              <Button
                onClick={savePolicy}
                disabled={!canConfigure || !calendar.defaultCalendar}
              >
                Criar política
              </Button>
              <Separator />
              <div className="grid gap-3 lg:grid-cols-2">
                {calendar.policies.map((policy) => (
                  <div
                    key={policy.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{policy.name}</p>
                        <Badge variant="outline">{policy.severity}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {policy.review_due_days
                          ? `Revisão: ${policy.review_due_days} dias úteis`
                          : ""}
                        {policy.review_due_days && policy.step_due_days
                          ? " · "
                          : ""}
                        {policy.step_due_days
                          ? `Etapa: ${policy.step_due_days} dias úteis`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Prioridade {policy.priority} · alerta{" "}
                        {policy.warning_before_days} dia(s)
                      </p>
                    </div>
                    <Switch
                      checked={policy.active}
                      disabled={!canConfigure}
                      onCheckedChange={(active) =>
                        void calendar.togglePolicy(policy.id, active)
                      }
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="availability">
          <TeamAvailabilityPanel
            members={team.members}
            compact
            availabilityState={availability}
          />
        </TabsContent>

        <TabsContent value="diagnostics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Diagnóstico do ambiente</CardTitle>
              <CardDescription>
                Contratos ativos sem executar alterações automáticas.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {[
                ["Ciclo 21", cycle21Label],
                ["Ciclo 22", cycle22Label],
                [
                  "Calendário padrão",
                  hasExplicitDefault ? "Configurado" : "Ausente",
                ],
                ["Fuso horário", timezoneValid ? timezone : "Inválido"],
                ["Modo de cálculo", calculationMode],
                [
                  "Disponibilidade da equipe",
                  availability.canUseAvailability
                    ? "Disponível"
                    : "Fallback ativo",
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 font-medium">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Alert>
            <Users className="h-4 w-4" />
            <AlertTitle>Substituição informativa</AlertTitle>
            <AlertDescription>
              O sistema não reatribui etapas e não permite ação delegada nesta
              fase. A P-25 deverá integrar autorização, evento e auditoria.
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>
    </div>
  );
}
