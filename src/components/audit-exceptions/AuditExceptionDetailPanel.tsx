import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Eye, Shield } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  compactExceptionHash,
  formatAuditExceptionDate,
  getAuditExceptionSourceLabel,
  type AuditExceptionDetail,
  type AuditExceptionStatus,
} from "@/lib/auditExceptions";
import {
  AuditExceptionSeverityBadge,
  AuditExceptionStatusBadge,
} from "./AuditExceptionStatusBadge";

export function AuditExceptionDetailPanel({
  detail,
  isLoading,
  isUpdating,
  onUpdateStatus,
}: {
  detail: AuditExceptionDetail | null;
  isLoading: boolean;
  isUpdating: boolean;
  onUpdateStatus: (
    status: Exclude<AuditExceptionStatus, "open">,
    note: string,
  ) => void;
}) {
  const [note, setNote] = useState("");

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Detalhe da exceção
          </CardTitle>
          <CardDescription>
            Selecione uma exceção para ver evidências técnicas e ações
            permitidas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma exceção selecionada.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap gap-2">
          <AuditExceptionSeverityBadge severity={detail.severity} />
          <AuditExceptionStatusBadge status={detail.status} />
        </div>
        <CardTitle className="mt-3">{detail.title}</CardTitle>
        <CardDescription>
          {getAuditExceptionSourceLabel(detail.source)} · {detail.entityType}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-semibold">Descrição</p>
          <p className="text-sm text-muted-foreground">{detail.description}</p>
        </div>

        {detail.recommendation && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Recomendação</AlertTitle>
            <AlertDescription>{detail.recommendation}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 text-sm md:grid-cols-2">
          <Detail label="Primeira ocorrência" value={formatAuditExceptionDate(detail.firstSeenAt)} />
          <Detail label="Última ocorrência" value={formatAuditExceptionDate(detail.lastSeenAt)} />
          <Detail label="Documento" value={String(detail.document?.title ?? detail.documentId ?? "—")} />
          <Detail label="Entidade" value={String(detail.entityId ?? "—")} />
          <Detail label="Hash do run" value={compactExceptionHash(String(detail.run?.package_hash ?? ""))} />
          <Detail label="Nota" value={detail.resolutionNote ?? "—"} />
        </div>

        <div>
          <p className="text-sm font-semibold">Evidências técnicas</p>
          <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-muted p-3 text-xs">
            {JSON.stringify(detail.evidence, null, 2)}
          </pre>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exception-resolution-note">
            Nota de tratamento
          </Label>
          <Textarea
            id="exception-resolution-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Explique a investigação, aceite ou resolução da exceção."
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isUpdating}
            onClick={() => onUpdateStatus("acknowledged", note)}
          >
            <Eye className="mr-2 h-4 w-4" />
            Reconhecer
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isUpdating}
            onClick={() => onUpdateStatus("ignored", note)}
          >
            <CircleSlash className="mr-2 h-4 w-4" />
            Ignorar
          </Button>
          <Button
            type="button"
            disabled={isUpdating}
            onClick={() => onUpdateStatus("resolved", note)}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Resolver
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Estas ações alteram apenas a tabela de exceções da P-27.1. Elas não
          corrigem documento, versão, aprovação, trâmite, evidência ou
          notificação.
        </p>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium">{value || "—"}</p>
    </div>
  );
}
