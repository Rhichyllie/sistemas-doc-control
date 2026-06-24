import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, RotateCcw, Search } from "lucide-react";
import { requirePermission } from "./-route-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthContext } from "@/contexts/AuthContext";
import { AuditFilters, useAuditTrail } from "@/hooks/useAuditTrail";
import { DOC_STATUS } from "@/lib/constants";
import { exportAuditTrailToPDF } from "@/lib/exportUtils";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/trilha-de-auditoria")({
  beforeLoad: async ({ location }) => {
    await requirePermission(location.href, "audit:view");
  },
  component: AuditTrailPage,
});

const ACTION_LABELS: Record<string, string> = {
  created: "Criado",
  submitted_for_review: "Enviado p/ Revisão",
  review_approved: "Revisão Aprovada",
  approved_and_published: "Aprovado e Publicado",
  rejected: "Rejeitado",
  obsoleted: "Tornado Obsoleto",
  status_changed: "Status Alterado",
}

const COMMON_ACTIONS = [
  "created",
  "submitted_for_review",
  "review_approved",
  "approved_and_published",
  "rejected",
  "obsoleted",
  "status_changed",
]

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return DOC_STATUS.find((item) => item.value === status)?.label ?? status;
}

function truncate(value: string, size = 40) {
  return value.length > size ? `${value.slice(0, size)}...` : value;
}

function AuditTrailPage() {
  const { org } = useAuthContext();
  const [filters, setFilters] = useState<AuditFilters>({});
  const { entries, loading, error, total } = useAuditTrail(filters);
  const actionOptions = useMemo(() => COMMON_ACTIONS, []);

  function clearFilters() {
    setFilters({});
  }

  function handleExport() {
    exportAuditTrailToPDF(entries, org?.name ?? "TRAMITA", filters);
    toast.success("Trilha de auditoria exportada em PDF");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Trilha de Auditoria</h1>
          <p className="text-muted-foreground">Histórico completo de ações em documentos da organização.</p>
        </div>
        <Button onClick={handleExport} disabled={loading || entries.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportar PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Consulte a auditoria por documento, ação ou período.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Código ou título do documento"
              value={filters.search ?? ""}
              onChange={(event) => setFilters({ ...filters, search: event.target.value || undefined })}
            />
          </div>
          <Select value={filters.action ?? "all"} onValueChange={(value) => setFilters({ ...filters, action: value === "all" ? undefined : value })}>
            <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              {actionOptions.map((action) => <SelectItem key={action} value={action}>{ACTION_LABELS[action] ?? action}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={filters.date_from ?? ""} onChange={(event) => setFilters({ ...filters, date_from: event.target.value || undefined })} />
          <Input type="date" value={filters.date_to ?? ""} onChange={(event) => setFilters({ ...filters, date_to: event.target.value || undefined })} />
          <div className="md:col-span-5 flex justify-end">
            <Button variant="secondary" onClick={clearFilters}><RotateCcw className="h-4 w-4 mr-2" /> Limpar filtros</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
          <CardDescription>Exibindo {entries.length} de {total} registros</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center py-8">Carregando trilha de auditoria...</TableCell></TableRow>}
              {error && !loading && <TableRow><TableCell colSpan={6} className="text-center text-destructive py-8">{error}</TableCell></TableRow>}
              {!loading && !error && entries.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum registro encontrado para os filtros aplicados</TableCell></TableRow>
              )}
              {!loading && !error && entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateTime(entry.created_at)}</TableCell>
                  <TableCell>{entry.user?.full_name ?? entry.user_id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.document?.code ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{truncate(entry.document?.title ?? "Documento não encontrado")}</div>
                  </TableCell>
                  <TableCell>{ACTION_LABELS[entry.action] ?? entry.action}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {entry.old_status && <Badge variant="outline">{statusLabel(entry.old_status)}</Badge>}
                      {entry.old_status && entry.new_status && <span className="text-muted-foreground">→</span>}
                      {entry.new_status && <Badge variant="secondary">{statusLabel(entry.new_status)}</Badge>}
                      {!entry.old_status && !entry.new_status && <span className="text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={entry.file_hash ?? undefined}>{entry.file_hash ? `${entry.file_hash.slice(0, 8)}...` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
