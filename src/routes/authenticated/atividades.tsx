import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ArrowRight, FileText, GitBranch, Plus } from 'lucide-react'
import { ActivityInboxPreview } from '@/components/operational/ActivityInboxPreview'
import { DocumentRouterLink } from '@/components/documents/DocumentRouterLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentWorkCenter } from '@/hooks/useDocumentWorkCenter'
import {
  type OperationalActivityType,
  useOperationalCockpit,
} from '@/hooks/useOperationalCockpit'
import { getDeadlineModeLabel } from '@/lib/operationalCalendar'
import {
  PageErrorBoundary,
  PageErrorView,
} from '@/components/shared/route-error-boundary'

export const Route = createFileRoute('/authenticated/atividades')({
  component: ActivitiesPageWrapped,
  errorComponent: ({ error, reset }) => (
    <PageErrorView
      title="Falha ao carregar a página Atividades"
      subtitle="Ocorreu um erro inesperado ao montar a Caixa de Atividades. Os detalhes abaixo ajudam a diagnosticar o problema."
      error={error}
      reset={reset}
    />
  ),
})

function ActivitiesPageWrapped() {
  return (
    <PageErrorBoundary
      title="Falha ao carregar a página Atividades"
      subtitle="Ocorreu um erro inesperado ao montar a Caixa de Atividades. Os detalhes abaixo ajudam a diagnosticar o problema."
    >
      <ActivitiesPage />
    </PageErrorBoundary>
  )
}

const TYPE_OPTIONS: { value: OperationalActivityType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'approval_pending', label: 'Aprovações pendentes' },
  { value: 'review_pending', label: 'Revisões pendentes' },
  { value: 'rejected_for_correction', label: 'Correções necessárias' },
  { value: 'mention', label: 'Menções' },
  { value: 'nearing_due', label: 'Próximos do prazo' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'recent_update', label: 'Atualizações recentes' },
  { value: 'informational', label: 'Informativos' },
]

function formatDate(value?: string | null) {
  if (!value) return 'Sem prazo'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'Prazo inválido'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: value.includes('T') ? 'short' : undefined,
  }).format(date)
}

function PillActionLink({
  to,
  children,
  params,
  hash,
  className = '',
}: {
  to: string
  children: string
  params?: Record<string, string>
  hash?: string
  className?: string
}) {
  return (
    <Link
      to={to}
      params={params}
      hash={hash}
      className={`group inline-flex h-10 min-w-0 overflow-hidden rounded-full bg-blue-900 shadow-[0_12px_22px_-16px_rgba(15,23,42,0.28),0_10px_18px_-16px_rgba(30,64,175,0.36)] transition-all hover:-translate-y-0.5 hover:bg-blue-950 hover:shadow-[0_16px_26px_-16px_rgba(15,23,42,0.3),0_14px_20px_-16px_rgba(30,64,175,0.4)] ${className}`}
    >
      <span className="flex h-full w-10 shrink-0 items-center justify-center bg-white">
        <Plus className="h-4 w-4 text-sky-900" />
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-center px-4 text-center text-xs font-semibold leading-tight text-white">
        {children}
      </span>
    </Link>
  )
}

function ActivitiesPage() {
  const { profile, isLoading, activityItems, kpis } = useOperationalCockpit()
  const workCenter = useDocumentWorkCenter()
  const [typeFilter, setTypeFilter] = useState<OperationalActivityType | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'actionable' | 'critical'>('all')
  const canViewOperationalPanels =
    profile?.role === 'manager' || profile?.role === 'admin'

  const filteredItems = useMemo(() => activityItems.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (priorityFilter === 'critical' && item.priority !== 'critical') return false
    if (priorityFilter === 'actionable' && ['recent_update', 'informational'].includes(item.type)) return false
    return true
  }), [activityItems, priorityFilter, typeFilter])
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minhas Atividades</h1>
          <p className="mt-1 text-muted-foreground">
            Uma caixa única para aprovações, revisões, correções e alertas ligados ao seu trabalho.
          </p>
        </div>
        <Badge variant={kpis.myPending > 0 ? 'default' : 'secondary'}>
          {kpis.myPending} {kpis.myPending === 1 ? 'pendência' : 'pendências'}
        </Badge>
      </div>
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2">
          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as OperationalActivityType | 'all')}>
            <SelectTrigger aria-label="Filtrar por tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as typeof priorityFilter)}>
            <SelectTrigger aria-label="Filtrar por prioridade"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              <SelectItem value="actionable">Somente itens acionáveis</SelectItem>
              <SelectItem value="critical">Somente atrasados</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <ActivityInboxPreview
        items={filteredItems}
        loading={isLoading}
        title="Caixa de atividades"
        description={
          filteredItems.length === activityItems.length
            ? 'Itens consolidados a partir do workflow, notificações e documentos.'
            : `${filteredItems.length} item(ns) encontrado(s) para os filtros atuais.`
        }
        emptyTitle={
          typeFilter === 'all' && priorityFilter === 'all'
            ? 'Nenhuma atividade pendente agora.'
            : 'Nenhuma atividade encontrada para os filtros atuais.'
        }
        emptyDescription={
          typeFilter === 'all' && priorityFilter === 'all'
            ? 'Quando houver revisões, aprovações ou documentos para corrigir, eles aparecerão aqui.'
            : 'Ajuste os filtros de tipo ou prioridade para ampliar a busca.'
        }
      />

      {canViewOperationalPanels && (
        <>
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documentos recentes
                </CardTitle>
                <CardDescription>
                  Últimos documentos movimentados na operação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {workCenter.isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))
                ) : workCenter.recentDocuments.length ? (
                  workCenter.recentDocuments.map((document) => {
                    const externalLink = (document as any)?.external_link ?? null
                    const docWrapper = externalLink
                      ? (children: React.ReactNode) => (
                        <a
                          key={document.id}
                          href={externalLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-muted"
                        >
                          {children}
                        </a>
                      )
                      : (children: React.ReactNode) => (
                        <Link
                          key={document.id}
                          to="/authenticated/documents/$documentId"
                          params={{ documentId: document.id }}
                          className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-muted"
                        >
                          {children}
                        </Link>
                      )
                    return docWrapper(
                      <>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {document.code || 'Sem código'} — {document.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {document.status.replaceAll('_', ' ')}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0" />
                      </>,
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhum documento recente disponível.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-primary" />
                  Trâmites em execução
                </CardTitle>
                <CardDescription>
                  Progresso das instâncias ativas. As ações continuam no detalhe do documento.
                </CardDescription>
              </div>
              <PillActionLink to="/authenticated/documentos/central">
                Abrir Central Documental
              </PillActionLink>
            </CardHeader>
            <CardContent>
              {workCenter.isLoading ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Skeleton className="h-36" />
                  <Skeleton className="h-36" />
                </div>
              ) : workCenter.activeInstances.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {workCenter.activeInstances.map((instance) => (
                    <div key={instance.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{instance.templateName}</p>
                          <DocumentRouterLink
                            documentId={instance.documentId}
                            externalLink={instance.externalLink}
                            className="mt-1 text-sm text-muted-foreground"
                          >
                            {[instance.documentCode, instance.documentTitle]
                              .filter(Boolean)
                              .join(' — ') || 'Documento não associado'}
                          </DocumentRouterLink>
                        </div>
                        <Badge variant={instance.isOverdue ? 'destructive' : 'secondary'}>
                          {instance.isOverdue ? 'Atrasado' : 'Em execução'}
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <Progress value={instance.progress} />
                        <span className="text-sm font-medium">
                          {instance.progress}%
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {instance.activeStepLabels.length
                          ? `Etapa ativa: ${instance.activeStepLabels.join(', ')}`
                          : 'Sem etapa ativa legível.'}
                        {' · '}
                        {formatDate(instance.dueAt)}
                      </p>
                      {instance.dueAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {getDeadlineModeLabel(instance.deadlineMode)}
                          {instance.dueAtSuggested
                            ? ' · prazo sugerido, não persistido'
                            : ''}
                        </p>
                      )}
                      <div className="mt-4">
                        <PillActionLink
                          to="/authenticated/documents/$documentId"
                          params={{ documentId: instance.documentId }}
                          hash="document-tramite-execution"
                        >
                          Abrir execução
                        </PillActionLink>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <GitBranch className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-medium">Nenhum trâmite em execução</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Não há instâncias ativas neste momento.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
