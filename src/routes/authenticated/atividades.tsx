import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ActivityInboxPreview } from '@/components/operational/ActivityInboxPreview'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  type OperationalActivityType,
  useOperationalCockpit,
} from '@/hooks/useOperationalCockpit'

export const Route = createFileRoute('/authenticated/atividades')({
  component: ActivitiesPage,
})

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

function ActivitiesPage() {
  const { isLoading, error, warnings, activityItems, kpis } = useOperationalCockpit()
  const [typeFilter, setTypeFilter] = useState<OperationalActivityType | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'actionable' | 'critical'>('all')

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

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar todos os dados</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {warnings.map((warning) => (
        <Alert key={warning}>
          <AlertTitle>Fonte alternativa em uso</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

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
    </div>
  )
}
