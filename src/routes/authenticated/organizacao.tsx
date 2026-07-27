import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Building2,
  FolderOpen,
  Plus,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Badge } from "@/components/ui/badge";
import { useLibraries, type LibraryPhaseCode } from "@/hooks/useLibraries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/authenticated/organizacao")({
  component: OrganizationLibrariesPage,
});

function phaseBadgeClass(code: LibraryPhaseCode | undefined) {
  if (code === "project") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-teal-200 bg-teal-50 text-teal-700";
}

function OrganizationLibrariesPage() {
  const navigate = useNavigate();
  const catalog = useLibraries();
  const [open, setOpen] = useState(false);
  const [enterpriseMode, setEnterpriseMode] = useState<"existing" | "new">(
    "existing",
  );
  const [enterpriseId, setEnterpriseId] = useState("");
  const [newEnterpriseName, setNewEnterpriseName] = useState("");
  const [phaseCode, setPhaseCode] = useState<LibraryPhaseCode | "">("");
  const [libraryName, setLibraryName] = useState("");

  const canSubmit = useMemo(() => {
    const hasEnterprise =
      enterpriseMode === "existing"
        ? Boolean(enterpriseId)
        : newEnterpriseName.trim().length >= 3;
    return hasEnterprise && Boolean(phaseCode) && libraryName.trim().length >= 3;
  }, [enterpriseId, enterpriseMode, libraryName, newEnterpriseName, phaseCode]);

  async function handleCreateLibrary() {
    if (!canSubmit || !phaseCode) return;

    let targetEnterpriseId = enterpriseId;
    if (enterpriseMode === "new") {
      const createdEnterprise = await catalog.createEnterprise(newEnterpriseName);
      if (!createdEnterprise?.id) return;
      targetEnterpriseId = createdEnterprise.id;
    }

    const libraryId = await catalog.provisionLibrary({
      enterpriseId: targetEnterpriseId,
      phaseCode,
      name: libraryName,
    });

    if (!libraryId) return;

    setOpen(false);
    setEnterpriseId("");
    setNewEnterpriseName("");
    setPhaseCode("");
    setLibraryName("");
    await navigate({
      to: "/authenticated/biblioteca/$bibliotecaId/dashboard",
      params: { bibliotecaId: libraryId },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-gradient-to-r from-[#061d3d] via-[#0b2f63] to-[#0f766e] p-6 text-white lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Badge className="border-white/15 bg-white/10 text-white hover:bg-white/10">
            Organização Tramita
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            Bibliotecas documentais
          </h1>
          <p className="max-w-2xl text-sm text-blue-100/80">
            Cada biblioteca representa um ambiente isolado do empreendimento,
            provisionado por fase e governado por um template fixo da plataforma.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
              <Plus className="h-4 w-4" />
              Nova biblioteca
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar biblioteca</DialogTitle>
              <DialogDescription>
                Escolha o empreendimento, a fase e o nome da nova biblioteca.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5 py-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    1
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Empreendimento
                    </p>
                    <p className="text-xs text-slate-500">
                      Selecione um existente ou crie um novo agrupador.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Modo</Label>
                    <Select
                      value={enterpriseMode}
                      onValueChange={(value) =>
                        setEnterpriseMode(value as "existing" | "new")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="existing">
                          Usar empreendimento existente
                        </SelectItem>
                        <SelectItem value="new">
                          Criar novo empreendimento
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {enterpriseMode === "existing" ? (
                    <div className="space-y-2">
                      <Label>Empreendimento</Label>
                      <Select value={enterpriseId} onValueChange={setEnterpriseId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.enterprises.map((enterprise) => (
                            <SelectItem key={enterprise.id} value={enterprise.id}>
                              {enterprise.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Nome do empreendimento</Label>
                      <Input
                        value={newEnterpriseName}
                        onChange={(event) =>
                          setNewEnterpriseName(event.target.value)
                        }
                        placeholder="Ex.: Plataforma A"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    2
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Fase</p>
                    <p className="text-xs text-slate-500">
                      O template define workflow, norma e metadados permitidos.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Template de fase</Label>
                  <Select
                    value={phaseCode}
                    onValueChange={(value) =>
                      setPhaseCode(value as LibraryPhaseCode)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a fase" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.phaseTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.code}>
                          {template.display_name} · {template.reference_standard}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    3
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Nome</p>
                    <p className="text-xs text-slate-500">
                      Dê um nome claro para a biblioteca.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Nome da biblioteca</Label>
                  <Input
                    value={libraryName}
                    onChange={(event) => setLibraryName(event.target.value)}
                    placeholder="Ex.: Revamp 2026"
                  />
                </div>
              </div>
            </div>

            {catalog.error && (
              <p className="text-sm text-rose-600">{catalog.error}</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateLibrary} disabled={!canSubmit || catalog.saving}>
                Criar biblioteca
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader>
            <CardTitle>Bibliotecas por empreendimento</CardTitle>
            <CardDescription>
              Escolha a biblioteca que deseja abrir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {catalog.groupedByEnterprise.map(({ enterprise, libraries }) => (
              <div key={enterprise.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    {enterprise.name}
                  </h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {libraries.map((library) => (
                    <Link
                      key={library.id}
                      to="/authenticated/biblioteca/$bibliotecaId/dashboard"
                      params={{ bibliotecaId: library.id }}
                      className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-200 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-slate-500" />
                            <p className="font-semibold text-slate-900">
                              {library.name}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full",
                              phaseBadgeClass(library.phase_template?.code),
                            )}
                          >
                            {library.phase_template?.display_name ?? "Fase"}
                          </Badge>
                          <p className="text-xs text-slate-500">
                            {library.phase_template?.reference_standard ?? "Template gerenciado pela Tramita"}
                          </p>
                        </div>

                        <Sparkles className="h-4 w-4 text-slate-300 transition group-hover:text-sky-500" />
                      </div>
                    </Link>
                  ))}

                  {libraries.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      Ainda não há bibliotecas neste empreendimento.
                    </div>
                  )}
                </div>
              </div>
            ))}

            {!catalog.loading && catalog.groupedByEnterprise.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                Nenhum empreendimento encontrado ainda. Crie a primeira biblioteca
                para começar.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Provisionamento</CardTitle>
            <CardDescription>
              A fase controla a base normativa e o comportamento do workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
                <Workflow className="h-4 w-4 text-slate-500" />
                Projeto
              </div>
              <p>
                Fluxo linear e finito, preparado para emissão e aprovações
                formais.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
                <Workflow className="h-4 w-4 text-slate-500" />
                Operação / O&amp;M
              </div>
              <p>
                Fluxo contínuo para documentos vivos, manutenção e revisões
                recorrentes.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
