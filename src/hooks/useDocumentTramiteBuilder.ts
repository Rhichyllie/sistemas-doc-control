import { useCallback, useMemo, useRef, useState } from "react";
import {
  createEmptyTramiteGraph,
  createTramiteEdge,
  createTramiteNode,
  type DocumentTramiteEdge,
  type DocumentTramiteEdgeCondition,
  type DocumentTramiteGraph,
  type DocumentTramiteNode,
  type DocumentTramiteNodeType,
} from "@/lib/documentTramiteModel";
import { validateTramiteGraph } from "@/lib/documentTramiteValidation";

const HISTORY_LIMIT = 40;

function cloneGraph(graph: DocumentTramiteGraph): DocumentTramiteGraph {
  return structuredClone(graph);
}

export function useDocumentTramiteBuilder(
  initialGraph: DocumentTramiteGraph = createEmptyTramiteGraph(),
) {
  const [graph, setGraphState] = useState(() => cloneGraph(initialGraph));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const past = useRef<DocumentTramiteGraph[]>([]);
  const future = useRef<DocumentTramiteGraph[]>([]);

  const commit = useCallback(
    (
      next:
        | DocumentTramiteGraph
        | ((current: DocumentTramiteGraph) => DocumentTramiteGraph),
    ) => {
      setGraphState((current) => {
        const resolved =
          typeof next === "function" ? next(cloneGraph(current)) : next;
        past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), current];
        future.current = [];
        return cloneGraph(resolved);
      });
      setIsDirty(true);
    },
    [],
  );

  const replaceGraph = useCallback(
    (nextGraph: DocumentTramiteGraph, clean = false) => {
      setGraphState(cloneGraph(nextGraph));
      past.current = [];
      future.current = [];
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setIsDirty(!clean);
    },
    [],
  );

  const addNode = useCallback(
    (type: DocumentTramiteNodeType, position?: { x: number; y: number }) => {
      const node = createTramiteNode(
        type,
        position ?? {
          x: 120 + (graph.nodes.length % 4) * 230,
          y: 100 + Math.floor(graph.nodes.length / 4) * 180,
        },
      );
      commit((current) => ({
        ...current,
        nodes: [...current.nodes, node],
      }));
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      return node;
    },
    [commit, graph.nodes.length],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      commit((current) => ({
        nodes: current.nodes.filter((node) => node.id !== nodeId),
        edges: current.edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId,
        ),
      }));
      setSelectedNodeId((current) => (current === nodeId ? null : current));
    },
    [commit],
  );

  const updateNode = useCallback(
    (nodeId: string, updates: Partial<DocumentTramiteNode>) => {
      commit((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId ? { ...node, ...updates } : node,
        ),
      }));
    },
    [commit],
  );

  const connectNodes = useCallback(
    (
      source: string,
      target: string,
      condition: DocumentTramiteEdgeCondition = "always",
    ) => {
      if (!source || !target || source === target) return null;
      const edge = createTramiteEdge(source, target, condition);
      commit((current) => {
        if (
          current.edges.some(
            (item) => item.source === source && item.target === target,
          )
        ) {
          return current;
        }
        return { ...current, edges: [...current.edges, edge] };
      });
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
      return edge;
    },
    [commit],
  );

  const removeEdge = useCallback(
    (edgeId: string) => {
      commit((current) => ({
        ...current,
        edges: current.edges.filter((edge) => edge.id !== edgeId),
      }));
      setSelectedEdgeId((current) => (current === edgeId ? null : current));
    },
    [commit],
  );

  const updateEdge = useCallback(
    (edgeId: string, updates: Partial<DocumentTramiteEdge>) => {
      commit((current) => ({
        ...current,
        edges: current.edges.map((edge) =>
          edge.id === edgeId ? { ...edge, ...updates } : edge,
        ),
      }));
    },
    [commit],
  );

  const updateNodePositions = useCallback(
    (positions: Array<{ id: string; position: { x: number; y: number } }>) => {
      if (!positions.length) return;
      const map = new Map(positions.map((item) => [item.id, item.position]));
      commit((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          const position = map.get(node.id);
          return position ? { ...node, position } : node;
        }),
      }));
    },
    [commit],
  );

  const autoLayout = useCallback(() => {
    const start = graph.nodes.find((node) => node.node_type === "start");
    const levels = new Map<string, number>();
    if (start) levels.set(start.id, 0);
    for (let pass = 0; pass < graph.nodes.length; pass += 1) {
      graph.edges.forEach((edge) => {
        const sourceLevel = levels.get(edge.source);
        if (sourceLevel === undefined) return;
        levels.set(
          edge.target,
          Math.max(levels.get(edge.target) ?? 0, sourceLevel + 1),
        );
      });
    }
    const byLevel = new Map<number, string[]>();
    graph.nodes.forEach((node, index) => {
      const level = levels.get(node.id) ?? index;
      byLevel.set(level, [...(byLevel.get(level) ?? []), node.id]);
    });
    commit((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const level = levels.get(node.id) ?? 0;
        const row = (byLevel.get(level) ?? []).indexOf(node.id);
        return {
          ...node,
          position: { x: 80 + level * 250, y: 80 + row * 180 },
        };
      }),
    }));
  }, [commit, graph]);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    setGraphState((current) => {
      future.current = [current, ...future.current].slice(0, HISTORY_LIMIT);
      return cloneGraph(previous);
    });
    setIsDirty(true);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.shift();
    if (!next) return;
    setGraphState((current) => {
      past.current = [...past.current, current].slice(-HISTORY_LIMIT);
      return cloneGraph(next);
    });
    setIsDirty(true);
  }, []);

  const validation = useMemo(() => validateTramiteGraph(graph), [graph]);
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge =
    graph.edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  return {
    graph,
    validation,
    selectedNode,
    selectedEdge,
    selectedNodeId,
    selectedEdgeId,
    isDirty,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    setSelectedNodeId: (id: string | null) => {
      setSelectedNodeId(id);
      if (id) setSelectedEdgeId(null);
    },
    setSelectedEdgeId: (id: string | null) => {
      setSelectedEdgeId(id);
      if (id) setSelectedNodeId(null);
    },
    addNode,
    removeNode,
    updateNode,
    connectNodes,
    removeEdge,
    updateEdge,
    updateNodePositions,
    replaceGraph,
    autoLayout,
    undo,
    redo,
    markClean: () => setIsDirty(false),
  };
}
