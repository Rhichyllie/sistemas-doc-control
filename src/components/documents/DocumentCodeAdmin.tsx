import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Braces,
  CircleHelp,
  Code2,
  Equal,
  FileText,
  FolderKanban,
  Hash,
  Layers3,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
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
import { useDocumentCodeOptions } from "@/hooks/useDocumentCodeOptions";
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
  const options = useDocumentCodeOptions();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentCodePattern | null>(null);
  const codingFlowSteps = [
    {
      title: "Contrato",
      subtitle: "Registro",
      helper: "Obrigatório",
      icon: FileText,
      accent: "text-blue-600",
      surface: "from-blue-50 via-white to-blue-50/60",
      border: "border-blue-200/80",
    },
    {
      title: "Projeto",
      subtitle: "Obra",
      helper: "Obrigatório",
      icon: FolderKanban,
      accent: "text-violet-600",
      surface: "from-violet-50 via-white to-violet-50/60",
      border: "border-violet-200/80",
    },
    {
      title: "Disciplina",
      subtitle: "Área técnica",
      helper: "Obrigatório",
      icon: Layers3,
      accent: "text-emerald-600",
      surface: "from-emerald-50 via-white to-emerald-50/60",
      border: "border-emerald-200/80",
    },
    {
      title: "Tipo",
      subtitle: "Documento",
      helper: "Obrigatório",
      icon: ScrollText,
      accent: "text-amber-600",
      surface: "from-amber-50 via-white to-amber-50/60",
      border: "border-amber-200/80",
    },
    {
      title: "Sequência",
      subtitle: "Numérica",
      helper: "Automático",
      icon: Hash,
      accent: "text-indigo-600",
      surface: "from-indigo-50 via-white to-indigo-50/60",
      border: "border-indigo-200/80",
    },
  ] as const;
  const previewSegments = [
    { label: "TR", color: "text-blue-600", dot: "bg-blue-600" },
    { label: "OBRA", color: "text-violet-600", dot: "bg-violet-600" },
    { label: "ENG", color: "text-emerald-600", dot: "bg-emerald-600" },
    { label: "ARQ", color: "text-amber-600", dot: "bg-amber-600" },
    { label: "DRW", color: "text-orange-500", dot: "bg-orange-500" },
    { label: "0001", color: "text-slate-800", dot: "bg-slate-700" },
  ] as const;

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

  const optionCards = [
    {
      step: "1",
      title: "Tipos de Documento",
      description: "Cadastre os grupos de documentos utilizados na codificação.",
      to: "/authenticated/configuracoes/codificacao-documental/tipos-documento",
      count: options.docTypes.length,
      icon: FileText,
      accent: "text-blue-600",
      badge: "bg-blue-600",
      iconSurface: "from-blue-50 to-blue-100/80",
      statSurface: "bg-emerald-50 text-emerald-700",
      buttonClass:
        "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100",
      cta: "Configurar",
    },
    {
      step: "2",
      title: "Áreas",
      description: "Cadastre as áreas ou frentes utilizadas na organização.",
      to: "/authenticated/configuracoes/codificacao-documental/areas",
      count: options.areas.length,
      icon: FolderKanban,
      accent: "text-violet-600",
      badge: "bg-violet-600",
      iconSurface: "from-violet-50 to-violet-100/80",
      statSurface: "bg-emerald-50 text-emerald-700",
      buttonClass:
        "bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-100",
      cta: "Configurar",
    },
    {
      step: "3",
      title: "Disciplinas",
      description: "Cadastre as disciplinas técnicas aplicáveis.",
      to: "/authenticated/configuracoes/codificacao-documental/disciplinas",
      count: options.disciplines.length,
      icon: Layers3,
      accent: "text-emerald-600",
      badge: "bg-emerald-600",
      iconSurface: "from-emerald-50 to-emerald-100/80",
      statSurface: "bg-emerald-50 text-emerald-700",
      buttonClass:
        "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100",
      cta: "Configurar",
    },
  ] as const;
  const quickTips = [
    "A ordem dos blocos define a estrutura da codificação.",
    "Use abreviações padronizadas para garantir consistência.",
    "Você pode criar múltiplos padrões para diferentes contextos.",
  ] as const;
  const summaryCards = [
    {
      label: "Padrões ativos",
      count: coding.isLoading
        ? "..."
        : String(coding.patterns.filter((pattern) => pattern.is_active).length),
      icon: Braces,
      accent: "text-blue-600",
      iconSurface: "from-blue-50 to-blue-100/80",
      border: "border-blue-100",
    },
    {
      label: "Áreas cadastradas",
      count: options.isLoading ? "..." : String(options.areas.length),
      icon: FolderKanban,
      accent: "text-emerald-600",
      iconSurface: "from-emerald-50 to-emerald-100/80",
      border: "border-emerald-100",
    },
    {
      label: "Disciplinas",
      count: options.isLoading ? "..." : String(options.disciplines.length),
      icon: Layers3,
      accent: "text-amber-500",
      iconSurface: "from-amber-50 to-amber-100/80",
      border: "border-amber-100",
    },
    {
      label: "Tipos de documento",
      count: options.isLoading ? "..." : String(options.docTypes.length),
      icon: ScrollText,
      accent: "text-violet-600",
      iconSurface: "from-violet-50 to-violet-100/80",
      border: "border-violet-100",
    },
  ] as const;

  return (
    <div className="space-y-10">
      <Card className="overflow-hidden border-0 bg-white shadow-[0_0_30px_rgba(15,23,42,0.12)]">
        <CardContent className="space-y-4 p-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 via-blue-100/80 to-slate-100 text-blue-600 shadow-inner">
              <Code2 className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <Badge
                variant="outline"
                className="mb-2 rounded-full border-slate-200 bg-slate-50 text-slate-600"
              >
                Governança de códigos
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Codificação Documental
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Padronize automaticamente a identificação dos documentos da
                organização utilizando blocos inteligentes.
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:min-w-0 xl:flex-1 xl:flex-nowrap">
              {summaryCards.map((item) => {
                const SummaryIcon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={`min-w-[140px] rounded-2xl border bg-white px-3.5 py-3 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.45)] xl:min-w-[132px] ${item.border}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${item.iconSurface} ${item.accent}`}
                      >
                        <SummaryIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xl font-bold leading-none text-slate-900">
                          {item.count}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {item.label}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 xl:flex-nowrap xl:justify-end">
              <Button
                variant="outline"
                size="icon"
                disabled={coding.isLoading}
                onClick={() => coding.refresh()}
                className="rounded-xl border-slate-200 text-slate-600"
              >
                <RefreshCw
                  className={`h-4 w-4 ${coding.isLoading ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                onClick={openNew}
                disabled={!coding.canManage || coding.isLoading}
                className="rounded-xl bg-gradient-to-r from-[#4b8ef8] via-[#5b7cf8] to-[#715cf6] px-5 text-white shadow-[0_12px_24px_-14px_rgba(79,70,229,0.65)] hover:from-[#4285f6] hover:via-[#5675f6] hover:to-[#684ff3]"
              >
                <Plus className="h-4 w-4" />
                Criar padrão visual
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_0_30px_rgba(15,23,42,0.08)]">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
            <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-[#3b82f6] to-[#2563eb]" />
            Como a codificação funciona
            <CircleHelp className="h-4 w-4 text-slate-400" />
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
           A codificação é composta por blocos de contexto e uma sequência numérica, que pode ser posicionada em qualquer ponto da estrutura.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_28px_minmax(280px,0.85fr)] xl:items-center">
          <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
            {codingFlowSteps.map((item, index) => {
              const StepIcon = item.icon;
              return (
                <div key={item.title} className="contents">
                  <div
                    className={`w-full min-w-[135px] flex-1 rounded-2xl border bg-gradient-to-br p-3 shadow-[0_14px_34px_-26px_rgba(15,23,42,0.35)] sm:max-w-[152px] xl:min-w-[118px] xl:max-w-[118px] ${item.border} ${item.surface}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-white/90 shadow-sm xl:h-8 xl:w-8 ${item.accent}`}
                      >
                        <StepIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 xl:text-[11px]">
                          {item.title}
                        </p>
                        <p className="text-xs font-medium text-slate-700 xl:text-[11px]">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-slate-200/80 pt-2 text-center text-[11px] font-medium text-slate-500">
                      {item.helper}
                    </div>
                  </div>

                  {index < codingFlowSteps.length - 1 && (
                    <div className="flex h-8 w-4 items-center justify-center text-lg font-light text-slate-400 xl:w-3">
                      +
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden items-center justify-center xl:flex">
            <Equal className="h-6 w-6 text-slate-400" />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 xl:p-3.5 shadow-[0_20px_45px_-28px_rgba(15,23,42,0.3)]">
            <div className="rounded-2xl bg-white p-4 xl:p-3.5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.28)]">
              <p className="text-sm font-semibold text-slate-900">
                Preview de exemplo
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-center font-mono text-lg font-bold tracking-wide sm:text-xl xl:text-[22px]">
                {previewSegments.map((segment, index) => (
                  <div key={segment.label} className="flex items-center gap-1.5">
                    <span className={segment.color}>{segment.label}</span>
                    {index < previewSegments.length - 1 && (
                      <span className="text-slate-300">-</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-1.5 px-1">
                {previewSegments.map((segment) => (
                  <div
                    key={segment.label}
                    className="flex flex-1 items-center gap-1.5"
                  >
                    <span className={`h-2 w-2 rounded-full ${segment.dot}`} />
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center font-mono text-xs font-semibold text-slate-700 xl:text-[11px]">
                TR-OBRA-ENG-ARQ-DRW-0001
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {coding.lastMutationMessage && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Configuração atualizada</AlertTitle>
          <AlertDescription>{coding.lastMutationMessage}</AlertDescription>
        </Alert>
      )}

      {options.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Falha ao carregar cadastros auxiliares</AlertTitle>
          <AlertDescription>{options.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_300px]">
        <Card className="border-slate-200 bg-white shadow-[0_0_30px_rgba(15,23,42,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-slate-900">
              Etapas da configuração
            </CardTitle>
            <CardDescription>
              Siga a ordem recomendada para criar sua codificação documental.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {optionCards.map((item, index) => {
              const OptionIcon = item.icon;
              return (
                <Card
                  key={item.to}
                  className="relative overflow-hidden border-slate-200 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]"
                >
                  {index < optionCards.length - 1 && (
                    <div className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white p-1 text-slate-300 shadow-sm xl:flex">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}

                  <CardContent className="space-y-4 p-4">
                    <div
                      className={`absolute left-4 top-4 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white ${item.badge}`}
                    >
                      {item.step}
                    </div>

                    <div className="flex justify-center pt-4">
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.iconSurface} ${item.accent}`}
                      >
                        <OptionIcon className="h-7 w-7" />
                      </div>
                    </div>

                    <div className="space-y-2 text-center">
                      <CardTitle className="text-base text-slate-900">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="min-h-10 text-xs leading-5 text-slate-500">
                        {item.description}
                      </CardDescription>
                    </div>

                    <div className="flex justify-center">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${item.statSurface}`}
                      >
                        {options.isLoading
                          ? "Carregando..."
                          : `${item.count} cadastrados`}
                      </span>
                    </div>

                    <Button
                      asChild
                      variant="outline"
                      className={`w-full justify-between rounded-xl border ${item.buttonClass}`}
                    >
                      <Link to={item.to}>
                        {item.cta}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-slate-50/80 shadow-[0_0_30px_rgba(15,23,42,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Lightbulb className="h-5 w-5 text-blue-600" />
              Dicas rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {quickTips.map((tip) => (
              <div key={tip} className="flex items-start gap-3 text-sm text-slate-600">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <p>{tip}</p>
              </div>
            ))}

            <div className="border-t border-slate-200 pt-4">
              <Button
                variant="ghost"
                className="h-auto px-0 text-sm font-semibold text-blue-700 hover:bg-transparent hover:text-blue-800"
              >
                Saiba mais sobre codificação
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
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
      ) : coding.patterns.length === 0 ? (
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
        docTypes={options.docTypes}
        areas={options.areas}
        disciplines={options.disciplines}
        isSaving={coding.isSaving}
        submissionError={coding.error}
        onSubmit={savePattern}
      />
    </div>
  );
}
