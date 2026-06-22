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

export const Route = createFileRoute("/authenticated/disciplines")({ component: DisciplinesPage });

function DisciplinesPage() {
  const { theme } = useTheme();
  const { disciplines, setDisciplines } = useLocalData();
  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [selectedDiscipline, setSelectedDiscipline] = useState<any>(null);
  const [form, setForm] = useState({ code: "", name: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const filteredDisciplines = disciplines.filter((d: any) => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    return (
      d.code?.toLowerCase().includes(lowerSearchTerm) ||
      d.name?.toLowerCase().includes(lowerSearchTerm)
    );
  });

  function handleCreate() {
    if (!form.code || !form.name) {
      toast.error("Preencha todos os campos");
      return;
    }

    const newDiscipline = { id: "disc-" + Date.now(), ...form };
    setDisciplines([...disciplines, newDiscipline]);
    toast.success("Disciplina criada com sucesso!");
    setOpenNew(false);
    setForm({ code: "", name: "" });
  }

  function handleEdit() {
    if (!selectedDiscipline) return;
    const updatedDisciplines = disciplines.map(d => d.id === selectedDiscipline.id ? { ...d, ...form } : d);
    setDisciplines(updatedDisciplines);
    toast.success("Disciplina atualizada com sucesso!");
    setOpenEdit(false);
    setSelectedDiscipline(null);
  }

  function handleDelete() {
    if (!selectedDiscipline) return;
    const updatedDisciplines = disciplines.filter(d => d.id !== selectedDiscipline.id);
    setDisciplines(updatedDisciplines);
    toast.success("Disciplina excluída com sucesso!");
    setOpenDelete(false);
    setSelectedDiscipline(null);
  }

  function openEditModal(discipline: any) {
    setSelectedDiscipline(discipline);
    setForm({
      code: discipline.code,
      name: discipline.name
    });
    setOpenEdit(true);
  }

  function openDeleteModal(discipline: any) {
    setSelectedDiscipline(discipline);
    setOpenDelete(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Disciplinas</h1>
          <p className="text-muted-foreground text-sm">Cadastro de disciplinas</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild><Button style={{ backgroundColor: theme.button, color: theme.text }}><Plus className="h-4 w-4 mr-2" />Nova Disciplina</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Disciplina</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpenNew(false)}>Cancelar</Button>
              <Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleCreate}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex gap-2 items-center">
        <Input 
          placeholder="Pesquisar disciplina por código ou nome..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>
      
      <Card className="shadow-md"><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead className="w-32">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filteredDisciplines.map((d: any) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">{d.code}</TableCell>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openEditModal(d)}><Edit className="h-3 w-3 mr-1" />Editar</Button>
                  <Button variant="destructive" size="sm" onClick={() => openDeleteModal(d)}><Trash2 className="h-3 w-3 mr-1" />Excluir</Button>
                </TableCell>
              </TableRow>
            ))}
            {!filteredDisciplines.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">
              {searchTerm ? "Nenhuma disciplina encontrada com essa pesquisa" : "Nenhuma disciplina cadastrada"}
            </TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Disciplina</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenEdit(false)}>Cancelar</Button>
            <Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleEdit}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Disciplina</DialogTitle></DialogHeader>
          <p>Você tem certeza que deseja excluir a disciplina {selectedDiscipline?.name}? Esta ação é irreversível!</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
