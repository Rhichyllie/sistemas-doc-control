const DAY_IN_MS = 1000 * 60 * 60 * 24

export type DueStatus = 'none' | 'on_track' | 'due_soon' | 'overdue'

export function normalizeDateInputToDueAt(date: string): string | null {
  const normalized = date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null

  const [year, month, day] = normalized.split('-').map(Number)
  const dueAt = new Date(year, month - 1, day, 23, 59, 59, 999)
  if (
    Number.isNaN(dueAt.getTime())
    || dueAt.getFullYear() !== year
    || dueAt.getMonth() !== month - 1
    || dueAt.getDate() !== day
  ) {
    return null
  }
  return dueAt.toISOString()
}

export function calculateDueAtFromDays(days: number, from: Date = new Date()): string | null {
  if (!Number.isInteger(days) || days < 0) return null
  const dueAt = new Date(from)
  dueAt.setDate(dueAt.getDate() + days)
  return dueAt.toISOString()
}

export function getDaysUntilDue(dueAt?: string | null, now: Date = new Date()) {
  if (!dueAt) return null
  const timestamp = new Date(dueAt).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.ceil((timestamp - now.getTime()) / DAY_IN_MS)
}

export function getDueStatus(dueAt?: string | null): DueStatus {
  const daysUntilDue = getDaysUntilDue(dueAt)
  if (daysUntilDue === null) return 'none'
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 2) return 'due_soon'
  return 'on_track'
}

export function formatDueLabel(dueAt?: string | null) {
  const daysUntilDue = getDaysUntilDue(dueAt)
  if (daysUntilDue === null) return 'Sem prazo definido'
  if (daysUntilDue < 0) {
    const daysOverdue = Math.abs(daysUntilDue)
    return `SLA vencido há ${daysOverdue} ${daysOverdue === 1 ? 'dia' : 'dias'}`
  }
  if (daysUntilDue === 0) return 'SLA vence hoje'
  return `SLA vence em ${daysUntilDue} ${daysUntilDue === 1 ? 'dia' : 'dias'}`
}
