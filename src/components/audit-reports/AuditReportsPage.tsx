import { Link } from "@tanstack/react-router";
import {
  Activity,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import { AuditExportBar } from "@/components/audit-reports/AuditExportBar";
import { AuditExportHistory } from "@/components/audit-reports/AuditExportHistory";
import { AuditReportBuilder } from "@/components/audit-reports/AuditReportBuilder";
import { AuditReportPreview } from "@/components/audit-reports/AuditReportPreview";
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
import { useAuditReports } from "@/hooks/useAuditReports";

export function AuditReportsPage() {
  const reports = useAuditReports();

  return (
    <div className="space-y-6">
      <header
        data-print-hidden
        className="rounded-2xl border bg-gradient-to-br from-primary/[0.07] via-background to-background p-5 md:p-7"
      >
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Auditoria formal</Badge>
              <Badge
                variant={
                  reports.schemaState === "available" ? "default" : "secondary"
                }
              >
                {reports.schemaState === "available"
                  ? "Ciclo 26 disponível"
                  : "Modo de compatibilidade"}
              </Badge>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Relatórios de Auditoria
            </h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Gere pacotes formais com manifesto, cobertura das fontes, eventos,
              evidências, limitações e hash técnico de integridade.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/authenticated/indicadores">
                <Activity className="mr-2 h-4 w-4" />
                Indicadores
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/authenticated/documentos/central">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Central
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/authenticated/configuracoes">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Configurações
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {reports.schemaState === "not_installed" && (
        <Alert data-print-hidden>
          <FileCheck2 className="h-4 w-4" />
          <AlertTitle>Exportação formal ainda não instalada</AlertTitle>
          <AlertDescription>
            Aplique manualmente o ciclo `26_TRAMITA_audit_reports_export`. A
            trilha existente continua disponível, mas não é apresentada como
            pacote formal.
            <Button asChild variant="link" className="ml-1 h-auto p-0">
              <Link to="/authenticated/trilha-de-auditoria">
                Abrir trilha atual
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {(reports.error || reports.warning || reports.hashError) && (
        <Alert
          data-print-hidden
          variant={
            reports.error || reports.hashError ? "destructive" : "default"
          }
        >
          <AlertTitle>
            {reports.error || reports.hashError
              ? "Relatório indisponível"
              : "Atenção"}
          </AlertTitle>
          <AlertDescription>
            {reports.error ?? reports.hashError ?? reports.warning}
          </AlertDescription>
        </Alert>
      )}

      <AuditReportBuilder
        filters={reports.filters}
        options={reports.options}
        canViewOrganization={reports.canViewOrganization}
        isGenerating={reports.isGenerating}
        onChange={reports.setFilters}
        onGenerate={() => void reports.generate()}
      />

      {reports.report ? (
        <>
          <AuditExportBar
            report={reports.report}
            integrityHash={reports.integrityHash}
            isHashing={reports.isHashing}
            registrationAvailable={reports.registrationAvailable}
            onRegister={reports.registerExport}
          />
          <AuditReportPreview
            report={reports.report}
            integrityHash={reports.integrityHash}
            isHashing={reports.isHashing}
          />
        </>
      ) : (
        <Card data-print-hidden>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Preview formal
            </CardTitle>
            <CardDescription>
              O preview será exibido após a geração segura do pacote.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Selecione o tipo, período e escopo para gerar o relatório.
            </div>
          </CardContent>
        </Card>
      )}

      <AuditExportHistory
        history={reports.history}
        isLoading={reports.isHistoryLoading}
        available={reports.registrationAvailable}
      />
    </div>
  );
}
