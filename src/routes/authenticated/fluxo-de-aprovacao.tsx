import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Filter, GitBranch } from 'lucide-react'
import { requireAuthenticated } from './-route-guards'
import { EmptyState } from '@/components/operational/EmptyState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuthContext } from '@/contexts/AuthContext'
import { useApprovalFlow } from '@/hooks/useApprovalFlow'
import { type QueueItem, useApprovalQueue } from '@/hooks/useApprovalQueue'
import { DOC_STATUS, DOC_TYPES, USER_ROLES } from '@/lib/constants'
import { formatDueLabel } from '@/lib/workflowDates'
import { toast } from 'sonner'

export const Route = createFileRoute('/authenticated/fluxo-de-aprovacao')({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location.href)
  },
  component: ApprovalFlowPage,
})

type DeadlineFilter = 'all' | 'overdue' | 'on_time' | 'no_due'

function getDocTypeLabel(docType: string) {
  return DOC_TYPES.find((item) => item.value === docType)?.label ?? docType
}

function getStatusLabel(status: string) {
  return DOC_STATUS.find((item) => item.value === status)?.label ?? status
}

function getRoleLabel(role: string) {
  return USER_ROLES.find((item) => item.value === role)?.label ?? role
}

function getAssignmentTypeLabel(type: QueueItem['assignment_type']) {
  if (type === 'user') return 'Usuário'
  if (type === 'group') return 'Grupo'
  return 'Papel'
}

function getAssignmentDescription(item: QueueItem) {
  if (item.assignment_type === 'group') {
    return `Atribuído ao grupo: ${item.assignee_group_name ?? 'Grupo não identificado'}`
  }
  if (item.assignment_type === 'user') {
    return `Atribuído ao usuário: ${item.assignee_user_name ?? item.assignee_name ?? 'Usuário não identificado'}`
  }
  return `Atribuído ao papel: ${getRoleLabel(item.required_role)}`
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function ApprovalFlowPage() {
  const { profile } = useAuthContext()
  const {
    queue,
    loading,
    error,
    schemaFallback,
    canUseGroups,
    compatibilityMessage,
    refetch,
  } = useApprovalQueue()
  const { actOnStep, loading: actionLoading, error: actionError } = useApprovalFlow()
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null)
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [comment, setComment] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [docTypeFilter, setDocTypeFilter] = useState('all')

  const canSeeQueue = Boolean(profile)
  const canConfigureRouting = profile && ['admin', 'manager', 'author'].includes(profile.role)

  const projectOptions = useMemo(() => {
    const projects = new Map<string, string>()
    queue.forEach((item) => {
      if (item.project_id && item.project_name) projects.set(item.project_id, item.project_name)
    })
    return [...projects.entries()].sort((left, right) => left[1].localeCompare(right[1]))
  }, [queue])

  const docTypeOptions = useMemo(
    () => [...new Set(queue.map((item) => item.doc_type).filter(Boolean))].sort(),
    [queue],
  )

  const filteredQueue = useMemo(() => queue.filter((item) => {
    if (projectFilter !== 'all' && item.project_id !== projectFilter) return false
    if (docTypeFilter !== 'all' && item.doc_type !== docTypeFilter) return false
    if (deadlineFilter === 'overdue' && !item.overdue) return false
    if (deadlineFilter === 'on_time' && (!item.due_at || item.overdue)) return false
    if (deadlineFilter === 'no_due' && item.due_at) return false
    return true
  }), [deadlineFilter, docTypeFilter, projectFilter, queue])

  const queueGroups = [
    {
      key: 'overdue',
      title: 'Atrasados',
      description: 'Etapas com prazo vencido.',
      icon: AlertTriangle,
      items: filteredQueue.filter((item) => item.overdue),
      critical: true,
    },
    {
      key: 'on-time',
      title: 'No prazo',
      description: 'Etapas com prazo definido e ainda vigente.',
      icon: CheckCircle2,
      items: filteredQueue.filter((item) => item.due_at && !item.overdue),
      critical: false,
    },
    {
      key: 'no-due',
      title: 'Sem prazo',
      description: 'Etapas que ainda não possuem data limite.',
      icon: Clock3,
      items: filteredQueue.filter((item) => !item.due_at),
      critical: false,
    },
  ]

  function openActionDialog(item: QueueItem, nextAction: 'approve' | 'reject') {
    setSelectedItem(item)
    setAction(nextAction)
    setComment('')
    setValidationError(null)
  }

  async function handleConfirmAction() {
    if (!selectedItem || !action) return

    if (action === 'reject' && !comment.trim()) {
      setValidationError('Informe o motivo da rejeição.')
      return
    }

    const success = await actOnStep({
      documentId: selectedItem.documentId,
      stepId: selectedItem.stepId,
      action,
      comment: comment.trim() || undefined,
    })

    if (success) {
      toast.success(action === 'approve' ? 'Documento aprovado' : 'Documento rejeitado e retornado ao elaborador')
      setSelectedItem(null)
      setAction(null)
      setComment('')
      await refetch()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fila de Aprovação</h1>
          <p className="mt-1 text-muted-foreground">Documentos aguardando sua revisão ou decisão no workflow.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canConfigureRouting && (
            <Button asChild variant="outline">
              <Link to="/authenticated/documents">Configurar roteamento</Link>
            </Button>
          )}
          <Badge variant={queue.length > 0 ? 'default' : 'secondary'}>
            {queue.length} {queue.length === 1 ? 'pendente' : 'pendentes'}
          </Badge>
        </div>
      </div>

      {!canSeeQueue ? (
        <Card>
          <CardHeader>
            <CardTitle>Fila disponível para revisores e aprovadores</CardTitle>
            <CardDescription>
              Seu perfil pode acompanhar documentos e atividades, mas não possui permissão para decidir etapas.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-3">
              <div className="flex items-center gap-2 text-sm font-medium md:col-span-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                Filtros da fila
              </div>
              <Select value={deadlineFilter} onValueChange={(value) => setDeadlineFilter(value as DeadlineFilter)}>
                <SelectTrigger aria-label="Filtrar por prazo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os prazos</SelectItem>
                  <SelectItem value="overdue">Atrasados</SelectItem>
                  <SelectItem value="on_time">No prazo</SelectItem>
                  <SelectItem value="no_due">Sem prazo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger aria-label="Filtrar por projeto"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os projetos</SelectItem>
                  {projectOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                <SelectTrigger aria-label="Filtrar por tipo de documento"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {docTypeOptions.map((type) => <SelectItem key={type} value={type}>{getDocTypeLabel(type)}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {(schemaFallback || compatibilityMessage) && (
            <Alert>
              <AlertTitle>Fila em modo de compatibilidade</AlertTitle>
              <AlertDescription>
                {compatibilityMessage
                  ?? 'Os campos opcionais do workflow não estão disponíveis. As aprovações continuam acessíveis no modo atual.'}
                {!canUseGroups && ' Atribuições por grupo ficam disponíveis após a migration P-9A.'}
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <Card><CardContent className="p-6 text-muted-foreground">Carregando fila de aprovação...</CardContent></Card>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Não foi possível carregar a fila</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
              </AlertDescription>
            </Alert>
          ) : queue.length === 0 ? (
            <Card>
              <EmptyState
                icon={<GitBranch className="h-5 w-5" />}
                title="Nenhuma aprovação pendente."
                description="Quando um documento chegar para sua revisão ou aprovação, ele aparecerá aqui."
              />
            </Card>
          ) : filteredQueue.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhuma atividade recente encontrada para os filtros atuais."
                description="Ajuste os filtros de prazo, projeto ou tipo de documento para ampliar a busca."
              />
            </Card>
          ) : (
            <div className="space-y-5">
              {queueGroups.filter((group) => group.items.length > 0).map((group) => {
                const Icon = group.icon
                return (
                  <Card key={group.key} className={group.critical ? 'border-destructive/30' : undefined}>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Icon className={group.critical ? 'h-5 w-5 text-destructive' : 'h-5 w-5 text-muted-foreground'} />
                          {group.title}
                        </CardTitle>
                        <CardDescription>{group.description}</CardDescription>
                      </div>
                      <Badge variant={group.critical ? 'destructive' : 'secondary'}>{group.items.length}</Badge>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <QueueTable
                        items={group.items}
                        onApprove={(item) => openActionDialog(item, 'approve')}
                        onReject={(item) => openActionDialog(item, 'reject')}
                      />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedItem && !!action} onOpenChange={(open) => {
        if (!open) {
          setSelectedItem(null)
          setAction(null)
          setComment('')
          setValidationError(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === 'approve' ? 'Aprovar documento' : 'Rejeitar documento'}</DialogTitle>
            <DialogDescription>
              {selectedItem?.code ?? 'Gerando...'} — {selectedItem?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(event) => {
                setComment(event.target.value)
                setValidationError(null)
              }}
              placeholder={action === 'approve' ? 'Comentário opcional sobre a aprovação...' : 'Informe o motivo da rejeição...'}
            />
            {(validationError || actionError) && <p className="text-sm text-destructive">{validationError ?? actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelectedItem(null)}>Cancelar</Button>
            <Button variant={action === 'reject' ? 'destructive' : 'default'} disabled={actionLoading} onClick={handleConfirmAction}>
              {actionLoading ? 'Processando...' : action === 'approve' ? 'Confirmar aprovação' : 'Confirmar rejeição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QueueTable({
  items,
  onApprove,
  onReject,
}: {
  items: QueueItem[]
  onApprove: (item: QueueItem) => void
  onReject: (item: QueueItem) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Documento</TableHead>
          <TableHead>Tipo / Projeto</TableHead>
          <TableHead>Etapa / Responsável</TableHead>
          <TableHead>Prazo</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.stepId}>
            <TableCell className="min-w-60">
              <Link
                className="font-medium hover:underline"
                to="/authenticated/documents/$documentId"
                params={{ documentId: item.documentId }}
              >
                {item.code ?? 'Gerando...'} — {item.title}
              </Link>
              <div className="mt-1 text-xs text-muted-foreground">{item.area} · Autor: {item.author_name ?? '—'}</div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{getDocTypeLabel(item.doc_type)}</Badge>
              <div className="mt-1 text-xs text-muted-foreground">{item.project_name ?? 'Sem projeto'}</div>
            </TableCell>
            <TableCell className="min-w-48">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.step_label}</span>
                <Badge variant="outline">{getAssignmentTypeLabel(item.assignment_type)}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {getAssignmentDescription(item)}
              </div>
              {item.instructions && <div className="mt-1 text-xs text-muted-foreground">{item.instructions}</div>}
            </TableCell>
            <TableCell>
              <div>{formatDateTime(item.due_at)}</div>
              {item.overdue ? (
                <Badge variant="destructive" className="mt-1">{formatDueLabel(item.due_at)}</Badge>
              ) : item.days_until_due !== null ? (
                <span className="text-xs text-muted-foreground">{formatDueLabel(item.due_at)}</span>
              ) : (
                <span className="text-xs text-muted-foreground">{formatDueLabel(item.due_at)}</span>
              )}
            </TableCell>
            <TableCell><Badge variant="secondary">{getStatusLabel(item.doc_status)}</Badge></TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => onApprove(item)}>Aprovar</Button>
                <Button size="sm" variant="destructive" onClick={() => onReject(item)}>Rejeitar</Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
