import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";
import { getAuthState } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    const authState = getAuthState();
    if (authState.isAuthenticated) {
      throw redirect({ to: "/authenticated/dashboard" });
    }
  },
  component: AuthPage,
});
