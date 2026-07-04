import { Paperclip } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { compactHash, formatAuditDateTime } from "@/lib/auditReports";

export function AuditEvidenceTable({
  evidences,
}: {
  evidences: Array<Record<string, unknown>>;
}) {
  return (
    <section data-audit-print-section>
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Paperclip className="h-5 w-5 text-primary" />
        Evidências
      </h3>
      <p className="text-sm text-muted-foreground">
        Referências e hashes registrados na execução; o arquivo binário não é
        incorporado.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Registrada em</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Arquivo/referência</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Hash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evidences.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhuma evidência disponível.
                </TableCell>
              </TableRow>
            ) : (
              evidences.slice(0, 50).map((evidence, index) => (
                <TableRow key={String(evidence.id ?? index)}>
                  <TableCell>
                    {formatAuditDateTime(evidence.created_at)}
                  </TableCell>
                  <TableCell>{String(evidence.evidence_type ?? "—")}</TableCell>
                  <TableCell>
                    {String(
                      evidence.file_name ??
                        evidence.note ??
                        evidence.file_path ??
                        "—",
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {String(evidence.step_id ?? "—")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {compactHash(
                      typeof evidence.file_hash === "string"
                        ? evidence.file_hash
                        : null,
                    )}
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
