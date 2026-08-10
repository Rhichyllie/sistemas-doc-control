import { useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type {
  CreatePublicationInput,
  PublicationCategory,
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

/**
 * TODO: confirme quais valores de `status`/`published_at` indicam, no seu
 * fluxo, que o documento está "aprovado e publicado". Hoje considero:
 * status === "published" e published_at preenchido.
 */
function isDocumentApprovedAndPublished(document: FoundDocument) {
  return document.status === "published" && Boolean(document.published_at);
}

export function CreatePublicationDialog({
  onCreate,
  onAttachImage,
}: {
  onCreate: (input: CreatePublicationInput) => Promise<string>;
  onAttachImage: (
    publicationId: string,
    file: File,
    currentUrl?: string | null,
  ) => Promise<string>;
}) {
  const { profile } = useAuthContext();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Busca de documento por código
  const [documentCode, setDocumentCode] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundDocument, setFoundDocument] = useState<FoundDocument | null>(null);

  // Campos da publicação
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<PublicationCategory | "">("");
  const [resumo, setResumo] = useState("");

  // Imagem
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);

  function resetForm() {
    setDocumentCode("");
    setLookupError(null);
    setFoundDocument(null);
    setTitulo("");
    setCategoria("");
    setResumo("");
    setImagePreview(null);
    setSelectedImageFile(null);
    setFormError(null);
  }

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

  function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    event.target.value = "";
  }

  const canSubmit =
    titulo.trim().length >= 3 && Boolean(categoria) && !saving;

  async function handleSubmit() {
    if (!canSubmit || !categoria) return;

    setSaving(true);
    setFormError(null);
    // #region debug-point C:dialog-submit-start
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"C",location:"src/components/organization/CreatePublicationDialog.tsx:handleSubmit:start",msg:"[DEBUG] publication dialog submit started",data:{hasOrgId:Boolean(profile?.org_id),profileId:profile?.id ?? null,tituloLength:titulo.trim().length,categoria,hasResumo:Boolean(resumo.trim()),hasImage:Boolean(selectedImageFile),documentoId:foundDocument?.id ?? null},ts:Date.now()})}).catch(()=>{});
    // #endregion

    try {
      const publicationId = await onCreate({
        titulo: titulo.trim(),
        categoria,
        resumo: resumo.trim() || null,
        documento_id: foundDocument?.id ?? null,
      });

      if (selectedImageFile) {
        const uploadedImageUrl = await onAttachImage(
          publicationId,
          selectedImageFile,
          null,
        );
        // #region debug-point B:dialog-upload-finished
        fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"B",location:"src/components/organization/CreatePublicationDialog.tsx:handleSubmit:afterUpload",msg:"[DEBUG] publication dialog upload finished",data:{uploadedImageUrl,hasImage:Boolean(selectedImageFile),publicationId},ts:Date.now()})}).catch(()=>{});
        // #endregion
      }

      // #region debug-point D:dialog-create-finished
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"D",location:"src/components/organization/CreatePublicationDialog.tsx:handleSubmit:success",msg:"[DEBUG] publication dialog create completed",data:{publicationId,titulo:titulo.trim(),categoria,documentoId:foundDocument?.id ?? null},ts:Date.now()})}).catch(()=>{});
      // #endregion
      toast.success("Publicação salva com sucesso.");
      setOpen(false);
      resetForm();
    } catch (err) {
      // #region debug-point D:dialog-create-error
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"D",location:"src/components/organization/CreatePublicationDialog.tsx:handleSubmit:error",msg:"[DEBUG] publication dialog submit failed",data:{message:err instanceof Error ? err.message : String(err)},ts:Date.now()})}).catch(()=>{});
      // #endregion
      const message =
        err instanceof Error ? err.message : "Não foi possível criar a publicação.";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-xl bg-[#2f7cf6] text-white hover:bg-[#1f6ce6]">
          <Plus className="h-4 w-4" />
          Nova publicação
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Criar publicação</DialogTitle>
          <DialogDescription>
            Vincule um documento já aprovado e publicado, ou crie uma publicação
            avulsa (sem documento vinculado).
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

            {lookupError && (
              <p className="text-sm text-rose-600">{lookupError}</p>
            )}

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
                  onClick={() => setFoundDocument(null)}
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
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Imagem de capa</Label>
            {imagePreview ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200">
                <img
                  src={imagePreview}
                  alt="Prévia da imagem da publicação"
                  className="h-40 w-full object-cover"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-2 top-2 h-8 w-8 rounded-lg bg-black/45 text-white hover:bg-black/60"
                  onClick={() => {
                    setImagePreview(null);
                    setSelectedImageFile(null);
                  }}
                  aria-label="Remover imagem"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-slate-400 hover:bg-slate-50">
                <ImagePlus className="h-5 w-5" />
                Clique para inserir uma imagem
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                />
              </label>
            )}
          </div>
        </div>

        {formError && <p className="text-sm text-rose-600">{formError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Criar publicação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
