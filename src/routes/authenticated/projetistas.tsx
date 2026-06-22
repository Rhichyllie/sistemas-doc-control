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

export const Route = createFileRoute("/authenticated/projetistas")({ component: ProjetistasPage });

function ProjetistasPage() {
  const { theme } = useTheme();
  const { projetistas, setProjetistas } = useLocalData();
  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [selectedProjetista, setSelectedProjetista] = useState<any>(null);
  const [form, setForm] = useState({ name: "", company: "" });

  function handleCreate() {
    if (!form.name) {
      toast.error("Preencha o nome do projetista");
      return;
    }

    const newProjetista = { id: "proj-" + Date.now(), ...form };
    setProjetistas([...projetistas, newProjetista]);
    toast.success("Projetista criado com sucesso!");
    setOpenNew(false);
    setForm({ name: "", company: "" });
  }

  function handleEdit() {
    if (!selectedProjetista) return;
    const updatedProjetistas = projetistas.map(p => p.id === selectedProjetista.id ? { ...p, ...form } : p);
    setProjetistas(updatedProjetistas);
    toast.success("Projetista atualizado com sucesso!");
    setOpenEdit(false);
    setSelectedProjetista(null);
  }

  function handleDelete() {
    if (!selectedProjetista) return;
    const updatedProjetistas = projetistas.filter(p => p.id !== selectedProjetista.id);
    setProjetistas(updatedProjetistas);
    toast.success("Projetista excluído com sucesso!");
    setOpenDelete(false);
    setSelectedProjetista(null);
  }

  function openEditModal(projetista: any) {
    setSelectedProjetista(projetista);
    setForm({
      name: projetista.name,
      company: projetista.company
    });
    setOpenEdit(true);
  }

  function openDeleteModal(projetista: any) {
    setSelectedProjetista(projetista);
    setOpenDelete(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projetistas</h1>
          <p className="text-muted-foreground text-sm">Cadastro de projetistas</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild><Button style={{ backgroundColor: theme.button, color: theme.text }}><Plus className="h-4 w-4 mr-2" />Novo Projetista</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Projetista</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="col-span-2"><Label>Empresa</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpenNew(false)}>Cancelar</Button>
              <Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleCreate}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="shadow-md"><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Empresa</TableHead><TableHead className="w-32">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {projetistas.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.company || "—"}</TableCell>
                <TableCell className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openEditModal(p)}><Edit className="h-3 w-3 mr-1" />Editar</Button>
                  <Button variant="destructive" size="sm" onClick={() => openDeleteModal(p)}><Trash2 className="h-3 w-3 mr-1" />Excluir</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Projetista</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Empresa</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenEdit(false)}>Cancelar</Button>
            <Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleEdit}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Projetista</DialogTitle></DialogHeader>
          <p>Você tem certeza que deseja excluir o projetista {selectedProjetista?.name}? Esta ação é irreversível!</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
