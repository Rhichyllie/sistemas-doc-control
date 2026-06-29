import { Link } from '@tanstack/react-router'
import { AlertCircle, ArrowRight, Bell, ClipboardList, FileStack, GitBranch } from 'lucide-react'
import { ActivityInboxPreview } from '@/components/operational/ActivityInboxPreview'
import { OperationalKpiCards } from '@/components/operational/OperationalKpiCards'
import { RecentActivityList } from '@/components/operational/RecentActivityList'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useOperationalCockpit } from '@/hooks/useOperationalCockpit'

export function OperationalHome() {
  const {
    profile,
    isLoading,
    error,
    warnings,
    kpis,
    activityItems,
    recentActivities,
    recentActivitiesSource,
  } = useOperationalCockpit()

  const firstName = profile?.full_name?.trim().split(/\s+/)[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Badge variant="outline" className="mb-3">Central de comando</Badge>
          <h1 className="text-3xl font-bold tracking-tight">
            {firstName ? `Olá, ${firstName}` : 'Home Operacional'}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Priorize o que precisa de ação e acompanhe as movimentações do TRAMITA.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/authenticated/documents"><FileStack className="h-4 w-4" /> Documentos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/authenticated/fluxo-de-aprovacao"><GitBranch className="h-4 w-4" /> Fila de Aprovação</Link>
          </Button>
          <Button asChild>
            <Link to="/authenticated/atividades">Minhas Atividades <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Parte dos dados operacionais não pôde ser carregada</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {warnings.map((warning) => (
        <Alert key={warning}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fonte alternativa em uso</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      <OperationalKpiCards kpis={kpis} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <ActivityInboxPreview items={activityItems} loading={isLoading} limit={6} showAllLink />

        <Card>
          <CardHeader>
            <CardTitle>Alertas importantes</CardTitle>
            <CardDescription>Resumo rápido do que merece prioridade.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <AlertLine
              icon={AlertCircle}
              label="Itens atrasados"
              value={kpis.overdue}
              critical={kpis.overdue > 0}
            />
            <AlertLine
              icon={GitBranch}
              label="Aprovações pendentes"
              value={kpis.approvalsPending}
            />
            <AlertLine
              icon={ClipboardList}
              label="Documentos para corrigir"
              value={kpis.rejectedForCorrection}
            />
            <AlertLine
              icon={Bell}
              label="Notificações não lidas"
              value={kpis.unreadNotifications}
            />
            {kpis.overdue + kpis.rejectedForCorrection === 0 && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Nenhum alerta crítico no momento.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <RecentActivityList
        activities={recentActivities}
        loading={isLoading}
        limit={8}
        description={
          recentActivitiesSource === 'audit_trail'
            ? 'Últimas movimentações registradas na trilha de auditoria.'
            : 'Últimos documentos criados ou atualizados disponíveis.'
        }
      />
    </div>
  )
}

function AlertLine({
  icon: Icon,
  label,
  value,
  critical = false,
}: {
  icon: typeof AlertCircle
  label: string
  value: number
  critical?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-3">
      <div className="flex items-center gap-2 text-sm">
        <Icon className={critical ? 'h-4 w-4 text-destructive' : 'h-4 w-4 text-muted-foreground'} />
        <span>{label}</span>
      </div>
      <Badge variant={critical ? 'destructive' : 'secondary'}>{value}</Badge>
    </div>
  )
}
