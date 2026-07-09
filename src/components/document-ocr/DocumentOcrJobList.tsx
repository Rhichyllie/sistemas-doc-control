import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDocumentOcrDate,
  formatDocumentOcrFileSize,
  formatDocumentOcrPercent,
  type DocumentOcrJob,
} from "@/lib/documentOcr";
import { DocumentOcrEmptyState } from "./DocumentOcrEmptyState";
import { DocumentOcrMethodBadge } from "./DocumentOcrMethodBadge";
import { DocumentOcrStatusBadge } from "./DocumentOcrStatusBadge";

export function DocumentOcrJobList({
  jobs,
  selectedId,
  isLoading,
  onSelect,
}: {
  jobs: DocumentOcrJob[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (jobId: string) => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    );
  }

  if (!jobs.length) {
    return <DocumentOcrEmptyState />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jobs de leitura</CardTitle>
        <CardDescription>
          Solicitações registradas com origem, método, status e confiança.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="hidden overflow-hidden rounded-xl border lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Páginas</TableHead>
                <TableHead>Confiança</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow
                  key={job.id}
                  className={selectedId === job.id ? "bg-muted/60" : ""}
                >
                  <TableCell>
                    <div className="font-medium">
                      {job.document?.code || "Sem código"}
                    </div>
                    <div className="max-w-[240px] truncate text-xs text-muted-foreground">
                      {job.document?.title || job.documentId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[220px] truncate">
                      {job.sourceFileName || job.sourceStoragePath || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDocumentOcrFileSize(job.sourceSizeBytes)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DocumentOcrMethodBadge method={job.method} />
                  </TableCell>
                  <TableCell>
                    <DocumentOcrStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell>
                    {job.processedPageCount}
                    {job.pageCount !== null ? ` / ${job.pageCount}` : ""}
                  </TableCell>
                  <TableCell>
                    {formatDocumentOcrPercent(job.averageConfidence)}
                  </TableCell>
                  <TableCell>{formatDocumentOcrDate(job.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelect(job.id)}
                    >
                      Ver detalhe
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 lg:hidden">
          {jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelect(job.id)}
              className={`w-full rounded-xl border p-4 text-left transition hover:bg-muted/60 ${
                selectedId === job.id ? "bg-muted/70" : "bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="h-4 w-4" />
                    {job.document?.code || "Sem código"}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {job.document?.title || job.documentId}
                  </p>
                </div>
                <DocumentOcrStatusBadge status={job.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <DocumentOcrMethodBadge method={job.method} />
                <span className="text-xs text-muted-foreground">
                  {job.processedPageCount} páginas ·{" "}
                  {formatDocumentOcrPercent(job.averageConfidence)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
