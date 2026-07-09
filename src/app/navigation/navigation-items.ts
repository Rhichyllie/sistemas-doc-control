import {
  Activity,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Code2,
  FileCheck2,
  FileStack,
  FolderKanban,
  GitBranch,
  House,
  Inbox,
  PanelsTopLeft,
  ScrollText,
  Settings,
  ShieldAlert,
  ScanText,
  Stethoscope,
  Users,
  UsersRound,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  managerOnly?: boolean;
  badge?: "activities" | "approval";
}

export const navigationItems: readonly NavigationItem[] = [
  { to: "/authenticated/dashboard", label: "Início", icon: House },
  { to: "/authenticated/documents", label: "Documentos", icon: FileStack },
  {
    to: "/authenticated/documentos/central",
    label: "Central Documental",
    icon: PanelsTopLeft,
  },
  { to: "/authenticated/projetos", label: "Projetos", icon: FolderKanban },
  {
    to: "/authenticated/atividades",
    label: "Minhas Atividades",
    icon: Inbox,
    badge: "activities",
  },
  { to: "/authenticated/notificacoes", label: "Notificações", icon: Bell },
  {
    to: "/authenticated/fluxo-de-aprovacao",
    label: "Fila de Aprovação",
    icon: GitBranch,
    badge: "approval",
  },
  {
    to: "/authenticated/grupos-aprovacao",
    label: "Grupos de Aprovação",
    icon: UsersRound,
    managerOnly: true,
  },
  {
    to: "/authenticated/documentos/regras",
    label: "Regras Documentais",
    icon: ScrollText,
    managerOnly: true,
  },
  {
    to: "/authenticated/documentos/codificacao",
    label: "Codificação Documental",
    icon: Code2,
    managerOnly: true,
  },
  {
    to: "/authenticated/documentos/tramites",
    label: "Trâmites Documentais",
    icon: Workflow,
    managerOnly: true,
  },
  {
    to: "/authenticated/documentos/leitura",
    label: "Leitura Documental",
    icon: ScanText,
    managerOnly: true,
  },
  {
    to: "/authenticated/indicadores",
    label: "Indicadores Operacionais",
    icon: ChartNoAxesCombined,
  },
  {
    to: "/authenticated/trilha-de-auditoria",
    label: "Trilha de Auditoria",
    icon: ClipboardList,
  },
  {
    to: "/authenticated/auditoria/relatorios",
    label: "Relatórios de Auditoria",
    icon: FileCheck2,
  },
  {
    to: "/authenticated/auditoria/excecoes",
    label: "Central de Exceções",
    icon: ShieldAlert,
    managerOnly: true,
  },
  {
    to: "/authenticated/schema-doctor",
    label: "Schema Doctor",
    icon: Stethoscope,
    managerOnly: true,
  },
  {
    to: "/authenticated/configuracoes/diagnostico",
    label: "Diagnóstico Operacional",
    icon: Activity,
    managerOnly: true,
  },
  { to: "/authenticated/equipe", label: "Equipe", icon: Users },
  {
    to: "/authenticated/configuracoes/calendario",
    label: "Calendário e SLA",
    icon: CalendarDays,
    managerOnly: true,
  },
  {
    to: "/authenticated/configuracoes",
    label: "Configurações",
    icon: Settings,
    managerOnly: true,
  },
];
