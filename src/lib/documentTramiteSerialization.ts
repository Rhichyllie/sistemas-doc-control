import {
  createEmptyTramiteGraph,
  createTramiteEdge,
  createTramiteNode,
  type DocumentTramiteEdgeCondition,
  type DocumentTramiteEdge,
  type DocumentTramiteGraph,
  type DocumentTramiteNode,
  type DocumentTramiteNodeType,
} from "@/lib/documentTramiteModel";

const NODE_TYPES = new Set<DocumentTramiteNodeType>([
  "start",
  "draft",
  "review",
  "approval",
  "correction",
  "evidence",
  "mandatory_reading",
  "publication",
  "decision",
  "end",
  "custom",
]);

const EDGE_CONDITIONS = new Set<DocumentTramiteEdgeCondition>([
  "always",
  "approved",
  "rejected",
  "needs_correction",
  "expired",
  "evidence_missing",
  "custom",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function serializeTramiteGraph(graph: DocumentTramiteGraph) {
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      metadata: record(node.metadata) ?? {},
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      metadata: record(edge.metadata) ?? {},
    })),
  };
}

export function deserializeTramiteGraph(
  payload: unknown,
): DocumentTramiteGraph {
  const source = record(payload);
  if (!source || !Array.isArray(source.nodes) || !Array.isArray(source.edges)) {
    return createEmptyTramiteGraph();
  }

  const nodes = source.nodes.flatMap((item, index) => {
    const node = record(item);
    if (!node || typeof node.id !== "string") return [];
    const type =
      typeof node.node_type === "string" &&
      NODE_TYPES.has(node.node_type as DocumentTramiteNodeType)
        ? (node.node_type as DocumentTramiteNodeType)
        : "custom";
    const position = record(node.position);
    return [
      createTramiteNode(
        type,
        {
          x: Number(position?.x) || index * 220,
          y: Number(position?.y) || 120,
        },
        {
          ...(node as unknown as Partial<DocumentTramiteNode>),
          id: node.id,
          node_key: typeof node.node_key === "string" ? node.node_key : node.id,
          label: typeof node.label === "string" ? node.label : "Etapa sem nome",
          description:
            typeof node.description === "string" ? node.description : "",
          metadata: record(node.metadata) ?? {},
        },
      ),
    ];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = source.edges.flatMap((item) => {
    const edge = record(item);
    if (
      !edge ||
      typeof edge.id !== "string" ||
      typeof edge.source !== "string" ||
      typeof edge.target !== "string"
    ) {
      return [];
    }
    const condition =
      typeof edge.condition_type === "string" &&
      EDGE_CONDITIONS.has(edge.condition_type as DocumentTramiteEdgeCondition)
        ? (edge.condition_type as DocumentTramiteEdgeCondition)
        : "always";
    return [
      createTramiteEdge(edge.source, edge.target, condition, {
        ...(edge as unknown as Partial<DocumentTramiteEdge>),
        id: edge.id,
        edge_key: typeof edge.edge_key === "string" ? edge.edge_key : edge.id,
        label: typeof edge.label === "string" ? edge.label : "",
        metadata: record(edge.metadata) ?? {},
      }),
    ];
  });

  return {
    nodes,
    edges: edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    ),
  };
}

export function exportTramiteGraphJson(graph: DocumentTramiteGraph) {
  return JSON.stringify(serializeTramiteGraph(graph), null, 2);
}

export function importTramiteGraphJson(value: string) {
  return deserializeTramiteGraph(JSON.parse(value) as unknown);
}
