import {
  Calendar,
  ChartNoAxesCombined,
  CheckSquare,
  FileCheck2,
  FileStack,
  FolderKanban,
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
  ShieldCheck,
  Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  managerOnly?: boolean;
  badge?: "activities" | "approval";
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
      { to: "/authenticated/dashboard", label: "Início", icon: House },
      { to: "/authenticated/documents", label: "Documentos", icon: FileText },
      { to: "/authenticated/configuracoes/projetos", label: "Projetos", icon: FolderKanban },
      { to: "/authenticated/documentos/tramites", label: "Modelos de tramitação", icon: GitBranch, managerOnly: true },
      {
        to: "/authenticated/fluxo-de-aprovacao",
        label: "Fila de Aprovação",
        icon: CheckSquare,
        badge: "approval",
      },
      {
        to: "/authenticated/documentos/central",
        label: "Central Documental",
        icon: PanelsTopLeft,
      },
    ],
  },
  {
    label: "CONFIGURAÇÃO",
    items: [
      { to: "/authenticated/documentos/codificacao", label: "Codificação", icon: Hash, managerOnly: true },
      { to: "/authenticated/documentos/regras", label: "Regras documentais", icon: LayoutList, managerOnly: true },
      {
        to: "/authenticated/configuracoes/equipe",
        label: "Equipe",
        icon: Users,
        managerOnly: true,
      },
      {
        to: "/authenticated/configuracoes/grupos-aprovacao",
        label: "Grupos de Aprovação",
        icon: CheckSquare,
        managerOnly: true,
      },
      {
        to: "/authenticated/configuracoes/calendario",
        label: "Calendário",
        icon: Calendar,
        managerOnly: true,
      },
      {
        to: "/authenticated/configuracoes/trilha-de-auditoria",
        label: "Trilha de Auditoria",
        icon: ShieldCheck,
        managerOnly: true,
      },
      {
        to: "/authenticated/schema-doctor",
        label: "Schema Doctor",
        icon: Stethoscope,
        managerOnly: true,
      },
    ],
  },
  {
    label: "ANÁLISE",
    items: [
      { to: "/authenticated/indicadores", label: "Indicadores", icon: ChartNoAxesCombined },
      { to: "/authenticated/auditoria/relatorios", label: "Relatórios", icon: LineChart },
    ],
  },
];

export const navigationItems: readonly NavigationItem[] = navigationSections.flatMap((s) => s.items);
