import { useState, useEffect, useRef } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  FileStack,
  LogOut,
  Settings,
  Palette,
  Download,
  DatabaseZap,
  UserCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
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
import { FloatingMessagesWidget } from "@/components/messages/FloatingMessagesWidget";
import { Badge } from "@/components/ui/badge";
import { navigationSections } from "@/app/navigation/navigation-items";
import { canViewNavigationItem } from "@/app/navigation/navigation-permissions";
import { USER_ROLES } from "@/lib/constants";
import { toast } from "sonner";

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
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(["/authenticated/configuracoes"]));
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

  function getInitials(name: string) {
    return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        data-app-sidebar
        className={`${
          sidebarCollapsed ? "w-20" : "w-20 md:w-72"
        } sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden text-sidebar-foreground transition-[width] duration-200`}
        style={{ backgroundColor: "#061d3d" }}
      >
        <div
          className={`${
            sidebarCollapsed ? "p-4 pb-2" : "p-6 md:p-8 pb-4"
          }`}
        >
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : "justify-start"}`}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo da Empresa"
                className={`rounded-xl object-cover shrink-0 ${
                  sidebarCollapsed ? "h-10 w-10" : "h-11 w-11"
                }`}
              />
            ) : (
              <div
                className={`rounded-xl flex items-center justify-center shrink-0 ${
                  sidebarCollapsed ? "h-10 w-10" : "h-11 w-11"
                }`}
                style={{ backgroundColor: "rgba(56,189,248,0.12)", color: "#38bdf8" }}
              >
                <FileStack className="h-5 w-5" />
              </div>
            )}
            <div
              className={`flex flex-col ${
                sidebarCollapsed ? "hidden" : "hidden md:flex"
              }`}
            >
              <div
                className="font-bold text-base text-white tracking-tight"
              >
                {companyName}
              </div>
              <div
                className="text-[11px] uppercase tracking-widest text-blue-300/60"
              >
                Document Control
              </div>
            </div>
          </div>
          <div
            className={`mt-5 justify-start ${
              sidebarCollapsed ? "hidden" : "hidden md:flex"
            }`}
          >
            <Dialog open={openSettings} onOpenChange={setOpenSettings}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-white/10 text-blue-300"
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
          className={`${sidebarCollapsed ? "px-3" : "px-3 md:px-6"} flex-1 space-y-6 overflow-y-auto py-2`}
        >
          {navigationSections.map((section) => {
            const visibleItems = section.items.filter((item) =>
              canViewNavigationItem(item, profile),
            );
            if (!visibleItems.length) return null;
            return (
              <div key={section.label} className="space-y-1.5">
                {!sidebarCollapsed && (
                  <div className="hidden md:block px-3 pt-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-400/55">
                      {section.label}
                    </span>
                  </div>
                )}
                <div className="space-y-1">
                  {visibleItems.map((item) => {
                    const active =
                      item.to === "/authenticated/configuracoes"
                        ? pathname === item.to
                        : pathname === item.to ||
                          pathname.startsWith(`${item.to}/`);
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
                        className={`flex items-center rounded-lg transition-all duration-150 ${
                          sidebarCollapsed
                            ? "h-11 w-11 justify-center mx-auto"
                            : "h-11 px-3.5 justify-start"
                        } ${
                          active
                            ? "bg-blue-500/18 text-white ring-1 ring-inset ring-blue-400/30"
                            : "text-blue-100/75 hover:bg-white/8 hover:text-white"
                        }`}
                      >
                        <Icon
                          className={`shrink-0 ${
                            active ? "text-sky-300" : "text-blue-300/75"
                          } ${sidebarCollapsed ? "h-5 w-5" : "h-[18px] w-[18px]"}`}
                        />
                        <span
                          className={`${
                            sidebarCollapsed
                              ? "hidden"
                              : "hidden md:inline ml-3 text-sm font-medium"
                          }`}
                        >
                          {item.label}
                        </span>
                        {pendingCount > 0 && (
                          <Badge
                            variant="destructive"
                            className="h-5 min-w-5 px-1 text-[10px] ml-auto"
                          >
                            {pendingCount}
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div
          className={`${sidebarCollapsed ? "p-3" : "p-4 md:p-6 pt-4 border-t border-white/10"}`}
        >
          <div
            className={`${sidebarCollapsed ? "hidden" : "hidden md:block"} mb-3`}
          >
            <div className="font-medium truncate text-sm text-white">
              {user?.user_metadata?.full_name || user?.email}
            </div>
            <div className="truncate text-xs text-blue-300/55">
              {user?.email}
            </div>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={`w-full hover:bg-white/10 text-blue-100/80 hover:text-white ${sidebarCollapsed ? "justify-center px-0 h-11" : "justify-start h-11 px-3.5"}`}
            title="Meu Perfil"
          >
            <Link to="/authenticated/meu-perfil">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Foto do perfil"
                  className={`rounded-full object-cover ring-1 ring-white/15 ${
                    sidebarCollapsed ? "h-8 w-8" : "h-7 w-7 mr-3"
                  }`}
                />
              ) : (
                <div
                  className={`rounded-full flex items-center justify-center font-semibold text-xs ring-1 ring-white/15 ${
                    sidebarCollapsed ? "h-8 w-8" : "h-7 w-7 mr-3"
                  }`}
                  style={{
                    backgroundColor: "rgba(56,189,248,0.14)",
                    color: "#7dd3fc",
                  }}
                >
                  {getInitials(
                    profile?.full_name ||
                      user?.user_metadata?.full_name ||
                      user?.email ||
                      "User",
                  )}
                </div>
              )}
              <span
                className={sidebarCollapsed ? "hidden" : "hidden md:inline text-sm font-medium"}
              >
                Meu Perfil
              </span>
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`w-full hover:bg-white/10 text-blue-100/80 hover:text-white mt-1.5 ${
              sidebarCollapsed
                ? "justify-center px-0 h-11"
                : "justify-start h-11 px-3.5"
            }`}
            title="Sair"
            onClick={handleLogout}
          >
            <LogOut
              className={`h-4 w-4 ${sidebarCollapsed ? "" : "mr-3"}`}
            />
            <span className={sidebarCollapsed ? "hidden" : "hidden md:inline text-sm font-medium"}>
              Sair
            </span>
          </Button>
        </div>
      </aside>

      <main data-app-main className="min-w-0 flex-1 overflow-auto">
          <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 lg:px-8 py-3 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar documento, projeto ou código..."
                className="pl-10 bg-slate-50 border-slate-200 shadow-none focus:bg-white"
              />
            </div>
            <div className="flex items-center justify-end gap-2 ml-auto">
            <Dialog open={openSettings} onOpenChange={setOpenSettings}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                >
                  <Palette className="h-5 w-5" />
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

            <Link
              to="/authenticated/meu-perfil"
              className="shrink-0"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Foto do perfil"
                  className="h-9 w-9 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center font-semibold text-sm border border-gray-200"
                  style={{ backgroundColor: theme.button, color: theme.text }}
                >
                  {getInitials(profile?.full_name || user?.user_metadata?.full_name || user?.email || "User")}
                </div>
              )}
            </Link>
            </div>
          </header>
        <div data-app-content className="p-6 lg:p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
        <FloatingMessagesWidget />
      </main>
    </div>
  );
}
