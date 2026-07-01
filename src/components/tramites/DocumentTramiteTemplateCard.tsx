import { Archive, Copy, GitBranch, Pencil, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DocumentTramiteTemplate } from "@/lib/documentTramiteModel";

const STATUS_LABEL = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
} as const;

export function DocumentTramiteTemplateCard({
  template,
  onEdit,
  onDuplicate,
  onPublish,
  onArchive,
}: {
  template: DocumentTramiteTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onPublish: () => void;
  onArchive: () => void;
}) {
  const version = template.current_version;
  return (
    <Card className={template.is_active ? undefined : "opacity-70"}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              {template.name}
              <Badge
                variant={
                  template.status === "published" ? "secondary" : "outline"
                }
              >
                {STATUS_LABEL[template.status]}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              {template.code} · versão {version?.version_number ?? 1}
            </CardDescription>
          </div>
          <GitBranch className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {template.description || "Modelo documental sem descrição."}
        </p>
        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-3 text-center">
          <div>
            <p className="text-lg font-semibold">
              {version?.graph.nodes.length ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground">etapas</p>
          </div>
          <div>
            <p className="text-lg font-semibold">
              {version?.graph.edges.length ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground">conexões</p>
          </div>
          <div>
            <p className="text-lg font-semibold">
              {template.template_scope === "organization" ? "Org." : "Escopo"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {template.doc_type || template.area || "geral"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Abrir modelador
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDuplicate}
          >
            <Copy className="h-4 w-4" />
            Duplicar
          </Button>
          {template.status !== "published" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onPublish}
            >
              <Send className="h-4 w-4" />
              Publicar
            </Button>
          )}
          {template.status !== "archived" && (
            <Button type="button" size="sm" variant="ghost" onClick={onArchive}>
              <Archive className="h-4 w-4" />
              Arquivar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Atualizado em{" "}
          {new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(template.updated_at))}
        </p>
      </CardContent>
    </Card>
  );
}
