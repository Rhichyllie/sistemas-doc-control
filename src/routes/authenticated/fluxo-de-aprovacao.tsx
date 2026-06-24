import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { requirePermission } from "./-route-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuthContext } from "@/contexts/AuthContext";
import { useApprovalFlow } from "@/hooks/useApprovalFlow";
import { QueueItem, useApprovalQueue } from "@/hooks/useApprovalQueue";
import { DOC_TYPES } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/fluxo-de-aprovacao")({
  beforeLoad: async ({ location }) => {
    await requirePermission(location.href, "document:review");
  },
  component: ApprovalFlowPage,
});

function getDocTypeLabel(docType: string) {
  return DOC_TYPES.find((item) => item.value === docType)?.label ?? docType;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ApprovalFlowPage() {
  const { profile } = useAuthContext();
  const { queue, loading, error, refetch } = useApprovalQueue();
  const { actOnStep, loading: actionLoading, error: actionError } = useApprovalFlow();
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const canSeeQueue = profile && !["viewer", "author"].includes(profile.role);

  function openActionDialog(item: QueueItem, nextAction: "approve" | "reject") {
    setSelectedItem(item);
    setAction(nextAction);
    setComment("");
    setValidationError(null);
  }

  async function handleConfirmAction() {
    if (!selectedItem || !action) return;

    if (action === "reject" && !comment.trim()) {
      setValidationError("Informe o motivo da rejeição.");
      return;
    }

    const success = await actOnStep({
      documentId: selectedItem.documentId,
      stepId: selectedItem.stepId,
      action,
      comment: comment.trim() || undefined,
    });

    if (success) {
      toast.success(action === "approve" ? "Documento aprovado" : "Documento rejeitado e retornado ao elaborador");
      setSelectedItem(null);
      setAction(null);
      setComment("");
      await refetch();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Fila de Aprovação</h1>
          <p className="text-muted-foreground">Documentos aguardando sua ação no workflow.</p>
        </div>
        <Badge variant="secondary">{queue.length} pendentes</Badge>
      </div>

      {!canSeeQueue ? (
        <Card>
          <CardHeader>
            <CardTitle>Você não tem permissão para aprovar documentos</CardTitle>
            <CardDescription>Usuários visualizadores e elaboradores não possuem itens de aprovação nesta fila.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Documentos pendentes</CardTitle>
            <CardDescription>Revise, aprove ou rejeite os documentos atribuídos ao seu papel.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-muted-foreground">Carregando fila de aprovação...</div>
            ) : error ? (
              <div className="p-6 text-destructive">{error}</div>
            ) : queue.length === 0 ? (
              <div className="p-6 text-muted-foreground">
                <div className="font-medium text-foreground">Nenhum documento aguardando sua ação</div>
                <p className="text-sm">Quando uma revisão técnica ou aprovação final chegar para o seu papel, ela aparecerá aqui.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead>Aguardando desde</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((item) => (
                    <TableRow key={item.stepId}>
                      <TableCell className="font-medium">{item.code ?? "Gerando..."}</TableCell>
                      <TableCell>
                        <Link className="font-medium hover:underline" to="/authenticated/documents/$documentId" params={{ documentId: item.documentId }}>
                          {item.title}
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant="outline">{getDocTypeLabel(item.doc_type)}</Badge></TableCell>
                      <TableCell>{item.area}</TableCell>
                      <TableCell>{item.step_label}</TableCell>
                      <TableCell>{item.author_name ?? "—"}</TableCell>
                      <TableCell>{formatDateTime(item.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => openActionDialog(item, "approve")}>Aprovar</Button>
                          <Button size="sm" variant="destructive" onClick={() => openActionDialog(item, "reject")}>Rejeitar</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedItem && !!action} onOpenChange={(open) => {
        if (!open) {
          setSelectedItem(null);
          setAction(null);
          setComment("");
          setValidationError(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "approve" ? "Aprovar documento" : "Rejeitar documento"}</DialogTitle>
            <DialogDescription>
              {selectedItem?.code ?? "Gerando..."} — {selectedItem?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setValidationError(null);
              }}
              placeholder={action === "approve" ? "Comentário opcional sobre a aprovação..." : "Informe o motivo da rejeição..."}
            />
            {(validationError || actionError) && <p className="text-sm text-destructive">{validationError ?? actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelectedItem(null)}>Cancelar</Button>
            <Button variant={action === "reject" ? "destructive" : "default"} disabled={actionLoading} onClick={handleConfirmAction}>
              {actionLoading ? "Processando..." : action === "approve" ? "Confirmar aprovação" : "Confirmar rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
