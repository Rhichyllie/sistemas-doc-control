import { BottleneckBarChart } from "@/components/indicators/BottleneckBarChart";
import { BottleneckTable } from "@/components/indicators/BottleneckTable";
import { DelegationImpactPanel } from "@/components/indicators/DelegationImpactPanel";
import { NotificationSignalPanel } from "@/components/indicators/NotificationSignalPanel";
import { OperationalFlowPanel } from "@/components/indicators/OperationalFlowPanel";
import { QualitySignalsPanel } from "@/components/indicators/QualitySignalsPanel";
import { SlaDistributionChart } from "@/components/indicators/SlaDistributionChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OperationalIndicatorsReport } from "@/lib/operationalIndicators";

export function IndicatorSectionTabs({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  return (
    <Tabs defaultValue="overview" className="space-y-5">
      <div className="overflow-x-auto pb-1">
        <TabsList className="h-auto min-w-max">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="sla">SLA e prazos</TabsTrigger>
          <TabsTrigger value="bottlenecks">Gargalos</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="delegations">Delegações</TabsTrigger>
          <TabsTrigger value="quality">Qualidade documental</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <SlaDistributionChart report={report} compact />
          <BottleneckBarChart report={report} />
        </div>
        <OperationalFlowPanel report={report} />
      </TabsContent>

      <TabsContent value="sla" className="space-y-4">
        <SlaDistributionChart report={report} />
        <div className="grid gap-4 xl:grid-cols-2">
          <BottleneckTable
            title="Etapas paradas há mais tempo"
            description="Prioridade por idade e prazo persistido."
            items={report.bottlenecks.longestStalledSteps}
            type="stalled"
          />
          <BottleneckTable
            title="Evidências que pressionam o SLA"
            description="Etapas com exigência obrigatória ainda não atendida."
            items={report.bottlenecks.evidencePending}
            type="evidence"
          />
        </div>
      </TabsContent>

      <TabsContent value="bottlenecks" className="space-y-4">
        <BottleneckBarChart report={report} />
        <div className="grid gap-4 xl:grid-cols-2">
          <BottleneckTable
            title="Top responsáveis"
            description="Concentração de etapas vencidas por responsável."
            items={report.bottlenecks.byResponsible}
          />
          <BottleneckTable
            title="Top projetos"
            description="Projetos com maior volume de atraso."
            items={report.bottlenecks.byProject}
          />
        </div>
      </TabsContent>

      <TabsContent value="notifications">
        <NotificationSignalPanel report={report} />
      </TabsContent>

      <TabsContent value="delegations">
        <DelegationImpactPanel report={report} />
      </TabsContent>

      <TabsContent value="quality" className="space-y-4">
        <QualitySignalsPanel report={report} />
        <BottleneckTable
          title="Evidências pendentes"
          description="Documentos e etapas que aguardam comprovação."
          items={report.bottlenecks.evidencePending}
          type="evidence"
        />
      </TabsContent>
    </Tabs>
  );
}
