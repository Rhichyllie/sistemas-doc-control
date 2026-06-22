export const docStatusLabels: Record<string, string> = {
  in_analysis: "Em Análise",
  awaiting_revision: "Aguardando Revisão",
  approved: "Aprovado",
  approved_with_comments: "Aprovado com Comentários",
  rejected: "Reprovado",
  cancelled: "Cancelado",
};

export const docStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  received: "secondary",
  in_analysis: "default",
  awaiting_revision: "outline",
  approved: "default",
  approved_with_comments: "secondary",
  rejected: "destructive",
  cancelled: "outline",
};

export const projectStatusLabels: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const originLabels: Record<string, string> = {
  supplier: "Fornecedor",
  client: "Cliente",
  internal: "Engenharia Interna",
  projetista: "Projetista",
};

export const roleLabels: Record<string, string> = {
  admin: "Administrador",
  document_controller: "Document Controller",
  coordinator: "Coordenador de Engenharia",
  analyzer: "Engenheiro Analisador",
  supplier: "Fornecedor / Projetista",
  client: "Cliente",
};

export const docStatuses = Object.keys(docStatusLabels);
export const projectStatuses = Object.keys(projectStatusLabels);
export const origins = Object.keys(originLabels);
export const roles = Object.keys(roleLabels);
