import { Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAuditDateTime } from "@/lib/auditReports";

export function AuditWorkflowTable({
  steps,
}: {
  steps: Array<Record<string, unknown>>;
}) {
  return (
    <section data-audit-print-section>
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Workflow className="h-5 w-5 text-primary" />
        Trâmites e etapas
      </h3>
      <p className="text-sm text-muted-foreground">
        Estado registrado das etapas; nenhuma ação é executada pelo relatório.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Etapa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Conclusão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {steps.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhuma etapa disponível.
                </TableCell>
              </TableRow>
            ) : (
              steps.slice(0, 75).map((step, index) => (
                <TableRow key={String(step.id ?? index)}>
                  <TableCell className="font-medium">
                    {String(step.label ?? step.node_key ?? "—")}
                  </TableCell>
                  <TableCell>{String(step.node_type ?? "—")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {String(step.status ?? "—")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {String(
                      step.assignee_user_id ??
                        step.assignee_group_id ??
                        step.required_role ??
                        "—",
                    )}
                  </TableCell>
                  <TableCell>{formatAuditDateTime(step.due_at)}</TableCell>
                  <TableCell>
                    {formatAuditDateTime(step.completed_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
