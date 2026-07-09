import { FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAuditExceptionDate,
  getAuditExceptionSourceLabel,
  type AuditExceptionItem,
} from "@/lib/auditExceptions";
import {
  AuditExceptionSeverityBadge,
  AuditExceptionStatusBadge,
} from "./AuditExceptionStatusBadge";

export function AuditExceptionList({
  exceptions,
  selectedId,
  onSelect,
}: {
  exceptions: AuditExceptionItem[];
  selectedId: string | null;
  onSelect: (exceptionId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-primary" />
          Exceções detectadas
        </CardTitle>
        <CardDescription>
          Lista limitada e ordenada por severidade e última ocorrência.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {exceptions.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma exceção encontrada para o filtro atual. Se a reconciliação
            nunca foi executada, use “Executar reconciliação”.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severidade</TableHead>
                <TableHead>Exceção</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última ocorrência</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exceptions.map((exception) => (
                <TableRow
                  key={exception.id}
                  data-state={selectedId === exception.id ? "selected" : undefined}
                >
                  <TableCell>
                    <AuditExceptionSeverityBadge
                      severity={exception.severity}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{exception.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {exception.exceptionType} · {exception.entityType}
                    </p>
                  </TableCell>
                  <TableCell>
                    {getAuditExceptionSourceLabel(exception.source)}
                  </TableCell>
                  <TableCell>
                    <AuditExceptionStatusBadge status={exception.status} />
                  </TableCell>
                  <TableCell>
                    {formatAuditExceptionDate(exception.lastSeenAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onSelect(exception.id)}
                    >
                      Ver detalhe
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
