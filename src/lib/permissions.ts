import type { UserProfile } from '@/contexts/AuthContext'

type Role = UserProfile['role']

export const PERMISSIONS = {
  // Document actions
  'document:create':         ['admin','manager','approver','reviewer','author'] as Role[],
  'document:edit_draft':     ['admin','manager','author'] as Role[],
  'document:submit_review':  ['admin','manager','author'] as Role[],
  'document:review':         ['admin','manager','reviewer'] as Role[],
  'document:approve':        ['admin','manager','approver'] as Role[],
  'document:publish':        ['admin','manager'] as Role[],
  'document:obsolete':       ['admin','manager'] as Role[],
  'document:delete':         ['admin'] as Role[],

  // User management
  'user:invite':             ['admin','manager'] as Role[],
  'user:change_role':        ['admin'] as Role[],
  'user:deactivate':         ['admin'] as Role[],

  // Audit & reports
  'audit:view':              ['admin','manager','approver','reviewer','author','viewer'] as Role[],
  'audit:export':            ['admin','manager'] as Role[],
  'report:view':             ['admin','manager','approver','reviewer','author','viewer'] as Role[],
  'report:export':           ['admin','manager'] as Role[],

  // Settings
  'settings:org':            ['admin'] as Role[],
  'settings:users':          ['admin','manager'] as Role[],
} as const

export type Permission = keyof typeof PERMISSIONS

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return (PERMISSIONS[permission] as readonly Role[]).includes(role)
}
