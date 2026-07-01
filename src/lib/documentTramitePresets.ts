import {
  createTramiteEdge,
  createTramiteNode,
  type DocumentTramiteEdgeCondition,
  type DocumentTramiteGraph,
  type DocumentTramiteNodeType,
  type DocumentTramitePreset,
} from "@/lib/documentTramiteModel";

interface PresetStep {
  key: string;
  type: DocumentTramiteNodeType;
  label?: string;
  x: number;
  y: number;
}

interface PresetConnection {
  source: string;
  target: string;
  condition?: DocumentTramiteEdgeCondition;
}

function graph(
  steps: PresetStep[],
  connections: PresetConnection[],
): DocumentTramiteGraph {
  const nodes = steps.map((step) =>
    createTramiteNode(
      step.type,
      { x: step.x, y: step.y },
      {
        id: step.key,
        node_key: step.key,
        label: step.label,
      },
    ),
  );
  return {
    nodes,
    edges: connections.map((connection, index) =>
      createTramiteEdge(
        connection.source,
        connection.target,
        connection.condition,
        {
          id: `edge-${index + 1}`,
          edge_key: `edge-${index + 1}`,
        },
      ),
    ),
  };
}

export const DOCUMENT_TRAMITE_PRESETS: DocumentTramitePreset[] = [
  {
    id: "simple-approval",
    name: "Aprovação simples",
    description: "Elaboração, aprovação e publicação em caminho direto.",
    graph: graph(
      [
        { key: "start", type: "start", x: 0, y: 160 },
        { key: "draft", type: "draft", x: 220, y: 160 },
        { key: "approval", type: "approval", x: 440, y: 160 },
        { key: "publication", type: "publication", x: 660, y: 160 },
        { key: "end", type: "end", x: 880, y: 160 },
      ],
      [
        { source: "start", target: "draft" },
        { source: "draft", target: "approval" },
        { source: "approval", target: "publication", condition: "approved" },
        { source: "publication", target: "end" },
      ],
    ),
  },
  {
    id: "technical-review",
    name: "Revisão técnica",
    description: "Revisão com retorno para correção ou avanço para aprovação.",
    graph: graph(
      [
        { key: "start", type: "start", x: 0, y: 180 },
        { key: "draft", type: "draft", x: 200, y: 180 },
        { key: "review", type: "review", x: 400, y: 180 },
        { key: "correction", type: "correction", x: 400, y: 360 },
        { key: "approval", type: "approval", x: 620, y: 180 },
        { key: "publication", type: "publication", x: 840, y: 180 },
        { key: "end", type: "end", x: 1060, y: 180 },
      ],
      [
        { source: "start", target: "draft" },
        { source: "draft", target: "review" },
        { source: "review", target: "approval", condition: "approved" },
        { source: "review", target: "correction", condition: "rejected" },
        {
          source: "correction",
          target: "review",
          condition: "needs_correction",
        },
        { source: "approval", target: "publication", condition: "approved" },
        { source: "approval", target: "correction", condition: "rejected" },
        { source: "publication", target: "end" },
      ],
    ),
  },
  {
    id: "evidence",
    name: "Documento com evidência",
    description: "Exige evidência antes da validação e aprovação.",
    graph: graph(
      [
        { key: "start", type: "start", x: 0, y: 160 },
        { key: "draft", type: "draft", x: 200, y: 160 },
        { key: "evidence", type: "evidence", x: 400, y: 160 },
        {
          key: "review",
          type: "review",
          label: "Validar evidência",
          x: 600,
          y: 160,
        },
        { key: "approval", type: "approval", x: 800, y: 160 },
        { key: "publication", type: "publication", x: 1000, y: 160 },
        { key: "end", type: "end", x: 1200, y: 160 },
      ],
      [
        { source: "start", target: "draft" },
        { source: "draft", target: "evidence" },
        { source: "evidence", target: "review" },
        { source: "review", target: "approval" },
        { source: "approval", target: "publication", condition: "approved" },
        { source: "publication", target: "end" },
      ],
    ),
  },
  {
    id: "mandatory-reading",
    name: "Ciência obrigatória",
    description: "Publicação seguida de confirmação de ciência.",
    graph: graph(
      [
        { key: "start", type: "start", x: 0, y: 160 },
        { key: "publication", type: "publication", x: 240, y: 160 },
        {
          key: "reading",
          type: "mandatory_reading",
          x: 480,
          y: 160,
        },
        { key: "end", type: "end", x: 720, y: 160 },
      ],
      [
        { source: "start", target: "publication" },
        { source: "publication", target: "reading" },
        { source: "reading", target: "end" },
      ],
    ),
  },
  {
    id: "complete",
    name: "Trâmite completo",
    description:
      "Revisão, aprovação, correção, publicação e ciência obrigatória.",
    graph: graph(
      [
        { key: "start", type: "start", x: 0, y: 180 },
        { key: "draft", type: "draft", x: 180, y: 180 },
        { key: "review", type: "review", x: 360, y: 180 },
        {
          key: "approval",
          type: "approval",
          label: "Aprovação do gestor",
          x: 560,
          y: 180,
        },
        { key: "correction", type: "correction", x: 460, y: 380 },
        { key: "publication", type: "publication", x: 760, y: 180 },
        {
          key: "reading",
          type: "mandatory_reading",
          x: 960,
          y: 180,
        },
        { key: "end", type: "end", x: 1160, y: 180 },
      ],
      [
        { source: "start", target: "draft" },
        { source: "draft", target: "review" },
        { source: "review", target: "approval", condition: "approved" },
        { source: "review", target: "correction", condition: "rejected" },
        { source: "approval", target: "publication", condition: "approved" },
        { source: "approval", target: "correction", condition: "rejected" },
        {
          source: "correction",
          target: "review",
          condition: "needs_correction",
        },
        { source: "publication", target: "reading" },
        { source: "reading", target: "end" },
      ],
    ),
  },
  {
    id: "future-dossier",
    name: "Dossiê/obra futuro",
    description:
      "Preset de modelagem para documentos de projeto e evidências. Não executa dossiê.",
    graph: graph(
      [
        { key: "start", type: "start", x: 0, y: 160 },
        {
          key: "project-document",
          type: "draft",
          label: "Documento de projeto",
          x: 200,
          y: 160,
        },
        { key: "evidence", type: "evidence", x: 400, y: 160 },
        {
          key: "engineering",
          type: "approval",
          label: "Aprovação engenharia",
          x: 600,
          y: 160,
        },
        {
          key: "quality",
          type: "approval",
          label: "Aprovação qualidade",
          x: 800,
          y: 160,
        },
        { key: "publication", type: "publication", x: 1000, y: 160 },
        { key: "end", type: "end", x: 1200, y: 160 },
      ],
      [
        { source: "start", target: "project-document" },
        { source: "project-document", target: "evidence" },
        { source: "evidence", target: "engineering" },
        { source: "engineering", target: "quality", condition: "approved" },
        { source: "quality", target: "publication", condition: "approved" },
        { source: "publication", target: "end" },
      ],
    ),
  },
];

export function getDocumentTramitePreset(id: string) {
  return DOCUMENT_TRAMITE_PRESETS.find((preset) => preset.id === id) ?? null;
}
