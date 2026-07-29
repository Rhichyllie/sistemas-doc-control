import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  FileStack,
  Megaphone,
  Shield,
} from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  PublicationCategory,
  PublicationRecord,
} from "@/hooks/usePublications";
import { cn } from "@/lib/utils";

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
}: {
  publication: PublicationRecord;
  onOpen?: () => void;
}) {
  const meta = CATEGORY_META[publication.categoria] ?? CATEGORY_META.comunicado;
  const interactive = Boolean(onOpen);
  const imageUrl = publication.imagem_url || buildPublicationImageUrl(publication.categoria);

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
        "group overflow-hidden rounded-[22px] border border-slate-200 bg-white transition-all",
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
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/30 via-slate-950/10 to-transparent" />
        </div>
      </AspectRatio>

      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Badge variant="outline" className={cn("rounded-full", meta.badgeClass)}>
            {meta.label}
          </Badge>
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

        <div className="border-t border-slate-100 pt-3">
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
    </article>
  );
}
