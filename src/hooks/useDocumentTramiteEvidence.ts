import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  buildExecutionErrorMessage,
  stripTramiteUuid,
} from "@/lib/documentTramiteExecution";

interface AddEvidenceInput {
  stepId: string;
  evidenceType: "note" | "file" | "link" | "external_reference";
  note?: string | null;
  filePath?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileHash?: string | null;
  metadata?: Record<string, unknown>;
}

export function useDocumentTramiteEvidence(
  refresh?: () => Promise<unknown> | unknown,
) {
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addEvidence = useCallback(
    async (input: AddEvidenceInput) => {
      setIsAdding(true);
      setError(null);
      const stepId = stripTramiteUuid(input.stepId) ?? input.stepId;
      const { data, error: rpcError } = await supabase.rpc(
        "add_document_tramite_evidence",
        {
          p_step_id: stepId,
          p_evidence_type: input.evidenceType,
          p_note: input.note?.trim() || null,
          p_file_path: input.filePath?.trim() || null,
          p_file_name: input.fileName?.trim() || null,
          p_file_size: input.fileSize ?? null,
          p_file_hash: input.fileHash?.trim() || null,
          p_metadata: input.metadata ?? {},
        },
      );
      setIsAdding(false);
      if (rpcError) {
        const message = buildExecutionErrorMessage(
          rpcError,
          "Não foi possível registrar a evidência.",
        );
        setError(message);
        throw new Error(message);
      }
      const result = data as {
        success: boolean;
        evidence_id: string;
        instance_id: string;
        step_id: string;
      };
      if (result.success === false) {
        const message = "O banco recusou o registro da evidência.";
        setError(message);
        throw new Error(message);
      }
      await refresh?.();
      return result;
    },
    [refresh],
  );

  return {
    addEvidence,
    isAdding,
    error,
    clearError: () => setError(null),
  };
}
