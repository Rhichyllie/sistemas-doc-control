import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type {
  PublicationCategory,
  PublicationRecord,
  UpdatePublicationInput,
} from "@/hooks/usePublications";
import { toast } from "sonner";

const CATEGORY_OPTIONS: { value: PublicationCategory; label: string }[] = [
  { value: "procedimento", label: "Procedimento" },
  { value: "manual", label: "Manual" },
  { value: "seguranca_saude", label: "Segurança e saúde" },
  { value: "comunicado", label: "Comunicado" },
];

interface FoundDocument {
  id: string;
  code: string | null;
  title: string;
  status: string;
  published_at: string | null;
  library_id: string | null;
}

function isDocumentApprovedAndPublished(document: FoundDocument) {
  return document.status === "published" && Boolean(document.published_at);
}

export function EditPublicationDialog({
  publication,
  open,
  onOpenChange,
  onSave,
}: {
  publication: PublicationRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (publicationId: string, input: UpdatePublicationInput) => Promise<void>;
}) {
  const { profile } = useAuthContext();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [documentCode, setDocumentCode] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundDocument, setFoundDocument] = useState<FoundDocument | null>(null);
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<PublicationCategory | "">("");
  const [resumo, setResumo] = useState("");

  useEffect(() => {
    if (!open) return;
    setDocumentCode(publication.documento?.id ? publication.documento.title : "");
    setLookupError(null);
    setFoundDocument(
      publication.documento
        ? {
            id: publication.documento.id,
            code: null,
            title: publication.documento.title,
            status: "published",
            published_at: publication.data_publicacao,
            library_id: publication.documento.library_id,
          }
        : null,
    );
    setTitulo(publication.titulo);
    setCategoria(publication.categoria);
    setResumo(publication.resumo ?? "");
    setFormError(null);
  }, [open, publication]);

  async function handleLookupDocument() {
    if (!documentCode.trim() || !profile?.org_id) return;

    setLookupLoading(true);
    setLookupError(null);
    setFoundDocument(null);

    try {
      const { data, error } = await supabase
        .from("documents")
        .select("id, code, title, status, published_at, library_id")
        .eq("org_id", profile.org_id)
        .eq("code", documentCode.trim())
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setLookupError("Nenhum documento encontrado com esse código.");
        return;
      }

      const document = data as FoundDocument;
      if (!isDocumentApprovedAndPublished(document)) {
        setLookupError(
          `O documento "${document.title}" foi encontrado, mas ainda não está aprovado/publicado.`,
        );
        return;
      }

      setFoundDocument(document);
      setTitulo((current) => current || document.title);
    } catch (err) {
      setLookupError(
        err instanceof Error ? err.message : "Erro ao buscar o documento.",
      );
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit() {
    if (!categoria || titulo.trim().length < 3) return;

    setSaving(true);
    setFormError(null);

    try {
      await onSave(publication.id, {
        titulo: titulo.trim(),
        categoria,
        resumo: resumo.trim() || null,
        documento_id: foundDocument?.id ?? null,
      });
      toast.success("Publicação atualizada com sucesso.");
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Não foi possível atualizar a publicação.";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar publicação</DialogTitle>
          <DialogDescription>
            Atualize os dados da publicação exibida na organização.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
            <Label>Código do documento (opcional)</Label>
            <div className="flex gap-2">
              <Input
                value={documentCode}
                onChange={(event) => {
                  setDocumentCode(event.target.value);
                  setFoundDocument(null);
                  setLookupError(null);
                }}
                placeholder="Ex.: PROJ-DOC-0012"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={handleLookupDocument}
                disabled={!documentCode.trim() || lookupLoading}
              >
                {lookupLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Buscar
              </Button>
            </div>

            {lookupError && <p className="text-sm text-rose-600">{lookupError}</p>}

            {foundDocument && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  Documento vinculado: <strong>{foundDocument.title}</strong>
                </span>
                <Badge className="rounded-full border-emerald-300 bg-white text-emerald-700">
                  Publicado
                </Badge>
                <button
                  type="button"
                  onClick={() => {
                    setFoundDocument(null);
                    setDocumentCode("");
                  }}
                  aria-label="Remover vínculo com o documento"
                  className="text-emerald-700/70 hover:text-emerald-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={titulo}
                onChange={(event) => setTitulo(event.target.value)}
                placeholder="Título da publicação"
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={categoria}
                onValueChange={(value) => setCategoria(value as PublicationCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Resumo</Label>
            <Textarea
              value={resumo}
              onChange={(event) => setResumo(event.target.value)}
              placeholder="Breve descrição que aparece no card"
              rows={4}
            />
          </div>
        </div>

        {formError && <p className="text-sm text-rose-600">{formError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || titulo.trim().length < 3 || !categoria}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
