import {
  Calendar,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare,
  ClipboardList,
  FileCheck2,
  FileStack,
  FolderTree,
  GitBranch,
  Hash,
  House,
  LayoutList,
  LineChart,
  PanelsTopLeft,
  ScanText,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Users,
  Workflow,
  Activity,
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
      { to: "/authenticated/documents", label: "Documentos", icon: FileStack, scope: "library" },
      {
        to: "/authenticated/documentos/central",
        label: "Central Documental",
        icon: PanelsTopLeft,
        scope: "library",
      },
      {
        to: "/authenticated/documentos/leitura",
        label: "Leitura Documental",
        icon: ScanText,
        managerOnly: true,
        scope: "library",
      },
      {
        to: "/authenticated/documentos/tramites",
        label: "Trâmites Documentais",
        icon: Workflow,
        managerOnly: true,
        scope: "library",
      },
    ],
  },
  {
    label: "ANÁLISE",
    items: [
      { to: "/authenticated/indicadores", label: "Indicadores Operacionais", icon: ChartNoAxesCombined, scope: "library" },
      { to: "/authenticated/trilha-de-auditoria", label: "Trilha de Auditoria", icon: ClipboardList, scope: "library" },
      { to: "/authenticated/auditoria/relatorios", label: "Relatórios de Auditoria", icon: LineChart, scope: "library" },
      {
        to: "/authenticated/auditoria/excecoes",
        label: "Central de Exceções",
        icon: ShieldAlert,
        managerOnly: true,
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
      {
        to: "/authenticated/configuracoes",
        label: "Diagnóstico Operacional",
        icon: Activity,
        managerOnly: true,
        scope: "global",
        search: { tab: "diagnostico" },
      },
      {
        to: "/authenticated/documentos/codificacao",
        label: "Codificação Documental",
        icon: Hash,
        managerOnly: true,
        scope: "global",
      },
      {
        to: "/authenticated/documentos/regras",
        label: "Regras Documentais",
        icon: ScrollText,
        managerOnly: true,
        scope: "global",
      },
      {
        to: "/authenticated/equipe",
        label: "Equipe",
        icon: Users,
        scope: "global",
      },
      {
        to: "/authenticated/configuracoes/equipe",
        label: "Equipe (Gestão)",
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
        label: "Calendário e SLA",
        icon: CalendarDays,
        managerOnly: true,
        scope: "global",
      },
      {
        to: "/authenticated/configuracoes/trilha-de-auditoria",
        label: "Auditoria (Gestão)",
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
      {
        to: "/authenticated/notificacoes",
        label: "Caixa de entrada",
        icon: Bell,
        scope: "global",
      },
    ],
  },
];

export const navigationItems: readonly NavigationItem[] = navigationSections.flatMap((s) => s.items);
