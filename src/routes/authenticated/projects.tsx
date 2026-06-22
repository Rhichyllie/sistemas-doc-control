import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2 } from "lucide-react";
import { projectStatusLabels, projectStatuses } from "@/lib/labels";
import { useLocalData } from "@/hooks/use-local-data";
import { useTheme } from "@/contexts/theme-context";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/projects")({ component: ProjectsPage });

function ProjectsPage() {
  const { theme } = useTheme();
  const { projects, setProjects, addRecentActivity } = useLocalData();
  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [form, setForm] = useState({ code: "", name: "", client: "", startDate: "", endDate: "", status: "planning" });

  function handleCreate() {
    const newProject = {
      id: "proj-" + Date.now(),
      ...form,
    };
    setProjects([...projects, newProject]);
    
    // Adicionar atividade recente
    addRecentActivity({
      type: 'project_created',
      title: 'Projeto Criado',
      description: `${newProject.code} - ${newProject.name}`,
      icon: 'folder',
      color: 'blue'
    });
    
    toast.success("Projeto criado com sucesso!");
    setOpenNew(false);
    setForm({ code: "", name: "", client: "", startDate: "", endDate: "", status: "planning" });
  }

  function handleEdit() {
    if (!selectedProject) return;
    const updatedProjects = projects.map(p => p.id === selectedProject.id ? { ...p, ...form } : p);
    setProjects(updatedProjects);
    
    // Adicionar atividade recente
    addRecentActivity({
      type: 'project_updated',
      title: 'Projeto Atualizado',
      description: `${form.code} - ${form.name}`,
      icon: 'edit',
      color: 'yellow'
    });
    
    toast.success("Projeto atualizado com sucesso!");
    setOpenEdit(false);
    setSelectedProject(null);
  }

  function handleDelete() {
    if (!selectedProject) return;
    const updatedProjects = projects.filter(p => p.id !== selectedProject.id);
    setProjects(updatedProjects);
    toast.success("Projeto excluído com sucesso!");
    setOpenDelete(false);
    setSelectedProject(null);
  }

  function openEditModal(project: any) {
    setSelectedProject(project);
    setForm({
      code: project.code,
      name: project.name,
      client: project.client,
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status
    });
    setOpenEdit(true);
  }

  function openDeleteModal(project: any) {
    setSelectedProject(project);
    setOpenDelete(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projetos</h1>
          <p className="text-muted-foreground text-sm">Cadastro de projetos de engenharia</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild><Button style={{ backgroundColor: theme.button, color: theme.text }}><Plus className="h-4 w-4 mr-2" />Novo Projeto</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Projeto</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{projectStatuses.map(s => <SelectItem key={s} value={s}>{projectStatusLabels[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="col-span-2"><Label>Cliente</Label><Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></div>
              <div><Label>Data início</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
              <div><Label>Data término</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
            </div>
            <DialogFooter><Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleCreate}>Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="shadow-md"><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Cliente</TableHead>
            <TableHead>Início</TableHead><TableHead>Término</TableHead><TableHead>Status</TableHead><TableHead className="w-32">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {projects.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.code}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.client ?? "—"}</TableCell>
                <TableCell>{p.startDate ?? "—"}</TableCell>
                <TableCell>{p.endDate ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary">{projectStatusLabels[p.status as keyof typeof projectStatusLabels]}</Badge></TableCell>
                <TableCell className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openEditModal(p)}><Edit className="h-3 w-3 mr-1" />Editar</Button>
                  <Button variant="destructive" size="sm" onClick={() => openDeleteModal(p)}><Trash2 className="h-3 w-3 mr-1" />Excluir</Button>
                </TableCell>
              </TableRow>
            ))}
            {!projects.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum projeto cadastrado</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Projeto</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{projectStatuses.map(s => <SelectItem key={s} value={s}>{projectStatusLabels[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Cliente</Label><Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></div>
            <div><Label>Data início</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div><Label>Data término</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenEdit(false)}>Cancelar</Button>
            <Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleEdit}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Projeto</DialogTitle></DialogHeader>
          <p>Você tem certeza que deseja excluir o projeto {selectedProject?.name}? Esta ação é irreversível!</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
