import { useMemo } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { useApprovalQueue } from '@/hooks/useApprovalQueue'
import { type AuditEntry, useAuditTrail } from '@/hooks/useAuditTrail'
import { useDocuments, type Document } from '@/hooks/useDocuments'
import { useNotifications, type Notification } from '@/hooks/useNotifications'

export type OperationalActivityType =
  | 'approval_pending'
  | 'review_pending'
  | 'rejected_for_correction'
  | 'mention'
  | 'nearing_due'
  | 'overdue'
  | 'recent_update'
  | 'informational'

export type OperationalPriority = 'critical' | 'high' | 'medium' | 'low'

export interface OperationalActivityItem {
  id: string
  type: OperationalActivityType
  title: string
  description: string
  documentId: string | null
  documentCode: string | null
  documentTitle: string | null
  projectName: string | null
  area: string | null
  status: string
  priority: OperationalPriority
  dueAt: string | null
  createdAt: string
  suggestedAction: string
  target: 'document' | 'approval' | 'none'
}

export interface RecentActivity {
  id: string
  title: string
  description: string
  documentId: string | null
  documentCode: string | null
  documentTitle: string | null
  actorName: string | null
  status: string | null
  createdAt: string
  source: 'audit_trail' | 'documents'
}

export interface OperationalKpis {
  myPending: number
  awaitingMyAction: number
  rejectedForCorrection: number
  nearingReview: number
  overdue: number
  approvalsPending: number
  unreadNotifications: number
}

const DAY_IN_MS = 1000 * 60 * 60 * 24
const PRIORITY_ORDER: Record<OperationalPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function daysUntil(value: string | null) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    const now = new Date()
    const targetDate = Date.UTC(year, month - 1, day)
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    return Math.round((targetDate - today) / DAY_IN_MS)
  }
  return Math.ceil((new Date(value).getTime() - Date.now()) / DAY_IN_MS)
}

function getDocumentLabel(document: Document | undefined, notification?: Notification) {
  return {
    code: document?.code ?? null,
    title: document?.title ?? notification?.body ?? notification?.title ?? null,
    projectName: document?.project?.name ?? null,
    area: document?.area ?? null,
  }
}

function isCorrectionNotification(notification: Notification) {
  return notification.type === 'document_rejected'
    || notification.type.includes('reject')
    || notification.type.includes('correction')
}

function isMentionNotification(notification: Notification) {
  return notification.type === 'mention' || notification.type.includes('mention')
}

function isWorkflowNotification(notification: Notification) {
  return notification.type === 'approval_required'
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    created: 'Documento criado',
    document_created: 'Documento criado',
    updated: 'Documento atualizado',
    document_updated: 'Documento atualizado',
    submitted_for_review: 'Enviado para aprovação',
    step_approved: 'Etapa aprovada',
    approved: 'Documento aprovado',
    approved_and_published: 'Documento aprovado e publicado',
    rejected: 'Documento reprovado',
    correction_requested: 'Correção solicitada',
    correction_updated: 'Correção atualizada',
    correction_updated_with_attachment: 'Correção atualizada com anexo',
    resubmitted_after_correction: 'Documento corrigido e reenviado',
    revision_created: 'Nova revisão registrada',
    new_revision: 'Nova revisão registrada',
    exported: 'Documento exportado',
    status_changed: 'Status do documento alterado',
    notification_created: 'Notificação criada',
    obsoleted: 'Documento tornado obsoleto',
  }

  return labels[action] ?? action.replaceAll('_', ' ')
}

function recentDescription(entry: AuditEntry) {
  const documentLabel = [entry.document?.code, entry.document?.title].filter(Boolean).join(' — ')
  const transition =
    entry.old_status || entry.new_status
      ? [entry.old_status, entry.new_status].filter(Boolean).join(' → ')
      : null

  return [documentLabel, transition].filter(Boolean).join(' · ') || 'Atualização registrada na trilha de auditoria.'
}

export function mapAuditEntriesToRecentActivities(entries: AuditEntry[], limit = 10): RecentActivity[] {
  return entries.slice(0, limit).map((entry) => ({
    id: entry.id,
    title: actionLabel(entry.action),
    description: recentDescription(entry),
    documentId: entry.document_id,
    documentCode: entry.document?.code ?? null,
    documentTitle: entry.document?.title ?? null,
    actorName: entry.user?.full_name ?? null,
    status: entry.new_status,
    createdAt: entry.created_at,
    source: 'audit_trail',
  }))
}

function documentsFallback(documents: Document[]): RecentActivity[] {
  return [...documents]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 10)
    .map((document) => {
      const wasUpdated = document.updated_at !== document.created_at
      return {
        id: `document-${document.id}`,
        title: wasUpdated ? 'Documento atualizado' : 'Documento criado',
        description: [document.code, document.title].filter(Boolean).join(' — '),
        documentId: document.id,
        documentCode: document.code,
        documentTitle: document.title,
        actorName: document.author?.full_name ?? null,
        status: document.status,
        createdAt: wasUpdated ? document.updated_at : document.created_at,
        source: 'documents' as const,
      }
    })
}

function sortActivityItems(items: OperationalActivityItem[]) {
  return items.sort((left, right) => {
    const priorityDifference = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
    if (priorityDifference !== 0) return priorityDifference
    if (left.dueAt && right.dueAt) return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
    if (left.dueAt) return -1
    if (right.dueAt) return 1
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

export function useOperationalCockpit() {
  const { profile } = useAuthContext()
  const {
    documents,
    loading: documentsLoading,
    error: documentsError,
    schemaFallback: documentsSchemaFallback,
  } = useDocuments()
  const {
    queue,
    loading: queueLoading,
    error: queueError,
    schemaFallback: queueSchemaFallback,
    compatibilityMessage: queueCompatibilityMessage,
  } = useApprovalQueue()
  const { notifications, unreadCount, loading: notificationsLoading } = useNotifications()
  const { entries, loading: auditLoading, error: auditError } = useAuditTrail()

  const result = useMemo(() => {
    const documentsById = new Map(documents.map((document) => [document.id, document]))
    const activityItems: OperationalActivityItem[] = []
    const correctionDocumentIds = new Set<string>()
    const relevantReviewDocumentIds = new Set<string>()
    const managerialView = profile?.role === 'admin' || profile?.role === 'manager'
    const now = new Date().toISOString()

    for (const item of queue) {
      const overdue = item.overdue
      const assignedActor =
        item.assignment_type === 'group'
          ? item.assignee_group_name ?? 'grupo responsável'
          : item.assignment_type === 'user'
            ? item.assignee_user_name ?? item.assignee_name ?? 'usuário responsável'
            : item.assignee_name ?? 'responsável do papel'
      activityItems.push({
        id: `approval-${item.stepId}`,
        type: overdue ? 'overdue' : 'approval_pending',
        title: overdue ? 'Aprovação atrasada' : 'Aprovação pendente',
        description: `${item.step_label} aguarda ${assignedActor}.`,
        documentId: item.documentId,
        documentCode: item.code,
        documentTitle: item.title,
        projectName: item.project_name,
        area: item.area,
        status: overdue ? 'Atrasado' : item.days_until_due === 0 ? 'Vence hoje' : 'Pendente',
        priority: overdue ? 'critical' : item.days_until_due !== null && item.days_until_due <= 2 ? 'high' : 'medium',
        dueAt: item.due_at,
        createdAt: item.created_at,
        suggestedAction: 'Revisar e decidir',
        target: 'approval',
      })
    }

    for (const notification of notifications) {
      const document = notification.document_id ? documentsById.get(notification.document_id) : undefined
      const label = getDocumentLabel(document, notification)

      if (isCorrectionNotification(notification)) {
        if (document && !['draft', 'rejected'].includes(document.status)) continue
        if (notification.document_id && correctionDocumentIds.has(notification.document_id)) continue
        if (notification.document_id) correctionDocumentIds.add(notification.document_id)

        activityItems.push({
          id: `correction-${notification.document_id ?? notification.id}`,
          type: 'rejected_for_correction',
          title: 'Correção solicitada',
          description: notification.title,
          documentId: notification.document_id,
          documentCode: label.code,
          documentTitle: label.title,
          projectName: label.projectName,
          area: label.area,
          status: 'Correção necessária',
          priority: 'high',
          dueAt: null,
          createdAt: notification.created_at,
          suggestedAction: 'Corrigir documento',
          target: notification.document_id ? 'document' : 'none',
        })
        continue
      }

      if (isWorkflowNotification(notification)) continue

      activityItems.push({
        id: `notification-${notification.id}`,
        type: isMentionNotification(notification) ? 'mention' : notification.type.includes('approved') ? 'recent_update' : 'informational',
        title: notification.title,
        description: notification.body ?? 'Nova notificação do TRAMITA.',
        documentId: notification.document_id,
        documentCode: label.code,
        documentTitle: label.title,
        projectName: label.projectName,
        area: label.area,
        status: notification.read ? 'Lida' : 'Nova',
        priority: notification.read ? 'low' : 'medium',
        dueAt: null,
        createdAt: notification.created_at,
        suggestedAction: notification.document_id ? 'Ver documento' : 'Consultar informação',
        target: notification.document_id ? 'document' : 'none',
      })
    }

    for (const document of documents) {
      if (
        (document.status === 'rejected' || document.correction)
        && document.author_id === profile?.id
        && !correctionDocumentIds.has(document.id)
      ) {
        correctionDocumentIds.add(document.id)
        activityItems.push({
          id: `correction-status-${document.id}`,
          type: 'rejected_for_correction',
          title: 'Correção solicitada',
          description: document.correction?.reason ?? 'O documento precisa ser ajustado antes de retornar ao fluxo.',
          documentId: document.id,
          documentCode: document.code,
          documentTitle: document.title,
          projectName: document.project?.name ?? null,
          area: document.area,
          status: 'Correção necessária',
          priority: 'high',
          dueAt: null,
          createdAt: document.updated_at,
          suggestedAction: 'Corrigir documento',
          target: 'document',
        })
      }

      if (
        !document.next_review_at ||
        document.status !== 'published' ||
        (!managerialView && document.author_id !== profile?.id)
      ) {
        continue
      }

      const remainingDays = daysUntil(document.next_review_at)
      if (remainingDays === null || remainingDays > 30) continue
      relevantReviewDocumentIds.add(document.id)
      const overdue = remainingDays < 0
      const nearing = remainingDays >= 0 && remainingDays <= 7

      activityItems.push({
        id: `review-${document.id}`,
        type: overdue ? 'overdue' : nearing ? 'nearing_due' : 'review_pending',
        title: overdue ? 'Revisão documental atrasada' : nearing ? 'Revisão próxima do prazo' : 'Revisão pendente',
        description: overdue
          ? 'A data prevista para revisão já passou.'
          : `A revisão está prevista para ${remainingDays === 0 ? 'hoje' : `daqui a ${remainingDays} dias`}.`,
        documentId: document.id,
        documentCode: document.code,
        documentTitle: document.title,
        projectName: document.project?.name ?? null,
        area: document.area,
        status: overdue ? 'Atrasado' : remainingDays === 0 ? 'Vence hoje' : 'Próximo da revisão',
        priority: overdue ? 'critical' : nearing ? 'high' : 'medium',
        dueAt: document.next_review_at,
        createdAt: document.updated_at,
        suggestedAction: 'Planejar revisão',
        target: 'document',
      })
    }

    const sortedItems = sortActivityItems(activityItems)
    const actionableItems = sortedItems.filter((item) =>
      !['recent_update', 'informational'].includes(item.type)
      && !(item.type === 'mention' && item.status === 'Lida'),
    )
    const awaitingDocumentIds = new Set(
      actionableItems.map((item) => item.documentId).filter((id): id is string => Boolean(id)),
    )
    const recentActivities = entries.length
      ? mapAuditEntriesToRecentActivities(entries)
      : documentsFallback(documents)

    const kpis: OperationalKpis = {
      myPending: actionableItems.length,
      awaitingMyAction: awaitingDocumentIds.size,
      rejectedForCorrection: correctionDocumentIds.size,
      nearingReview: relevantReviewDocumentIds.size,
      overdue: sortedItems.filter((item) => item.type === 'overdue').length,
      approvalsPending: queue.length,
      unreadNotifications: unreadCount,
    }

    return {
      kpis,
      activityItems: sortedItems,
      recentActivities,
      approvalSummary: {
        total: queue.length,
        overdue: queue.filter((item) => item.overdue).length,
        onTime: queue.filter((item) => item.due_at && !item.overdue).length,
        withoutDueDate: queue.filter((item) => !item.due_at).length,
      },
      emptyStates: {
        activities: sortedItems.length === 0,
        recentActivities: recentActivities.length === 0,
        approvals: queue.length === 0,
      },
      recentActivitiesSource: entries.length ? ('audit_trail' as const) : ('documents' as const),
      generatedAt: now,
    }
  }, [documents, entries, notifications, profile, queue, unreadCount])

  const error = documentsError ?? queueError
  const warnings = [
    auditError ? 'A trilha de auditoria não pôde ser carregada; as atividades recentes usam documentos atualizados.' : null,
    documentsSchemaFallback ? 'Os dados de projeto não estão disponíveis neste ambiente; área e documento continuam visíveis.' : null,
    queueSchemaFallback
      ? queueCompatibilityMessage ?? 'A fila está operando em modo de compatibilidade.'
      : queueCompatibilityMessage,
  ].filter((warning): warning is string => Boolean(warning))

  return {
    profile,
    isLoading: documentsLoading || queueLoading || notificationsLoading || auditLoading,
    error,
    warnings,
    ...result,
  }
}
