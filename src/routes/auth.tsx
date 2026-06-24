import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      throw redirect({ to: "/authenticated/dashboard" });
    }
    throw redirect({ to: "/login" });
  },
  component: AuthPage,
});
