import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";

export type PublicationCategory =
  | "procedimento"
  | "manual"
  | "seguranca_saude"
  | "comunicado";

export interface PublicationRecord {
  id: string;
  org_id: string;
  titulo: string;
  categoria: PublicationCategory;
  imagem_url: string | null;
  resumo: string | null;
  documento_id: string | null;
  data_publicacao: string;
  autor_id: string | null;
  autor_nome: string | null;
  documento:
    | {
        id: string;
        title: string;
        library_id: string | null;
      }
    | null;
}

const DEFAULT_PUBLICATIONS: Omit<
  PublicationRecord,
  "org_id" | "autor_id" | "documento_id" | "documento"
>[] = [
  {
    id: "fallback-procedimento",
    titulo: "Novo procedimento para emissão multidisciplinar",
    categoria: "procedimento",
    imagem_url: null,
    resumo:
      "Padronização do fluxo de emissão e conferência para entregáveis de projeto com múltiplas disciplinas.",
    data_publicacao: new Date(Date.now() - 86400000).toISOString(),
    autor_nome: "Equipe Tramita",
  },
  {
    id: "fallback-manual",
    titulo: "Manual operacional revisado para gestão documental",
    categoria: "manual",
    imagem_url: null,
    resumo:
      "Atualização do guia interno com critérios de registro, revisão e rastreabilidade de documentos.",
    data_publicacao: new Date(Date.now() - 2 * 86400000).toISOString(),
    autor_nome: "Equipe Tramita",
  },
  {
    id: "fallback-seguranca",
    titulo: "Nova orientação de segurança e saúde no canteiro",
    categoria: "seguranca_saude",
    imagem_url: null,
    resumo:
      "Comunicado com reforço dos requisitos mínimos de segurança para inspeções, manutenção e acesso controlado.",
    data_publicacao: new Date(Date.now() - 4 * 86400000).toISOString(),
    autor_nome: "Equipe Tramita",
  },
  {
    id: "fallback-comunicado",
    titulo: "Comunicado geral sobre padronização de nomenclaturas",
    categoria: "comunicado",
    imagem_url: null,
    resumo:
      "Ajustes de nomenclatura para harmonizar bibliotecas de Projeto e O&M dentro da mesma organização.",
    data_publicacao: new Date(Date.now() - 6 * 86400000).toISOString(),
    autor_nome: "Equipe Tramita",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMissingPublicationsSchema(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  return (
    message.includes("publicacoes") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  );
}

function normalizePublication(value: unknown): PublicationRecord | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  const categoria =
    value.categoria === "procedimento" ||
    value.categoria === "manual" ||
    value.categoria === "seguranca_saude" ||
    value.categoria === "comunicado"
      ? value.categoria
      : "comunicado";

  const documento = isRecord(value.documento)
    ? {
        id: String(value.documento.id ?? ""),
        title: String(value.documento.title ?? "Documento"),
        library_id:
          typeof value.documento.library_id === "string"
            ? value.documento.library_id
            : null,
      }
    : null;

  return {
    id: value.id,
    org_id: String(value.org_id ?? ""),
    titulo: String(value.titulo ?? "Publicação"),
    categoria,
    imagem_url: typeof value.imagem_url === "string" ? value.imagem_url : null,
    resumo: typeof value.resumo === "string" ? value.resumo : null,
    documento_id:
      typeof value.documento_id === "string" ? value.documento_id : null,
    data_publicacao: String(value.data_publicacao ?? new Date().toISOString()),
    autor_id: typeof value.autor_id === "string" ? value.autor_id : null,
    autor_nome:
      isRecord(value.autor) && typeof value.autor.full_name === "string"
        ? value.autor.full_name
        : null,
    documento,
  };
}

function buildFallbackPublications(orgId: string) {
  return DEFAULT_PUBLICATIONS.map((item) => ({
    ...item,
    org_id: orgId,
    autor_id: null,
    documento_id: null,
    documento: null,
  }));
}

export function usePublications(options: { limit?: number } = {}) {
  const { limit } = options;
  const { profile } = useAuthContext();
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const refresh = useCallback(async () => {
    if (!profile?.org_id) {
      setPublications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setUsingFallback(false);

    try {
      let query = supabase
        .from("publicacoes")
        .select(
          `
            id,
            org_id,
            titulo,
            categoria,
            imagem_url,
            resumo,
            documento_id,
            data_publicacao,
            autor_id,
            autor:profiles!publicacoes_autor_id_fkey (full_name),
            documento:documents!publicacoes_documento_id_fkey (id, title, library_id)
          `,
        )
        .eq("org_id", profile.org_id)
        .order("data_publicacao", { ascending: false });

      if (typeof limit === "number") {
        query = query.limit(limit);
      }

      const result = await query;
      if (result.error) {
        if (isMissingPublicationsSchema(result.error)) {
          setUsingFallback(true);
          setPublications(buildFallbackPublications(profile.org_id));
          return;
        }
        throw result.error;
      }

      setPublications(
        (result.data ?? [])
          .map(normalizePublication)
          .filter((item): item is PublicationRecord => Boolean(item)),
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar as publicações."));
      setPublications([]);
    } finally {
      setLoading(false);
    }
  }, [limit, profile?.org_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const latestPublications = useMemo(
    () =>
      publications.slice(
        0,
        typeof limit === "number" ? limit : publications.length,
      ),
    [limit, publications],
  );

  return {
    publications,
    latestPublications,
    loading,
    error,
    usingFallback,
    refresh,
  };
}
