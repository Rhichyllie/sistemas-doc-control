import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Pencil, Plus, ShieldCheck, UserPlus, UsersRound } from 'lucide-react'
import { EmptyState } from '@/components/operational/EmptyState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  type ApprovalGroupRecord,
  useApprovalGroups,
} from '@/hooks/useApprovalGroups'
import { USER_ROLES } from '@/lib/constants'
import { toast } from 'sonner'

export const Route = createFileRoute('/authenticated/grupos-aprovacao')({
  component: ApprovalGroupsPage,
})

const MEMBER_ROLES = [
  { value: 'member', label: 'Membro' },
  { value: 'lead', label: 'Líder' },
  { value: 'backup', label: 'Suplente' },
]

interface GroupFormState {
  name: string
  description: string
  scope: string
  project_id: string | null
}

const EMPTY_GROUP_FORM: GroupFormState = {
  name: '',
  description: '',
  scope: 'organization',
  project_id: null,
}

function getUserRoleLabel(role: string) {
  return USER_ROLES.find((item) => item.value === role)?.label ?? role
}

function getMemberRoleLabel(role: string) {
  return MEMBER_ROLES.find((item) => item.value === role)?.label ?? role
}

function ApprovalGroupsPage() {
  const { profile } = useAuthContext()
  const canManage = profile?.role === 'admin' || profile?.role === 'manager'
  const {
    groups,
    members,
    users,
    isLoading,
    error,
    canUseGroups,
    canManageMembers,
    compatibilityMessage,
    createGroup,
    updateGroup,
    deactivateGroup,
    addMember,
    removeMember,
    updateMemberRole,
    refresh,
  } = useApprovalGroups(Boolean(canManage))
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ApprovalGroupRecord | null>(null)
  const [groupForm, setGroupForm] = useState<GroupFormState>(EMPTY_GROUP_FORM)
  const [memberGroup, setMemberGroup] = useState<ApprovalGroupRecord | null>(null)
  const [memberUserId, setMemberUserId] = useState('')
  const [memberRole, setMemberRole] = useState('member')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const usersById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  )

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Apenas administradores e gestores podem administrar grupos de aprovação.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  function openCreateGroup() {
    setEditingGroup(null)
    setGroupForm(EMPTY_GROUP_FORM)
    setValidationError(null)
    setGroupDialogOpen(true)
  }

  function openEditGroup(group: ApprovalGroupRecord) {
    setEditingGroup(group)
    setGroupForm({
      name: group.name,
      description: group.description ?? '',
      scope: group.scope,
      project_id: group.project_id,
    })
    setValidationError(null)
    setGroupDialogOpen(true)
  }

  async function handleSaveGroup() {
    if (!groupForm.name.trim()) {
      setValidationError('Informe o nome do grupo.')
      return
    }

    setSaving(true)
    const success = editingGroup
      ? await updateGroup(editingGroup.id, groupForm)
      : await createGroup(groupForm)
    setSaving(false)

    if (success) {
      toast.success(editingGroup ? 'Grupo atualizado' : 'Grupo criado')
      setGroupDialogOpen(false)
    }
  }

  async function handleToggleGroup(group: ApprovalGroupRecord) {
    const success = group.is_active
      ? await deactivateGroup(group.id)
      : await updateGroup(group.id, { is_active: true })
    if (success) toast.success(group.is_active ? 'Grupo desativado' : 'Grupo ativado')
  }

  function openAddMember(group: ApprovalGroupRecord) {
    setMemberGroup(group)
    setMemberUserId('')
    setMemberRole('member')
    setValidationError(null)
  }

  async function handleAddMember() {
    if (!memberGroup || !memberUserId) {
      setValidationError('Selecione um usuário.')
      return
    }

    setSaving(true)
    const success = await addMember(memberGroup.id, memberUserId, memberRole)
    setSaving(false)
    if (success) {
      toast.success('Membro adicionado ao grupo')
      setMemberGroup(null)
    }
  }

  async function handleRemoveMember(memberId: string) {
    const success = await removeMember(memberId)
    if (success) toast.success('Membro removido do grupo')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Badge variant="outline" className="mb-3">Workflow enterprise</Badge>
          <h1 className="text-3xl font-bold tracking-tight">Grupos de Aprovação</h1>
          <p className="mt-1 text-muted-foreground">
            Organize responsáveis reutilizáveis para revisão e aprovação de documentos.
          </p>
        </div>
        <Button onClick={openCreateGroup} disabled={!canUseGroups}>
          <Plus className="h-4 w-4" /> Novo grupo
        </Button>
      </div>

      {compatibilityMessage && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Modo de compatibilidade</AlertTitle>
          <AlertDescription>{compatibilityMessage}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível concluir a operação</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => refresh()}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTitle>Escopo por projeto indisponível</AlertTitle>
        <AlertDescription>
          A tabela atual de projetos não possui isolamento confiável por organização. Nesta fase, novos grupos usam escopo organizacional.
        </AlertDescription>
      </Alert>

      {isLoading ? (
        <Card><CardContent className="p-6 text-muted-foreground">Carregando grupos de aprovação...</CardContent></Card>
      ) : !canUseGroups ? (
        <Card>
          <EmptyState
            icon={<UsersRound className="h-5 w-5" />}
            title="Administração de grupos indisponível."
            description="Aplique a migration P-9A no Supabase para criar as tabelas de grupos e membros."
          />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersRound className="h-5 w-5" />}
            title="Nenhum grupo de aprovação criado."
            description="Crie um grupo para reunir revisores, aprovadores ou responsáveis de uma área."
            action={<Button onClick={openCreateGroup}>Criar primeiro grupo</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const groupMembers = members.filter(
              (member) => member.group_id === group.id && member.is_active,
            )
            return (
              <Card key={group.id} className={!group.is_active ? 'opacity-70' : undefined}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{group.name}</CardTitle>
                      <Badge variant={group.is_active ? 'default' : 'secondary'}>
                        {group.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge variant="outline">
                        {group.scope === 'project' ? 'Projeto' : 'Organização'}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1">
                      {group.description || 'Sem descrição.'}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditGroup(group)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!group.is_active || !canManageMembers}
                      onClick={() => openAddMember(group)}
                    >
                      <UserPlus className="h-4 w-4" /> Adicionar membro
                    </Button>
                    <Button
                      size="sm"
                      variant={group.is_active ? 'destructive' : 'secondary'}
                      onClick={() => handleToggleGroup(group)}
                    >
                      {group.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {!canManageMembers ? (
                    <div className="border-t px-6 py-5 text-sm text-muted-foreground">
                      A tabela de membros ainda não está disponível neste ambiente.
                    </div>
                  ) : groupMembers.length === 0 ? (
                    <div className="border-t px-6 py-5 text-sm text-muted-foreground">
                      Nenhum membro ativo neste grupo.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Membro</TableHead>
                          <TableHead>Papel no sistema</TableHead>
                          <TableHead>Papel no grupo</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupMembers.map((member) => {
                          const user = usersById.get(member.user_id)
                          return (
                            <TableRow key={member.id}>
                              <TableCell>
                                <div className="font-medium">{user?.full_name ?? 'Usuário não encontrado'}</div>
                                {user?.email && <div className="text-xs text-muted-foreground">{user.email}</div>}
                              </TableCell>
                              <TableCell>{getUserRoleLabel(user?.role ?? '—')}</TableCell>
                              <TableCell className="w-48">
                                <Select
                                  value={member.role}
                                  onValueChange={async (role) => {
                                    const success = await updateMemberRole(member.id, role)
                                    if (success) toast.success('Papel do membro atualizado')
                                  }}
                                >
                                  <SelectTrigger aria-label={`Papel de ${user?.full_name ?? 'membro'}`}>
                                    <SelectValue>{getMemberRoleLabel(member.role)}</SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {MEMBER_ROLES.map((role) => (
                                      <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => handleRemoveMember(member.id)}>
                                  Remover
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Editar grupo' : 'Novo grupo de aprovação'}</DialogTitle>
            <DialogDescription>
              Defina um grupo reutilizável para o roteamento de etapas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Nome</Label>
              <Input
                id="group-name"
                value={groupForm.name}
                onChange={(event) => {
                  setGroupForm((current) => ({ ...current, name: event.target.value }))
                  setValidationError(null)
                }}
                placeholder="Ex.: Engenharia"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-description">Descrição</Label>
              <Textarea
                id="group-description"
                value={groupForm.description}
                onChange={(event) => setGroupForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Responsabilidade e contexto do grupo."
              />
            </div>
            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select
                value={groupForm.scope}
                onValueChange={(scope) => setGroupForm((current) => ({
                  ...current,
                  scope,
                  project_id: scope === 'organization' ? null : current.project_id,
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Organização</SelectItem>
                  <SelectItem value="project" disabled>Projeto — indisponível neste ambiente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {validationError && <p className="text-sm text-destructive">{validationError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setGroupDialogOpen(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={handleSaveGroup}>
              {saving ? 'Salvando...' : editingGroup ? 'Salvar alterações' : 'Criar grupo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!memberGroup} onOpenChange={(open) => { if (!open) setMemberGroup(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar membro</DialogTitle>
            <DialogDescription>{memberGroup?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={memberUserId} onValueChange={(value) => {
                setMemberUserId(value)
                setValidationError(null)
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                <SelectContent>
                  {users
                    .filter((user) => !members.some(
                      (member) =>
                        member.group_id === memberGroup?.id
                        && member.user_id === user.id
                        && member.is_active,
                    ))
                    .map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name}{user.email ? ` · ${user.email}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Papel no grupo</Label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEMBER_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {validationError && <p className="text-sm text-destructive">{validationError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMemberGroup(null)}>Cancelar</Button>
            <Button disabled={saving || !canManageMembers} onClick={handleAddMember}>
              {saving ? 'Adicionando...' : 'Adicionar membro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
