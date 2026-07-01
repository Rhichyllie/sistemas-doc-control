export const APPROVAL_GROUP_CODE_MAX_LENGTH = 64

export interface ApprovalGroupValidationInput {
  name: string
  code: string
}

export interface ApprovalGroupValidationResult {
  isValid: boolean
  errors: {
    name?: string
    code?: string
  }
  normalizedCode: string
}

export interface ApprovalGroupScopeLike {
  scope?: string | null
  project_id?: string | null
}

export function normalizeApprovalGroupCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, APPROVAL_GROUP_CODE_MAX_LENGTH)
    .replace(/-$/g, '')
}

export function suggestApprovalGroupCode(name: string): string {
  return normalizeApprovalGroupCode(name)
}

export function validateApprovalGroupInput(
  input: ApprovalGroupValidationInput,
): ApprovalGroupValidationResult {
  const errors: ApprovalGroupValidationResult['errors'] = {}
  const normalizedCode = normalizeApprovalGroupCode(input.code)

  if (!input.name.trim()) {
    errors.name = 'Informe o nome do grupo.'
  }

  if (!normalizedCode) {
    errors.code = 'Informe um código válido para o grupo.'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalizedCode,
  }
}

export function describeApprovalGroupScope(group: ApprovalGroupScopeLike): string {
  if (group.scope === 'project') {
    return group.project_id ? 'Projeto específico' : 'Projeto não definido'
  }

  return 'Organização'
}
