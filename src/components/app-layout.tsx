import { useState, useEffect, useRef } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  House,
  FileStack,
  Users,
  LogOut,
  Settings,
  Palette,
  Download,
  DatabaseZap,
  GitBranch,
  Bell,
  ClipboardList,
  UserCircle,
  Inbox,
  ChartNoAxesCombined,
  UsersRound,
  Stethoscope,
  ScrollText,
  Code2,
  FolderKanban,
  Workflow,
  PanelsTopLeft,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  FileCheck2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme, themeColors } from "@/contexts/theme-context";
import { useLocalData } from "@/hooks/use-local-data";
import { useNotifications } from "@/hooks/useNotifications";
import { useApprovalQueue } from "@/hooks/useApprovalQueue";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface NavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  managerOnly?: boolean;
  badge?: "activities" | "approval";
}

const nav: readonly NavigationItem[] = [
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

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuthContext();
  const { theme, setTheme } = useTheme();
  const { exportData, importData } = useLocalData();
  const notificationState = useNotifications();
  const { unreadCount } = notificationState;
  const { queue } = useApprovalQueue();

  // Company settings
  const [openSettings, setOpenSettings] = useState(false);
  const [companyName, setCompanyName] = useState("EngDocs Control");
  const [logoUrl, setLogoUrl] = useState("");
  const [openImportConfirm, setOpenImportConfirm] = useState(false);
  const [importFileData, setImportFileData] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const savedName = localStorage.getItem("companyName");
    const savedLogo = localStorage.getItem("companyLogo");
    if (savedName) setCompanyName(savedName);
    if (savedLogo) setLogoUrl(savedLogo);
    try {
      setSidebarCollapsed(
        localStorage.getItem("tramita.sidebar.collapsed") === "true",
      );
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("tramita.sidebar.collapsed", String(next));
      } catch {
        // O estado React continua funcional quando o storage está indisponível.
      }
      return next;
    });
  }

  function handleSaveSettings() {
    localStorage.setItem("companyName", companyName);
    if (logoUrl) localStorage.setItem("companyLogo", logoUrl);
    setOpenSettings(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleImportFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          setImportFileData(data);
          setOpenImportConfirm(true);
        } catch (err) {
          toast.error(
            "Arquivo inválido. Por favor, selecione um arquivo de backup válido.",
          );
        }
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleConfirmImport() {
    if (importFileData) {
      importData(importFileData);
      setOpenImportConfirm(false);
      setImportFileData(null);
      toast.success("Dados importados com sucesso!");
    }
  }

  async function handleLogout() {
    await signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        data-app-sidebar
        className={`${
          sidebarCollapsed ? "w-20" : "w-20 md:w-64"
        } sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden text-sidebar-foreground transition-[width] duration-200`}
        style={{ backgroundColor: theme.sidebar }}
      >
        <div
          className={`border-b border-white/20 ${
            sidebarCollapsed ? "p-3" : "p-3 md:p-5"
          }`}
        >
          <div className="flex flex-col items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo da Empresa"
                className={`rounded-full object-cover ${
                  sidebarCollapsed ? "h-10 w-10" : "h-12 w-12 md:h-16 md:w-16"
                }`}
              />
            ) : (
              <div
                className={`rounded-full flex items-center justify-center ${
                  sidebarCollapsed ? "h-10 w-10" : "h-12 w-12 md:h-14 md:w-14"
                }`}
                style={{ backgroundColor: theme.button, color: theme.text }}
              >
                <FileStack className="h-7 w-7" />
              </div>
            )}
            <div
              className={`text-center ${
                sidebarCollapsed ? "hidden" : "hidden md:block"
              }`}
            >
              <div
                className="font-semibold text-sm"
                style={{ color: theme.text }}
              >
                {companyName}
              </div>
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: theme.text + "99" }}
              >
                Document Control
              </div>
            </div>
          </div>
          <div
            className={`mt-3 justify-center gap-2 ${
              sidebarCollapsed ? "hidden" : "hidden md:flex"
            }`}
          >
            <Dialog open={openSettings} onOpenChange={setOpenSettings}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ color: theme.text }}
                  className="hover:bg-white/20"
                >
                  <Settings className="h-4 w-4 mr-2" /> Configurar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configurações</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome da Empresa</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Logo da Empresa</Label>
                    <div className="mt-2 flex items-center gap-3">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                      />
                    </div>
                    {logoUrl && (
                      <div className="mt-3">
                        <img
                          src={logoUrl}
                          alt="Preview"
                          className="h-20 w-20 object-cover rounded-full"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Cor do Tema</Label>
                    <div className="mt-2">
                      {/* Organizar por famílias de cores como Excel */}
                      {(() => {
                        const families = [
                          {
                            label: "Azul",
                            filter: (t: any) =>
                              t.name.includes("Azul") &&
                              !t.name.includes("Turquesa"),
                          },
                          {
                            label: "Turquesa",
                            filter: (t: any) => t.name.includes("Turquesa"),
                          },
                          {
                            label: "Amarelo",
                            filter: (t: any) => t.name.includes("Amarelo"),
                          },
                          {
                            label: "Laranja",
                            filter: (t: any) => t.name.includes("Laranja"),
                          },
                          {
                            label: "Vermelho",
                            filter: (t: any) => t.name.includes("Vermelho"),
                          },
                          {
                            label: "Rosa",
                            filter: (t: any) => t.name.includes("Rosa"),
                          },
                          {
                            label: "Roxo",
                            filter: (t: any) => t.name.includes("Roxo"),
                          },
                          {
                            label: "Verde",
                            filter: (t: any) => t.name.includes("Verde"),
                          },
                          {
                            label: "Cinza/Preto",
                            filter: (t: any) =>
                              t.name.includes("Cinza") ||
                              t.name.includes("Preto"),
                          },
                        ];

                        return (
                          <div className="flex gap-1">
                            {families.map((fam) => {
                              const colors = themeColors.filter(fam.filter);
                              return (
                                <div
                                  key={fam.label}
                                  className="flex flex-col items-center gap-0.5"
                                >
                                  <span className="text-[10px] text-muted-foreground w-8 text-center truncate">
                                    {fam.label}
                                  </span>
                                  {colors.map((tc) => (
                                    <button
                                      key={tc.name}
                                      title={tc.name}
                                      onClick={() => setTheme(tc)}
                                      className="w-7 h-5 rounded-sm border-2 transition-transform hover:scale-110"
                                      style={{
                                        background: tc.button,
                                        borderColor:
                                          theme.button === tc.button
                                            ? "#000"
                                            : "transparent",
                                      }}
                                    />
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <Label>Backup e Restauração</Label>
                    <div className="mt-3 flex gap-3">
                      <Button
                        className="flex-1"
                        style={{ backgroundColor: theme.button }}
                        onClick={() => {
                          exportData();
                          toast.success("Backup exportado com sucesso!");
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Exportar Dados
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImportFileSelect}
                        className="hidden"
                      />
                      <Button
                        className="flex-1"
                        variant="secondary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <DatabaseZap className="h-4 w-4 mr-2" />
                        Importar Dados
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="secondary"
                    onClick={() => setOpenSettings(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    style={{ backgroundColor: theme.button }}
                    onClick={handleSaveSettings}
                  >
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mx-auto mt-3 flex hover:bg-white/20"
            style={{ color: theme.text }}
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
        </div>

        <nav
          className={`${sidebarCollapsed ? "px-2" : "px-2 md:px-3"} flex-1 space-y-1 overflow-y-auto py-3`}
        >
          {nav
            .filter(
              (item) =>
                !item.managerOnly ||
                profile?.role === "admin" ||
                profile?.role === "manager",
            )
            .map((item) => {
              const active =
                item.to === "/authenticated/configuracoes"
                  ? pathname === item.to
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);
              const Icon = item.icon;
              const pendingCount =
                item.badge === "approval"
                  ? queue.length
                  : item.badge === "activities"
                    ? unreadCount
                    : 0;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className={`flex items-center rounded-lg py-2 text-sm transition-colors ${
                    sidebarCollapsed
                      ? "justify-center px-2"
                      : "justify-center px-2 md:justify-between md:gap-2.5 md:px-3"
                  }`}
                  style={{
                    color: active ? theme.text : theme.text + "99",
                    backgroundColor: active
                      ? "rgba(255,255,255,0.18)"
                      : "transparent",
                    fontWeight: active ? 500 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      e.currentTarget.style.backgroundColor =
                        "rgba(255,255,255,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active)
                      e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span
                      className={
                        sidebarCollapsed ? "hidden" : "hidden md:inline"
                      }
                    >
                      {item.label}
                    </span>
                  </span>
                  {pendingCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="h-5 min-w-5 px-1 text-[10px]"
                    >
                      {pendingCount}
                    </Badge>
                  )}
                </Link>
              );
            })}
        </nav>
        <div
          className={`${sidebarCollapsed ? "p-2" : "p-2 md:p-3"} border-t border-white/20`}
        >
          <div
            className={`${sidebarCollapsed ? "hidden" : "hidden md:block"} px-2 py-2 text-xs`}
          >
            <div className="font-medium truncate" style={{ color: theme.text }}>
              {user?.user_metadata?.full_name || user?.email}
            </div>
            <div className="truncate" style={{ color: theme.text + "99" }}>
              {user?.email}
            </div>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={`w-full hover:bg-white/20 ${sidebarCollapsed ? "justify-center px-0" : "justify-center md:justify-start"}`}
            style={{ color: theme.text }}
            title="Meu Perfil"
          >
            <Link to="/authenticated/meu-perfil">
              <UserCircle
                className={`h-4 w-4 ${sidebarCollapsed ? "" : "md:mr-2"}`}
              />
              <span
                className={sidebarCollapsed ? "hidden" : "hidden md:inline"}
              >
                Meu Perfil
              </span>
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`w-full hover:bg-white/20 ${
              sidebarCollapsed
                ? "justify-center px-0"
                : "justify-center md:justify-start"
            }`}
            style={{ color: theme.text }}
            title="Sair"
            onClick={handleLogout}
          >
            <LogOut
              className={`h-4 w-4 ${sidebarCollapsed ? "" : "md:mr-2"}`}
            />
            <span className={sidebarCollapsed ? "hidden" : "hidden md:inline"}>
              Sair
            </span>
          </Button>
        </div>
      </aside>

      <main data-app-main className="min-w-0 flex-1 overflow-auto">
        <div
          data-app-banner
          className="w-full relative h-48"
          style={{
            backgroundImage: "url('/Banner_DOC.png')",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundColor: "#ffffff",
          }}
        >
          <div className="absolute inset-0 bg-black/10"></div>
          <header className="absolute top-0 right-0 left-0 z-20 px-6 lg:px-8 py-4 flex items-center justify-end gap-3">
            <Dialog open={openSettings} onOpenChange={setOpenSettings}>
              <DialogTrigger asChild>
                <Button
                  variant="secondary"
                  size="default"
                  className="bg-white/90 text-gray-800 hover:bg-white shadow-md hover:shadow-lg transition-all"
                >
                  <Palette className="h-5 w-5 mr-2" />
                  Tema
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configurações</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome da Empresa</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Logo da Empresa</Label>
                    <div className="mt-2 flex items-center gap-3">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                      />
                    </div>
                    {logoUrl && (
                      <div className="mt-3">
                        <img
                          src={logoUrl}
                          alt="Preview"
                          className="h-20 w-20 object-cover rounded-full"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Cor do Tema</Label>
                    <div className="mt-2">
                      {/* Organizar por famílias de cores como Excel */}
                      {(() => {
                        const families = [
                          {
                            label: "Azul",
                            filter: (t: any) =>
                              t.name.includes("Azul") &&
                              !t.name.includes("Turquesa"),
                          },
                          {
                            label: "Turquesa",
                            filter: (t: any) => t.name.includes("Turquesa"),
                          },
                          {
                            label: "Amarelo",
                            filter: (t: any) => t.name.includes("Amarelo"),
                          },
                          {
                            label: "Laranja",
                            filter: (t: any) => t.name.includes("Laranja"),
                          },
                          {
                            label: "Vermelho",
                            filter: (t: any) => t.name.includes("Vermelho"),
                          },
                          {
                            label: "Rosa",
                            filter: (t: any) => t.name.includes("Rosa"),
                          },
                          {
                            label: "Roxo",
                            filter: (t: any) => t.name.includes("Roxo"),
                          },
                          {
                            label: "Verde",
                            filter: (t: any) => t.name.includes("Verde"),
                          },
                          {
                            label: "Cinza/Preto",
                            filter: (t: any) =>
                              t.name.includes("Cinza") ||
                              t.name.includes("Preto"),
                          },
                        ];

                        return (
                          <div className="flex gap-1">
                            {families.map((fam) => {
                              const colors = themeColors.filter(fam.filter);
                              return (
                                <div
                                  key={fam.label}
                                  className="flex flex-col items-center gap-0.5"
                                >
                                  <span className="text-[10px] text-muted-foreground w-8 text-center truncate">
                                    {fam.label}
                                  </span>
                                  {colors.map((tc) => (
                                    <button
                                      key={tc.name}
                                      title={tc.name}
                                      onClick={() => setTheme(tc)}
                                      className="w-7 h-5 rounded-sm border-2 transition-transform hover:scale-110"
                                      style={{
                                        background: tc.button,
                                        borderColor:
                                          theme.button === tc.button
                                            ? "#000"
                                            : "transparent",
                                      }}
                                    />
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <Label>Backup e Restauração</Label>
                    <div className="mt-3 flex gap-3">
                      <Button
                        className="flex-1"
                        style={{ backgroundColor: theme.button }}
                        onClick={() => {
                          exportData();
                          toast.success("Backup exportado com sucesso!");
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Exportar Dados
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImportFileSelect}
                        className="hidden"
                      />
                      <Button
                        className="flex-1"
                        variant="secondary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <DatabaseZap className="h-4 w-4 mr-2" />
                        Importar Dados
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="secondary"
                    onClick={() => setOpenSettings(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    style={{ backgroundColor: theme.button }}
                    onClick={handleSaveSettings}
                  >
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={openImportConfirm}
              onOpenChange={setOpenImportConfirm}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirmar Importação</DialogTitle>
                  <DialogDescription>
                    Esta ação substituirá todos os dados atuais (disciplinas,
                    projetos, documentos, projetistas e notificações). Deseja
                    continuar?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setOpenImportConfirm(false);
                      setImportFileData(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    style={{ backgroundColor: theme.button }}
                    onClick={handleConfirmImport}
                  >
                    Confirmar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <NotificationBell state={notificationState} />
          </header>
        </div>
        <div data-app-content className="p-6 lg:p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
