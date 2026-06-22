import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileStack, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type AuthTab = "signin" | "signup" | "reset-email" | "new-password";

const getPasswordRequirements = (password: string) => {
  return {
    hasMinLength: password.length >= 8, // Try 8 to be safe
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/`~]/.test(password),
  };
};

export function AuthPage() {
  const navigate = useNavigate();
  const { login, signup, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [activeTab, setActiveTab] = useState<AuthTab>("signup");
  const [newPassword, setNewPassword] = useState("");
  const passwordRequirements = getPasswordRequirements(password);
  const newPasswordRequirements = getPasswordRequirements(newPassword);

  // Detecta o link de recuperação de senha e abre a aba de nova senha automaticamente
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setActiveTab("new-password");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.success) {
      return toast.error(result.error || "Credenciais inválidas");
    }
    toast.success("Bem-vindo!");
    navigate({ to: "/authenticated/dashboard" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await signup(email, fullName, password);
    setLoading(false);
    if (!result.success) {
      return toast.error(result.error || "Erro ao criar conta");
    }
    toast.success("Conta criada. Verifique seu e-mail para confirmar!");
    setActiveTab("signin");
  }

  async function handleResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await resetPassword(email);
    setLoading(false);
    if (!result.success) {
      return toast.error(result.error || "Erro ao enviar e-mail de recuperação");
    }
    toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    setActiveTab("signin");
  }

  async function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await resetPassword(email, newPassword);
    setLoading(false);
    if (!result.success) {
      return toast.error(result.error || "Erro ao redefinir senha");
    }
    toast.success("Senha redefinida com sucesso! Faça login.");
    setNewPassword("");
    setActiveTab("signin");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-sidebar p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
            <FileStack className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">EngDocs Control</CardTitle>
          <CardDescription>Controle de Documentos Técnicos de Engenharia</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs 
            value={activeTab} 
            onValueChange={(value) => setActiveTab(value as AuthTab)}
          >
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              <TabsTrigger value="reset-email">Recuperar</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3 mt-4">
                <div>
                  <Label>E-mail</Label>
                  <Input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input 
                    type="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  Entrar
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 mt-4">
                <div>
                  <Label>Nome completo</Label>
                  <Input 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input 
                    type="password" 
                    minLength={6} 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                  />
                  <div className="mt-2 space-y-1 text-xs">
                    {[
                      { valid: passwordRequirements.hasMinLength, label: "Pelo menos 8 caracteres" },
                      { valid: passwordRequirements.hasLowerCase, label: "Pelo menos uma letra minúscula" },
                      { valid: passwordRequirements.hasUpperCase, label: "Pelo menos uma letra maiúscula" },
                      { valid: passwordRequirements.hasNumber, label: "Pelo menos um número" },
                      { valid: passwordRequirements.hasSpecialChar, label: "Pelo menos um caractere especial (!@#$%^&*)" },
                    ].map((req, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {req.valid ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-gray-300" />
                        )}
                        <span className={req.valid ? "text-green-600" : "text-gray-500"}>{req.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={
                    loading || 
                    !passwordRequirements.hasMinLength || 
                    !passwordRequirements.hasLowerCase || 
                    !passwordRequirements.hasUpperCase || 
                    !passwordRequirements.hasNumber || 
                    !passwordRequirements.hasSpecialChar
                  }
                >
                  Criar conta
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="reset-email">
              <form onSubmit={handleResetEmail} className="space-y-3 mt-4">
                <div>
                  <Label>E-mail cadastrado</Label>
                  <Input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  Enviar e-mail de recuperação
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="new-password">
              <form onSubmit={handleNewPassword} className="space-y-3 mt-4">
                <div>
                  <Label>Nova senha</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <div className="mt-2 space-y-1 text-xs">
                    {[
                      { valid: newPasswordRequirements.hasMinLength, label: "Pelo menos 8 caracteres" },
                      { valid: newPasswordRequirements.hasLowerCase, label: "Pelo menos uma letra minúscula" },
                      { valid: newPasswordRequirements.hasUpperCase, label: "Pelo menos uma letra maiúscula" },
                      { valid: newPasswordRequirements.hasNumber, label: "Pelo menos um número" },
                      { valid: newPasswordRequirements.hasSpecialChar, label: "Pelo menos um caractere especial (!@#$%^&*)" },
                    ].map((req, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {req.valid ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-gray-300" />
                        )}
                        <span className={req.valid ? "text-green-600" : "text-gray-500"}>{req.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    loading ||
                    !newPasswordRequirements.hasMinLength ||
                    !newPasswordRequirements.hasLowerCase ||
                    !newPasswordRequirements.hasUpperCase ||
                    !newPasswordRequirements.hasNumber ||
                    !newPasswordRequirements.hasSpecialChar
                  }
                >
                  Redefinir senha
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
