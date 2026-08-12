import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Edit, Trash2 } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/theme-context";
import { useDocumentCodeOptions } from "@/hooks/useDocumentCodeOptions";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/disciplines")({
  component: DisciplinesPage,
});

interface DisciplineRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

function DisciplinesPage() {
  const { profile } = useAuthContext();
  const { theme } = useTheme();
  const codeOptionsConfig = useMemo(() => ({ requireManagement: false }), []);
  const options = useDocumentCodeOptions(codeOptionsConfig);

  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [selectedDiscipline, setSelectedDiscipline] = useState<DisciplineRow | null>(null);
  const [form, setForm] = useState({ code: "", name: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canManage = profile?.role === "admin" || profile?.role === "manager";

  const rows: DisciplineRow[] = options.disciplines.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.label,
    is_active: item.is_active,
  }));

  const filteredDisciplines = rows.filter((d) => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    return (
      d.code?.toLowerCase().includes(lowerSearchTerm) ||
      d.name?.toLowerCase().includes(lowerSearchTerm)
    );
  });

  useEffect(() => {
    if (!openNew) {
      setForm({ code: "", name: "" });
    }
  }, [openNew]);

  useEffect(() => {
    if (!openEdit && !openDelete) {
      setSelectedDiscipline(null);
    }
  }, [openEdit, openDelete]);

  async function handleCreate() {
    if (!canManage) {
      toast.error("Apenas administradores/gestores podem criar disciplinas.");
      return;
    }
    if (!form.code || !form.name) {
      toast.error("Preencha código e nome da disciplina.");
      return;
    }
    setSubmitting(true);
    try {
      const success = await options.saveDiscipline(null, {
        code: form.code.toUpperCase(),
        label: form.name,
        is_active: true,
      });
      if (success) {
        toast.success("Disciplina criada com sucesso!");
        setOpenNew(false);
        setForm({ code: "", name: "" });
        await options.refresh();
      } else {
        toast.error(
          options.error || "Não foi possível criar. Verifique as permissões.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit() {
    if (!canManage) {
      toast.error("Apenas administradores/gestores podem editar disciplinas.");
      return;
    }
    if (!selectedDiscipline) return;
    if (!form.code || !form.name) {
      toast.error("Preencha código e nome da disciplina.");
      return;
    }
    setSubmitting(true);
    try {
      const success = await options.saveDiscipline(selectedDiscipline.id, {
        code: form.code.toUpperCase(),
        label: form.name,
        is_active: selectedDiscipline.is_active,
      });
      if (success) {
        toast.success("Disciplina atualizada com sucesso!");
        setOpenEdit(false);
        setSelectedDiscipline(null);
        await options.refresh();
      } else {
        toast.error(
          options.error || "Não foi possível editar. Verifique as permissões.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!canManage) {
      toast.error("Apenas administradores/gestores podem excluir disciplinas.");
      return;
    }
    if (!selectedDiscipline) return;
    setSubmitting(true);
    try {
      const success = await options.deleteDiscipline(selectedDiscipline.id);
      if (success) {
        toast.success("Disciplina excluída com sucesso!");
        setOpenDelete(false);
        setSelectedDiscipline(null);
        await options.refresh();
      } else {
        toast.error(
          options.error ||
            "Não foi possível excluir. Verifique dependências ou permissões.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function openEditModal(discipline: DisciplineRow) {
    setSelectedDiscipline(discipline);
    setForm({
      code: discipline.code,
      name: discipline.name,
    });
    setOpenEdit(true);
  }

  function openDeleteModal(discipline: DisciplineRow) {
    setSelectedDiscipline(discipline);
    setOpenDelete(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Disciplinas</h1>
          <p className="text-muted-foreground text-sm">
            Cadastro de disciplinas (sincronizado com codificação documental e
            cadastro de documentos).
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button
              disabled={options.isLoading || !canManage}
              style={{ backgroundColor: theme.button, color: theme.text }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Disciplina
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Disciplina</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input
                  value={form.code}
                  onChange={(e) =>
                    setForm({ ...form, code: e.target.value.toUpperCase() })
                  }
                  placeholder="Ex.: CIV"
                />
              </div>
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Civil"
                />
              </div>
            </div>
            {options.compatibilityMessage && (
              <p className="text-xs text-muted-foreground">
                {options.compatibilityMessage}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpenNew(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                style={{ backgroundColor: theme.button, color: theme.text }}
                onClick={() => void handleCreate()}
                disabled={submitting || options.isSaving}
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Disciplinas cadastradas</CardTitle>
            <div className="w-72">
              <Input
                placeholder="Buscar disciplina..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {options.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : filteredDisciplines.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              Nenhuma disciplina cadastrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right w-56">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDisciplines.map((discipline) => (
                  <TableRow key={discipline.id}>
                    <TableCell className="font-mono">
                      {discipline.code || "—"}
                    </TableCell>
                    <TableCell>{discipline.name}</TableCell>
                    <TableCell>
                      {discipline.is_active ? "Ativo" : "Inativo"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(discipline)}
                          disabled={!canManage}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDeleteModal(discipline)}
                          disabled={!canManage}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Disciplina</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código *</Label>
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpenEdit(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              style={{ backgroundColor: theme.button, color: theme.text }}
              onClick={() => void handleEdit()}
              disabled={submitting || options.isSaving}
            >
              {submitting && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir disciplina</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Tem certeza que deseja excluir a disciplina{" "}
            <span className="font-semibold">
              {selectedDiscipline?.code ? `${selectedDiscipline.code} · ` : ""}
              {selectedDiscipline?.name}
            </span>
            ? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpenDelete(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={submitting || options.isSaving}
            >
              {submitting && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Confirmar exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
