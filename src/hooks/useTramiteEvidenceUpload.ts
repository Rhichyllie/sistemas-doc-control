import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useDocumentTramiteEvidence } from "@/hooks/useDocumentTramiteEvidence";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import {
  calculateEvidenceFileHash,
  sanitizeEvidenceFileName,
  TRAMITE_EVIDENCE_BUCKET,
  validateTramiteEvidenceFile,
} from "@/lib/tramiteEvidenceFiles";

interface UseTramiteEvidenceUploadOptions {
  enabled?: boolean;
  refresh?: () => Promise<unknown> | unknown;
}

interface UploadTramiteEvidenceInput {
  documentId: string;
  instanceId: string;
  stepId: string;
  file: File;
  note?: string | null;
}

interface OpenTramiteEvidenceInput {
  filePath: string;
  fileName?: string | null;
  storageBucket?: string | null;
}

export interface TramiteEvidenceUploadResult {
  evidenceId: string;
  filePath: string;
  warnings: string[];
}

type FileEvidenceAvailability =
  | "checking"
  | "available"
  | "not_installed"
  | "restricted";

function isFileEvidenceSchemaUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = String(record.code ?? "").toUpperCase();
  const message = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    ((message.includes("document_tramite_instance_evidence") ||
      message.includes("add_document_tramite_evidence")) &&
      (message.includes("does not exist") ||
        message.includes("could not find") ||
        message.includes("schema cache") ||
        message.includes("column")))
  );
}

export function useTramiteEvidenceUpload({
  enabled = true,
  refresh,
}: UseTramiteEvidenceUploadOptions = {}) {
  const { profile } = useAuthContext();
  const evidenceActions = useDocumentTramiteEvidence(refresh);
  const [availability, setAvailability] =
    useState<FileEvidenceAvailability>("checking");
  const [compatibilityMessage, setCompatibilityMessage] = useState<
    string | null
  >(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function probe() {
      if (!enabled || !profile?.org_id) {
        if (active) {
          setAvailability("not_installed");
          setCompatibilityMessage(null);
        }
        return;
      }

      setAvailability("checking");
      const { error: probeError } = await supabase
        .from("document_tramite_instance_evidence")
        .select("id, file_path, file_name, file_size, file_hash, metadata")
        .eq("org_id", profile.org_id)
        .limit(0);
      if (!active) return;

      if (!probeError) {
        setAvailability("available");
        setCompatibilityMessage(null);
      } else if (isFileEvidenceSchemaUnavailable(probeError)) {
        setAvailability("not_installed");
        setCompatibilityMessage(
          "Upload de evidência ainda não instalado neste ambiente. Notas e links continuam disponíveis.",
        );
      } else {
        setAvailability("restricted");
        setCompatibilityMessage(
          "Não foi possível confirmar o acesso aos arquivos de evidência. Verifique as policies do ciclo 18 e do Storage.",
        );
      }
    }

    void probe();
    return () => {
      active = false;
    };
  }, [enabled, profile?.org_id]);

  const uploadEvidence = useCallback(
    async (
      input: UploadTramiteEvidenceInput,
    ): Promise<TramiteEvidenceUploadResult> => {
      setError(null);
      function fail(message: string): never {
        setError(message);
        throw new Error(message);
      }

      if (!profile?.org_id) {
        fail("Seu perfil não possui organização válida.");
      }
      if (availability !== "available") {
        fail(
          compatibilityMessage ??
            "Upload de evidência ainda não está disponível.",
        );
      }

      const validationError = validateTramiteEvidenceFile(input.file);
      if (validationError) fail(validationError);

      const safeFileName = sanitizeEvidenceFileName(input.file.name);
      if (!safeFileName) fail("O nome do arquivo é inválido.");

      setIsUploading(true);
      const warnings: string[] = [];
      const hash = await calculateEvidenceFileHash(input.file);
      if (!hash) {
        warnings.push(
          "O navegador não disponibilizou SHA-256; a evidência foi registrada sem hash.",
        );
      }

      const randomPart =
        globalThis.crypto?.randomUUID?.().slice(0, 8) ??
        Math.random().toString(36).slice(2, 10);
      const storagePath = `${profile.org_id}/evidence/${input.documentId}/${input.instanceId}/${input.stepId}/${Date.now()}-${randomPart}-${safeFileName}`;
      let uploaded = false;

      try {
        const { error: uploadError } = await supabase.storage
          .from(TRAMITE_EVIDENCE_BUCKET)
          .upload(storagePath, input.file, {
            contentType: input.file.type || undefined,
            upsert: false,
          });
        if (uploadError) {
          throw new Error(
            `Não foi possível enviar o arquivo de evidência: ${getErrorMessage(uploadError, "erro não identificado")}`,
          );
        }
        uploaded = true;

        const result = await evidenceActions.addEvidence({
          stepId: input.stepId,
          evidenceType: "file",
          note: input.note,
          filePath: storagePath,
          fileName: input.file.name,
          fileSize: input.file.size,
          fileHash: hash,
          metadata: {
            source: "document_detail",
            storage_bucket: TRAMITE_EVIDENCE_BUCKET,
            file_mime_type: input.file.type || null,
            safe_file_name: safeFileName,
          },
        });

        return {
          evidenceId: result.evidence_id,
          filePath: storagePath,
          warnings,
        };
      } catch (uploadOrRegisterError) {
        let message = getErrorMessage(
          uploadOrRegisterError,
          "Não foi possível registrar a evidência.",
        );
        if (uploaded) {
          const { error: cleanupError } = await supabase.storage
            .from(TRAMITE_EVIDENCE_BUCKET)
            .remove([storagePath]);
          if (cleanupError) {
            message = `${message} O arquivo pode ter permanecido no Storage em ${storagePath}. Solicite a limpeza manual.`;
          } else {
            message = `${message} O upload parcial foi removido.`;
          }
        }
        setError(message);
        throw new Error(message);
      } finally {
        setIsUploading(false);
      }
    },
    [availability, compatibilityMessage, evidenceActions, profile?.org_id],
  );

  const openEvidenceFile = useCallback(
    async (input: OpenTramiteEvidenceInput) => {
      setError(null);
      const bucket = input.storageBucket || TRAMITE_EVIDENCE_BUCKET;
      const { data, error: signedUrlError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(input.filePath, 60, {
          download: input.fileName || undefined,
        });
      if (signedUrlError || !data?.signedUrl) {
        const message = `Não foi possível abrir a evidência: ${getErrorMessage(signedUrlError, "URL temporária indisponível")}`;
        setError(message);
        throw new Error(message);
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return data.signedUrl;
    },
    [],
  );

  return {
    uploadEvidence,
    openEvidenceFile,
    isUploading,
    isCheckingAvailability: availability === "checking",
    canUploadFiles: availability === "available",
    availability,
    compatibilityMessage,
    error: error ?? evidenceActions.error,
    clearError: () => {
      setError(null);
      evidenceActions.clearError();
    },
  };
}
