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

/** Payload para criar uma nova publicação pela UI de administração. */
export interface CreatePublicationInput {
  titulo: string;
  categoria: PublicationCategory;
  resumo?: string | null;
  documento_id?: string | null;
  data_publicacao?: string;
}

const PUBLICATIONS_BUCKET = "publicacoes";

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

function buildPublicationImagePath(orgId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const safeExtension =
    extension && /^[a-z0-9]+$/i.test(extension) ? extension : "jpg";

  return `${orgId}/${crypto.randomUUID()}.${safeExtension}`;
}

function extractPublicationImagePath(url: string) {
  try {
    const parsedUrl = new URL(url);
    const marker = `/storage/v1/object/public/${PUBLICATIONS_BUCKET}/`;
    const markerIndex = parsedUrl.pathname.indexOf(marker);

    if (markerIndex === -1) return null;

    return decodeURIComponent(
      parsedUrl.pathname.slice(markerIndex + marker.length),
    );
  } catch {
    return null;
  }
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
      // #region debug-point C:refresh-no-org
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"C",location:"src/hooks/usePublications.ts:refresh:noOrg",msg:"[DEBUG] publications refresh skipped without org",data:{profileId:profile?.id ?? null,orgId:profile?.org_id ?? null},ts:Date.now()})}).catch(()=>{});
      // #endregion
      setPublications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setUsingFallback(false);
    // #region debug-point E:refresh-start
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"E",location:"src/hooks/usePublications.ts:refresh:start",msg:"[DEBUG] publications refresh started",data:{orgId:profile.org_id,limit:typeof limit === "number" ? limit : null},ts:Date.now()})}).catch(()=>{});
    // #endregion

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
      // #region debug-point E:refresh-result
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"E",location:"src/hooks/usePublications.ts:refresh:result",msg:"[DEBUG] publications refresh received query result",data:{orgId:profile.org_id,rowCount:Array.isArray(result.data) ? result.data.length : null,error:result.error ? {message:result.error.message,code:(result.error as { code?: string }).code}:null},ts:Date.now()})}).catch(()=>{});
      // #endregion
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

  const fetchPublicationState = useCallback(
    async (publicationId: string) => {
      if (!profile?.org_id) {
        throw new Error(
          "Organização não identificada para validar a publicação.",
        );
      }

      const { data, error: selectError } = await supabase
        .from("publicacoes")
        .select("id, imagem_url")
        .eq("id", publicationId)
        .eq("org_id", profile.org_id)
        .maybeSingle();

      if (selectError) {
        throw new Error(
          getErrorMessage(
            selectError,
            "Não foi possível validar a publicação salva.",
          ),
        );
      }

      return data;
    },
    [profile?.org_id],
  );

  /**
   * Cria uma nova publicação vinculada (opcionalmente) a um documento já
   * cadastrado, e atualiza a lista local em seguida.
   */
  const createPublication = useCallback(
    async (input: CreatePublicationInput) => {
      if (!profile?.org_id) {
        throw new Error("Organização não identificada para criar a publicação.");
      }
      // #region debug-point A:create-start
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"A",location:"src/hooks/usePublications.ts:createPublication:start",msg:"[DEBUG] publication insert started",data:{orgId:profile.org_id,profileId:profile.id ?? null,titulo:input.titulo,categoria:input.categoria,documentoId:input.documento_id ?? null},ts:Date.now()})}).catch(()=>{});
      // #endregion

      const { data, error: insertError } = await supabase.rpc(
        "create_publicacao",
        {
          p_titulo: input.titulo,
          p_categoria: input.categoria,
          p_resumo: input.resumo ?? null,
          p_documento_id: input.documento_id ?? null,
          p_data_publicacao: input.data_publicacao ?? new Date().toISOString(),
        },
      );
      // #region debug-point A:create-result
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"A",location:"src/hooks/usePublications.ts:createPublication:result",msg:"[DEBUG] publication insert finished",data:{insertedId:typeof data === "string" ? data : null,error:insertError ? {message:insertError.message,code:(insertError as { code?: string }).code}:null},ts:Date.now()})}).catch(()=>{});
      // #endregion

      if (insertError) {
        throw new Error(
          getErrorMessage(insertError, "Não foi possível criar a publicação."),
        );
      }

      if (typeof data !== "string" || !data) {
        throw new Error("A publicação foi criada sem retornar um identificador.");
      }

      const persistedPublication = await fetchPublicationState(data);
      if (!persistedPublication) {
        throw new Error(
          "A publicação não foi confirmada no Supabase após a gravação.",
        );
      }

      await refresh();

      return data;
    },
    [fetchPublicationState, profile, refresh],
  );

  const persistPublicationImage = useCallback(
    async (publicationId: string, imageUrl: string | null) => {
      const { error } = await supabase.rpc("set_publicacao_image", {
        p_publicacao_id: publicationId,
        p_imagem_url: imageUrl,
      });

      if (error) {
        throw new Error(
          getErrorMessage(
            error,
            "Não foi possível salvar a imagem da publicação.",
          ),
        );
      }
    },
    [],
  );

  const uploadPublicationImage = useCallback(
    async (file: File) => {
      if (!profile?.org_id) {
        throw new Error("Organização não identificada para enviar a imagem.");
      }

      const filePath = buildPublicationImagePath(profile.org_id, file);
      // #region debug-point B:upload-start
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"B",location:"src/hooks/usePublications.ts:uploadPublicationImage:start",msg:"[DEBUG] publication image upload started",data:{orgId:profile.org_id,filePath,fileName:file.name,fileType:file.type,fileSize:file.size},ts:Date.now()})}).catch(()=>{});
      // #endregion
      const { error } = await supabase.storage
        .from(PUBLICATIONS_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) {
        throw new Error(
          getErrorMessage(
            error,
            "Não foi possível enviar a imagem da publicação.",
          ),
        );
      }

      const { data } = supabase.storage
        .from(PUBLICATIONS_BUCKET)
        .getPublicUrl(filePath);
      // #region debug-point B:upload-result
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"publication-save-missing",runId:"pre-fix",hypothesisId:"B",location:"src/hooks/usePublications.ts:uploadPublicationImage:result",msg:"[DEBUG] publication image upload finished",data:{filePath,publicUrl:data.publicUrl},ts:Date.now()})}).catch(()=>{});
      // #endregion

      return data.publicUrl;
    },
    [profile?.org_id],
  );

  const deletePublicationImage = useCallback(async (url: string | null) => {
    if (!url) return;

    const filePath = extractPublicationImagePath(url);
    if (!filePath) return;

    const { error } = await supabase.storage
      .from(PUBLICATIONS_BUCKET)
      .remove([filePath]);

    if (error) {
      throw new Error(
        getErrorMessage(
          error,
          "Não foi possível remover a imagem da publicação.",
        ),
      );
    }
  }, []);

  const updatePublicationImage = useCallback(
    async (publicationId: string, file: File, currentUrl?: string | null) => {
      if (!profile?.org_id) {
        throw new Error(
          "Organização não identificada para atualizar a publicação.",
        );
      }

      const uploadedUrl = await uploadPublicationImage(file);

      try {
        await persistPublicationImage(publicationId, uploadedUrl);
        const persistedPublication = await fetchPublicationState(publicationId);

        if (!persistedPublication || persistedPublication.imagem_url !== uploadedUrl) {
          throw new Error(
            "A imagem foi enviada, mas não foi confirmada na publicação.",
          );
        }
      } catch (error) {
        await deletePublicationImage(uploadedUrl).catch(() => undefined);
        throw error;
      }

      if (currentUrl && currentUrl !== uploadedUrl) {
        await deletePublicationImage(currentUrl).catch(() => undefined);
      }

      await refresh();
      return uploadedUrl;
    },
    [
      deletePublicationImage,
      fetchPublicationState,
      persistPublicationImage,
      profile?.org_id,
      refresh,
      uploadPublicationImage,
    ],
  );

  const removePublicationImage = useCallback(
    async (publicationId: string, currentUrl?: string | null) => {
      if (!profile?.org_id) {
        throw new Error(
          "Organização não identificada para atualizar a publicação.",
        );
      }

      await persistPublicationImage(publicationId, null);

      const persistedPublication = await fetchPublicationState(publicationId);
      if (!persistedPublication || persistedPublication.imagem_url !== null) {
        throw new Error(
          "A remoção da imagem não foi confirmada na publicação.",
        );
      }

      await deletePublicationImage(currentUrl ?? null).catch(() => undefined);
      await refresh();
    },
    [
      deletePublicationImage,
      fetchPublicationState,
      persistPublicationImage,
      profile?.org_id,
      refresh,
    ],
  );

  return {
    publications,
    latestPublications,
    loading,
    error,
    usingFallback,
    refresh,
    createPublication,
    uploadPublicationImage,
    updatePublicationImage,
    removePublicationImage,
  };
}
