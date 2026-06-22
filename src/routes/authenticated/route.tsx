import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { getAuthState } from "@/hooks/use-auth";

export const Route = createFileRoute("/authenticated")({
  beforeLoad: () => {
    const authState = getAuthState();
    if (!authState.isAuthenticated) {
      throw redirect({ to: "/auth" });
    }
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
