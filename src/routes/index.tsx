import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthState } from "@/hooks/use-local-auth";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const authState = getAuthState();
    if (authState.isAuthenticated) {
      throw redirect({ to: "/authenticated/dashboard" });
    }
    throw redirect({ to: "/auth" });
  },
});
