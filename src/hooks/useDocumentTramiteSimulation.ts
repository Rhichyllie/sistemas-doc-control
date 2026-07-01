import { useMemo, useState } from "react";
import type {
  DocumentTramiteGraph,
  DocumentTramiteSimulationContext,
} from "@/lib/documentTramiteModel";
import { simulateTramitePath } from "@/lib/documentTramiteValidation";

const DEFAULT_CONTEXT: DocumentTramiteSimulationContext = {
  docType: "PRO",
  area: "ENG",
  projectId: null,
  hasFile: true,
  hasEvidence: true,
  approvalDecision: "approved",
};

export function useDocumentTramiteSimulation(graph: DocumentTramiteGraph) {
  const [context, setContext] =
    useState<DocumentTramiteSimulationContext>(DEFAULT_CONTEXT);
  const [hasSimulated, setHasSimulated] = useState(false);
  const result = useMemo(
    () => (hasSimulated ? simulateTramitePath(graph, context) : null),
    [context, graph, hasSimulated],
  );

  return {
    context,
    setContext: (updates: Partial<DocumentTramiteSimulationContext>) =>
      setContext((current) => ({ ...current, ...updates })),
    result,
    hasSimulated,
    simulate: () => setHasSimulated(true),
    reset: () => {
      setContext(DEFAULT_CONTEXT);
      setHasSimulated(false);
    },
  };
}
