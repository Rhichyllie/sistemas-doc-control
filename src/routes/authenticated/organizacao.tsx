import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowRight,
  Building2,
  FileStack,
  FolderOpen,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  Settings,
  Sparkles,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { OrganizationPublicationCard } from "@/components/organization/OrganizationPublicationCard";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAuthContext } from "@/contexts/AuthContext";
import { setStoredActiveLibraryId } from "@/contexts/library-context";
import {
  useLibraries,
  type LibraryPhaseCode,
  type LibraryRecord,
} from "@/hooks/useLibraries";
import {
  usePublications,
  type PublicationRecord,
} from "@/hooks/usePublications";
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

function formatLongDate(dateIso: string) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildHeroImageUrl(publication: PublicationRecord | null) {
  if (publication?.imagem_url) return publication.imagem_url;

  const prompt =
    publication?.categoria === "seguranca_saude"
      ? "modern industrial engineering complex with landscaped foreground, realistic corporate editorial photography, blue hour, architectural glass facade, premium lighting"
      : "modern corporate engineering headquarters building with glass facade and landscaped entrance, realistic editorial architecture photo, blue sky, premium business atmosphere";

  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    prompt,
  )}&image_size=landscape_16_9`;
}

function OrganizationLibrariesPage() {
  const navigate = useNavigate();
  const { profile, user } = useAuthContext();
  const catalog = useLibraries();
  const publications = usePublications({ limit: 4 });
  const [open, setOpen] = useState(false);
  const [enterpriseMode, setEnterpriseMode] = useState<"existing" | "new">(
    "existing",
  );
  const [enterpriseId, setEnterpriseId] = useState("");
  const [newEnterpriseName, setNewEnterpriseName] = useState("");
  const [phaseCode, setPhaseCode] = useState<LibraryPhaseCode | "">("");
  const [libraryName, setLibraryName] = useState("");

  const isAdmin = profile?.role === "admin";
  const heroImageInputRef = useRef<HTMLInputElement>(null);
  const [heroImagePreview, setHeroImagePreview] = useState<string | null>(null);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);
  const [heroImageError, setHeroImageError] = useState<string | null>(null);

  const [editingLibrary, setEditingLibrary] = useState<LibraryRecord | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editCodeLoading, setEditCodeLoading] = useState(false);
  const [deletingLibrary, setDeletingLibrary] = useState<LibraryRecord | null>(
    null,
  );
  const [togglingLibraryId, setTogglingLibraryId] = useState<string | null>(
    null,
  );

  const canSubmit = useMemo(() => {
    const hasEnterprise =
      enterpriseMode === "existing"
        ? Boolean(enterpriseId)
        : newEnterpriseName.trim().length >= 3;
    return (
      hasEnterprise && Boolean(phaseCode) && libraryName.trim().length >= 3
    );
  }, [enterpriseId, enterpriseMode, libraryName, newEnterpriseName, phaseCode]);

  const featuredPublication = publications.latestPublications[0] ?? null;
  const newsroomPublications =
    publications.latestPublications.length > 1
      ? publications.latestPublications.slice(1, 5)
      : publications.latestPublications;

  const accessibleLibraries = useMemo(
    () =>
      catalog.groupedByEnterprise.flatMap(({ enterprise, libraries }) =>
        libraries.map((library) => ({
          ...library,
          enterpriseName: enterprise.name,
        })),
      ),
    [catalog.groupedByEnterprise],
  );

  const firstName =
    profile?.full_name?.split(" ")[0] ||
    user?.user_metadata?.full_name?.split(" ")[0] ||
    "Ana";

  async function handleCreateLibrary() {
    if (!canSubmit || !phaseCode) return;

    let targetEnterpriseId = enterpriseId;
    if (enterpriseMode === "new") {
      const createdEnterprise =
        await catalog.createEnterprise(newEnterpriseName);
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
    setStoredActiveLibraryId(libraryId);
    await navigate({
      to: "/authenticated/biblioteca/$bibliotecaId/dashboard",
      params: { bibliotecaId: libraryId },
    });
  }

  async function handleOpenPublication(publication: PublicationRecord) {
    if (publication.documento_id && publication.documento?.library_id) {
      setStoredActiveLibraryId(publication.documento.library_id);
      await navigate({
        to: "/authenticated/biblioteca/$bibliotecaId/documentos/$documentId",
        params: {
          bibliotecaId: publication.documento.library_id,
          documentId: publication.documento_id,
        },
      });
      return;
    }

    await navigate({ to: "/authenticated/organizacao/noticias" });
  }

  async function handleHeroImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !featuredPublication) return;

    setHeroImageError(null);

    // Preview local imediato, antes mesmo do upload terminar
    const localPreviewUrl = URL.createObjectURL(file);
    setHeroImagePreview(localPreviewUrl);
    setUploadingHeroImage(true);

    try {
      const filePath = `hero/${featuredPublication.id}-${Date.now()}-${file.name}`;

      // TODO: confirme se o bucket "publicacoes-midia" existe no seu Supabase
      // Storage (Dashboard > Storage). Ajuste o nome se for diferente.
      const { error: uploadError } = await supabase.storage
        .from("publicacoes-midia")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("publicacoes-midia")
        .getPublicUrl(filePath);

      // TODO: confirme o nome real da tabela de publicações (aqui assumi
      // "publicacoes" com coluna "imagem_url", igual ao campo já usado em
      // PublicationRecord.imagem_url).
      const { error: updateError } = await supabase
        .from("publicacoes")
        .update({ imagem_url: publicUrlData.publicUrl })
        .eq("id", featuredPublication.id);

      if (updateError) throw updateError;

      await publications.refresh();
    } catch (err) {
      setHeroImageError(
        "Não foi possível salvar a nova imagem agora. Tente novamente em instantes.",
      );
    } finally {
      setUploadingHeroImage(false);
      if (heroImageInputRef.current) heroImageInputRef.current.value = "";
    }
  }

  async function handleOpenEditLibrary(library: LibraryRecord) {
    setEditingLibrary(library);
    setEditName(library.name);
    setEditCode("");
    setEditCodeLoading(true);
    const code = await catalog.getLibraryCode(library.id);
    setEditCode(code);
    setEditCodeLoading(false);
  }

  async function handleSaveEditLibrary() {
    if (!editingLibrary) return;
    const ok = await catalog.updateLibrary(editingLibrary.id, {
      name: editName,
      code: editCode,
    });
    if (ok) {
      setEditingLibrary(null);
    }
  }

  async function handleToggleLibraryActive(library: LibraryRecord) {
    setTogglingLibraryId(library.id);
    await catalog.updateLibrary(library.id, { active: !library.active });
    setTogglingLibraryId(null);
  }

  async function handleConfirmDeleteLibrary() {
    if (!deletingLibrary) return;
    const ok = await catalog.deleteLibrary(deletingLibrary.id);
    if (ok) {
      setDeletingLibrary(null);
    }
  }

  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-500">
            Bem-vinda, {firstName}.{" "}
            <span aria-hidden="true" className="align-middle">
              👋
            </span>
          </p>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
              Bibliotecas documentais
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Cada biblioteca representa um ambiente documental do
              empreendimento, provisionado por fase e governado por um template
              fixo da plataforma.
            </p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-14 gap-2 rounded-xl bg-[#2f7cf6] px-6 text-base font-semibold text-white hover:bg-[#1f6ce6]">
              <Plus className="h-5 w-5" />
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
                      <Select
                        value={enterpriseId}
                        onValueChange={setEnterpriseId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.enterprises.map((enterprise) => (
                            <SelectItem
                              key={enterprise.id}
                              value={enterprise.id}
                            >
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
                    disabled={
                      catalog.loading ||
                      catalog.saving ||
                      catalog.phaseTemplates.length === 0
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          catalog.loading
                            ? "Carregando fases..."
                            : "Selecione a fase"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.phaseTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.code}>
                          {template.display_name} ·{" "}
                          {template.reference_standard}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {catalog.phaseTemplates.length === 0 && (
                    <p className="text-xs text-slate-500">
                      {catalog.loading
                        ? "Carregando templates de fase..."
                        : "Nenhum template de fase foi encontrado para sua organização."}
                    </p>
                  )}
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
              <Button
                onClick={handleCreateLibrary}
                disabled={!canSubmit || catalog.saving}
              >
                Criar biblioteca
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <section className="overflow-hidden rounded-[30px] bg-[#071d3d] shadow-[0_32px_80px_-30px_rgba(7,29,61,0.75)]">
        <div className="grid min-h-[360px] lg:grid-cols-[1.02fr_0.98fr]">
          <div className="relative flex flex-col justify-between gap-8 p-8 text-white lg:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(88,168,255,0.32),transparent_42%)]" />
            <div className="relative space-y-5">
              <Badge className="w-fit rounded-full border-cyan-400/35 bg-cyan-500/10 px-3 text-[11px] uppercase tracking-[0.14em] text-cyan-200 hover:bg-cyan-500/10">
                Destaque
              </Badge>
              <p className="text-sm text-blue-100/75">
                {formatLongDate(
                  featuredPublication?.data_publicacao ??
                    new Date().toISOString(),
                )}
              </p>
              <div className="max-w-xl space-y-4">
                <h2 className="text-3xl font-semibold leading-tight tracking-tight lg:text-[2.55rem]">
                  {featuredPublication?.titulo ??
                    "Nova matriz de segregação de funções e permissões"}
                </h2>
                <p className="max-w-lg text-sm leading-7 text-blue-100/80">
                  {featuredPublication?.resumo ??
                    "Atualizamos a matriz para reforçar a segurança da informação e garantir maior rastreabilidade nos processos de aprovação."}
                </p>
              </div>
            </div>

            <div className="relative flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="h-14 rounded-xl bg-white px-7 text-base font-semibold text-slate-900 hover:bg-slate-100"
                onClick={() => {
                  if (featuredPublication) {
                    void handleOpenPublication(featuredPublication);
                  }
                }}
              >
                Acessar documento
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <div className="ml-auto hidden items-center gap-2 lg:flex">
                <span className="h-2 w-2 rounded-full bg-white" />
                <span className="h-2 w-2 rounded-full bg-white/40" />
                <span className="h-2 w-2 rounded-full bg-white/40" />
              </div>
            </div>
          </div>

          <div className="relative min-h-[280px] bg-[#071d3d]">
            <img
              src={heroImagePreview ?? buildHeroImageUrl(featuredPublication)}
              alt={featuredPublication?.titulo ?? "Destaque das bibliotecas"}
              className="h-full w-full object-cover"
            />
            {/* Sombra/gradiente contínua: mais escura junto à emenda com o
                painel de texto (esquerda no desktop, topo no mobile) e
                esmaecendo para transparente sobre a foto — é isso que costura
                visualmente os dois lados em um único card. */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#071d3d]/70 via-[#071d3d]/20 to-transparent lg:bg-gradient-to-r lg:from-[#071d3d]/70 lg:via-[#071d3d]/22 lg:to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-[#071d3d]/50 to-transparent lg:block" />

            {isAdmin && (
              <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
                <input
                  ref={heroImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleHeroImageChange}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={uploadingHeroImage || !featuredPublication}
                  onClick={() => heroImageInputRef.current?.click()}
                  className="h-11 gap-2 rounded-xl bg-white/90 px-4 text-sm font-medium text-slate-900 shadow-md backdrop-blur hover:bg-white"
                >
                  {uploadingHeroImage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {uploadingHeroImage ? "Enviando..." : "Alterar imagem"}
                </Button>
                {heroImageError && (
                  <p className="max-w-[220px] rounded-lg bg-rose-50/95 px-2.5 py-1.5 text-right text-xs text-rose-600 shadow-sm">
                    {heroImageError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Últimas notícias e publicações
            </h2>
            <p className="text-sm text-slate-500">
              Acompanhe as publicações mais recentes da organização.
            </p>
          </div>
          <Button
            asChild
            variant="ghost"
            className="gap-2 px-0 text-sky-700 hover:text-sky-800"
          >
            <Link to="/authenticated/organizacao/noticias">
              Ver todas as notícias
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {newsroomPublications.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {newsroomPublications.map((publication) => (
              <OrganizationPublicationCard
                key={publication.id}
                publication={publication}
                onOpen={() => {
                  void handleOpenPublication(publication);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[26px] border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
            Ainda não há publicações recentes para esta organização.
          </div>
        )}
      </section>

      <section id="libraries" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Suas bibliotecas
            </h2>
            <p className="text-sm text-slate-500">
              Acesse rapidamente as bibliotecas às quais você tem permissão.
            </p>
          </div>
          <div className="text-sm font-medium text-sky-700">
            {accessibleLibraries.length} biblioteca
            {accessibleLibraries.length === 1 ? "" : "s"} ativa
            {accessibleLibraries.length === 1 ? "" : "s"}
          </div>
        </div>

        {accessibleLibraries.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {accessibleLibraries.map((library) => (
              <div key={library.id} className="group relative">
                <Link
                  to="/authenticated/biblioteca/$bibliotecaId/dashboard"
                  params={{ bibliotecaId: library.id }}
                  onClick={() => setStoredActiveLibraryId(library.id)}
                  className={cn(
                    "block rounded-[22px] border border-slate-200 bg-white p-5 pr-14 transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg",
                    !library.active && "opacity-60",
                  )}
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl",
                          library.phase_template?.code === "project"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-violet-100 text-violet-700",
                        )}
                      >
                        <FolderOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">
                          {library.name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {library.enterpriseName}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full",
                          phaseBadgeClass(library.phase_template?.code),
                        )}
                      >
                        {library.phase_template?.display_name ?? "Ativa"}
                      </Badge>
                      {!library.active && (
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-300 bg-slate-100 text-slate-600"
                        >
                          Desativada
                        </Badge>
                      )}
                    </div>

                    <p className="min-h-[44px] text-sm leading-6 text-slate-500">
                      {library.phase_template?.reference_standard ??
                        "Biblioteca corporativa com políticas, procedimentos e documentos geridos pela plataforma."}
                    </p>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <FileStack className="h-3.5 w-3.5" />
                        Template fixo
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Escopo ativo
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-medium text-sky-700">
                      Abrir biblioteca
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>

                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-3 top-3 h-9 w-9 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Opções da biblioteca"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>
                        Edição da biblioteca
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleOpenEditLibrary(library);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar nome e código
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={togglingLibraryId === library.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleToggleLibraryActive(library);
                        }}
                      >
                        <Power className="mr-2 h-4 w-4" />
                        {library.active
                          ? "Desativar biblioteca"
                          : "Ativar biblioteca"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-rose-600 focus:text-rose-600"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeletingLibrary(library);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir biblioteca
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[26px] border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
            Nenhuma biblioteca encontrada ainda. Crie a primeira biblioteca para
            começar.
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(editingLibrary)}
        onOpenChange={(next) => !next && setEditingLibrary(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar biblioteca</DialogTitle>
            <DialogDescription>
              Altere o nome de exibição ou o código do projeto vinculado a esta
              biblioteca.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Nome da biblioteca</Label>
              <Input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="Ex.: Revamp 2026"
              />
            </div>
            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={editCode}
                onChange={(event) => setEditCode(event.target.value)}
                placeholder={
                  editCodeLoading ? "Carregando..." : "Ex.: PROJ-0142"
                }
                disabled={editCodeLoading}
              />
            </div>
          </div>

          {catalog.error && (
            <p className="text-sm text-rose-600">{catalog.error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLibrary(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEditLibrary}
              disabled={catalog.saving || editName.trim().length < 3}
            >
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletingLibrary)}
        onOpenChange={(next) => !next && setDeletingLibrary(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir biblioteca</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir "{deletingLibrary?.name}"? Esta
              ação não pode ser desfeita. Se houver documentos nesta biblioteca,
              a exclusão será bloqueada.
            </DialogDescription>
          </DialogHeader>

          {catalog.error && (
            <p className="text-sm text-rose-600">{catalog.error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingLibrary(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteLibrary}
              disabled={catalog.saving}
            >
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            Entenda como funciona
          </h2>
          <p className="text-sm text-slate-500">
            Organize, controle e compartilhe documentos com segurança e
            eficiência.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: Building2,
              title: "Organização inteligente",
              description:
                "Estruture bibliotecas por projeto, área ou processo sem perder rastreabilidade.",
              iconClass: "bg-sky-100 text-sky-700",
            },
            {
              icon: ShieldCheck,
              title: "Segurança e controle",
              description:
                "Defina permissões, acompanhe acessos e garanta a integridade das informações.",
              iconClass: "bg-emerald-100 text-emerald-700",
            },
            {
              icon: Workflow,
              title: "Fluxos eficientes",
              description:
                "Padronize processos de aprovação, revisão e publicação de documentos.",
              iconClass: "bg-violet-100 text-violet-700",
            },
            {
              icon: Sparkles,
              title: "Informação na hora certa",
              description:
                "Encontre o que precisa com rapidez e tome decisões com mais confiança.",
              iconClass: "bg-amber-100 text-amber-700",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-[22px] border border-slate-200 bg-white p-5"
              >
                <div className="space-y-4">
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl",
                      item.iconClass,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-6 text-slate-500">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
