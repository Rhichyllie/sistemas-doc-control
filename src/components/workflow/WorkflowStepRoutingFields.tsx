import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { WorkflowStepInput } from '@/hooks/useApprovalFlow'
import type { ApprovalGroup, WorkflowActorUser } from '@/hooks/useWorkflowActors'
import type { WorkflowAssignmentType } from '@/lib/workflowCompatibility'

interface WorkflowRoleOption {
  value: string
  label: string
}

interface WorkflowStepRoutingFieldsProps {
  step: WorkflowStepInput
  users: WorkflowActorUser[]
  groups: ApprovalGroup[]
  roles: readonly WorkflowRoleOption[]
  canUseGroups: boolean
  compatibilityMessage?: string | null
  onChange: (updates: Partial<WorkflowStepInput>) => void
}

function assignmentTypeFor(step: WorkflowStepInput): WorkflowAssignmentType {
  if (step.assignment_type === 'group' || step.assignee_group_id) return 'group'
  if (step.assignment_type === 'user' || step.assignee_user_id || step.assignee_id) return 'user'
  return 'role'
}

export function WorkflowStepRoutingFields({
  step,
  users,
  groups,
  roles,
  canUseGroups,
  compatibilityMessage,
  onChange,
}: WorkflowStepRoutingFieldsProps) {
  const assignmentType = assignmentTypeFor(step)

  function changeAssignmentType(nextType: WorkflowAssignmentType) {
    onChange({
      assignment_type: nextType,
      assignee_id: null,
      assignee_user_id: null,
      assignee_group_id: null,
    })
  }

  return (
    <>
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          Tipo de atribuição
          <Badge variant="outline">
            {assignmentType === 'role' ? 'Papel' : assignmentType === 'user' ? 'Usuário' : 'Grupo'}
          </Badge>
        </div>
        <Select value={assignmentType} onValueChange={(value) => changeAssignmentType(value as WorkflowAssignmentType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="role">Papel</SelectItem>
            <SelectItem value="user">Usuário específico</SelectItem>
            <SelectItem value="group" disabled={!canUseGroups}>Grupo de aprovação</SelectItem>
          </SelectContent>
        </Select>
        {!canUseGroups && (
          <p className="mt-1 text-xs text-muted-foreground">
            {compatibilityMessage ?? 'Grupos de aprovação ainda não estão disponíveis neste ambiente.'}
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">
          {assignmentType === 'role' ? 'Papel responsável' : 'Papel da etapa e fallback'}
        </div>
        <Select value={step.required_role} onValueChange={(requiredRole) => onChange({ required_role: requiredRole })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {assignmentType === 'user' && (
        <div className="md:col-span-2">
          <div className="mb-2 text-sm font-medium">Usuário responsável</div>
          <Select
            value={step.assignee_user_id ?? step.assignee_id ?? ''}
            onValueChange={(userId) => onChange({
              assignment_type: 'user',
              assignee_id: userId,
              assignee_user_id: userId,
              assignee_group_id: null,
            })}
          >
            <SelectTrigger><SelectValue placeholder="Selecione um usuário da organização" /></SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name} · {roles.find((role) => role.value === user.role)?.label ?? user.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!users.length && <p className="mt-1 text-xs text-muted-foreground">Nenhum usuário ativo encontrado.</p>}
        </div>
      )}

      {assignmentType === 'group' && (
        <div className="md:col-span-2">
          <div className="mb-2 text-sm font-medium">Grupo responsável</div>
          <Select
            value={step.assignee_group_id ?? ''}
            disabled={!canUseGroups}
            onValueChange={(groupId) => onChange({
              assignment_type: 'group',
              assignee_id: null,
              assignee_user_id: null,
              assignee_group_id: groupId,
            })}
          >
            <SelectTrigger><SelectValue placeholder="Selecione um grupo ativo" /></SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!groups.length && (
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhum grupo ativo disponível para roteamento.
            </p>
          )}
        </div>
      )}

      <div className="md:col-span-2">
        <div className="mb-2 text-sm font-medium">Instruções da etapa</div>
        <Textarea
          value={step.instructions ?? ''}
          onChange={(event) => onChange({ instructions: event.target.value })}
          placeholder="Orientações opcionais para quem receber esta etapa."
        />
      </div>
    </>
  )
}
