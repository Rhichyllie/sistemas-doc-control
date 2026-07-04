import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AuditLimitationsPanel({
  limitations,
}: {
  limitations: string[];
}) {
  return (
    <Alert data-audit-print-section>
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>Limitações declaradas</AlertTitle>
      <AlertDescription>
        {limitations.length === 0 ? (
          <p>Nenhuma limitação adicional foi declarada pela fonte.</p>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {limitations.map((limitation, index) => (
              <li key={`${limitation}-${index}`}>{limitation}</li>
            ))}
          </ol>
        )}
      </AlertDescription>
    </Alert>
  );
}
