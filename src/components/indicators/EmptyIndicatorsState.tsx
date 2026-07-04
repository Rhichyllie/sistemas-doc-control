import { Link } from "@tanstack/react-router";
import { Activity, CircleOff, DatabaseZap, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OperationalIndicatorsSource } from "@/lib/operationalIndicators";

export function EmptyIndicatorsState({
  source,
  hasFallbackReport = false,
}: {
  source: OperationalIndicatorsSource;
  hasFallbackReport?: boolean;
}) {
  const content =
    source === "restricted"
      ? {
          icon: ShieldAlert,
          title: "Você está vendo apenas sua operação pessoal",
          description:
            "O escopo organizacional é reservado a administradores e gestores.",
        }
      : source === "error"
        ? {
            icon: DatabaseZap,
            title: "Não foi possível carregar os indicadores consolidados",
            description:
              "Verifique o Diagnóstico Operacional para confirmar ciclo, RPC e permissões.",
          }
        : source === "fallback" || source === "not_installed"
          ? {
              icon: CircleOff,
              title: "Indicadores avançados ainda não instalados",
              description: hasFallbackReport
                ? "O TRAMITA mantém um fallback limitado, sem rankings e compliance consolidado."
                : "Aplique o ciclo 25 para habilitar SLA, gargalos e performance consolidada.",
            }
          : {
              icon: Activity,
              title: "Nenhum movimento encontrado no período selecionado",
              description:
                "Amplie o período ou remova filtros para procurar atividade operacional.",
            };
  const Icon = content.icon;

  return (
    <Card className="border-dashed">
      <CardHeader className="items-center text-center">
        <div className="rounded-2xl bg-muted p-4 text-muted-foreground">
          <Icon className="h-7 w-7" />
        </div>
        <CardTitle className="pt-3">{content.title}</CardTitle>
        <CardDescription className="max-w-xl">
          {content.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild variant="outline">
          <Link to="/authenticated/configuracoes/diagnostico">
            Abrir Diagnóstico Operacional
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
