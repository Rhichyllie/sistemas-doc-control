export const DOC_TYPES = [
  { value: 'PRO', label: 'Procedimento Operacional (POP/PO)' },
  { value: 'IT',  label: 'Instrução de Trabalho (IT)' },
  { value: 'ET',  label: 'Especificação Técnica (ET)' },
  { value: 'DRW', label: 'Desenho de Engenharia' },
  { value: 'RNC', label: 'Relatório de Não Conformidade (RNC)' },
  { value: 'PLN', label: 'Plano (Ação, Emergência, Qualidade)' },
  { value: 'REG', label: 'Registro (Treinamento, Inspeção)' },
  { value: 'MAN', label: 'Manual' },
] as const

export const DOC_STATUS = [
  { value: 'draft',      label: 'Rascunho',    color: '#475569' },
  { value: 'in_review',  label: 'Em Revisão',  color: '#4A90D9' },
  { value: 'pending_approval', label: 'Aprovação', color: '#F5A623' },
  { value: 'published',  label: 'Publicado',   color: '#00C271' },
  { value: 'obsolete',   label: 'Obsoleto',    color: '#F05454' },
] as const

export const USER_ROLES = [
  { value: 'admin',     label: 'Administrador' },
  { value: 'manager',   label: 'Gestor de Documentos' },
  { value: 'approver',  label: 'Aprovador' },
  { value: 'reviewer',  label: 'Revisor Técnico' },
  { value: 'author',    label: 'Elaborador' },
  { value: 'viewer',    label: 'Visualizador' },
] as const

export const SECTORS = [
  { value: 'oil_gas',    label: 'Petróleo & Gás',           prefix: 'PB' },
  { value: 'mining',     label: 'Mineração',                prefix: 'VL' },
  { value: 'civil',      label: 'Construção Pesada',        prefix: 'CV' },
  { value: 'chemical',   label: 'Química & Farmacêutica',   prefix: 'QF' },
  { value: 'energy',     label: 'Energia & Infraestrutura', prefix: 'EN' },
  { value: 'industrial', label: 'Manufatura Industrial',    prefix: 'IN' },
] as const

export const REVIEW_ALERT_DAYS = [30, 15, 7] as const
