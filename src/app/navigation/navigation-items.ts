import {
  Calendar,
  ChartNoAxesCombined,
  CheckSquare,
  FileCheck2,
  FileStack,
  GitBranch,
  Hash,
  House,
  Inbox,
  LayoutList,
  PanelsTopLeft,
  Settings,
  Stethoscope,
  Users,
  Workflow,
  FileText,
  CalendarDays,
  FolderTree,
  LineChart,
  Rows3,
  ShieldCheck,
  Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  scope?: "global" | "library";
  managerOnly?: boolean;
  badge?: "activities" | "approval";
  search?: Record<string, string>;
  children?: readonly Omit<NavigationItem, "children" | "badge">[];
}

export interface NavigationSection {
  label: string;
  items: readonly NavigationItem[];
}

export const navigationSections: readonly NavigationSection[] = [
  {
    label: "PAINEL",
    items: [
      { to: "/authenticated/dashboard", label: "Início", icon: House, scope: "library" },
      { to: "/authenticated/documents", label: "Documentos", icon: FileText, scope: "library" },
      { to: "/authenticated/documentos/tramites", label: "Modelos de tramitação", icon: GitBranch, managerOnly: true, scope: "library" },
      {
        to: "/authenticated/fluxo-de-aprovacao",
        label: "Fila de Aprovação",
        icon: CheckSquare,
        badge: "approval",
        scope: "library",
      },
      {
        to: "/authenticated/documentos/central",
        label: "Central Documental",
        icon: PanelsTopLeft,
        scope: "library",
      },
    ],
  },
  {
    label: "CONFIGURAÇÃO",
    items: [
      {
        to: "/authenticated/configuracoes",
        label: "Geral",
        icon: Settings,
        managerOnly: true,
        scope: "global",
      },
      { to: "/authenticated/documentos/codificacao", label: "Codificação", icon: Hash, managerOnly: true, scope: "global" },
      { to: "/authenticated/documentos/regras", label: "Regras documentais", icon: LayoutList, managerOnly: true, scope: "global" },
      {
        to: "/authenticated/configuracoes/equipe",
        label: "Equipe",
        icon: Users,
        managerOnly: true,
        scope: "global",
      },
      {
        to: "/authenticated/configuracoes/grupos-aprovacao",
        label: "Grupos de Aprovação",
        icon: CheckSquare,
        managerOnly: true,
        scope: "global",
      },
      {
        to: "/authenticated/configuracoes/calendario",
        label: "Calendário",
        icon: Calendar,
        managerOnly: true,
        scope: "global",
      },
      {
        to: "/authenticated/configuracoes/trilha-de-auditoria",
        label: "Trilha de Auditoria",
        icon: ShieldCheck,
        managerOnly: true,
        scope: "global",
      },
      {
        to: "/authenticated/schema-doctor",
        label: "Schema Doctor",
        icon: Stethoscope,
        managerOnly: true,
        scope: "global",
      },
    ],
  },
  {
    label: "ANÁLISE",
    items: [
      { to: "/authenticated/indicadores", label: "Indicadores", icon: ChartNoAxesCombined, scope: "library" },
      {
        to: "/authenticated/indicadores",
        label: "Análise",
        icon: Rows3,
        scope: "library",
        search: { view: "analysis" },
      },
      { to: "/authenticated/auditoria/relatorios", label: "Relatórios", icon: LineChart, scope: "library" },
    ],
  },
];

export const navigationItems: readonly NavigationItem[] = navigationSections.flatMap((s) => s.items);
