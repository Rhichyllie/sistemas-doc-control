import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { USER_ROLES } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/meu-perfil")({ component: MeuPerfil });

function getRoleLabel(role: string | null | undefined) {
  return USER_ROLES.find((item) => item.value === role)?.label ?? role ?? "—";
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

function MeuPerfil() {
  const navigate = useNavigate();
  const { profile, org, signOut } = useAuthContext();
  const { members, updateMyProfile } = useTeam();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [department, setDepartment] = useState(profile?.department ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setDepartment(profile?.department ?? "");
  }, [profile]);

  const currentMember = useMemo(() => members.find((member) => member.id === profile?.id), [members, profile?.id]);

  async function handleSave() {
    setSaving(true);
    const ok = await updateMyProfile({ full_name: fullName.trim(), department: department.trim() || undefined });
    setSaving(false);

    if (ok) {
      setSaved(true);
      toast.success("Perfil atualizado");
      setTimeout(() => setSaved(false), 2000);
    } else {
      toast.error("Não foi possível salvar o perfil");
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login", replace: true });
  }

  if (!profile) return <div className="p-6 text-muted-foreground">Carregando perfil...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardContent className="p-6 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
            {initials(fullName)}
          </div>
          <div>
            <h1 className="text-3xl font-bold">{fullName || profile.full_name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="secondary">{getRoleLabel(profile.role)}</Badge>
              <span className="text-sm text-muted-foreground">{org?.name ?? "Organização"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editar perfil</CardTitle>
          <CardDescription>Atualize suas informações visíveis para a equipe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </div>
          <div>
            <Label>Área / Departamento</Label>
            <Input value={department} onChange={(event) => setDepartment(event.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">E-mail e senha são gerenciados pelo administrador do sistema.</p>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : saved ? "Salvo!" : "Salvar alterações"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Informações da conta</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground">Perfil de acesso:</span><div className="font-medium">{getRoleLabel(profile.role)}</div></div>
            <div><span className="text-muted-foreground">Organização:</span><div className="font-medium">{org?.name ?? "—"}</div></div>
            <div><span className="text-muted-foreground">Membro desde:</span><div className="font-medium">{formatDate(currentMember?.created_at)}</div></div>
          </div>
          <Separator />
          <div>
            <h2 className="font-semibold mb-2">Segurança</h2>
            <Button variant="destructive" onClick={handleSignOut}>Sair da conta</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
