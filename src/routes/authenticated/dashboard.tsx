import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, FileStack, FileText, CheckCircle2, Layers, ListChecks } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DOC_TYPES } from "@/lib/constants";
import { useDashboard } from "@/hooks/useDashboard";
import { useExpiringDocuments } from "@/hooks/useExpiringDocuments";

export const Route = createFileRoute("/authenticated/dashboard")({ component: Dashboard });

const chartColors = ["#4A90D9", "#00C271", "#F5A623", "#F05454", "#8B5CF6", "#14B8A6", "#64748B"];

function getDocTypeLabel(value: string) {
  return DOC_TYPES.find((type) => type.value === value)?.label ?? value;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

function isWithinSevenDays(value: string | null) {
  if (!value) return false;
  const diffDays = Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
}

function Dashboard() {
  const { metrics, loading, error } = useDashboard();
  const { documents: expiringDocuments, loading: expiringLoading } = useExpiringDocuments(30);

  if (loading) return <div className="p-6 text-muted-foreground">Carregando métricas do dashboard...</div>;
  if (error) return <div className="p-6 text-destructive">{error}</div>;
  if (!metrics) return <div className="p-6 text-muted-foreground">Nenhuma métrica disponível.</div>;

  const inFlow = metrics.in_review + metrics.pending_approval;
  const typeChartData = metrics.by_type.map((item) => ({ name: item.doc_type, label: getDocTypeLabel(item.doc_type), count: item.count }));
  const areaChartData = metrics.by_area.map((item) => ({ name: item.area, count: item.count }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Indicadores reais dos documentos TRAMITA no seu tenant.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard icon={<FileStack className="h-5 w-5" />} label="Total de Documentos" value={metrics.total} />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Publicados" value={metrics.published} />
        <MetricCard icon={<Clock className="h-5 w-5" />} label="Em Fluxo" value={inFlow} />
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Rascunhos" value={metrics.draft} />
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Aguardando Minha Ação</CardTitle>
            <ListChecks className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.pending_my_action}</div>
            <Button asChild variant="link" className="px-0">
              <Link to="/authenticated/fluxo-de-aprovacao">Abrir fila</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Vencendo em 30 dias</CardTitle>
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold">{metrics.expiring_30_days}</div>
              <Badge variant={metrics.expiring_30_days > 0 ? "secondary" : "outline"}>{metrics.expiring_30_days > 0 ? "Acompanhar" : "Sem alertas"}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Vencendo em 7 dias</CardTitle>
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold">{metrics.expiring_7_days}</div>
              <Badge variant={metrics.expiring_7_days > 0 ? "destructive" : "outline"}>{metrics.expiring_7_days > 0 ? "Atenção crítica" : "Sem críticos"}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Publicados (últimos 30 dias)" value={metrics.recent_published} />
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Criados (últimos 30 dias)" value={metrics.recent_created} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard icon={<ListChecks className="h-5 w-5" />} label="Etapas de aprovação pendentes" value={metrics.pending_approval_steps} />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Etapas de aprovação atrasadas" value={metrics.overdue_approval_steps} />
      </div>

      {metrics.expiring_30_days > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Documentos a vencer nos próximos 30 dias</CardTitle>
            <CardDescription>Priorize revisões próximas ao prazo obrigatório.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {expiringLoading ? (
              <div className="p-4 text-muted-foreground">Carregando documentos a vencer...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Código</TableHead><TableHead>Título</TableHead><TableHead>Área</TableHead><TableHead>Próxima revisão</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {expiringDocuments.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell className="font-mono text-xs">{document.code ?? "Gerando..."}</TableCell>
                      <TableCell>
                        <Link className="font-medium hover:underline" to="/authenticated/documents/$documentId" params={{ documentId: document.id }}>
                          {document.title}
                        </Link>
                      </TableCell>
                      <TableCell>{document.area}</TableCell>
                      <TableCell className={isWithinSevenDays(document.next_review_at) ? "text-destructive font-medium" : ""}>{formatDate(document.next_review_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Documentos por tipo</CardTitle>
            <CardDescription>Distribuição por classificação documental.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {typeChartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value, _name, item) => [value, item.payload.label]} />
                  <Bar dataKey="count" fill="#4A90D9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyBreakdown />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documentos por área</CardTitle>
            <CardDescription>Ranking das áreas com documentos cadastrados.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {areaChartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={areaChartData} dataKey="count" nameKey="name" label outerRadius={100}>
                    {areaChartData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyBreakdown />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent><div className="text-3xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function EmptyBreakdown() {
  return <div className="h-full flex items-center justify-center text-muted-foreground">Sem dados para exibir.</div>;
}
