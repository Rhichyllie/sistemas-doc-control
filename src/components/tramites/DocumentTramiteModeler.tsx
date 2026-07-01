import { useEffect, useRef, useState } from "react";
import { ArrowLeft, GitBranch, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DocumentTramiteCanvas } from "@/components/tramites/DocumentTramiteCanvas";
import { DocumentTramiteEdgeInspector } from "@/components/tramites/DocumentTramiteEdgeInspector";
import { DocumentTramiteInspector } from "@/components/tramites/DocumentTramiteInspector";
import { DocumentTramitePalette } from "@/components/tramites/DocumentTramitePalette";
import { DocumentTramitePublishDialog } from "@/components/tramites/DocumentTramitePublishDialog";
import { DocumentTramiteSimulationPanel } from "@/components/tramites/DocumentTramiteSimulationPanel";
import { DocumentTramiteToolbar } from "@/components/tramites/DocumentTramiteToolbar";
import { DocumentTramiteValidationPanel } from "@/components/tramites/DocumentTramiteValidationPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDocumentTramiteBuilder } from "@/hooks/useDocumentTramiteBuilder";
import { useDocumentTramiteSimulation } from "@/hooks/useDocumentTramiteSimulation";
import type { useDocumentTramiteTemplates } from "@/hooks/useDocumentTramiteTemplates";
import { useWorkflowActors, WORKFLOW_ROLES } from "@/hooks/useWorkflowActors";
import {
  createEmptyTramiteGraph,
  summarizeTramiteGraph,
  type DocumentTramiteTemplate,
} from "@/lib/documentTramiteModel";
import {
  exportTramiteGraphJson,
  importTramiteGraphJson,
} from "@/lib/documentTramiteSerialization";

type TramiteCatalog = ReturnType<typeof useDocumentTramiteTemplates>;

export function DocumentTramiteModeler({
  template,
  catalog,
  onBack,
}: {
  template: DocumentTramiteTemplate;
  catalog: TramiteCatalog;
  onBack: () => void;
}) {
  const actors = useWorkflowActors();
  const builder = useDocumentTramiteBuilder(
    template.current_version?.graph ?? createEmptyTramiteGraph(),
  );
  const simulation = useDocumentTramiteSimulation(builder.graph);
  const [publishOpen, setPublishOpen] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    builder.replaceGraph(
      template.current_version?.graph ?? createEmptyTramiteGraph(),
      true,
    );
    // The template/version identity is the synchronization boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id, template.current_version?.id]);

  const summary = summarizeTramiteGraph(builder.graph);

  async function save() {
    const success = await catalog.saveGraph(template.id, builder.graph);
    if (success) {
      builder.markClean();
      toast.success("Rascunho do trâmite salvo.");
    } else {
      toast.error(catalog.error || "Não foi possível salvar o trâmite.");
    }
    return success;
  }

  async function publish() {
    if (builder.isDirty && !(await save())) return;
    const success = await catalog.publishTemplate(template.id);
    if (success) {
      setPublishOpen(false);
      builder.markClean();
      toast.success("Modelo de trâmite publicado.");
    } else {
      toast.error(catalog.error || "Não foi possível publicar o trâmite.");
    }
  }

  function exportGraph() {
    const blob = new Blob([exportTramiteGraphJson(builder.graph)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${template.code.toLowerCase()}-v${
      template.current_version?.version_number ?? 1
    }.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importGraph(file: File) {
    try {
      const nextGraph = importTramiteGraphJson(await file.text());
      builder.replaceGraph(nextGraph);
      toast.success("Grafo importado para o rascunho local.");
    } catch {
      toast.error("Arquivo inválido. Use um JSON exportado pelo modelador.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  const dialogTemplate: DocumentTramiteTemplate = {
    ...template,
    current_version: template.current_version
      ? { ...template.current_version, graph: builder.graph }
      : null,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Button
            type="button"
            variant="ghost"
            className="-ml-3"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar aos modelos
          </Button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <GitBranch className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {template.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {template.code} · versão{" "}
                {template.current_version?.version_number ?? 1}
              </p>
            </div>
            <Badge variant="outline">
              {template.current_version?.status === "published"
                ? "Publicado"
                : "Rascunho"}
            </Badge>
            {builder.isDirty && (
              <Badge variant="secondary">Alterações locais</Badge>
            )}
          </div>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Cada etapa define quem age, qual prazo existe, quais evidências são
            exigidas e o que acontece depois.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{summary.nodesCount} etapas</Badge>
          <Badge variant="outline">{summary.edgesCount} conexões</Badge>
          <Badge variant="outline">
            {summary.estimatedDays} dia(s) estimados
          </Badge>
        </div>
      </div>

      <DocumentTramiteToolbar
        isSaving={catalog.isSaving}
        isDirty={builder.isDirty}
        canUndo={builder.canUndo}
        canRedo={builder.canRedo}
        canPublish={builder.validation.isPublishable}
        onSave={() => void save()}
        onValidate={() =>
          toast[builder.validation.isPublishable ? "success" : "warning"](
            builder.validation.summary,
          )
        }
        onSimulate={() => {
          setShowSimulation(true);
          simulation.simulate();
        }}
        onPublish={() => setPublishOpen(true)}
        onAutoLayout={builder.autoLayout}
        onUndo={builder.undo}
        onRedo={builder.redo}
        onExport={exportGraph}
        onImport={() => importRef.current?.click()}
      />
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importGraph(file);
        }}
      />

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        <DocumentTramitePalette onAdd={builder.addNode} />
        <DocumentTramiteCanvas
          graph={builder.graph}
          validation={builder.validation}
          selectedNodeId={builder.selectedNodeId}
          selectedEdgeId={builder.selectedEdgeId}
          onSelectNode={builder.setSelectedNodeId}
          onSelectEdge={builder.setSelectedEdgeId}
          onConnect={(source, target) =>
            void builder.connectNodes(source, target)
          }
          onPositionChange={builder.updateNodePositions}
        />
        {builder.selectedEdge ? (
          <DocumentTramiteEdgeInspector
            edge={builder.selectedEdge}
            onChange={(updates) =>
              builder.updateEdge(builder.selectedEdge!.id, updates)
            }
            onRemove={() => builder.removeEdge(builder.selectedEdge!.id)}
          />
        ) : (
          <DocumentTramiteInspector
            node={builder.selectedNode}
            users={actors.users}
            groups={actors.groups}
            roles={WORKFLOW_ROLES}
            canUseGroups={actors.canUseGroups}
            onChange={(updates) =>
              builder.updateNode(builder.selectedNode!.id, updates)
            }
            onRemove={() => builder.removeNode(builder.selectedNode!.id)}
          />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DocumentTramiteValidationPanel
          validation={builder.validation}
          onFocusNode={builder.setSelectedNodeId}
        />
        {showSimulation ? (
          <DocumentTramiteSimulationPanel simulation={simulation} />
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/15 p-6 text-center">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <p className="mt-3 font-medium">Simule antes de publicar</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Teste aprovação, rejeição, arquivos e evidências sem criar tarefas
              ou alterar documentos.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => {
                setShowSimulation(true);
                simulation.simulate();
              }}
            >
              Abrir simulação
            </Button>
          </div>
        )}
      </div>

      <DocumentTramitePublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        template={dialogTemplate}
        validation={builder.validation}
        isPublishing={catalog.isSaving}
        onConfirm={() => void publish()}
      />
    </div>
  );
}
