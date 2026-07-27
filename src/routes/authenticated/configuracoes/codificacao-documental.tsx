import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { DocumentCodeAdmin } from "@/components/documents/DocumentCodeAdmin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/contexts/AuthContext";
import type { ReactNode } from "react";

export const Route = createFileRoute(
  "/authenticated/configuracoes/codificacao-documental",
)({
  component: ConfiguracoesDocumentCodeRoute,
});

const CODIFICACAO_SUBPAGES = [
  {
    to: "/authenticated/configuracoes/codificacao-documental",
    label: "Padrões de Codificação",
    description: "Padrões de codificação de documentos.",
  },
  {
    to: "/authenticated/configuracoes/codificacao-documental/tipos-documento",
    label: "Tipos de Documento",
    description: "Gestão de tipos de documento para codificação.",
  },
  {
    to: "/authenticated/configuracoes/codificacao-documental/areas",
    label: "Áreas",
    description: "Gestão de áreas para codificação.",
  },
  {
    to: "/authenticated/configuracoes/codificacao-documental/disciplinas",
    label: "Disciplinas",
    description: "Gestão de disciplinas para codificação.",
  },
] as const;

function ConfiguracoesDocumentCodeRoute() {
  const { profile } = useAuthContext();
  const canAccess = profile?.role === "admin" || profile?.role === "manager";
  const pathname = useRouterState({
    select: (state) => state.location.pathname.replace(/\/+$/, ""),
  });
  const isOverview = pathname === "/authenticated/configuracoes/codificacao-documental";

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Esta area e exclusiva para administradores e gestores. A codificacao
            continua sendo aplicada automaticamente na criacao de documentos.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <CodificacaoLayout>
      {isOverview ? <DocumentCodeAdmin /> : <Outlet />}
    </CodificacaoLayout>
  );
}

function CodificacaoLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname.replace(/\/+$/, ""),
  });

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-slate-50 shadow-none">
        <CardContent className="px-6 py-5">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          {CODIFICACAO_SUBPAGES.map((item) => {
            const isActive = pathname === item.to;
            return (
              <Button
                key={item.to}
                asChild
                variant="ghost"
                className={
                  isActive
                    ? "h-9 rounded-lg border-0 bg-gradient-to-r from-[#4b8ef8] via-[#5b7cf8] to-[#715cf6] px-4 text-sm font-medium text-white shadow-[0_10px_20px_-12px_rgba(99,102,241,0.55)] hover:bg-gradient-to-r hover:from-[#4285f6] hover:via-[#5675f6] hover:to-[#684ff3] hover:text-white"
                    : "h-9 rounded-lg px-4 text-sm font-medium text-slate-700 hover:bg-white hover:text-slate-900"
                }
              >
                <Link to={item.to}>{item.label}</Link>
              </Button>
            );
          })}
          </div>
        </CardContent>
      </Card>

      {children}
    </div>
  );
}
