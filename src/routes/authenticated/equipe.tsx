import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { USER_ROLES } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/equipe")({ component: EquipePage });

type Role = typeof USER_ROLES[number]["value"];

const roleBadgeClass: Record<Role, string> = {
  admin: "bg-purple-600 text-white",
  manager: "bg-blue-600 text-white",
  approver: "bg-amber-500 text-white",
  reviewer: "bg-teal-600 text-white",
  author: "bg-slate-500 text-white",
  viewer: "bg-muted text-muted-foreground",
};

function getRoleLabel(role: string) {
  return USER_ROLES.find((item) => item.value === role)?.label ?? role;
}

function formatMemberSince(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function EquipePage() {
  const { profile, org } = useAuthContext();
  const { members, loading, error, updateMemberRole, toggleMemberActive } = useTeam();
  const isAdmin = profile?.role === "admin";
  const countsByRole = USER_ROLES.map((role) => ({ ...role, count: members.filter((member) => member.role === role.value).length }));

  async function handleRoleChange(memberId: string, role: Role) {
    const ok = await updateMemberRole(memberId, role);
    toast[ok ? "success" : "error"](ok ? "Perfil atualizado" : "Não foi possível atualizar o perfil");
  }

  async function handleToggleActive(memberId: string, active: boolean) {
    if (memberId === profile?.id) {
      toast.error("Você não pode desativar seu próprio usuário");
      return;
    }

    const ok = await toggleMemberActive(memberId, active);
    toast[ok ? "success" : "error"](ok ? `Usuário ${active ? "reativado" : "desativado"}` : "Não foi possível alterar o usuário");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-muted-foreground text-sm">{org?.name ?? "Organização"}</p>
        </div>
        <Badge variant="secondary">{members.length} membros</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {countsByRole.map((role) => (
          <Card key={role.value}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{role.label}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{role.count}</div></CardContent>
          </Card>
        ))}
      </div>

      {!isAdmin && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">Apenas administradores podem alterar perfis de acesso.</CardContent>
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
                <TableHead>Status</TableHead>
                <TableHead>Membro desde</TableHead>
                {isAdmin && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8">Carregando equipe...</TableCell></TableRow>}
              {error && !loading && <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-destructive py-8">{error}</TableCell></TableRow>}
              {!loading && !error && members.length === 0 && <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">Nenhum membro encontrado</TableCell></TableRow>}
              {!loading && !error && members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.full_name}</TableCell>
                  <TableCell><Badge className={roleBadgeClass[member.role]}>{getRoleLabel(member.role)}</Badge></TableCell>
                  <TableCell>{member.department || "—"}</TableCell>
                  <TableCell><Badge variant={member.active ? "secondary" : "destructive"}>{member.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell>{formatMemberSince(member.created_at)}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Select value={member.role} onValueChange={(value) => handleRoleChange(member.id, value as Role)}>
                          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {USER_ROLES.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant={member.active ? "destructive" : "outline"}
                          disabled={member.id === profile?.id}
                          onClick={() => handleToggleActive(member.id, !member.active)}
                        >
                          {member.active ? "Desativar" : "Reativar"}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
