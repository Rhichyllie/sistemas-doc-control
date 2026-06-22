import { useState, useEffect, useRef } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, FileStack, Layers, Users, Search, LogOut, Settings, Upload, UserCheck, Palette, Download, DatabaseZap, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { NotificationPanel } from "./notifications-panel";
import { useTheme, themeColors } from "@/contexts/theme-context";
import { useLocalData } from "@/hooks/use-local-data";
import { toast } from "sonner";

const nav = [
  {
    section: "Principal",
    items: [
      { to: "/authenticated/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
      { to: "/authenticated/documents",  label: "Documentos", icon: FileStack },
    ]
  },
  {
    section: "Cadastros",
    items: [
      { to: "/authenticated/projects",    label: "Projetos",    icon: FolderKanban },
      { to: "/authenticated/disciplines", label: "Disciplinas", icon: Layers },
      { to: "/authenticated/projetistas", label: "Projetistas", icon: UserCheck },
      { to: "/authenticated/equipe", label: "Equipe", icon: Users },
      { to: "/authenticated/fluxo-de-aprovacao", label: "Fluxo de Aprovação", icon: GitBranch },
    ]
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { exportData, importData } = useLocalData();

  // Company settings
  const [openSettings, setOpenSettings] = useState(false);
  const [companyName, setCompanyName] = useState("EngDocs Control");
  const [logoUrl, setLogoUrl] = useState("");
  const [openImportConfirm, setOpenImportConfirm] = useState(false);
  const [importFileData, setImportFileData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const savedName = localStorage.getItem("companyName");
    const savedLogo = localStorage.getItem("companyLogo");
    if (savedName) setCompanyName(savedName);
    if (savedLogo) setLogoUrl(savedLogo);
  }, []);

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
          toast.error("Arquivo inválido. Por favor, selecione um arquivo de backup válido.");
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
    await logout();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside 
        className="w-64 text-sidebar-foreground flex flex-col shrink-0"
        style={{ backgroundColor: theme.sidebar }}
      >
        <div className="p-5 border-b border-white/20">
          <div className="flex flex-col items-center gap-3">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt="Logo da Empresa" 
                className="h-16 w-16 object-cover rounded-full" 
              />
            ) : (
              <div 
                className="h-14 w-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: theme.button, color: theme.text }}
              >
                <FileStack className="h-7 w-7" />
              </div>
            )}
            <div className="text-center">
              <div className="font-semibold text-sm" style={{ color: theme.text }}>{companyName}</div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: theme.text + "99" }}>Document Control</div>
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-2">
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
                <DialogHeader><DialogTitle>Configurações</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome da Empresa</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Logo da Empresa</Label>
                    <div className="mt-2 flex items-center gap-3">
                      <Input type="file" accept="image/*" onChange={handleFileUpload} />
                    </div>
                    {logoUrl && (
                      <div className="mt-3">
                        <img src={logoUrl} alt="Preview" className="h-20 w-20 object-cover rounded-full" />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Cor do Tema</Label>
                    <div className="mt-2">
                      {/* Organizar por famílias de cores como Excel */}
                      {(() => {
                        const families = [
                          { label: "Azul", filter: (t: any) => t.name.includes("Azul") && !t.name.includes("Turquesa") },
                          { label: "Turquesa", filter: (t: any) => t.name.includes("Turquesa") },
                          { label: "Amarelo", filter: (t: any) => t.name.includes("Amarelo") },
                          { label: "Laranja", filter: (t: any) => t.name.includes("Laranja") },
                          { label: "Vermelho", filter: (t: any) => t.name.includes("Vermelho") },
                          { label: "Rosa", filter: (t: any) => t.name.includes("Rosa") },
                          { label: "Roxo", filter: (t: any) => t.name.includes("Roxo") },
                          { label: "Verde", filter: (t: any) => t.name.includes("Verde") },
                          { label: "Cinza/Preto", filter: (t: any) => t.name.includes("Cinza") || t.name.includes("Preto") },
                        ];

                        return (
                          <div className="flex gap-1">
                            {families.map(fam => {
                              const colors = themeColors.filter(fam.filter);
                              return (
                                <div key={fam.label} className="flex flex-col items-center gap-0.5">
                                  <span className="text-[10px] text-muted-foreground w-8 text-center truncate">{fam.label}</span>
                                  {colors.map(tc => (
                                    <button
                                      key={tc.name}
                                      title={tc.name}
                                      onClick={() => setTheme(tc)}
                                      className="w-7 h-5 rounded-sm border-2 transition-transform hover:scale-110"
                                      style={{
                                        background: tc.button,
                                        borderColor: theme.button === tc.button ? "#000" : "transparent",
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
                  <Button variant="secondary" onClick={() => setOpenSettings(false)}>Cancelar</Button>
                  <Button style={{ backgroundColor: theme.button }} onClick={handleSaveSettings}>Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

<nav className="flex-1 p-3 space-y-4">
  {nav.map(group => (
    <div key={group.section}>
      <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1"
        style={{ color: theme.text + "55" }}>
        {group.section}
      </p>
      <div className="space-y-0.5">
        {group.items.map(item => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                color: active ? theme.text : theme.text + "99",
                backgroundColor: active ? "rgba(255,255,255,0.18)" : "transparent",
                fontWeight: active ? 500 : 400,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  ))}
</nav>
        <div className="p-3 border-t border-white/20">
          <div className="px-2 py-2 text-xs">
            <div className="font-medium truncate" style={{ color: theme.text }}>{user?.user_metadata?.full_name || user?.email}</div>
            <div className="truncate" style={{ color: theme.text + "99" }}>{user?.email}</div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start hover:bg-white/20"
            style={{ color: theme.text }}
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div 
          className="w-full relative h-48"
          style={{
            backgroundImage: "url('/Banner_DOC.png')",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundColor: "#ffffff"
          }}
        >
          <div className="absolute inset-0 bg-black/10"></div>
          <header className="absolute top-0 right-0 left-0 z-20 px-6 lg:px-8 py-4 flex items-center justify-end gap-3">
            <Dialog open={openSettings} onOpenChange={setOpenSettings}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="default" className="bg-white/90 text-gray-800 hover:bg-white shadow-md hover:shadow-lg transition-all">
                  <Palette className="h-5 w-5 mr-2" />
                  Tema
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Configurações</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome da Empresa</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Logo da Empresa</Label>
                    <div className="mt-2 flex items-center gap-3">
                      <Input type="file" accept="image/*" onChange={handleFileUpload} />
                    </div>
                    {logoUrl && (
                      <div className="mt-3">
                        <img src={logoUrl} alt="Preview" className="h-20 w-20 object-cover rounded-full" />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Cor do Tema</Label>
                    <div className="mt-2">
                      {/* Organizar por famílias de cores como Excel */}
                      {(() => {
                        const families = [
                          { label: "Azul", filter: (t: any) => t.name.includes("Azul") && !t.name.includes("Turquesa") },
                          { label: "Turquesa", filter: (t: any) => t.name.includes("Turquesa") },
                          { label: "Amarelo", filter: (t: any) => t.name.includes("Amarelo") },
                          { label: "Laranja", filter: (t: any) => t.name.includes("Laranja") },
                          { label: "Vermelho", filter: (t: any) => t.name.includes("Vermelho") },
                          { label: "Rosa", filter: (t: any) => t.name.includes("Rosa") },
                          { label: "Roxo", filter: (t: any) => t.name.includes("Roxo") },
                          { label: "Verde", filter: (t: any) => t.name.includes("Verde") },
                          { label: "Cinza/Preto", filter: (t: any) => t.name.includes("Cinza") || t.name.includes("Preto") },
                        ];

                        return (
                          <div className="flex gap-1">
                            {families.map(fam => {
                              const colors = themeColors.filter(fam.filter);
                              return (
                                <div key={fam.label} className="flex flex-col items-center gap-0.5">
                                  <span className="text-[10px] text-muted-foreground w-8 text-center truncate">{fam.label}</span>
                                  {colors.map(tc => (
                                    <button
                                      key={tc.name}
                                      title={tc.name}
                                      onClick={() => setTheme(tc)}
                                      className="w-7 h-5 rounded-sm border-2 transition-transform hover:scale-110"
                                      style={{
                                        background: tc.button,
                                        borderColor: theme.button === tc.button ? "#000" : "transparent",
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
                  <Button variant="secondary" onClick={() => setOpenSettings(false)}>Cancelar</Button>
                  <Button style={{ backgroundColor: theme.button }} onClick={handleSaveSettings}>Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={openImportConfirm} onOpenChange={setOpenImportConfirm}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirmar Importação</DialogTitle>
                  <DialogDescription>
                    Esta ação substituirá todos os dados atuais (disciplinas, projetos, documentos, projetistas e notificações). Deseja continuar?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => {
                    setOpenImportConfirm(false);
                    setImportFileData(null);
                  }}>
                    Cancelar
                  </Button>
                  <Button style={{ backgroundColor: theme.button }} onClick={handleConfirmImport}>
                    Confirmar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <NotificationPanel />
          </header>
        </div>
        <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
