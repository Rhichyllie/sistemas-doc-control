import { FileText, FolderKanban, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DocumentCodePreviewCard } from "@/components/documents/DocumentCodePreviewCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  DocumentProjectOption,
  DocumentTypeOption,
  IntelligentDocumentFormState,
} from "@/hooks/useDocumentCreationIntelligence";
import type { DocumentRiskLevel } from "@/lib/documentIntelligence";
import type { DocumentPolicyGuidance } from "@/lib/documentPolicyGuidance";
import type { DocumentCodePreview } from "@/lib/documentCodePatterns";

interface DocumentCreationSummaryProps {
  form: IntelligentDocumentFormState;
  documentTypes: DocumentTypeOption[];
  projects: DocumentProjectOption[];
  completenessScore: number;
  riskLevel: DocumentRiskLevel;
  templateName: string | null;
  governanceScore: number;
  appliedRulesCount: number;
  policyGuidance: DocumentPolicyGuidance;
  codePreview: DocumentCodePreview;
  codePreviewLoading: boolean;
  codeCompatibilityMessage: string | null;
}

export function DocumentCreationSummary({
  form,
  documentTypes,
  projects,
  completenessScore,
  riskLevel,
  templateName,
  governanceScore,
  appliedRulesCount,
  policyGuidance,
  codePreview,
  codePreviewLoading,
  codeCompatibilityMessage,
}: DocumentCreationSummaryProps) {
  const type = documentTypes.find((option) => option.value === form.doc_type);
  const project = projects.find((option) => option.id === form.project_id);
  const riskLabel = {
    low: "baixo",
    medium: "médio",
    high: "alto",
  }[riskLevel];
  const formattedReviewDate = form.next_review_at
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${form.next_review_at}T00:00:00Z`),
      )
    : "não definida";

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle>Resumo antes de criar</CardTitle>
        <CardDescription>
          O documento será criado como rascunho e não seguirá automaticamente
          para aprovação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Identidade
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            {form.title || "Título ainda não informado"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {form.description || "Sem descrição."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className="bg-slate-700 text-white hover:bg-slate-700">
            Rascunho
          </Badge>
          <Badge variant="outline">
            {codePreview.code ? codePreview.code : "Código automático"}
          </Badge>
          <Badge>{type?.label || form.doc_type || "Tipo pendente"}</Badge>
          <Badge variant="secondary">{form.area || "Área pendente"}</Badge>
          <Badge variant="outline">Revisão {form.revision}</Badge>
          <Badge variant="outline">{form.review_period_months} meses</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <FileText className="h-4 w-4 text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">Arquivo</p>
            <p className="truncate text-sm font-medium">
              {form.file?.name ?? "Cadastro preliminar"}
            </p>
            {form.file && (
              <p className="text-xs text-muted-foreground">
                {(form.file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <FolderKanban className="h-4 w-4 text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">Projeto</p>
            <p className="truncate text-sm font-medium">
              {project
                ? `${project.code ? `${project.code} · ` : ""}${project.name}`
                : "Sem vínculo"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">Governança</p>
            <p className="text-sm font-medium">
              {completenessScore}% · risco {riskLabel}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Governança {governanceScore}%
            </p>
          </div>
        </div>

        {(templateName || appliedRulesCount > 0) && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            <strong>{templateName ?? "Políticas da organização"}</strong>
            <span className="text-muted-foreground">
              {" "}
              · {appliedRulesCount} regra
              {appliedRulesCount === 1 ? "" : "s"} aplicada
              {appliedRulesCount === 1 ? "" : "s"}
            </span>
          </div>
        )}

        <DocumentCodePreviewCard
          preview={codePreview}
          isLoading={codePreviewLoading}
          compatibilityMessage={codeCompatibilityMessage}
          compact
        />

        <div
          className={
            policyGuidance.status === "blocked"
              ? "rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              : policyGuidance.status === "ready"
                ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3"
                : "rounded-lg border bg-muted/30 p-3"
          }
        >
          <p className="text-sm font-semibold">{policyGuidance.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {policyGuidance.summary}
          </p>
          {policyGuidance.blockingReasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-destructive">
              {policyGuidance.blockingReasons.slice(0, 4).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          Próxima revisão: <strong>{formattedReviewDate}</strong>
        </div>
      </CardContent>
    </Card>
  );
}
