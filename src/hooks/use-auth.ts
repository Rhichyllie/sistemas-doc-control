import { useEffect, useState, useRef } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function getAuthState() {
  if (typeof window === "undefined") {
    return { isAuthenticated: false };
  }
  // We'll check Supabase session here, but for beforeLoad we can't use hooks
  // So we'll use localStorage to persist a simple flag, but the real check will be via hooks
  const session = localStorage.getItem("supabase_session");
  return { isAuthenticated: !!session };
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (isMountedRef.current) {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          localStorage.setItem("supabase_session", JSON.stringify(s));
          setTimeout(async () => {
            const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id);
            if (isMountedRef.current) {
              setRoles((data ?? []).map((r: any) => r.role));
            }
          }, 0);
        } else {
          if (isMountedRef.current) {
            setRoles([]);
            localStorage.removeItem("supabase_session");
          }
        }
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (isMountedRef.current) {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          localStorage.setItem("supabase_session", JSON.stringify(data.session));
          supabase.from("user_roles").select("role").eq("user_id", data.session.user.id)
            .then(({ data: r }) => {
              if (isMountedRef.current) {
                setRoles((r ?? []).map((x: any) => x.role));
              }
            });
        }
        setLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      console.log("Attempting login with email:", email);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("Login error:", error);
        let userFriendlyMessage = error.message;
        if (error.message.toLowerCase().includes("email not confirmed")) {
          userFriendlyMessage = "E-mail não confirmado! Por favor, verifique sua caixa de entrada (ou desabilite a confirmação de e-mail no Supabase para testes).";
        } else if (error.message.toLowerCase().includes("invalid") || error.message.toLowerCase().includes("credentials")) {
          userFriendlyMessage = "Credenciais inválidas! Verifique seu e-mail e senha.";
        }
        return { success: false, error: userFriendlyMessage };
      }
      if (data.user) {
        // Check if user has a role, if not create a default one
        const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
        if (!rolesData || rolesData.length === 0) {
          try {
            await supabase.from("user_roles").insert({ user_id: data.user.id, role: "analyzer" });
          } catch (roleErr: any) {
            console.warn("Role insertion failed during login:", roleErr);
          }
        }
      }
      console.log("Login successful!", data.user);
      return { success: true, user: data.user };
    } catch (error: any) {
      console.error("Unexpected login error:", error);
      return { success: false, error: error.message || "Erro ao fazer login" };
    }
  };

  const signup = async (email: string, fullName: string, password: string) => {
    try {
      // First, sign up the user with Supabase Auth - disable email confirmation for testing!
      console.log("Attempting signup with email:", email, "password length:", password.length);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin + "/authenticated/dashboard", // Optional
        },
      });

      if (error) {
        // Log the full error to console for debugging
        console.error("Supabase auth error:", error);
        // Customize error messages to be more user-friendly - use the exact Supabase message
        let userFriendlyMessage = error.message;
        if (error.message.toLowerCase().includes("password")) {
          userFriendlyMessage = "Erro na senha: " + error.message + ". Por favor, use uma senha com pelo menos 8 caracteres, incluindo letras maiúsculas, minúsculas, números e um caractere especial (!@#$%^&*).";
        } else if (error.message.toLowerCase().includes("email")) {
          userFriendlyMessage = "E-mail inválido ou já cadastrado.";
        }
        return { success: false, error: userFriendlyMessage };
      }

      if (data.user) {
        // Assign default role to new user - if RLS fails, still allow signup to proceed
        try {
          const { data: allRoles, error: rolesCountError } = await supabase.from("user_roles").select("*");
          if (!rolesCountError) {
            const { error: roleError } = await supabase.from("user_roles").insert({
              user_id: data.user.id,
              role: allRoles?.length === 0 ? "admin" : "analyzer",
            });
            if (roleError) {
              console.warn("Failed to assign role (RLS issue), but user created successfully:", roleError);
              // Don't fail signup - just skip role assignment for now
            }
          }
        } catch (roleErr: any) {
          console.warn("Error assigning role:", roleErr);
        }
      }

      return { success: true, user: data.user };
    } catch (error: any) {
      return { success: false, error: error.message || "Erro ao criar conta" };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRoles([]);
    setSession(null);
  };

  const checkEmailExists = async (email: string) => {
    // We can't directly check emails with Supabase Auth due to privacy
    // So we'll just proceed with password reset flow
    return true;
  };

  const resetPassword = async (email: string, newPassword?: string) => {
    try {
      if (newPassword) {
        // This would be for after user clicks reset link
        // For simplicity, let's use the Supabase password reset flow
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
          return { success: false, error: error.message };
        }
        return { success: true };
      } else {
        // Send password reset email
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/auth",
        });
        if (error) {
          return { success: false, error: error.message };
        }
        return { success: true };
      }
    } catch (error: any) {
      return { success: false, error: error.message || "Erro ao redefinir senha" };
    }
  };

  return {
    session,
    user,
    loading,
    roles,
    isAuthenticated: !!session,
    login,
    logout,
    signup,
    checkEmailExists,
    resetPassword
  };
}
