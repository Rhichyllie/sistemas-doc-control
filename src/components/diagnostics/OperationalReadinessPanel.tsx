import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";
import { ReadinessCard } from "@/components/diagnostics/ReadinessCard";
import { ReadinessChecklist } from "@/components/diagnostics/ReadinessChecklist";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useOperationalReadiness } from "@/hooks/useOperationalReadiness";

const DELEGATION_TEST = [
  "Crie um usuário titular e um usuário substituto na mesma organização.",
  "Cadastre ausência ativa ou futura para o titular.",
  "Defina o substituto e confirme que ele não está indisponível.",
  "Crie um documento e inicie um trâmite publicado.",
  "Garanta uma etapa active com assignment_type = specific_user para o titular.",
  "Entre no TRAMITA como substituto.",
  "Confirme o aviso de ação delegada antes da conclusão.",
  "Conclua explicitamente a etapa no detalhe do documento.",
  "Verifique completed_by = substituto e assignee_user_id = titular.",
  "Confirme metadata.delegated, delegated_from_user_id, evento step_completed e audit_trail quando compatível.",
] as const;

function formatGeneratedAt(value: string | null) {
  if (!value) return "Ainda não gerado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function OperationalReadinessPanel() {
  const readiness = useOperationalReadiness();

  if (!readiness.canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Somente administradores e gestores podem consultar o diagnóstico
            completo de implantação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary">
            <Link to="/authenticated/dashboard">Voltar para a Home</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-background to-background p-6 md:p-8">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <Badge variant="outline">Governança de implantação</Badge>
            <div className="mt-4 flex items-center gap-3">
              <Stethoscope className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                Diagnóstico Operacional
              </h1>
            </div>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Verifique ciclos, segurança, configurações e evidências antes de
              colocar notificações, SLA e delegação em operação.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/authenticated/schema-doctor">
                Comparar Schema Doctor
              </Link>
            </Button>
            <Button
              onClick={() => void readiness.refresh()}
              disabled={readiness.isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  readiness.isLoading ? "animate-spin" : ""
                }`}
              />
              Atualizar diagnóstico
            </Button>
          </div>
        </div>
      </section>

      {readiness.warning && (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Diagnóstico em modo de compatibilidade</AlertTitle>
          <AlertDescription>{readiness.warning}</AlertDescription>
        </Alert>
      )}
      {readiness.error && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Não foi possível concluir o diagnóstico</AlertTitle>
          <AlertDescription>{readiness.error}</AlertDescription>
        </Alert>
      )}

      {readiness.isLoading && !readiness.view ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-44 rounded-xl" />
            ))}
          </div>
        </div>
      ) : readiness.view ? (
        <>
          <Card
            className={
              readiness.view.overallStatus === "blocked"
                ? "border-destructive/40 bg-destructive/[0.025]"
                : readiness.view.overallStatus === "attention"
                  ? "border-amber-300 bg-amber-50/30"
                  : "border-emerald-200 bg-emerald-50/30"
            }
          >
            <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      readiness.view.overallStatus === "blocked"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {readiness.view.overallStatus === "blocked"
                      ? "Piloto bloqueado"
                      : readiness.view.overallStatus === "attention"
                        ? "Requer preparação"
                        : "Pronto para piloto"}
                  </Badge>
                  <Badge variant="outline">
                    {readiness.source === "database"
                      ? "Health check confirmado pelo banco"
                      : "Fallback frontend"}
                  </Badge>
                </div>
                <h2 className="mt-3 text-2xl font-semibold">
                  {readiness.view.blockingCount > 0
                    ? `${readiness.view.blockingCount} bloqueio(s) crítico(s) precisam ser resolvidos.`
                    : "A fundação crítica está disponível."}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {readiness.view.readyCount}/{readiness.view.totalCount} itens
                  confirmados. Última leitura:{" "}
                  {formatGeneratedAt(readiness.view.generatedAt)}.
                </p>
                <Progress
                  value={readiness.view.score}
                  className="mt-4 max-w-2xl"
                />
              </div>
              <div className="rounded-xl border bg-background p-5 text-center">
                <p className="text-sm text-muted-foreground">
                  Índice de prontidão
                </p>
                <p className="mt-1 text-5xl font-semibold">
                  {readiness.view.score}%
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Não substitui os testes manuais do piloto.
                </p>
              </div>
            </CardContent>
          </Card>

          <section>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Saúde dos módulos</h2>
              <p className="text-sm text-muted-foreground">
                Leitura consolidada sem gerar alertas ou alterar dados.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {readiness.view.sections.map((section) => (
                <ReadinessCard key={section.id} section={section} />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Checklist de go-live</h2>
              <p className="text-sm text-muted-foreground">
                Cada item indica evidência, impacto e a próxima ação
                recomendada.
              </p>
            </div>
            <ReadinessChecklist sections={readiness.view.goLiveSections} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRoundCheck className="h-5 w-5 text-primary" />
                  Teste guiado de delegação
                </CardTitle>
                <CardDescription>
                  Roteiro obrigatório para comprovar a ação do substituto sem
                  reatribuir a etapa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {DELEGATION_TEST.map((item, index) => (
                    <li key={item} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to="/authenticated/equipe">
                      Configurar ausência
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/authenticated/documentos/central">
                      Abrir Central
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/authenticated/trilha-de-auditoria">
                      Ver auditoria
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Guardrails confirmados
                </CardTitle>
                <CardDescription>
                  Limites que permanecem obrigatórios na P-25.1.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Nenhum e-mail, WhatsApp ou SMS é enviado.",
                  "A geração operacional é manual/on-demand.",
                  "assignee_user_id nunca é trocado silenciosamente.",
                  "A Central não conclui etapas inline.",
                  "approval_flows não recebe mutações da P-25.",
                  "Evidência delegada permanece bloqueada.",
                ].map((item) => (
                  <div key={item} className="flex gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
                <Button asChild variant="secondary" className="mt-3 w-full">
                  <Link to="/authenticated/notificacoes">
                    Validar inbox
                    <ClipboardCheck className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
