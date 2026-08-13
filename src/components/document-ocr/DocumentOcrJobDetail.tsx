import { useMemo, useState } from "react";
import { Copy, Download, Save } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  buildDocumentOcrTextFromPages,
  downloadDocumentOcrText,
  formatDocumentOcrDate,
  formatDocumentOcrFileSize,
  formatDocumentOcrPercent,
  type DocumentOcrJob,
  type DocumentOcrJobDetail as DocumentOcrJobDetailType,
} from "@/lib/documentOcr";
import { DocumentOcrMethodBadge } from "./DocumentOcrMethodBadge";
import { DocumentOcrPageViewer } from "./DocumentOcrPageViewer";
import { DocumentOcrStatusBadge } from "./DocumentOcrStatusBadge";
import { DocumentOcrWarnings } from "./DocumentOcrWarnings";

export function DocumentOcrJobDetail({
  detail,
  isLoading,
  isStoringManualText,
  onStoreManualText,
}: {
  detail: DocumentOcrJobDetailType | null;
  isLoading: boolean;
  isStoringManualText: boolean;
  onStoreManualText: (job: DocumentOcrJob, text: string) => Promise<boolean>;
}) {
  const [manualText, setManualText] = useState("");
  const extractedText = useMemo(
    () => (detail ? buildDocumentOcrTextFromPages(detail.pages) : ""),
    [detail],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Detalhe da leitura</CardTitle>
          <CardDescription>
            Selecione um job para ver manifesto, origem, páginas e limitações.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const currentDetail = detail;

  async function handleCopy() {
    if (!extractedText.trim()) {
      toast.info("Nenhum texto extraído disponível para copiar.");
      return;
    }
    await navigator.clipboard.writeText(extractedText);
    toast.success("Texto extraído copiado.");
  }

  function handleDownload() {
    if (!extractedText.trim()) {
      toast.info("Nenhum texto extraído disponível para baixar.");
      return;
    }
    const fileName = downloadDocumentOcrText(currentDetail.job, extractedText);
    toast.success(`Arquivo ${fileName} gerado localmente.`);
  }

  async function handleManualText() {
    const ok = await onStoreManualText(currentDetail.job, manualText);
    if (ok) {
      setManualText("");
      toast.success("Texto manual registrado como leitura técnica.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Manifesto do job</CardTitle>
              <CardDescription>
                Origem, método, confiança e limitações da leitura.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <DocumentOcrStatusBadge status={detail.job.status} />
              <DocumentOcrMethodBadge method={detail.job.method} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-muted p-3">
              <div className="text-xs uppercase text-muted-foreground">
                Documento
              </div>
              <div className="font-medium">
                {detail.document?.code || "Sem código"}
              </div>
              <div className="text-muted-foreground">
                {detail.document?.title || detail.job.documentId}
              </div>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <div className="text-xs uppercase text-muted-foreground">
                Arquivo
              </div>
              <div className="font-medium">
                {detail.job.sourceFileName ||
                  detail.job.sourceStoragePath ||
                  "Origem não informada"}
              </div>
              <div className="text-muted-foreground">
                {formatDocumentOcrFileSize(detail.job.sourceSizeBytes)}
              </div>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <div className="text-xs uppercase text-muted-foreground">
                Páginas
              </div>
              <div className="font-medium">
                {detail.job.processedPageCount}
                {detail.job.pageCount !== null
                  ? ` / ${detail.job.pageCount}`
                  : ""}
              </div>
              <div className="text-muted-foreground">
                {detail.job.extractedTextLength} caracteres observados
              </div>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <div className="text-xs uppercase text-muted-foreground">
                Confiança média
              </div>
              <div className="font-medium">
                {formatDocumentOcrPercent(detail.job.averageConfidence)}
              </div>
              <div className="text-muted-foreground">
                Finalizado: {formatDocumentOcrDate(detail.job.finishedAt)}
              </div>
            </div>
          </div>

          <DocumentOcrWarnings
            warnings={detail.job.warnings}
            limitations={detail.job.limitations}
            errors={
              detail.job.errorMessage
                ? [detail.job.errorMessage]
                : undefined
            }
          />

          <Alert>
            <AlertTitle>Contrato anti-alucinação</AlertTitle>
            <AlertDescription>
              Esta tela mostra apenas texto observado, extraído ou informado
              manualmente com método explícito. Ela não resume, interpreta,
              corrige ortografia, extrai campos nem altera validade do
              documento.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void handleCopy()}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar texto
            </Button>
            <Button variant="outline" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Baixar .txt
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar texto manual</CardTitle>
          <CardDescription>
            Use apenas quando o texto foi observado/conferido manualmente. Isto
            não é OCR automático.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="Cole aqui o texto observado no arquivo original. Não resuma, não corrija e não infira conteúdo."
            className="min-h-36"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => void handleManualText()}
              disabled={isStoringManualText || !manualText.trim()}
            >
              <Save className="mr-2 h-4 w-4" />
              {isStoringManualText
                ? "Registrando..."
                : "Registrar como manual_text"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <DocumentOcrPageViewer pages={detail.pages} />
    </div>
  );
}
