import { createFileRoute } from '@tanstack/react-router'
import { OperationalHome } from '@/components/operational/OperationalHome'

export const Route = createFileRoute('/authenticated/dashboard')({
  component: OperationalHome,
})
