import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  DocumentTramiteNode,
  type TramiteFlowNode,
} from "@/components/tramites/DocumentTramiteNode";
import {
  getEdgeConditionLabel,
  type DocumentTramiteGraph,
  type DocumentTramiteValidationResult,
} from "@/lib/documentTramiteModel";

interface DocumentTramiteCanvasProps {
  graph: DocumentTramiteGraph;
  validation: DocumentTramiteValidationResult;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onConnect: (source: string, target: string) => void;
  onPositionChange: (
    positions: Array<{ id: string; position: { x: number; y: number } }>,
  ) => void;
}

const nodeTypes = { tramite: DocumentTramiteNode };

function FlowCanvas({
  graph,
  validation,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onConnect,
  onPositionChange,
}: DocumentTramiteCanvasProps) {
  const invalidNodes = useMemo(
    () =>
      new Set(
        validation.errors
          .map((issue) => issue.nodeId)
          .filter((id): id is string => Boolean(id)),
      ),
    [validation.errors],
  );
  const warningNodes = useMemo(
    () =>
      new Set(
        validation.warnings
          .map((issue) => issue.nodeId)
          .filter((id): id is string => Boolean(id)),
      ),
    [validation.warnings],
  );
  const nodes = useMemo<TramiteFlowNode[]>(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: "tramite",
        position: node.position,
        selected: node.id === selectedNodeId,
        data: {
          tramite: node,
          invalid: invalidNodes.has(node.id),
          warning: warningNodes.has(node.id),
        },
      })),
    [graph.nodes, invalidNodes, selectedNodeId, warningNodes],
  );
  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep", 
        label:
          edge.label ||
          (edge.condition_type === "always"
            ? undefined
            : getEdgeConditionLabel(edge.condition_type)),
        selected: edge.id === selectedEdgeId,
        animated: edge.condition_type !== "always",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          strokeWidth: edge.id === selectedEdgeId ? 3 : 2,
        },
      })),
    [graph.edges, selectedEdgeId],
  );
  const [flowNodes, setFlowNodes, onNodesChange] =
    useNodesState<TramiteFlowNode>(nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(edges);
  const { fitView } = useReactFlow();
  const lastGraphSig = useRef<string>("");

  useEffect(() => {
    setFlowNodes(nodes);
  }, [nodes, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(edges);
  }, [edges, setFlowEdges]);

  useEffect(() => {
    const sig = `${graph.nodes.length}:${graph.edges.length}:${graph.nodes
      .map((n) => `${n.id}@${n.position.x},${n.position.y}`)
      .join("|")}`;
    if (lastGraphSig.current && lastGraphSig.current !== sig) {
      const timer = window.setTimeout(() => {
        fitView({ padding: 0.2, duration: 350, maxZoom: 1.2 });
      }, 80);
      return () => window.clearTimeout(timer);
    }
    lastGraphSig.current = sig;
  }, [graph.nodes, graph.edges, fitView]);

  const handleNodeClick: NodeMouseHandler<TramiteFlowNode> = (_, node) => {
    onSelectNode(node.id);
  };

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.25}
      maxZoom={1.8}
      onNodeClick={handleNodeClick}
      onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
      onPaneClick={() => {
        onSelectNode(null);
        onSelectEdge(null);
      }}
      onConnect={(connection: Connection) => {
        if (connection.source && connection.target) {
          onConnect(connection.source, connection.target);
        }
      }}
      onNodeDragStop={(_, node) =>
        onPositionChange([{ id: node.id, position: node.position }])
      }
      className="rounded-xl bg-background"
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={22} size={1} />
      <Controls position="bottom-left" />
      <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={3} />
    </ReactFlow>
  );
}

export function DocumentTramiteCanvas(props: DocumentTramiteCanvasProps) {
  return (
    <div className="h-[640px] min-h-[520px] overflow-hidden rounded-xl border bg-background shadow-inner">
      <ReactFlowProvider>
        <FlowCanvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
