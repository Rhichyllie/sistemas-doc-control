import { useMemo } from "react";
import { useProjects } from "@/hooks/useProjects";
import { isProjectSelectable } from "@/lib/projectOperationalContext";

interface UseProjectOptionsOptions {
  enabled?: boolean;
}

export function useProjectOptions(options: UseProjectOptionsOptions = {}) {
  const catalog = useProjects({
    enabled: options.enabled ?? true,
    includeInactive: true,
    loadDocumentCounts: false,
    loadPeople: false,
  });

  const projects = useMemo(
    () => catalog.projects.filter(isProjectSelectable),
    [catalog.projects],
  );

  return {
    projects,
    isLoading: catalog.isLoading,
    error: catalog.error,
    schemaMode: catalog.schemaMode,
    compatibilityMessage: catalog.compatibilityMessage,
    canUseProjects:
      catalog.schemaMode === "enterprise" || catalog.schemaMode === "legacy",
    refresh: catalog.refresh,
  };
}
