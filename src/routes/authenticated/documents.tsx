import { createFileRoute, Link, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Eye, Download } from "lucide-react";
import { DOC_STATUS, DOC_TYPES } from "@/lib/constants";
import { useDocuments, type DocumentFilters } from "@/hooks/useDocuments";
import { useCreateDocument } from "@/hooks/useCreateDocument";
import { useTheme } from "@/contexts/theme-context";
import { useAuthContext } from "@/contexts/AuthContext";
import { exportDocumentsToExcel } from "@/lib/exportUtils";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/documents")({ component: DocumentsPage });

const AREAS = ["SGI", "ENG", "OPS", "MNT", "SST", "MA", "QUA", "ADM"] as const;
const REVIEW_PERIODS = [6, 12, 24, 36] as const;

function getStatusMeta(status: string) {
  return DOC_STATUS.find((item) => item.value === status);
}

function getDocTypeLabel(docType: string) {
  return DOC_TYPES.find((item) => item.value === docType)?.label ?? docType;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

function isReviewSoon(value: string | null) {
  if (!value) return false;
  const today = new Date();
  const reviewDate = new Date(value);
  const diffDays = Math.ceil((reviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays < 30;
}

function addMonths(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function DocumentsPage() {
  const location = useLocation();

  if (location.pathname !== "/authenticated/documents") {
    return <Outlet />;
  }

  return <DocumentsListPage />;
}

function DocumentsListPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { org } = useAuthContext();
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [openNewDoc, setOpenNewDoc] = useState(false);
  const [form, setForm] = useState({
    title: "",
    doc_type: "",
    area: "",
    description: "",
    review_period_months: "24",
    next_review_at: "",
    file: null as File | null,
  });

  const { documents, loading, error, refetch } = useDocuments(filters);
  const { createDocument, loading: creating, error: createError } = useCreateDocument();

  const statusOptions = useMemo(() => DOC_STATUS, []);
  const typeOptions = useMemo(() => DOC_TYPES, []);

  async function handleCreateDocument(e: React.FormEvent) {
    e.preventDefault();

    if (!form.title.trim() || !form.doc_type || !form.area) {
      toast.error("Preencha título, tipo e área");
      return;
    }

    const reviewPeriod = Number(form.review_period_months) || 24;
    const result = await createDocument({
      title: form.title.trim(),
      doc_type: form.doc_type,
      area: form.area,
      description: form.description.trim() || undefined,
      review_period_months: reviewPeriod,
      next_review_at: form.next_review_at || addMonths(reviewPeriod),
      file: form.file,
    });

    if (!result) return;

    toast.success(`Documento criado: ${result.code ?? "Gerando..."}`);
    setOpenNewDoc(false);
    setForm({
      title: "",
      doc_type: "",
      area: "",
      description: "",
      review_period_months: "24",
      next_review_at: "",
      file: null,
    });
    await refetch();
    navigate({ to: "/authenticated/documents/$documentId", params: { documentId: result.id } });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documentos</h1>
          <p className="text-muted-foreground text-sm">Controle real de documentos técnicos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => exportDocumentsToExcel(documents, org?.name ?? "TRAMITA")} disabled={loading || documents.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
        <Dialog open={openNewDoc} onOpenChange={setOpenNewDoc}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: theme.button, color: theme.text }}>
              <Plus className="h-4 w-4 mr-2" /> Novo Documento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Novo Documento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateDocument} className="space-y-4">
              <p className="text-sm text-muted-foreground">Código gerado automaticamente após salvar.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Título *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div>
                  <Label>Tipo *</Label>
                  <Select value={form.doc_type} onValueChange={(value) => setForm({ ...form, doc_type: value })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Área *</Label>
                  <Select value={form.area} onValueChange={(value) => setForm({ ...form, area: value })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {AREAS.map((area) => <SelectItem key={area} value={area}>{area}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Descrição</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div>
                  <Label>Período de revisão</Label>
                  <Select value={form.review_period_months} onValueChange={(value) => setForm({ ...form, review_period_months: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REVIEW_PERIODS.map((period) => <SelectItem key={period} value={String(period)}>{period} meses</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Próxima revisão</Label>
                  <Input type="date" value={form.next_review_at} onChange={(e) => setForm({ ...form, next_review_at: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Arquivo</Label>
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.dwg,.xls,.xlsx"
                    onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
                  />
                </div>
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpenNewDoc(false)}>Cancelar</Button>
                <Button type="submit" disabled={creating} style={{ backgroundColor: theme.button, color: theme.text }}>
                  {creating ? "Salvando..." : "Salvar Documento"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card className="shadow-md">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por título..."
                value={filters.search ?? ""}
                onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
              />
            </div>
            <Select value={filters.status ?? "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {statusOptions.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.doc_type ?? "all"} onValueChange={(value) => setFilters({ ...filters, doc_type: value === "all" ? undefined : value })}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {typeOptions.map((type) => <SelectItem key={type.value} value={type.value}>{type.value}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.area ?? "all"} onValueChange={(value) => setFilters({ ...filters, area: value === "all" ? undefined : value })}>
              <SelectTrigger><SelectValue placeholder="Área" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as áreas</SelectItem>
                {AREAS.map((area) => <SelectItem key={area} value={area}>{area}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Revisão</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Próxima Revisão</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} className="text-center py-8">Carregando documentos...</TableCell></TableRow>}
              {error && !loading && <TableRow><TableCell colSpan={9} className="text-center text-destructive py-8">{error}</TableCell></TableRow>}
              {!loading && !error && documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Nenhum documento encontrado. <Button variant="link" onClick={() => setOpenNewDoc(true)}>Criar documento</Button>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && documents.map((doc) => {
                const status = getStatusMeta(doc.status);
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-mono text-xs">{doc.code ?? "Gerando..."}</TableCell>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell><Badge variant="outline">{getDocTypeLabel(doc.doc_type)}</Badge></TableCell>
                    <TableCell>{doc.area}</TableCell>
                    <TableCell>
                      {doc.correction ? (
                        <Badge className="border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100">
                          Correção Solicitada
                        </Badge>
                      ) : doc.published_revision && doc.working_revision ? (
                        <div className="flex flex-wrap gap-1">
                          <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">Publicado</Badge>
                          <Badge variant="outline">
                            {doc.working_revision.status === "draft"
                              ? "Rev. em andamento"
                              : "Nova revisão em análise"}
                          </Badge>
                        </div>
                      ) : (
                        <Badge style={{ backgroundColor: status?.color, color: "white" }}>{status?.label ?? doc.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      Rev. {doc.revision}
                      {doc.working_revision && (
                        <div className="text-xs text-muted-foreground">
                          preparando Rev. {doc.working_revision.revision}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{doc.author?.full_name ?? "—"}</TableCell>
                    <TableCell className={isReviewSoon(doc.next_review_at) ? "text-destructive font-medium" : ""}>
                      {formatDate(doc.next_review_at)}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="secondary" size="sm">
                        <Link to="/authenticated/documents/$documentId" params={{ documentId: doc.id }}>
                          <Eye className="h-3 w-3 mr-1" /> Ver
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
