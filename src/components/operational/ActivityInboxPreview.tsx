import { Link } from '@tanstack/react-router'
import { AlertTriangle, AtSign, Bell, CalendarClock, CheckSquare2, Info, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/operational/EmptyState'
import type { OperationalActivityItem, OperationalActivityType } from '@/hooks/useOperationalCockpit'
import { cn } from '@/lib/utils'

interface ActivityInboxPreviewProps {
  items: OperationalActivityItem[]
  loading?: boolean
  limit?: number
  title?: string
  description?: string
  showAllLink?: boolean
  className?: string
  emptyTitle?: string
  emptyDescription?: string
}

const TYPE_META: Record<OperationalActivityType, { label: string; icon: typeof Info }> = {
  approval_pending: { label: 'Aprovação', icon: CheckSquare2 },
  review_pending: { label: 'Revisão', icon: CalendarClock },
  rejected_for_correction: { label: 'Correção', icon: RotateCcw },
  mention: { label: 'Menção', icon: AtSign },
  nearing_due: { label: 'Prazo próximo', icon: CalendarClock },
  overdue: { label: 'Atrasado', icon: AlertTriangle },
  recent_update: { label: 'Atualização', icon: Bell },
  informational: { label: 'Informativo', icon: Info },
}

function formatDueDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(value))
}

export function ActivityInboxPreview({
  items,
  loading = false,
  limit,
  title = 'Minhas Atividades',
  description = 'Revisões, aprovações e documentos que precisam da sua atenção.',
  showAllLink = false,
  className,
  emptyTitle = 'Nenhuma atividade pendente agora.',
  emptyDescription = 'Quando houver revisões, aprovações ou documentos para corrigir, eles aparecerão aqui.',
}: ActivityInboxPreviewProps) {
  const visibleItems = typeof limit === 'number' ? items.slice(0, limit) : items

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {items.length > 0 && <Badge variant="secondary">{items.length}</Badge>}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">Carregando suas atividades...</div>
        ) : visibleItems.length === 0 ? (
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
          />
        ) : (
          <div className="divide-y">
            {visibleItems.map((item) => <ActivityRow key={item.id} item={item} />)}
          </div>
        )}
        {showAllLink && items.length > 0 && (
          <div className="border-t px-4 py-3">
            <Button asChild variant="ghost" className="w-full">
              <Link to="/authenticated/atividades">Ver todas as atividades</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityRow({ item }: { item: OperationalActivityItem }) {
  const meta = TYPE_META[item.type]
  const Icon = meta.icon
  const dueDate = formatDueDate(item.dueAt)
  const content = (
    <>
      <div className={cn(
        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
        item.priority === 'critical' && 'bg-destructive/10 text-destructive',
        item.priority === 'high' && 'bg-amber-100 text-amber-700',
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{item.title}</p>
          <Badge variant={item.priority === 'critical' ? 'destructive' : 'outline'}>{meta.label}</Badge>
        </div>
        {(item.documentCode || item.documentTitle) && (
          <p className="mt-1 truncate text-sm">
            {[item.documentCode, item.documentTitle].filter(Boolean).join(' — ')}
          </p>
        )}
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.projectName && <span>{item.projectName}</span>}
          {item.area && <span>{item.area}</span>}
          {dueDate && <span>Prazo: {dueDate}</span>}
          <span className="font-medium text-foreground/70">{item.suggestedAction}</span>
        </div>
      </div>
      <Badge
        className="shrink-0 self-start"
        variant={item.priority === 'critical' ? 'destructive' : item.status === 'Nova' ? 'default' : 'secondary'}
      >
        {item.status}
      </Badge>
    </>
  )

  if (item.target === 'document' && item.documentId) {
    return (
      <Link
        to="/authenticated/documents/$documentId"
        params={{ documentId: item.documentId }}
        className="flex gap-3 px-5 py-4 transition-colors hover:bg-muted/40"
      >
        {content}
      </Link>
    )
  }

  if (item.target === 'approval') {
    return (
      <Link
        to="/authenticated/fluxo-de-aprovacao"
        className="flex gap-3 px-5 py-4 transition-colors hover:bg-muted/40"
      >
        {content}
      </Link>
    )
  }

  return <div className="flex gap-3 px-5 py-4">{content}</div>
}
