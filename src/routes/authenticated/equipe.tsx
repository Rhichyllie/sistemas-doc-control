import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { useProjectMembers } from "@/hooks/useProjectMembers";
import { USER_ROLES } from "@/lib/constants";
import { TeamAvailabilityPanel } from "@/components/team/TeamAvailabilityPanel";
import { Users, UserPlus, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/equipe")({
  component: EquipePage,
});

type Role = (typeof USER_ROLES)[number]["value"];

const roleBadgeClass: Record<Role, string> = {
  admin: "bg-purple-600 text-white",
  manager: "bg-blue-600 text-white",
  approver: "bg-amber-500 text-white",
  reviewer: "bg-teal-600 text-white",
  author: "bg-slate-500 text-white",
  viewer: "bg-muted text-muted-foreground",
};

const schemaModeLabel: Record<string, { label: string; className: string }> = {
  enterprise: { label: "Conectado ao Supabase", className: "bg-emerald-600 text-white" },
  missing: { label: "Modo local (schema não configurado)", className: "bg-amber-500 text-white" },
  denied: { label: "Acesso negado pelo Supabase (RLS)", className: "bg-destructive text-white" },
  error: { label: "Erro ao conectar ao Supabase", className: "bg-destructive text-white" },
};

function getRoleLabel(role: string) {
  return USER_ROLES.find((item) => item.value === role)?.label ?? role;
}

function formatMemberSince(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function EquipePage() {
  const { profile, org } = useAuthContext();
  const {
    members,
    loading,
    error,
    mutationError,
    schemaMode,
    updateMemberRole,
    toggleMemberActive,
    addMember,
  } = useTeam();
  const { projects, isLoading: projectsLoading } = useProjectOptions();
  const {
    members: projectMembers,
    isLoading: projectMembersLoading,
    addMember: addProjectMember,
    removeMember: removeProjectMember,
    getProjectsForProfile,
  } = useProjectMembers();
  const isAdmin = profile?.role === "admin";
  const countsByRole = USER_ROLES.map((role) => ({
    ...role,
    count: members.filter((member) => member.role === role.value).length,
  }));
  const [newMemberDialogOpen, setNewMemberDialogOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<Role>("viewer");
  const [newMemberDepartment, setNewMemberDepartment] = useState("");

  // Reage à mudança de mutationError em vez de ler a variável dentro do
  // handler logo após o await — evita pegar o valor "stale" da closure
  // (o setState do hook re-renderiza, mas não durante a função em execução).
  useEffect(() => {
    if (mutationError) {
      toast.error(mutationError);
    }
  }, [mutationError]);

  async function handleRoleChange(memberId: string, role: Role) {
    const ok = await updateMemberRole(memberId, role);
    if (ok) toast.success("Perfil atualizado");
    // erro real é exibido pelo useEffect acima via mutationError
  }

  async function handleToggleActive(memberId: string, active: boolean) {
    if (memberId === profile?.id) {
      toast.error("Você não pode desativar seu próprio usuário");
      return;
    }

    const ok = await toggleMemberActive(memberId, active);
    if (ok) {
      toast.success(`Usuário ${active ? "reativado" : "desativado"}`);
    }
  }

  async function handleProjectToggle(
    memberId: string,
    projectId: string,
    checked: boolean,
  ) {
    if (checked) {
      const ok = await addProjectMember(projectId, memberId);
      if (!ok) toast.error("Não foi possível adicionar o projeto");
    } else {
      const ok = await removeProjectMember(projectId, memberId);
      if (!ok) toast.error("Não foi possível remover o projeto");
    }
  }

  async function handleAddNewMember() {
    if (!newMemberName) {
      toast.error("O nome do membro é obrigatório");
      return;
    }
    const ok = await addMember({
      full_name: newMemberName,
      role: newMemberRole,
      email: newMemberEmail || undefined,
      department: newMemberDepartment || null,
    });
    if (ok) {
      toast.success(
        schemaMode === "missing"
          ? "Membro adicionado localmente (Supabase ainda não configurado)"
          : "Membro adicionado com sucesso!",
      );
      setNewMemberDialogOpen(false);
      setNewMemberName("");
      setNewMemberEmail("");
      setNewMemberRole("viewer");
      setNewMemberDepartment("");
    }
    // erro real (RLS, coluna faltando, etc.) é exibido pelo useEffect acima
  }

  const modeInfo = schemaModeLabel[schemaMode] ?? schemaModeLabel.error;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-muted-foreground text-sm">
            {org?.name ?? "Organização"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Dialog open={newMemberDialogOpen} onOpenChange={setNewMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Adicionar Membro
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar novo membro</DialogTitle>
                  <DialogDescription>
                    Preencha os dados do novo membro da equipe.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input
                      id="name"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      placeholder="Digite o nome completo"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">E-mail (opcional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role">Perfil</Label>
                    <Select
                      value={newMemberRole}
                      onValueChange={(val) => setNewMemberRole(val as Role)}
                    >
                      <SelectTrigger id="role">
                        <SelectValue placeholder="Selecione o perfil" />
                      </SelectTrigger>
                      <SelectContent>
                        {USER_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="department">Área/Departamento (opcional)</Label>
                    <Input
                      id="department"
                      value={newMemberDepartment}
                      onChange={(e) => setNewMemberDepartment(e.target.value)}
                      placeholder="Ex: RH, Financeiro, Operações"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="secondary">Cancelar</Button>
                  </DialogClose>
                  <Button onClick={handleAddNewMember}>Adicionar</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Badge variant="secondary">{members.length} membros</Badge>
        </div>
      </div>

      {schemaMode !== "enterprise" && (
        <Card className="border-amber-500/50">
          <CardContent className="p-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <Badge className={modeInfo.className}>{modeInfo.label}</Badge>
            {schemaMode === "missing" && (
              <span className="text-muted-foreground">
                Os dados abaixo estão salvos apenas neste navegador (localStorage), não no banco de dados.
              </span>
            )}
            {schemaMode === "denied" && (
              <span className="text-muted-foreground">
                O Supabase recusou a leitura/escrita por política de RLS. Verifique as policies da tabela.
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {countsByRole.map((role) => (
          <Card key={role.value}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{role.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{role.count}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isAdmin && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Apenas administradores podem alterar perfis de acesso.
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card className="shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Área/Departamento</TableHead>
                <TableHead>Projetos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Membro desde</TableHead>
                {isAdmin && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || projectsLoading || projectMembersLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 7 : 6}
                    className="text-center py-8"
                  >
                    Carregando equipe...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 7 : 6}
                    className="text-center text-destructive py-8"
                  >
                    {error}
                  </TableCell>
                </TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 7 : 6}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nenhum membro encontrado
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => {
                  const assignedProjects = getProjectsForProfile(member.id);
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.full_name}
                      </TableCell>
                      <TableCell>
                        <Badge className={roleBadgeClass[member.role]}>
                          {getRoleLabel(member.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>{member.department || "—"}</TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Users className="h-4 w-4 mr-1" />
                              {assignedProjects.length}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>
                                Projetos de {member.full_name}
                              </DialogTitle>
                              <DialogDescription>
                                Selecione os projetos aos quais este membro
                                pertence.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-2">
                              {projects.length === 0 ? (
                                <p className="text-muted-foreground">
                                  Nenhum projeto cadastrado.
                                </p>
                              ) : (
                                projects.map((project) => (
                                  <div
                                    key={project.id}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={`project-${project.id}`}
                                      checked={assignedProjects.includes(
                                        project.id,
                                      )}
                                      onCheckedChange={(checked) =>
                                        handleProjectToggle(
                                          member.id,
                                          project.id,
                                          checked === true,
                                        )
                                      }
                                    />
                                    <label
                                      htmlFor={`project-${project.id}`}
                                      className="text-sm"
                                    >
                                      {project.code
                                        ? `${project.code} - `
                                        : ""}
                                      {project.name}
                                    </label>
                                  </div>
                                ))
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={member.active ? "secondary" : "destructive"}
                        >
                          {member.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatMemberSince(member.created_at)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                handleRoleChange(member.id, value as Role)
                              }
                            >
                              <SelectTrigger className="w-44">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {USER_ROLES.map((role) => (
                                  <SelectItem
                                    key={role.value}
                                    value={role.value}
                                  >
                                    {role.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant={
                                member.active ? "destructive" : "outline"
                              }
                              disabled={member.id === profile?.id}
                              onClick={() =>
                                handleToggleActive(member.id, !member.active)
                              }
                            >
                              {member.active ? "Desativar" : "Reativar"}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TeamAvailabilityPanel members={members} />
    </div>
  );
}
