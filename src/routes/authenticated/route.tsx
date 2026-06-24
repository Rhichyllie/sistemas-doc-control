import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { requireAuthenticated } from "./-route-guards";

export const Route = createFileRoute("/authenticated")({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location.href);
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
