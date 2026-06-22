import { useEffect, useState, useCallback } from "react";
import { supabase, Profile } from "@/lib/supabase";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
}

function profileToUser(profile: Profile): AuthUser {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    roles: [profile.role],
  };
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (supabaseUser: SupabaseUser) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", supabaseUser.id)
      .single();

    if (error || !data) {
      console.error("Erro ao carregar perfil:", error);
      return;
    }

    const authUser = profileToUser(data as Profile);
    setUser(authUser);
    setRoles(authUser.roles);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setUser(null);
        setRoles([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, error: traduzErroLogin(error.message) };
    }
    if (data.user) {
      await loadProfile(data.user);
    }
    return { success: true, user: data.user };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRoles([]);
  };

  // Cadastro só pode ser feito por admin (ver função separada createUserByAdmin)
  const signup = async (email: string, fullName: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      return { success: false, error: traduzErroLogin(error.message) };
    }
    return { success: true, user: data.user };
  };

  const checkEmailExists = async (email: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    return !!data;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  return {
    session,
    user,
    loading,
    roles,
    isAuthenticated: !!user,
    login,
    logout,
    signup,
    checkEmailExists,
    resetPassword,
  };
}

function traduzErroLogin(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos";
  if (msg.includes("User already registered")) return "E-mail já cadastrado";
  if (msg.includes("Password should be at least")) return "A senha deve ter pelo menos 6 caracteres";
  return msg;
}