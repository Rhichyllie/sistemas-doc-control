import { Link } from '@tanstack/react-router'
import { Activity } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/operational/EmptyState'
import type { RecentActivity } from '@/hooks/useOperationalCockpit'
import { cn } from '@/lib/utils'

interface RecentActivityListProps {
  activities: RecentActivity[]
  loading?: boolean
  title?: string
  description?: string
  className?: string
  limit?: number
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export function RecentActivityList({
  activities,
  loading = false,
  title = 'Atividades Recentes',
  description = 'Últimas movimentações registradas na organização.',
  className,
  limit,
}: RecentActivityListProps) {
  const visibleActivities = typeof limit === 'number' ? activities.slice(0, limit) : activities

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">Carregando atividades recentes...</div>
        ) : visibleActivities.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title="Nenhuma atividade recente encontrada."
            description="As próximas movimentações documentais aparecerão nesta linha do tempo."
          />
        ) : (
          <div className="divide-y">
            {visibleActivities.map((activity) => {
              const content = (
                <>
                  <div className="relative mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{activity.title}</p>
                      {activity.status && <Badge variant="outline">{activity.status}</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{activity.description}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {activity.actorName && <span>Por {activity.actorName}</span>}
                      <span>{formatDateTime(activity.createdAt)}</span>
                    </div>
                  </div>
                </>
              )

              return activity.documentId ? (
                <Link
                  key={activity.id}
                  to="/authenticated/documents/$documentId"
                  params={{ documentId: activity.documentId }}
                  className="flex gap-3 px-5 py-4 transition-colors hover:bg-muted/40"
                >
                  {content}
                </Link>
              ) : (
                <div key={activity.id} className="flex gap-3 px-5 py-4">{content}</div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
