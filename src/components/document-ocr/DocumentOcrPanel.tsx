import { Link } from "@tanstack/react-router";
import {
  FileCheck2,
  FileSearch,
  LayoutDashboard,
  ShieldAlert,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentOcr } from "@/hooks/useDocumentOcr";
import {
  formatDocumentOcrPercent,
  getDocumentOcrStatusLabel,
  type DocumentOcrJobStatus,
} from "@/lib/documentOcr";
import { DocumentOcrCreateJobDialog } from "./DocumentOcrCreateJobDialog";
import { DocumentOcrJobDetail } from "./DocumentOcrJobDetail";
import { DocumentOcrJobList } from "./DocumentOcrJobList";

const STATUS_FILTERS: Array<"all" | DocumentOcrJobStatus> = [
  "all",
  "queued",
  "processing",
  "completed",
  "completed_with_warnings",
  "partial",
  "failed",
  "unsupported",
  "unavailable",
];

function statusFilterLabel(status: "all" | DocumentOcrJobStatus) {
  return status === "all" ? "Todos os status" : getDocumentOcrStatusLabel(status);
}

export function DocumentOcrPanel() {
  const ocr = useDocumentOcr();
  const counts = ocr.overview?.countsByStatus ?? {};
  const totals = ocr.overview?.totals;

  async function handleCreate() {
    const result = await ocr.createJobForSelectedDocument();
    if (result) {
      toast.success("Solicitação de leitura registrada.");
    }
    return result;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border bg-gradient-to-br from-indigo-500/[0.09] via-background to-background p-5 md:p-7">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">P-29</Badge>
              <Badge
                variant={
                  ocr.schemaState === "available" ? "default" : "secondary"
                }
              >
                {ocr.schemaState === "available"
                  ? "Leitura documental disponível"
                  : "Modo de compatibilidade"}
              </Badge>
              <Badge variant="outline">Sem IA · sem interpretação</Badge>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              OCR e Leitura Documental
            </h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Leitura técnica de arquivos, com origem, método, confiança,
              warnings e limitações. A P-29 não interpreta conteúdo nem altera
              documentos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/authenticated/documentos/central">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Central
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/authenticated/auditoria/relatorios">
                <FileCheck2 className="mr-2 h-4 w-4" />
                Relatórios
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/authenticated/auditoria/excecoes">
                <ShieldAlert className="mr-2 h-4 w-4" />
                Exceções
              </Link>
            </Button>
            <DocumentOcrCreateJobDialog
              documents={ocr.documents}
              selectedDocumentId={ocr.selectedDocumentId}
              selectedMethod={ocr.defaultMethod}
              isCreating={ocr.isCreating}
              onDocumentChange={ocr.setSelectedDocumentId}
              onMethodChange={ocr.setDefaultMethod}
              onCreate={handleCreate}
            />
          </div>
        </div>
      </header>

      {ocr.schemaState === "not_installed" && (
        <Alert>
          <FileSearch className="h-4 w-4" />
          <AlertTitle>OCR ainda não instalado no banco</AlertTitle>
          <AlertDescription>
            Aplique manualmente o ciclo `29_TRAMITA_document_ocr_base` no
            Supabase SQL Editor para habilitar jobs, páginas e RPCs.
          </AlertDescription>
        </Alert>
      )}

      {(ocr.error || ocr.warning) && (
        <Alert variant={ocr.error ? "destructive" : "default"}>
          <AlertTitle>{ocr.error ? "Leitura indisponível" : "Atenção"}</AlertTitle>
          <AlertDescription>{ocr.error ?? ocr.warning}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTitle>Regras contra alucinação</AlertTitle>
        <AlertDescription>
          OCR pode conter erro e deve ser conferido contra o arquivo original.
          Texto ausente não significa documento vazio. Esta etapa não extrai
          campos, não preenche formulários, não resume conteúdo e não substitui
          assinatura, aprovação ou validação formal.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {ocr.isLoading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : (
          <>
            <MetricCard label="Jobs totais" value={totals?.jobs ?? 0} />
            <MetricCard
              label="Concluídos"
              value={
                (counts.completed ?? 0) + (counts.completed_with_warnings ?? 0)
              }
            />
            <MetricCard label="Parciais" value={counts.partial ?? 0} />
            <MetricCard label="Falhos" value={counts.failed ?? 0} />
            <MetricCard
              label="Aguardando"
              value={(counts.queued ?? 0) + (counts.processing ?? 0)}
            />
            <MetricCard
              label="Confiança média"
              value={formatDocumentOcrPercent(totals?.averageConfidence)}
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Filtre sem disparar processamento ou mutação operacional.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Documento</Label>
            <Select
              value={ocr.selectedDocumentId || "all"}
              onValueChange={(value) =>
                ocr.setSelectedDocumentId(value === "all" ? "" : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os documentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os documentos</SelectItem>
                {ocr.documents.map((document) => (
                  <SelectItem key={document.value} value={document.value}>
                    {document.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={ocr.selectedStatus}
              onValueChange={(value) =>
                ocr.setSelectedStatus(value as "all" | DocumentOcrJobStatus)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusFilterLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                ocr.setSelectedDocumentId("");
                ocr.setSelectedStatus("all");
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.95fr)]">
        <DocumentOcrJobList
          jobs={ocr.overview?.jobs ?? []}
          selectedId={ocr.selectedJobId}
          isLoading={ocr.isLoading}
          onSelect={(jobId) => void ocr.loadJob(jobId)}
        />
        <DocumentOcrJobDetail
          detail={ocr.selectedJob}
          isLoading={ocr.isDetailLoading}
          isStoringManualText={ocr.isStoringManualText}
          onStoreManualText={ocr.storeManualTextResult}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
