export function getErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback

  if (error instanceof Error && error.message) return error.message

  if (typeof error === 'string') return error

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>

    const parts = ['message', 'details', 'hint']
      .map((key) => record[key])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

    if (parts.length) return parts.join(' · ')

    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }

  return fallback
}
