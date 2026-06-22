import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useLocalData } from "@/hooks/use-local-data";
import { useTheme } from "@/contexts/theme-context";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/equipe")({ component: EquipePage });

function EquipePage() {
  const { theme } = useTheme();
  const { team, createTeamMember, updateTeamMember, deleteTeamMember } = useLocalData();
  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [form, setForm] = useState({ name: "", sector: "", email: "" });
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!form.name) {
      toast.error("Preencha o nome do membro da equipe");
      return;
    }
    setSaving(true);
    try {
      await createTeamMember({ name: form.name, sector: form.sector, email: form.email });
      toast.success("Membro da equipe criado com sucesso!");
      setOpenNew(false);
      setForm({ name: "", sector: "", email: "" });
    } catch (err) {
      toast.error("Erro ao criar membro da equipe.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!selectedMember) return;
    setSaving(true);
    try {
      await updateTeamMember(selectedMember.id, { name: form.name, sector: form.sector, email: form.email });
      toast.success("Membro da equipe atualizado com sucesso!");
      setOpenEdit(false);
      setSelectedMember(null);
    } catch (err) {
      toast.error("Erro ao atualizar membro da equipe.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedMember) return;
    setSaving(true);
    try {
      await deleteTeamMember(selectedMember.id);
      toast.success("Membro da equipe excluído com sucesso!");
      setOpenDelete(false);
      setSelectedMember(null);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir membro da equipe.");
    } finally {
      setSaving(false);
    }
  }

  function openEditModal(member: any) {
    setSelectedMember(member);
    setForm({
      name: member.name,
      sector: member.sector || "",
      email: member.email || ""
    });
    setOpenEdit(true);
  }

  function openDeleteModal(member: any) {
    setSelectedMember(member);
    setOpenDelete(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-muted-foreground text-sm">Cadastro da equipe do projeto</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild><Button style={{ backgroundColor: theme.button, color: theme.text }}><Plus className="h-4 w-4 mr-2" />Novo Membro</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Membro da Equipe</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="col-span-2"><Label>Setor</Label><Input value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} /></div>
              <div className="col-span-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpenNew(false)} disabled={saving}>Cancelar</Button>
              <Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleCreate} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="shadow-md"><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Setor</TableHead><TableHead>E-mail</TableHead><TableHead className="w-32">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {team.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{t.sector || "—"}</TableCell>
                <TableCell>{t.email || "—"}</TableCell>
                <TableCell className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openEditModal(t)}><Edit className="h-3 w-3 mr-1" />Editar</Button>
                  <Button variant="destructive" size="sm" onClick={() => openDeleteModal(t)}><Trash2 className="h-3 w-3 mr-1" />Excluir</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Membro da Equipe</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Setor</Label><Input value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} /></div>
            <div className="col-span-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenEdit(false)} disabled={saving}>Cancelar</Button>
            <Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleEdit} disabled={saving}>{saving ? "Salvando..." : "Salvar Alterações"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Membro da Equipe</DialogTitle></DialogHeader>
          <p>Você tem certeza que deseja excluir o membro {selectedMember?.name}? Esta ação é irreversível!</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenDelete(false)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? "Excluindo..." : "Excluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}