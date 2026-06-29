import { Link } from '@tanstack/react-router'
import { AlertTriangle, CalendarClock, CheckSquare2, FileWarning, ListChecks, RotateCcw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { OperationalKpis } from '@/hooks/useOperationalCockpit'
import { cn } from '@/lib/utils'

interface OperationalKpiCardsProps {
  kpis: OperationalKpis
}

export function OperationalKpiCards({ kpis }: OperationalKpiCardsProps) {
  const cards = [
    {
      label: 'Minhas pendências',
      value: kpis.myPending,
      helper: 'Itens que pedem acompanhamento',
      icon: CheckSquare2,
      to: '/authenticated/atividades' as const,
      attention: kpis.myPending > 0,
    },
    {
      label: 'Aguardando minha ação',
      value: kpis.awaitingMyAction,
      helper: 'Documentos com ação sugerida',
      icon: ListChecks,
      to: '/authenticated/atividades' as const,
      attention: kpis.awaitingMyAction > 0,
    },
    {
      label: 'Aprovações pendentes',
      value: kpis.approvalsPending,
      helper: 'Etapas disponíveis na fila',
      icon: FileWarning,
      to: '/authenticated/fluxo-de-aprovacao' as const,
      attention: kpis.approvalsPending > 0,
    },
    {
      label: 'Itens atrasados',
      value: kpis.overdue,
      helper: 'Prazos que já venceram',
      icon: AlertTriangle,
      to: '/authenticated/atividades' as const,
      attention: kpis.overdue > 0,
      critical: kpis.overdue > 0,
    },
    {
      label: 'Próximos da revisão',
      value: kpis.nearingReview,
      helper: 'Até 30 dias ou vencidos',
      icon: CalendarClock,
      to: '/authenticated/atividades' as const,
      attention: kpis.nearingReview > 0,
    },
    {
      label: 'Para corrigir',
      value: kpis.rejectedForCorrection,
      helper: 'Reprovações ligadas a você',
      icon: RotateCcw,
      to: '/authenticated/atividades' as const,
      attention: kpis.rejectedForCorrection > 0,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Link key={card.label} to={card.to} className="group">
            <Card className={cn(
              'h-full transition-colors group-hover:border-primary/40',
              card.critical && 'border-destructive/30 bg-destructive/[0.03]',
            )}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
                  card.attention && 'bg-primary/10 text-primary',
                  card.critical && 'bg-destructive/10 text-destructive',
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tracking-tight">{card.value}</span>
                    <span className="truncate text-sm font-medium">{card.label}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{card.helper}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
