import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { WorkflowDueMode, WorkflowStepInput } from '@/hooks/useApprovalFlow'
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
  const dueMode: WorkflowDueMode = step.due_mode ?? (step.due_at ? 'date' : 'days')

  function changeAssignmentType(nextType: WorkflowAssignmentType) {
    onChange({
      assignment_type: nextType,
      assignee_id: null,
      assignee_user_id: null,
      assignee_group_id: null,
    })
  }

  function changeDueMode(nextMode: WorkflowDueMode) {
    onChange({
      due_mode: nextMode,
      due_days: nextMode === 'days' ? step.due_days ?? 2 : null,
      due_at: nextMode === 'date' ? step.due_at ?? null : null,
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
            <SelectItem value="group" disabled={!canUseGroups || groups.length === 0}>Grupo de aprovação</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          Você pode aprovar por papel, usuário específico ou grupo reutilizável.
        </p>
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

      <div>
        <div className="mb-2 text-sm font-medium">Modo de prazo</div>
        <Select value={dueMode} onValueChange={(value) => changeDueMode(value as WorkflowDueMode)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="days">Por quantidade de dias</SelectItem>
            <SelectItem value="date">Por data específica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dueMode === 'days' ? (
        <div>
          <div className="mb-2 text-sm font-medium">Quantidade de dias</div>
          <Input
            type="number"
            min={0}
            step={1}
            value={step.due_days ?? 2}
            onChange={(event) => onChange({
              due_mode: 'days',
              due_days: event.target.value === '' ? null : Number(event.target.value),
              due_at: null,
            })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Prazo calculado a partir do momento do envio.
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-2 text-sm font-medium">Data específica</div>
          <Input
            type="date"
            value={step.due_at?.slice(0, 10) ?? ''}
            onChange={(event) => onChange({
              due_mode: 'date',
              due_days: null,
              due_at: event.target.value || null,
            })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Data definida manualmente; calendário útil não é aplicado nesta fase.
          </p>
        </div>
      )}
    </>
  )
}
