import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileStack,
  FolderOpen,
  ImagePlus,
  Loader2,
  Plus,
  ShieldCheck,
  Settings,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { OrganizationPublicationCard } from "@/components/organization/OrganizationPublicationCard";
import { CreatePublicationDialog } from "@/components/organization/CreatePublicationDialog";
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
import { useLibraries, type LibraryPhaseCode } from "@/hooks/useLibraries";
import { usePublications, type PublicationRecord } from "@/hooks/usePublications";
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
  const { profile, user, hasRole } = useAuthContext();
  const catalog = useLibraries();
  // Busca 5: 1 vai para o card de destaque (hero) e as outras 4 preenchem
  // completamente a grade "Últimas notícias e publicações" (xl:grid-cols-4).
  const publications = usePublications({ limit: 5 });
  const [open, setOpen] = useState(false);
  const [enterpriseMode, setEnterpriseMode] = useState<"existing" | "new">(
    "existing",
  );
  const [enterpriseId, setEnterpriseId] = useState("");
  const [newEnterpriseName, setNewEnterpriseName] = useState("");
  const [phaseCode, setPhaseCode] = useState<LibraryPhaseCode | "">("");
  const [libraryName, setLibraryName] = useState("");

  const isAdmin = hasRole(["admin"]);

  const [heroImagePreview, setHeroImagePreview] = useState<string | null>(null);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  // Índice do slide ativo no carrossel do hero (dots/setas)
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);

  const canSubmit = useMemo(() => {
    const hasEnterprise =
      enterpriseMode === "existing"
        ? Boolean(enterpriseId)
        : newEnterpriseName.trim().length >= 3;
    return hasEnterprise && Boolean(phaseCode) && libraryName.trim().length >= 3;
  }, [enterpriseId, enterpriseMode, libraryName, newEnterpriseName, phaseCode]);

  const featuredPublication = publications.latestPublications[0] ?? null;
  const newsroomPublications =
    publications.latestPublications.length > 1
      ? publications.latestPublications.slice(1, 5)
      : publications.latestPublications;

  // Publicações candidatas a aparecer no carrossel do hero (ajuste a fonte se tiver uma lista própria de "destaques")
  const heroSlides = useMemo(
    () => publications.latestPublications.slice(0, 3),
    [publications.latestPublications],
  );

  useEffect(() => {
    setHeroImagePreview(null);
  }, [featuredPublication?.id]);

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

  const heroImageUrl = heroImagePreview ?? buildHeroImageUrl(featuredPublication);

  function handleHeroPrev() {
    if (heroSlides.length === 0) return;
    setActiveHeroSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
  }

  function handleHeroNext() {
    if (heroSlides.length === 0) return;
    setActiveHeroSlide((prev) => (prev + 1) % heroSlides.length);
  }

  async function handleHeroImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !featuredPublication) return;

    const localPreview = URL.createObjectURL(file);
    setHeroImagePreview(localPreview);
    setUploadingHeroImage(true);

    try {
      const uploadedUrl = await publications.updatePublicationImage(
        featuredPublication.id,
        file,
        featuredPublication.imagem_url,
      );
      setHeroImagePreview(uploadedUrl);
    } catch (error) {
      console.error("Falha ao enviar imagem de destaque", error);
      setHeroImagePreview(null);
    } finally {
      setUploadingHeroImage(false);
      event.target.value = "";
    }
  }

  function handleRemoveHeroImage() {
    if (!featuredPublication) return;
    setUploadingHeroImage(true);
    void (async () => {
      try {
        await publications.removePublicationImage(
          featuredPublication.id,
          featuredPublication.imagem_url,
        );
        setHeroImagePreview(null);
      } catch (error) {
        console.error("Falha ao remover imagem de destaque", error);
      } finally {
        setUploadingHeroImage(false);
      }
    })();
  }

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
              Cada biblioteca representa um ambiente documental do empreendimento,
              provisionado por fase e governado por um template fixo da plataforma.
            </p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-12 gap-2 rounded-xl bg-[#2f7cf6] px-5 text-white hover:bg-[#1f6ce6]">
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
                          {template.display_name} · {template.reference_standard}
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
              <Button onClick={handleCreateLibrary} disabled={!canSubmit || catalog.saving}>
                Criar biblioteca
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ============================================================
          HERO / CARD DE DESTAQUE
          Reestruturado de grid 2-colunas para overlay full-bleed:
          a imagem ocupa o card inteiro como plano de fundo, com
          gradiente por cima para dar contraste ao texto. Isso resolve
          o problema de a imagem "encolher" dentro de uma coluna fixa.
      ============================================================ */}
      <section className="relative overflow-hidden shadow-[0_24px_60px_-28px_rgba(7,29,61,0.65)]">
        <div className="relative min-h-[600px] w-full bg-[#071d3d] lg:min-h-[680px]">
          {/* Imagem de fundo cobrindo o card inteiro */}
          <img
            src={heroImageUrl}
            alt={featuredPublication?.titulo ?? "Destaque das bibliotecas"}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Gradiente da esquerda para a direita, garantindo contraste do texto sobre a foto */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#071d3d] via-[#071d3d]/78 to-[#071d3d]/10" />
          {/* Reforço sutil de baixo para cima, para o CTA e os dots não se perderem na foto */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
          {/* Glow decorativo no canto superior direito, como no design original */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(29, 128, 235, 0.28),transparent_55%)]" />

          {/* Conteúdo textual sobreposto */}
          <div className="relative flex h-full min-h-[600px] flex-col justify-between gap-8 p-8 text-white lg:min-h-[680px] lg:p-16">
            <div className="max-w-2xl space-y-5">
              <Badge className="w-fit rounded-full border-cyan-400/35 bg-cyan-500/10 px-3 text-[11px] uppercase tracking-[0.14em] text-cyan-200 hover:bg-cyan-500/10">
                Destaque
              </Badge>
              <p className="text-sm text-blue-100/75">
                {formatLongDate(
                  featuredPublication?.data_publicacao ?? new Date().toISOString(),
                )}
              </p>
              <div className="space-y-4">
                <h2 className="text-4xl font-semibold leading-tight tracking-tight lg:text-[3.25rem]">
                  {featuredPublication?.titulo ??
                    "Nova matriz de segregação de funções e permissões"}
                </h2>
                <p className="max-w-xl text-base leading-7 text-blue-100/80 lg:text-lg">
                  {featuredPublication?.resumo ??
                    "Atualizamos a matriz para reforçar a segurança da informação e garantir maior rastreabilidade nos processos de aprovação."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="h-14 rounded-2xl bg-white px-8 text-base font-semibold text-slate-900 shadow-[0_10px_24px_-8px_rgba(0,0,0,0.45)] transition-all hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow-[0_14px_28px_-8px_rgba(0,0,0,0.5)]"
                onClick={() => {
                  if (featuredPublication) {
                    void handleOpenPublication(featuredPublication);
                  }
                }}
              >
                Acessar documento
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>

              {heroSlides.length > 1 && (
                <div className="ml-auto hidden items-center gap-2 lg:flex">
                  {heroSlides.map((slide, index) => (
                    <button
                      key={slide.id}
                      type="button"
                      aria-label={`Ir para destaque ${index + 1}`}
                      onClick={() => setActiveHeroSlide(index)}
                      className={cn(
                        "h-2 rounded-full transition-all",
                        index === activeHeroSlide ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/60",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Setas de navegação do carrossel */}
          {heroSlides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handleHeroPrev}
                aria-label="Destaque anterior"
                className="absolute left-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50 lg:flex"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={handleHeroNext}
                aria-label="Próximo destaque"
                className="absolute right-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50 lg:flex"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Controles de administrador para a imagem de destaque */}
          {isAdmin && (
            <div className="absolute right-4 top-4 flex gap-2">
              {(heroImagePreview || featuredPublication?.imagem_url) && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 rounded-lg bg-black/40 text-white backdrop-blur-sm hover:bg-black/55"
                  onClick={handleRemoveHeroImage}
                  disabled={uploadingHeroImage}
                >
                  <X className="h-3.5 w-3.5" />
                  Remover
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5 rounded-lg bg-white/95 text-slate-900 shadow-sm hover:bg-white"
                disabled={uploadingHeroImage || !featuredPublication}
                onClick={() => heroFileInputRef.current?.click()}
              >
                {uploadingHeroImage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}
                {heroImagePreview ? "Trocar imagem" : "Inserir imagem"}
              </Button>
              <input
                ref={heroFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleHeroImageSelect}
              />
            </div>
          )}
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
          <Button asChild variant="ghost" className="gap-2 px-0 text-sky-700 hover:text-sky-800">
            <Link to="/authenticated/organizacao/noticias">
              Ver todas as notícias
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {isAdmin && (
          <div className="flex justify-end">
            <CreatePublicationDialog
              onCreate={publications.createPublication}
              onAttachImage={publications.updatePublicationImage}
            />
          </div>
        )}

        {newsroomPublications.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {newsroomPublications.map((publication) => (
              <OrganizationPublicationCard
                key={publication.id}
                publication={publication}
                isAdmin={isAdmin}
                onUpdateImage={publications.updatePublicationImage}
                onRemoveImage={publications.removePublicationImage}
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
            {accessibleLibraries.length} biblioteca{accessibleLibraries.length === 1 ? "" : "s"} ativa{accessibleLibraries.length === 1 ? "" : "s"}
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
                  className="block rounded-[22px] border border-slate-200 bg-white p-5 pr-14 transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg"
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

                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full",
                        phaseBadgeClass(library.phase_template?.code),
                      )}
                    >
                      {library.phase_template?.display_name ?? "Ativa"}
                    </Badge>

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
                    <DropdownMenuLabel>Edição da biblioteca</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled>Editar nome da biblioteca</DropdownMenuItem>
                    <DropdownMenuItem disabled>Editar empreendimento</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[26px] border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
            Nenhuma biblioteca encontrada ainda. Crie a primeira biblioteca para começar.
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            Entenda como funciona
          </h2>
          <p className="text-sm text-slate-500">
            Organize, controle e compartilhe documentos com segurança e eficiência.
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
                  <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", item.iconClass)}>
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
