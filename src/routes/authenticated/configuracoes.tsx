import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuthContext } from "@/contexts/AuthContext";
import { DOC_TYPES, SECTORS } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { requireRole } from "./-route-guards";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/configuracoes")({
  beforeLoad: async ({ location }) => {
    await requireRole(location.href, ["admin", "manager"]);
  },
  component: Configuracoes,
});

interface OrgSettings {
  default_review_months?: number
  alert_days?: number[]
}

interface OrgDetails {
  id: string
  name: string
  sector: string
  code_prefix: string
  plan: string
  settings: OrgSettings
}

const REVIEW_PERIODS = [6, 12, 24, 36] as const;
const ALERT_DAYS = [30, 15, 7] as const;

function Configuracoes() {
  const { profile, org } = useAuthContext();
  const [orgDetails, setOrgDetails] = useState<OrgDetails | null>(null);
  const [name, setName] = useState(org?.name ?? "");
  const [prefix, setPrefix] = useState(org?.code_prefix ?? "");
  const [sector, setSector] = useState(org?.sector ?? "industrial");
  const [reviewMonths, setReviewMonths] = useState("24");
  const [alertDays, setAlertDays] = useState<number[]>([30, 15, 7]);
  const [areas, setAreas] = useState<string[]>([]);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingDeadlines, setSavingDeadlines] = useState(false);

  const isAdmin = profile?.role === "admin";
  const canAccess = profile?.role === "admin" || profile?.role === "manager";

  useEffect(() => {
    async function loadSettings() {
      if (!org?.id) return;

      const [{ data: orgData }, { data: areaRows }] = await Promise.all([
        supabase
          .from("organizations")
          .select("id, name, sector, code_prefix, plan, settings")
          .eq("id", org.id)
          .single(),
        supabase
          .from("documents")
          .select("area")
          .eq("org_id", org.id),
      ]);

      if (orgData) {
        const settings = (orgData.settings ?? {}) as OrgSettings;
        setOrgDetails({ ...orgData, settings } as OrgDetails);
        setName(orgData.name ?? "");
        setPrefix(orgData.code_prefix ?? "");
        setSector(orgData.sector ?? "industrial");
        setReviewMonths(String(settings.default_review_months ?? 24));
        setAlertDays(settings.alert_days?.length ? settings.alert_days : [30, 15, 7]);
      }

      setAreas(Array.from(new Set((areaRows ?? []).map((row) => row.area).filter(Boolean))).sort());
    }

    loadSettings();
  }, [org?.id]);

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso negado</CardTitle>
          <CardDescription>Esta página é restrita a Gestores e Administradores.</CardDescription>
        </CardHeader>
        <CardContent><Button asChild variant="secondary"><Link to="/authenticated/dashboard">Voltar</Link></Button></CardContent>
      </Card>
    );
  }

  async function saveOrganizationInfo() {
    if (!org?.id || !isAdmin) return;
    setSavingOrg(true);
    const { error } = await supabase
      .from("organizations")
      .update({ name, code_prefix: prefix.toUpperCase().slice(0, 4), sector, updated_at: new Date().toISOString() })
      .eq("id", org.id);
    setSavingOrg(false);

    if (error) toast.error(error.message);
    else toast.success("Configurações salvas");
  }

  async function saveDeadlineSettings() {
    if (!org?.id) return;
    setSavingDeadlines(true);
    const settings = { ...(orgDetails?.settings ?? {}), default_review_months: Number(reviewMonths), alert_days: alertDays };
    const { error } = await supabase
      .from("organizations")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", org.id);
    setSavingDeadlines(false);

    if (error) toast.error(error.message);
    else {
      setOrgDetails((prev) => prev ? { ...prev, settings } : prev);
      toast.success("Configurações salvas");
    }
  }

  function toggleAlertDay(day: number, checked: boolean) {
    setAlertDays((prev) => checked ? Array.from(new Set([...prev, day])).sort((a, b) => b - a) : prev.filter((item) => item !== day));
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Parâmetros da organização e padrões do TRAMITA.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações da Organização</CardTitle>
          <CardDescription>O prefixo será usado apenas para novos documentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2"><Label>Nome da organização</Label><Input value={name} disabled={!isAdmin} onChange={(event) => setName(event.target.value)} /></div>
            <div><Label>Prefixo dos documentos</Label><Input value={prefix} maxLength={4} disabled={!isAdmin} onChange={(event) => setPrefix(event.target.value.toUpperCase())} /></div>
            <div className="md:col-span-3">
              <Label>Setor</Label>
              <Select value={sector} onValueChange={setSector} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SECTORS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {!isAdmin && <p className="text-sm text-muted-foreground">Gestores podem consultar, mas apenas administradores editam nome, prefixo e setor.</p>}
          <Button onClick={saveOrganizationInfo} disabled={!isAdmin || savingOrg}>{savingOrg ? "Salvando..." : "Salvar organização"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prazos Padrão</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Prazo padrão de revisão</Label>
            <Select value={reviewMonths} onValueChange={setReviewMonths}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REVIEW_PERIODS.map((period) => <SelectItem key={period} value={String(period)}>{period} meses</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Dias de alerta de vencimento</Label>
            <div className="flex gap-4 mt-2">
              {ALERT_DAYS.map((day) => (
                <label key={day} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={alertDays.includes(day)} onCheckedChange={(checked) => toggleAlertDay(day, checked === true)} />
                  {day} dias
                </label>
              ))}
            </div>
          </div>
          <Button onClick={saveDeadlineSettings} disabled={savingDeadlines}>{savingDeadlines ? "Salvando..." : "Salvar prazos"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Áreas de Trabalho</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">{areas.length ? areas.map((area) => <Badge key={area} variant="secondary">{area}</Badge>) : <span className="text-muted-foreground">Nenhuma área em uso ainda.</span>}</div>
          <p className="text-sm text-muted-foreground">Novas áreas são criadas automaticamente ao cadastrar documentos.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tipos de Documento</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {DOC_TYPES.map((type) => <div key={type.value} className="rounded-md border p-3"><span className="font-mono font-semibold">{type.value}</span> — {type.label}</div>)}
          <p className="md:col-span-2 text-sm text-muted-foreground">Tipos de documento são definidos pelo sistema TRAMITA.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Informações do Sistema</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div><span className="text-muted-foreground">Plano:</span> {(orgDetails?.plan ?? "pilot").replace(/^./, (char) => char.toUpperCase())}</div>
          <div><span className="text-muted-foreground">Organização ID:</span> <code>{org?.id ? `${org.id.slice(0, 8)}...${org.id.slice(-8)}` : "—"}</code></div>
          <Separator />
          <div><span className="text-muted-foreground">Versão do TRAMITA:</span> 1.0.0 — P-7</div>
        </CardContent>
      </Card>
    </div>
  );
}
