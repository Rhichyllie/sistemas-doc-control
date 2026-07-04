import { Clock3 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAuditDateTime,
  type AuditTimelineEvent,
} from "@/lib/auditReports";

export function AuditTimelineTable({
  events,
}: {
  events: AuditTimelineEvent[];
}) {
  const visible = events.slice(0, 50);
  return (
    <section data-audit-print-section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Clock3 className="h-5 w-5 text-primary" />
            Linha do tempo
          </h3>
          <p className="text-sm text-muted-foreground">
            Eventos normalizados das fontes disponíveis.
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          {events.length.toLocaleString("pt-BR")} evento(s)
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/hora</TableHead>
              <TableHead>Fonte</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Ator</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhum evento disponível para o recorte.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((event, index) => (
                <TableRow key={`${event.source}-${event.entityId}-${index}`}>
                  <TableCell className="whitespace-nowrap">
                    {formatAuditDateTime(event.occurredAt)}
                  </TableCell>
                  <TableCell>{event.source}</TableCell>
                  <TableCell className="font-medium">
                    {event.eventType}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {event.documentId ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {event.actorId ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {events.length > visible.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Preview limitado a {visible.length} linhas. O JSON contém o volume
          retornado pelo pacote.
        </p>
      )}
    </section>
  );
}
