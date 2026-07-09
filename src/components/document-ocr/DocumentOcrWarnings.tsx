import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function DocumentOcrWarnings({
  warnings,
  limitations,
  errors,
}: {
  warnings?: string[];
  limitations?: string[];
  errors?: string[];
}) {
  const hasWarnings = Boolean(warnings?.length);
  const hasLimitations = Boolean(limitations?.length);
  const hasErrors = Boolean(errors?.length);

  if (!hasWarnings && !hasLimitations && !hasErrors) {
    return null;
  }

  return (
    <div className="space-y-3">
      {hasErrors && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erros de leitura</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errors?.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {(hasWarnings || hasLimitations) && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Limitações da leitura</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {warnings?.map((warning, index) => (
                <li key={`warning-${warning}-${index}`}>{warning}</li>
              ))}
              {limitations?.map((limitation, index) => (
                <li key={`limitation-${limitation}-${index}`}>
                  {limitation}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
