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
import { getStoredActiveLibraryId } from "@/contexts/library-context";
import { getLibraryIdFromPath, toLibraryScopedPath } from "@/lib/library-routing";
import { toast } from "sonner";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      searchStr: s.location.searchStr,
    }),
  });
  const pathname = location.pathname;
  const currentView = new URLSearchParams(location.searchStr).get("view");
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuthContext();
  const { theme, setTheme } = useTheme();
  const { exportData, importData } = useLocalData();
  const notificationState = useNotifications();
  const { unreadCount } = notificationState;
  const { queue } = useApprovalQueue();
  const currentLibraryId = getLibraryIdFromPath(pathname);
  const [rememberedLibraryId, setRememberedLibraryId] = useState<string | null>(
    null,
  );
  const effectiveLibraryId = currentLibraryId ?? rememberedLibraryId;
  const isOrganizationHome =
    pathname === "/authenticated/organizacao" ||
    pathname.startsWith("/authenticated/organizacao/");

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
    setRememberedLibraryId(getStoredActiveLibraryId());
  }, []);

  useEffect(() => {
    if (!currentLibraryId) return;
    setRememberedLibraryId(currentLibraryId);
  }, [currentLibraryId]);

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
      {!isOrganizationHome && (
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
          <Link
            to="/authenticated/organizacao"
            className={`flex items-center gap-3 rounded-2xl transition hover:bg-white/6 ${
              sidebarCollapsed ? "justify-center p-1" : "justify-start -mx-2 px-2 py-1"
            }`}
            title="Abrir página principal de bibliotecas"
          >
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
          </Link>
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
                    const isLibraryScoped = item.scope === "library";
                    const isDisabled = isLibraryScoped && !effectiveLibraryId;
                    const resolvedTo =
                      isLibraryScoped && effectiveLibraryId
                        ? toLibraryScopedPath(item.to, effectiveLibraryId)
                        : item.to;
                    const matchesPath =
                      resolvedTo === "/authenticated/configuracoes"
                        ? pathname === resolvedTo
                        : pathname === resolvedTo ||
                          pathname.startsWith(`${resolvedTo}/`);
                    const activeSearchView = item.search?.view;
                    const active =
                      !isDisabled &&
                      matchesPath &&
                      (activeSearchView
                        ? currentView === activeSearchView
                        : !(
                            resolvedTo.includes("/indicadores") &&
                            currentView === "analysis"
                          ));
                    const Icon = item.icon;
                    const pendingCount =
                      item.badge === "approval"
                        ? queue.length
                        : item.badge === "activities"
                          ? unreadCount
                          : 0;

                    if (isDisabled) {
                      return (
                        <div
                          key={item.to}
                          title={`${item.label} — crie ou selecione uma biblioteca`}
                          aria-disabled="true"
                          className={`flex items-center rounded-lg opacity-45 ${
                            sidebarCollapsed
                              ? "h-11 w-11 justify-center mx-auto"
                              : "h-11 px-3.5 justify-start"
                          } text-blue-100/70 cursor-not-allowed`}
                        >
                          <Icon
                            className={`shrink-0 text-blue-300/60 ${
                              sidebarCollapsed ? "h-5 w-5" : "h-[18px] w-[18px]"
                            }`}
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
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.to}
                        to={resolvedTo}
                        search={item.search}
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
      )}

      <main data-app-main className="min-w-0 flex-1 overflow-auto">
          <header
            className={`sticky top-0 z-20 flex items-center gap-4 border-b px-6 py-3 lg:px-8 ${
              isOrganizationHome
                ? "border-[#123765] bg-[#071d3d] text-white"
                : "border-slate-200 bg-white"
            }`}
          >
            {isOrganizationHome && (
              <Link
                to="/authenticated/organizacao"
                className="hidden min-w-0 items-center gap-3 lg:flex"
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo da Empresa"
                    className="h-9 w-9 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-sky-300">
                    <FileStack className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {companyName}
                  </div>
                  <div className="truncate text-[10px] uppercase tracking-[0.14em] text-blue-200/70">
                    Document Control
                  </div>
                </div>
              </Link>
            )}

            <div className={`relative flex-1 ${isOrganizationHome ? "max-w-2xl" : "max-w-md"}`}>
              <Search
                className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
                  isOrganizationHome ? "text-blue-200/60" : "text-slate-400"
                }`}
              />
              <Input
                placeholder={
                  isOrganizationHome
                    ? "Buscar documentos, bibliotecas e mais..."
                    : "Buscar documento, projeto ou código..."
                }
                className={`pl-10 shadow-none ${
                  isOrganizationHome
                    ? "border-[#1d4e89] bg-white/6 text-white placeholder:text-blue-100/45 focus-visible:ring-[#2f7cf6]"
                    : "border-slate-200 bg-slate-50 focus:bg-white"
                }`}
              />
            </div>
            <div className="ml-auto flex items-center justify-end gap-2">
            <Dialog open={openSettings} onOpenChange={setOpenSettings}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={
                    isOrganizationHome
                      ? "text-blue-100/80 hover:bg-white/10 hover:text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }
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
              className={`flex shrink-0 items-center gap-3 rounded-full ${
                isOrganizationHome ? "pl-2 pr-1.5 py-1 hover:bg-white/8" : ""
              }`}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Foto do perfil"
                  className={`h-9 w-9 rounded-full object-cover ${
                    isOrganizationHome ? "border border-white/20" : "border border-gray-200"
                  }`}
                />
              ) : (
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full font-semibold text-sm ${
                    isOrganizationHome ? "border border-white/20" : "border border-gray-200"
                  }`}
                  style={{ backgroundColor: theme.button, color: theme.text }}
                >
                  {getInitials(profile?.full_name || user?.user_metadata?.full_name || user?.email || "User")}
                </div>
              )}
              {isOrganizationHome && (
                <div className="hidden text-left lg:block">
                  <div className="max-w-[9rem] truncate text-sm font-semibold text-white">
                    {profile?.full_name || user?.user_metadata?.full_name || "Usuário"}
                  </div>
                  <div className="text-xs text-blue-100/70">
                    {profile?.role === "admin" ? "Administrador" : "Colaborador"}
                  </div>
                </div>
              )}
            </Link>
            </div>
          </header>
        <div
          data-app-content
          className={`mx-auto ${
            isOrganizationHome
              ? "max-w-[1420px] px-6 py-8 lg:px-8"
              : "max-w-[1600px] p-6 lg:p-8"
          }`}
        >
          {children}
        </div>
        <FloatingMessagesWidget />
      </main>
    </div>
  );
}
