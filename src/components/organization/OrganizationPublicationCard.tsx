import { useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Crosshair,
  FileStack,
  ImagePlus,
  Loader2,
  Megaphone,
  MoreVertical,
  Pencil,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { EditPublicationDialog } from "@/components/organization/EditPublicationDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  PublicationCategory,
  PublicationImageFocus,
  PublicationRecord,
  UpdatePublicationInput,
} from "@/hooks/usePublications";
import { PUBLICATION_IMAGE_FOCUS_OPTIONS } from "@/hooks/usePublications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CATEGORY_META: Record<
  PublicationCategory,
  {
    label: string;
    badgeClass: string;
    mediaClass: string;
    icon: typeof FileStack;
  }
> = {
  procedimento: {
    label: "Procedimento",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    mediaClass: "from-sky-600 via-blue-600 to-cyan-500",
    icon: FileStack,
  },
  manual: {
    label: "Manual",
    badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
    mediaClass: "from-violet-600 via-indigo-600 to-blue-500",
    icon: BookOpen,
  },
  seguranca_saude: {
    label: "Segurança e saúde",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    mediaClass: "from-emerald-600 via-teal-600 to-cyan-500",
    icon: Shield,
  },
  comunicado: {
    label: "Comunicado",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    mediaClass: "from-amber-500 via-orange-500 to-rose-500",
    icon: Megaphone,
  },
};

const DISPLAY_MODE_META = {
  destaque: {
    label: "Destaque",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  secundaria: {
    label: "Secundária",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  padrao: {
    label: "Padrão",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  },
} as const;

function buildPublicationImageUrl(category: PublicationCategory) {
  const promptByCategory: Record<PublicationCategory, string> = {
    procedimento:
      "corporate engineering team reviewing technical procedure document on desk, blueprints, laptops, realistic office, professional lighting, modern business editorial photo",
    manual:
      "professional engineer reading technical operations manual in modern library office, realistic corporate editorial photography, blue and neutral tones",
    seguranca_saude:
      "industrial safety team with helmets and PPE in engineering site, professional corporate editorial photo, realistic lighting, modern facility",
    comunicado:
      "business team analyzing dashboards and reports in corporate meeting room, realistic editorial photography, modern engineering company, blue tones",
  };

  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    promptByCategory[category],
  )}&image_size=landscape_16_9`;
}

function formatPublicationDate(dateIso: string) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function OrganizationPublicationCard({
  publication,
  onOpen,
  isAdmin = false,
  onUpdateImage,
  onUpdateImageFocus,
  onEditPublication,
  onDeletePublication,
  onRemoveImage,
}: {
  publication: PublicationRecord;
  onOpen?: () => void;
  /** Exibe os controles de inserir/trocar/remover imagem — apenas para administradores. */
  isAdmin?: boolean;
  onUpdateImage?: (
    publicationId: string,
    file: File,
    currentUrl?: string | null,
  ) => Promise<string>;
  onUpdateImageFocus?: (
    publicationId: string,
    imageFocus: PublicationImageFocus,
  ) => Promise<void>;
  onEditPublication?: (
    publicationId: string,
    input: UpdatePublicationInput,
  ) => Promise<void>;
  onDeletePublication?: (
    publicationId: string,
    currentUrl?: string | null,
  ) => Promise<void>;
  onRemoveImage?: (
    publicationId: string,
    currentUrl?: string | null,
  ) => Promise<void>;
}) {
  const meta = CATEGORY_META[publication.categoria] ?? CATEGORY_META.comunicado;
  const displayModeMeta = DISPLAY_MODE_META[publication.modo_exibicao];
  const interactive = Boolean(onOpen);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingPublication, setDeletingPublication] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageUrl =
    imagePreview ||
    publication.imagem_url ||
    buildPublicationImageUrl(publication.categoria);
  const imageFocus = publication.imagem_foco ?? "center center";

  async function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setImagePreview(localPreview);
    setUploadingImage(true);

    try {
      if (!onUpdateImage) {
        throw new Error("Atualização de imagem não está disponível.");
      }
      const uploadedUrl = await onUpdateImage(
        publication.id,
        file,
        publication.imagem_url,
      );
      setImagePreview(uploadedUrl);
    } catch (error) {
      console.error("Falha ao enviar imagem da publicação", error);
      setImagePreview(null);
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  }

  function handleRemoveImage(event: React.MouseEvent) {
    event.stopPropagation();
    setUploadingImage(true);
    void (async () => {
      try {
        if (!onRemoveImage) {
          throw new Error("Remoção de imagem não está disponível.");
        }
        await onRemoveImage(publication.id, publication.imagem_url);
        setImagePreview(null);
      } catch (error) {
        console.error("Falha ao remover imagem da publicação", error);
      } finally {
        setUploadingImage(false);
      }
    })();
  }

  function handleUpdateImageFocus(
    event: React.MouseEvent,
    imageFocus: PublicationImageFocus,
  ) {
    event.stopPropagation();
    if (!onUpdateImageFocus) return;

    setUploadingImage(true);
    void (async () => {
      try {
        await onUpdateImageFocus(publication.id, imageFocus);
      } catch (error) {
        console.error("Falha ao atualizar enquadramento da publicação", error);
      } finally {
        setUploadingImage(false);
      }
    })();
  }

  function handleEditAction(event: React.MouseEvent) {
    event.stopPropagation();
    setEditOpen(true);
  }

  function handleDeleteAction(event: React.MouseEvent) {
    event.stopPropagation();
    setDeleteOpen(true);
  }

  async function handleConfirmDelete() {
    if (!onDeletePublication) return;
    setDeletingPublication(true);
    try {
      await onDeletePublication(publication.id, publication.imagem_url);
      toast.success("Publicação removida com sucesso.");
      setDeleteOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível remover a publicação.";
      toast.error(message);
    } finally {
      setDeletingPublication(false);
    }
  }

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white transition-all",
        interactive &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg",
      )}
    >
      <AspectRatio ratio={16 / 9}>
        <div className="relative h-full w-full overflow-hidden">
          <img
            src={imageUrl}
            alt={publication.titulo}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            style={{ objectPosition: imageFocus }}
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/30 via-slate-950/10 to-transparent" />

          {isAdmin && (
            <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 rounded-lg bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
                    onClick={(event) => event.stopPropagation()}
                    disabled={uploadingImage || deletingPublication}
                    aria-label="Mais ações da publicação"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Gerenciar publicação</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleEditAction}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar publicação
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDeleteAction}
                    className="text-rose-600 focus:text-rose-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover publicação
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 rounded-lg bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
                    onClick={(event) => event.stopPropagation()}
                    disabled={uploadingImage}
                    aria-label="Ajustar enquadramento"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Enquadramento da imagem</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {PUBLICATION_IMAGE_FOCUS_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={(event) => handleUpdateImageFocus(event, option.value)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {(imagePreview || publication.imagem_url) && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 rounded-lg bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
                  onClick={handleRemoveImage}
                  disabled={uploadingImage}
                  aria-label="Remover imagem"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                className="h-7 w-7 rounded-lg bg-white/95 text-slate-900 shadow-sm hover:bg-white"
                disabled={uploadingImage}
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
                aria-label={imagePreview ? "Trocar imagem" : "Inserir imagem"}
              >
                {uploadingImage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onClick={(event) => event.stopPropagation()}
                onChange={handleImageSelect}
              />
            </div>
          )}
        </div>
      </AspectRatio>

      <div className="flex flex-1 flex-col space-y-4 p-4">
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("rounded-full", meta.badgeClass)}>
                {meta.label}
              </Badge>
              <Badge
                variant="outline"
                className={cn("rounded-full", displayModeMeta.className)}
              >
                {displayModeMeta.label}
              </Badge>
            </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{formatPublicationDate(publication.data_publicacao)}</span>
          </div>
          <h3 className="line-clamp-2 text-base font-semibold tracking-tight text-slate-900">
            {publication.titulo}
          </h3>
          <p className="line-clamp-3 text-sm text-slate-600">
            {publication.resumo ?? "Sem resumo disponível para esta publicação."}
          </p>
        </div>

        <div className="mt-auto border-t border-slate-100 pt-3">
          {interactive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-3 gap-1 px-3 text-sky-700 hover:text-sky-800"
            >
              Ler documento
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {onEditPublication && (
        <EditPublicationDialog
          publication={publication}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSave={onEditPublication}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover publicação?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação exclui o texto e a capa da publicação atual da organização.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deletingPublication ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
