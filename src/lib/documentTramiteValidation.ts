import {
  getEdgeConditionLabel,
  type DocumentTramiteEdge,
  type DocumentTramiteGraph,
  type DocumentTramiteNode,
  type DocumentTramiteSimulationContext,
  type DocumentTramiteSimulationResult,
  type DocumentTramiteValidationIssue,
  type DocumentTramiteValidationResult,
} from "@/lib/documentTramiteModel";

export function findStartNode(graph: DocumentTramiteGraph) {
  return graph.nodes.find((node) => node.node_type === "start") ?? null;
}

export function findEndNodes(graph: DocumentTramiteGraph) {
  return graph.nodes.filter((node) => node.node_type === "end");
}

export function findOrphanNodes(graph: DocumentTramiteGraph) {
  const start = findStartNode(graph);
  const endIds = new Set(findEndNodes(graph).map((node) => node.id));
  if (!start || endIds.size === 0) return [...graph.nodes];

  const reachableFromStart = new Set<string>();
  const forwardQueue = [start.id];
  while (forwardQueue.length) {
    const current = forwardQueue.shift()!;
    if (reachableFromStart.has(current)) continue;
    reachableFromStart.add(current);
    graph.edges
      .filter((edge) => edge.source === current)
      .forEach((edge) => forwardQueue.push(edge.target));
  }

  const canReachEnd = new Set<string>();
  const reverseQueue = [...endIds];
  while (reverseQueue.length) {
    const current = reverseQueue.shift()!;
    if (canReachEnd.has(current)) continue;
    canReachEnd.add(current);
    graph.edges
      .filter((edge) => edge.target === current)
      .forEach((edge) => reverseQueue.push(edge.source));
  }

  return graph.nodes.filter(
    (node) => !reachableFromStart.has(node.id) || !canReachEnd.has(node.id),
  );
}

export function detectCycles(graph: DocumentTramiteGraph) {
  const adjacency = new Map<string, string[]>();
  graph.edges.forEach((edge) => {
    adjacency.set(edge.source, [
      ...(adjacency.get(edge.source) ?? []),
      edge.target,
    ]);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();

  function visit(nodeId: string) {
    if (visiting.has(nodeId)) {
      cyclic.add(nodeId);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    (adjacency.get(nodeId) ?? []).forEach(visit);
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  graph.nodes.forEach((node) => visit(node.id));
  return [...cyclic];
}

export function hasPathFromStartToEnd(graph: DocumentTramiteGraph) {
  const start = findStartNode(graph);
  const endIds = new Set(findEndNodes(graph).map((node) => node.id));
  if (!start || endIds.size === 0) return false;
  const visited = new Set<string>();
  const queue = [start.id];
  while (queue.length) {
    const current = queue.shift()!;
    if (endIds.has(current)) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    graph.edges
      .filter((edge) => edge.source === current)
      .forEach((edge) => queue.push(edge.target));
  }
  return false;
}

function issue(
  code: string,
  message: string,
  severity: "error" | "warning",
  reference: { nodeId?: string; edgeId?: string } = {},
): DocumentTramiteValidationIssue {
  return { code, message, severity, ...reference };
}

function getMetadataAssigneeUserIds(node: DocumentTramiteNode) {
  const raw = node.metadata?.assignee_user_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string");
}

function hasActor(node: DocumentTramiteNode) {
  if (node.assignment_type === "approval_group") {
    return Boolean(node.assignee_group_id);
  }
  if (node.assignment_type === "specific_user") {
    return (
      Boolean(node.assignee_user_id) || getMetadataAssigneeUserIds(node).length > 0
    );
  }
  if (node.assignment_type === "role") return Boolean(node.required_role);
  return ["author", "document_owner"].includes(node.assignment_type);
}

function publicationHasGovernanceBefore(
  graph: DocumentTramiteGraph,
  publicationId: string,
) {
  const reverse = new Map<string, string[]>();
  graph.edges.forEach((edge) => {
    reverse.set(edge.target, [
      ...(reverse.get(edge.target) ?? []),
      edge.source,
    ]);
  });
  const visited = new Set<string>();
  const queue = [...(reverse.get(publicationId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = graph.nodes.find((candidate) => candidate.id === id);
    if (node && ["review", "approval"].includes(node.node_type)) return true;
    queue.push(...(reverse.get(id) ?? []));
  }
  return false;
}

export function validateTramiteGraph(
  graph: DocumentTramiteGraph,
): DocumentTramiteValidationResult {
  const errors: DocumentTramiteValidationIssue[] = [];
  const warnings: DocumentTramiteValidationIssue[] = [];
  const starts = graph.nodes.filter((node) => node.node_type === "start");
  const ends = findEndNodes(graph);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  if (starts.length !== 1) {
    errors.push(
      issue(
        "start_count",
        "O trâmite precisa ter exatamente uma etapa Início.",
        "error",
      ),
    );
  }
  if (ends.length === 0) {
    errors.push(
      issue("missing_end", "Adicione ao menos uma etapa Fim.", "error"),
    );
  }

  graph.nodes.forEach((node) => {
    if (!node.label.trim()) {
      errors.push(
        issue("empty_label", "Toda etapa precisa ter um nome.", "error", {
          nodeId: node.id,
        }),
      );
    }
    if (
      ["review", "approval", "evidence", "mandatory_reading"].includes(
        node.node_type,
      ) &&
      !hasActor(node)
    ) {
      errors.push(
        issue(
          "missing_actor",
          `Defina quem atua na etapa “${node.label}”.`,
          "error",
          { nodeId: node.id },
        ),
      );
    }
    if (
      node.node_type === "evidence" &&
      !node.required_evidence &&
      !node.required_file
    ) {
      errors.push(
        issue(
          "evidence_without_requirement",
          `A etapa “${node.label}” precisa exigir evidência ou arquivo.`,
          "error",
          { nodeId: node.id },
        ),
      );
    }
  });

  graph.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(
        issue(
          "missing_edge_node",
          "Uma conexão aponta para uma etapa que não existe.",
          "error",
          { edgeId: edge.id },
        ),
      );
    }
    if (edge.source === edge.target) {
      errors.push(
        issue(
          "self_edge",
          "Uma etapa não pode apontar diretamente para si mesma.",
          "error",
          { edgeId: edge.id },
        ),
      );
    }
  });

  starts.forEach((start) => {
    if (graph.edges.some((edge) => edge.target === start.id)) {
      errors.push(
        issue(
          "start_incoming",
          "A etapa Início não pode receber conexões.",
          "error",
          { nodeId: start.id },
        ),
      );
    }
  });
  ends.forEach((end) => {
    if (graph.edges.some((edge) => edge.source === end.id)) {
      errors.push(
        issue(
          "end_outgoing",
          "A etapa Fim não pode iniciar novas conexões.",
          "error",
          { nodeId: end.id },
        ),
      );
    }
  });

  findOrphanNodes(graph).forEach((node) => {
    errors.push(
      issue(
        "orphan_node",
        `A etapa “${node.label}” está sem caminho completo.`,
        "error",
        { nodeId: node.id },
      ),
    );
  });

  if (!hasPathFromStartToEnd(graph)) {
    errors.push(
      issue(
        "no_complete_path",
        "Não existe um caminho completo entre Início e Fim.",
        "error",
      ),
    );
  }

  graph.nodes
    .filter((node) => node.node_type === "publication")
    .forEach((publication) => {
      if (!publicationHasGovernanceBefore(graph, publication.id)) {
        warnings.push(
          issue(
            "publication_without_governance",
            "A publicação não possui revisão ou aprovação anterior.",
            "warning",
            { nodeId: publication.id },
          ),
        );
      }
    });

  const cyclicNodes = detectCycles(graph);
  cyclicNodes.forEach((nodeId) => {
    const outgoing = graph.edges.filter((edge) => edge.source === nodeId);
    if (outgoing.every((edge) => edge.condition_type === "always")) {
      warnings.push(
        issue(
          "cycle_without_exit",
          "Existe um ciclo sem condição explícita de saída.",
          "warning",
          { nodeId },
        ),
      );
    }
  });

  graph.nodes
    .filter((node) => node.node_type === "correction")
    .forEach((node) => {
      const hasReturn = graph.edges.some(
        (edge) =>
          edge.source === node.id &&
          graph.nodes.some(
            (target) =>
              target.id === edge.target &&
              ["draft", "review", "approval"].includes(target.node_type),
          ),
      );
      if (!hasReturn) {
        warnings.push(
          issue(
            "correction_without_return",
            `A etapa “${node.label}” não retorna para elaboração, revisão ou aprovação.`,
            "warning",
            { nodeId: node.id },
          ),
        );
      }
    });

  const isValid = errors.length === 0;
  return {
    isValid,
    isPublishable: isValid,
    errors,
    warnings,
    summary: isValid
      ? warnings.length
        ? `Trâmite válido com ${warnings.length} aviso(s).`
        : "Trâmite pronto para publicar."
      : `${errors.length} correção(ões) necessária(s) antes de publicar.`,
  };
}

function selectSimulationEdge(
  edges: DocumentTramiteEdge[],
  context: DocumentTramiteSimulationContext,
) {
  const matching = edges.filter((edge) => {
    if (edge.condition_type === "always") return true;
    if (edge.condition_type === "approved") {
      return context.approvalDecision === "approved";
    }
    if (
      edge.condition_type === "rejected" ||
      edge.condition_type === "needs_correction"
    ) {
      return context.approvalDecision === "rejected";
    }
    if (edge.condition_type === "evidence_missing") {
      return !context.hasEvidence;
    }
    return false;
  });
  return matching.sort(
    (left, right) =>
      left.priority - right.priority ||
      Number(left.condition_type === "always") -
        Number(right.condition_type === "always"),
  )[0];
}

function responsibleLabel(node: DocumentTramiteNode) {
  if (node.assignment_type === "author") return "Autor do documento";
  if (node.assignment_type === "document_owner") return "Dono do documento";
  if (node.assignment_type === "specific_user") {
    const count = getMetadataAssigneeUserIds(node).length;
    return count > 1 ? `${count} analistas` : "Usuário específico";
  }
  if (node.assignment_type === "approval_group") return "Grupo de aprovação";
  if (node.assignment_type === "role") {
    return `Papel: ${node.required_role || "não definido"}`;
  }
  return "Sem responsável";
}

export function simulateTramitePath(
  graph: DocumentTramiteGraph,
  context: DocumentTramiteSimulationContext,
): DocumentTramiteSimulationResult {
  const validation = validateTramiteGraph(graph);
  const start = findStartNode(graph);
  if (!start) {
    return {
      completed: false,
      path: [],
      blockers: ["O trâmite não possui etapa Início."],
      tasks: [],
      warnings: validation.warnings.map((item) => item.message),
    };
  }

  const path: DocumentTramiteSimulationResult["path"] = [];
  const blockers: string[] = [];
  const tasks: string[] = [];
  const visits = new Map<string, number>();
  let current: DocumentTramiteNode | undefined = start;

  while (current && path.length < Math.max(graph.nodes.length * 3, 10)) {
    path.push({
      nodeId: current.id,
      label: current.label,
      nodeType: current.node_type,
      responsible: responsibleLabel(current),
      dueDays: current.due_days,
    });
    if (!["start", "end", "decision"].includes(current.node_type)) {
      tasks.push(
        `${current.label} — ${responsibleLabel(current)}${
          current.due_days !== null ? ` em até ${current.due_days} dia(s)` : ""
        }`,
      );
    }
    if (current.required_file && !context.hasFile) {
      blockers.push(`A etapa “${current.label}” exige arquivo.`);
    }
    if (current.required_evidence && !context.hasEvidence) {
      blockers.push(`A etapa “${current.label}” exige evidência.`);
    }
    if (current.node_type === "end") break;

    visits.set(current.id, (visits.get(current.id) ?? 0) + 1);
    if ((visits.get(current.id) ?? 0) > 2) {
      blockers.push(`A simulação entrou em ciclo na etapa “${current.label}”.`);
      break;
    }
    const nextEdge = selectSimulationEdge(
      graph.edges.filter((edge) => edge.source === current?.id),
      context,
    );
    if (!nextEdge) {
      blockers.push(
        `Nenhuma saída aplicável foi encontrada após “${current.label}”.`,
      );
      break;
    }
    current = graph.nodes.find((node) => node.id === nextEdge.target);
    if (!current) {
      blockers.push(
        `A conexão “${getEdgeConditionLabel(nextEdge.condition_type)}” aponta para uma etapa ausente.`,
      );
    }
  }

  return {
    completed: path.at(-1)?.nodeType === "end" && blockers.length === 0,
    path,
    blockers: [...new Set(blockers)],
    tasks,
    warnings: validation.warnings.map((item) => item.message),
  };
}
