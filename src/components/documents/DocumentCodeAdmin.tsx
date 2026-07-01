import { useState } from "react";
import {
  AlertTriangle,
  Braces,
  Code2,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentCodePatternForm } from "@/components/documents/DocumentCodePatternForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  useDocumentCodePatterns,
  type DocumentCodePatternMutationInput,
} from "@/hooks/useDocumentCodePatterns";
import {
  parsePatternToBlocks,
  validatePatternExpression,
} from "@/lib/documentCodePatternBuilder";
import type { DocumentCodePattern } from "@/lib/documentCodePatterns";

function patternContext(
  pattern: DocumentCodePattern,
  projectLabel?: string | null,
) {
  return [
    pattern.project_id ? `Projeto ${projectLabel || "específico"}` : null,
    pattern.area ? `Área ${pattern.area}` : null,
    pattern.doc_type ? `Tipo ${pattern.doc_type}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function patternAuthoringMode(pattern: DocumentCodePattern) {
  const tokenMetadata =
    pattern.tokens &&
    typeof pattern.tokens === "object" &&
    !Array.isArray(pattern.tokens)
      ? (pattern.tokens as Record<string, unknown>)
      : null;
  if (tokenMetadata?.builder_mode === "advanced") return "advanced";
  return parsePatternToBlocks(pattern.pattern).isLossless
    ? "visual"
    : "advanced";
}

export function DocumentCodeAdmin() {
  const coding = useDocumentCodePatterns({ includeInactive: true });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentCodePattern | null>(null);

  function openNew() {
    coding.clearMutationFeedback();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(pattern: DocumentCodePattern) {
    coding.clearMutationFeedback();
    setEditing(pattern);
    setFormOpen(true);
  }

  async function savePattern(input: DocumentCodePatternMutationInput) {
    const success = editing
      ? await coding.updatePattern(editing.id, input)
      : await coding.createPattern(input);
    if (success) {
      toast.success(editing ? "Padrão atualizado." : "Padrão criado.");
    }
    return success;
  }

  async function togglePattern(pattern: DocumentCodePattern, active: boolean) {
    const success = await coding.setPatternActive(pattern.id, active);
    if (success) {
      toast.success(active ? "Padrão ativado." : "Padrão desativado.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Badge variant="outline" className="mb-3">
            Governança de códigos
          </Badge>
          <div className="flex items-center gap-3">
            <Code2 className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">
              Codificação Documental
            </h1>
          </div>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Configure formatos previsíveis, escopos e sequências auditáveis por
            organização.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={coding.isLoading}
            onClick={() => coding.refresh()}
          >
            <RefreshCw
              className={`h-4 w-4 ${coding.isLoading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
          <Button
            onClick={openNew}
            disabled={
              !coding.canManage ||
              !["ready", "empty"].includes(coding.diagnostic)
            }
          >
            <Plus className="h-4 w-4" />
            Criar padrão visual
          </Button>
        </div>
      </div>

      <Card className="border-primary/15 bg-primary/[0.025]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Layers3 className="h-5 w-5 text-primary" />
            Como a codificação funciona
          </CardTitle>
          <CardDescription>
            Combine blocos de contexto e sequência. O preview orienta a
            configuração; o banco confirma o número final ao criar o documento.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Contrato", "TR-CONTRATO-2026-0001"],
            ["Projeto", "TR-OBRA-MARINA-ENG-0001"],
            ["Certificado", "TR-CERT-2026-0001"],
            ["Registro", "TR-REG-OPS-0001"],
          ].map(([label, example]) => (
            <div key={label} className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 break-all font-mono text-sm font-semibold">
                {example}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {coding.diagnostic !== "ready" && coding.diagnostic !== "empty" && (
        <Alert
          variant={coding.diagnostic === "error" ? "destructive" : "default"}
        >
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>
            {coding.diagnostic === "not_installed"
              ? "Ciclo P-11 não instalado"
              : coding.diagnostic === "restricted"
                ? "Acesso restrito"
                : "Não foi possível carregar a codificação"}
          </AlertTitle>
          <AlertDescription>
            {coding.compatibilityMessage ||
              coding.error ||
              "Verifique seu perfil, organização e políticas de acesso."}
          </AlertDescription>
        </Alert>
      )}

      {coding.lastMutationMessage && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Configuração atualizada</AlertTitle>
          <AlertDescription>{coding.lastMutationMessage}</AlertDescription>
        </Alert>
      )}

      {coding.projectCompatibilityMessage && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Compatibilidade de projetos</AlertTitle>
          <AlertDescription>
            {coding.projectCompatibilityMessage}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Padrões cadastrados</p>
            <p className="mt-1 text-2xl font-semibold">
              {coding.patterns.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Ativos</p>
            <p className="mt-1 text-2xl font-semibold">
              {coding.patterns.filter((pattern) => pattern.is_active).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Padrões padrão</p>
            <p className="mt-1 text-2xl font-semibold">
              {coding.patterns.filter((pattern) => pattern.is_default).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {coding.isLoading ? (
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando padrões…
          </CardContent>
        </Card>
      ) : coding.diagnostic === "empty" ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum padrão cadastrado</CardTitle>
            <CardDescription>
              Crie um padrão para habilitar preview e alocação configurável. Até
              lá, o gatilho legado continua gerando códigos. O builder visual
              oferece modelos prontos e valida a expressão antes de salvar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Criar primeiro padrão visual
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {coding.patterns.map((pattern) => {
            const authoringMode = patternAuthoringMode(pattern);
            const expressionValidation = validatePatternExpression(
              pattern.pattern,
            );
            return (
              <Card
                key={pattern.id}
                className={pattern.is_active ? undefined : "opacity-70"}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                        {pattern.name}
                        {pattern.is_default && (
                          <Badge variant="secondary">Padrão</Badge>
                        )}
                        {!pattern.is_active && (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                        <Badge variant="outline">
                          {authoringMode === "visual"
                            ? "Builder visual"
                            : "Modo avançado"}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {patternContext(
                          pattern,
                          coding.projects.find(
                            (project) => project.id === pattern.project_id,
                          )?.code,
                        ) || "Toda a organização"}
                      </CardDescription>
                    </div>
                    <Switch
                      checked={pattern.is_active}
                      disabled={coding.isSaving}
                      onCheckedChange={(checked) =>
                        void togglePattern(pattern, checked)
                      }
                      aria-label={`${pattern.is_active ? "Desativar" : "Ativar"} ${pattern.name}`}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!expressionValidation.isValid && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Expressão precisa de revisão</AlertTitle>
                      <AlertDescription>
                        {expressionValidation.errors[0]}
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="rounded-lg border bg-muted/25 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Braces className="h-3.5 w-3.5" />
                      Formato
                    </div>
                    <p className="mt-1 break-all font-mono font-semibold">
                      {pattern.pattern}
                    </p>
                    {pattern.example_output && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Exemplo: {pattern.example_output}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      Prioridade {pattern.priority} · {pattern.sequence_padding}{" "}
                      dígitos · reset {pattern.sequence_reset}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(pattern)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DocumentCodePatternForm
        open={formOpen}
        onOpenChange={setFormOpen}
        pattern={editing}
        projects={coding.projects}
        isSaving={coding.isSaving}
        submissionError={coding.error}
        onSubmit={savePattern}
      />
    </div>
  );
}
