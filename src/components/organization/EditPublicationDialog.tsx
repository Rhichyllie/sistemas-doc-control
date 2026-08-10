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
import { useLibraries } from "@/hooks/useLibraries";
import {
  findSelectableLibraryDocumentByCode,
  listSelectableLibraryDocuments,
  type PublicationSelectableDocument,
} from "@/lib/publicationDocuments";
import {
  PUBLICATION_DISPLAY_MODE_OPTIONS,
  type PublicationCategory,
  type PublicationDisplayMode,
  type PublicationRecord,
  type UpdatePublicationInput,
} from "@/hooks/usePublications";
import { toast } from "sonner";

const CATEGORY_OPTIONS: { value: PublicationCategory; label: string }[] = [
  { value: "procedimento", label: "Procedimento" },
  { value: "manual", label: "Manual" },
  { value: "seguranca_saude", label: "Segurança e saúde" },
  { value: "comunicado", label: "Comunicado" },
];

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
  const libraries = useLibraries();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState("");
  const [documentCode, setDocumentCode] = useState("");
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<
    PublicationSelectableDocument[]
  >([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundDocument, setFoundDocument] =
    useState<PublicationSelectableDocument | null>(null);
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<PublicationCategory | "">("");
  const [modoExibicao, setModoExibicao] =
    useState<PublicationDisplayMode>("padrao");
  const [resumo, setResumo] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedLibraryId(publication.documento?.library_id ?? "");
    setDocumentCode("");
    setAvailableDocuments([]);
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
            project_id: null,
          }
        : null,
    );
    setTitulo(publication.titulo);
    setCategoria(publication.categoria);
    setModoExibicao(publication.modo_exibicao);
    setResumo(publication.resumo ?? "");
    setFormError(null);
  }, [open, publication]);

  useEffect(() => {
    if (!open || !profile?.org_id || !selectedLibraryId) {
      setAvailableDocuments([]);
      return;
    }

    setDocumentsLoading(true);
    setLookupError(null);

    void (async () => {
      try {
        const documents = await listSelectableLibraryDocuments(
          profile.org_id,
          selectedLibraryId,
        );
        setAvailableDocuments(
          foundDocument &&
            !documents.some((document) => document.id === foundDocument.id)
            ? [foundDocument, ...documents]
            : documents,
        );
      } catch (err) {
        setLookupError(
          err instanceof Error ? err.message : "Erro ao carregar documentos da biblioteca.",
        );
        setAvailableDocuments([]);
      } finally {
        setDocumentsLoading(false);
      }
    })();
  }, [foundDocument, open, profile?.org_id, selectedLibraryId]);

  async function handleLookupDocument() {
    if (!documentCode.trim() || !profile?.org_id) return;
    if (!selectedLibraryId) {
      setLookupError("Selecione a biblioteca para buscar o documento.");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setFoundDocument(null);

    try {
      const document =
        availableDocuments.find(
          (item) => item.code?.trim().toLowerCase() === documentCode.trim().toLowerCase(),
        ) ??
        (await findSelectableLibraryDocumentByCode(
          profile.org_id,
          selectedLibraryId,
          documentCode.trim(),
        ));

      if (!document) {
        setLookupError("Nenhum documento encontrado com esse código.");
        return;
      }

      setFoundDocument(document);
      setAvailableDocuments((current) =>
        current.some((item) => item.id === document.id)
          ? current
          : [document, ...current],
      );
      setSelectedLibraryId(document.library_id ?? selectedLibraryId);
      setTitulo((current) => current || document.title);
    } catch (err) {
      setLookupError(
        err instanceof Error ? err.message : "Erro ao buscar o documento.",
      );
    } finally {
      setLookupLoading(false);
    }
  }

  function handleSelectLibrary(libraryId: string) {
    setSelectedLibraryId(libraryId);
    setFoundDocument(null);
    setLookupError(null);
    setDocumentCode("");
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
        modo_exibicao: modoExibicao,
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
            <div className="space-y-2">
              <Label>Biblioteca do documento</Label>
              <Select value={selectedLibraryId} onValueChange={handleSelectLibrary}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a biblioteca/projeto" />
                </SelectTrigger>
                <SelectContent>
                  {libraries.libraries.map((library) => (
                    <SelectItem key={library.id} value={library.id}>
                      {library.name}
                      {library.enterprise?.name ? ` • ${library.enterprise.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                A publicação será vinculada a um documento dessa biblioteca, com prioridade para os já publicados.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Documento da biblioteca</Label>
              <Select
                value={foundDocument?.id ?? ""}
                onValueChange={(documentId) => {
                  const selectedDocument =
                    availableDocuments.find((document) => document.id === documentId) ?? null;
                  setFoundDocument(selectedDocument);
                  setLookupError(null);
                  setDocumentCode(selectedDocument?.code ?? "");
                  if (selectedDocument) {
                    setTitulo((current) => current || selectedDocument.title);
                  }
                }}
                disabled={!selectedLibraryId || documentsLoading || availableDocuments.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !selectedLibraryId
                        ? "Selecione uma biblioteca primeiro"
                        : documentsLoading
                          ? "Carregando documentos..."
                          : availableDocuments.length === 0
                            ? "Nenhum documento encontrado nessa biblioteca"
                            : "Selecione um documento"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableDocuments.map((document) => (
                    <SelectItem key={document.id} value={document.id}>
                      {document.code ? `${document.code} • ` : ""}
                      {document.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                disabled={!documentCode.trim() || lookupLoading || !selectedLibraryId}
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
                {foundDocument.code ? (
                  <Badge className="rounded-full border-slate-200 bg-white text-slate-700">
                    {foundDocument.code}
                  </Badge>
                ) : null}
                <Badge className="rounded-full border-emerald-300 bg-white text-emerald-700">
                  {(foundDocument.status || "documento").replaceAll("_", " ")}
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
            <Label>Posição na home</Label>
            <Select
              value={modoExibicao}
              onValueChange={(value) =>
                setModoExibicao(value as PublicationDisplayMode)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {PUBLICATION_DISPLAY_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              {
                PUBLICATION_DISPLAY_MODE_OPTIONS.find(
                  (option) => option.value === modoExibicao,
                )?.description
              }
            </p>
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
