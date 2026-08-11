import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import type {
  DocumentTramiteInstance,
  DocumentTramiteInstanceEdge,
  DocumentTramiteInstanceEvidence,
  DocumentTramiteInstanceEvent,
  DocumentTramiteInstanceStep,
} from "@/lib/documentTramiteExecution";

export type DocumentTramiteExecutionSchemaStatus =
  | "loading"
  | "ready"
  | "empty"
  | "not_installed"
  | "restricted"
  | "error";

interface UseDocumentTramiteInstancesOptions {
  documentId?: string | null;
  instanceId?: string | null;
  recentLimit?: number;
  enabled?: boolean;
  activeOnly?: boolean;
  loadAllSteps?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSchemaUnavailable(error: unknown) {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
  const text = [error.code, error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    code === "pgrst205" ||
    code === "42p01" ||
    text.includes("schema cache") ||
    text.includes("could not find the table") ||
    (text.includes("document_tramite_instance") &&
      text.includes("does not exist"))
  );
}

export function useDocumentTramiteInstances({
  documentId,
  instanceId,
  recentLimit = 25,
  enabled = true,
  activeOnly = false,
  loadAllSteps = false,
}: UseDocumentTramiteInstancesOptions = {}) {
  const { profile } = useAuthContext();
  const [instances, setInstances] = useState<DocumentTramiteInstance[]>([]);
  const [steps, setSteps] = useState<DocumentTramiteInstanceStep[]>([]);
  const [edges, setEdges] = useState<DocumentTramiteInstanceEdge[]>([]);
  const [evidence, setEvidence] = useState<DocumentTramiteInstanceEvidence[]>(
    [],
  );
  const [events, setEvents] = useState<DocumentTramiteInstanceEvent[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [schemaStatus, setSchemaStatus] =
    useState<DocumentTramiteExecutionSchemaStatus>("loading");

  const clearDetails = useCallback(() => {
    setSteps([]);
    setEdges([]);
    setEvidence([]);
    setEvents([]);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setInstances([]);
      clearDetails();
      setError(null);
      setSchemaStatus("empty");
      setIsLoading(false);
      return;
    }
    if (!profile?.org_id) {
      setInstances([]);
      clearDetails();
      setError("Seu perfil não possui organização válida.");
      setSchemaStatus("restricted");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    let instanceQuery = supabase
      .from("document_tramite_instances")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(recentLimit);
    if (documentId) instanceQuery = instanceQuery.eq("document_id", documentId);

    if (activeOnly) instanceQuery = instanceQuery.eq("status", "active");

    const instanceResult = await instanceQuery;
    if (instanceResult.error) {
      setInstances([]);
      clearDetails();
      if (isSchemaUnavailable(instanceResult.error)) {
        setSchemaStatus("not_installed");
        setError(
          "Execução de trâmites ainda não instalada. O modelador continua disponível normalmente.",
        );
      } else {
        setSchemaStatus("restricted");
        setError(
          getErrorMessage(
            instanceResult.error,
            "Não foi possível carregar as execuções. Verifique RLS e organização.",
          ),
        );
      }
      setIsLoading(false);
      return;
    }

    const loadedInstances = (instanceResult.data ??
      []) as unknown as DocumentTramiteInstance[];
    setInstances(loadedInstances);
    setSchemaStatus(loadedInstances.length ? "ready" : "empty");

    if (loadAllSteps) {
      const instanceIds = loadedInstances.map((item) => item.id);
      if (!instanceIds.length) {
        clearDetails();
        setIsLoading(false);
        return;
      }
      const chunks: string[][] = [];
      for (let index = 0; index < instanceIds.length; index += 100) {
        chunks.push(instanceIds.slice(index, index + 100));
      }
      const stepResults = await Promise.all(
        chunks.map((ids) =>
          supabase
            .from("document_tramite_instance_steps")
            .select("*")
            .eq("org_id", profile.org_id)
            .in("instance_id", ids)
            .order("created_at", { ascending: true }),
        ),
      );
      const stepsError = stepResults.find((result) => result.error)?.error;
      if (stepsError) {
        clearDetails();
        setSchemaStatus(
          isSchemaUnavailable(stepsError) ? "not_installed" : "restricted",
        );
        setError(
          getErrorMessage(
            stepsError,
            "As execuções existem, mas suas etapas não puderam ser carregadas.",
          ),
        );
        setIsLoading(false);
        return;
      }
      setSteps(
        stepResults.flatMap(
          (result) =>
            (result.data ?? []) as unknown as DocumentTramiteInstanceStep[],
        ),
      );
      setEdges([]);
      setEvidence([]);
      setEvents([]);
      setIsLoading(false);
      return;
    }

    const target =
      loadedInstances.find((item) => item.id === instanceId) ??
      loadedInstances.find((item) => item.status === "active") ??
      loadedInstances[0];
    if (!target) {
      clearDetails();
      setIsLoading(false);
      return;
    }

    const [stepsResult, edgesResult, evidenceResult, eventsResult] =
      await Promise.all([
        supabase
          .from("document_tramite_instance_steps")
          .select("*")
          .eq("org_id", profile.org_id)
          .eq("instance_id", target.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("document_tramite_instance_edges")
          .select("*")
          .eq("org_id", profile.org_id)
          .eq("instance_id", target.id)
          .order("priority", { ascending: true }),
        supabase
          .from("document_tramite_instance_evidence")
          .select("*")
          .eq("org_id", profile.org_id)
          .eq("instance_id", target.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("document_tramite_instance_events")
          .select("*")
          .eq("org_id", profile.org_id)
          .eq("instance_id", target.id)
          .order("created_at", { ascending: false }),
      ]);

    const relationError =
      stepsResult.error ??
      edgesResult.error ??
      evidenceResult.error ??
      eventsResult.error;
    if (relationError) {
      clearDetails();
      setSchemaStatus(
        isSchemaUnavailable(relationError) ? "not_installed" : "restricted",
      );
      setError(
        getErrorMessage(
          relationError,
          "A instância existe, mas seus detalhes não puderam ser carregados.",
        ),
      );
      setIsLoading(false);
      return;
    }

    setSteps(
      (stepsResult.data ?? []) as unknown as DocumentTramiteInstanceStep[],
    );
    setEdges(
      (edgesResult.data ?? []) as unknown as DocumentTramiteInstanceEdge[],
    );
    setEvidence(
      (evidenceResult.data ??
        []) as unknown as DocumentTramiteInstanceEvidence[],
    );
    setEvents(
      (eventsResult.data ?? []) as unknown as DocumentTramiteInstanceEvent[],
    );
    setIsLoading(false);
  }, [
    clearDetails,
    activeOnly,
    documentId,
    enabled,
    instanceId,
    loadAllSteps,
    profile?.org_id,
    recentLimit,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedInstance = useMemo(
    () =>
      instances.find((item) => item.id === instanceId) ??
      instances.find((item) => item.status === "active") ??
      instances[0] ??
      null,
    [instanceId, instances],
  );

  return {
    instances,
    selectedInstance,
    activeInstance:
      instances.find((instance) => instance.status === "active") ?? null,
    steps,
    edges,
    evidence,
    events,
    isLoading,
    error,
    schemaStatus,
    refresh,
  };
}
