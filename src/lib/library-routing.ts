export function getLibraryIdFromPath(pathname: string) {
  const match = pathname.match(/^\/authenticated\/biblioteca\/([^/]+)/);
  return match?.[1] ?? null;
}

export function toLibraryScopedPath(basePath: string, libraryId: string) {
  if (basePath.startsWith("/authenticated/biblioteca/")) return basePath;

  const map: Record<string, string> = {
    "/authenticated/dashboard":
      `/authenticated/biblioteca/${libraryId}/dashboard`,
    "/authenticated/documents":
      `/authenticated/biblioteca/${libraryId}/documentos`,
    "/authenticated/projetos":
      `/authenticated/biblioteca/${libraryId}/projetos`,
    "/authenticated/fluxo-de-aprovacao":
      `/authenticated/biblioteca/${libraryId}/fluxo-de-aprovacao`,
    "/authenticated/documentos/tramites":
      `/authenticated/biblioteca/${libraryId}/documentos/tramites`,
    "/authenticated/documentos/central":
      `/authenticated/biblioteca/${libraryId}/documentos/central`,
    "/authenticated/indicadores":
      `/authenticated/biblioteca/${libraryId}/indicadores`,
    "/authenticated/auditoria/relatorios":
      `/authenticated/biblioteca/${libraryId}/auditoria/relatorios`,
    "/authenticated/configuracoes":
      `/authenticated/biblioteca/${libraryId}/configuracoes`,
    "/authenticated/configuracoes/projetos":
      `/authenticated/biblioteca/${libraryId}/configuracoes/projetos`,
    "/authenticated/configuracoes/equipe":
      `/authenticated/biblioteca/${libraryId}/configuracoes/equipe`,
    "/authenticated/configuracoes/grupos-aprovacao":
      `/authenticated/biblioteca/${libraryId}/configuracoes/grupos-aprovacao`,
    "/authenticated/configuracoes/regras-documentais":
      `/authenticated/biblioteca/${libraryId}/configuracoes/regras-documentais`,
    "/authenticated/configuracoes/codificacao-documental":
      `/authenticated/biblioteca/${libraryId}/configuracoes/codificacao-documental`,
    "/authenticated/configuracoes/calendario":
      `/authenticated/biblioteca/${libraryId}/configuracoes/calendario`,
    "/authenticated/configuracoes/trilha-de-auditoria":
      `/authenticated/biblioteca/${libraryId}/configuracoes/trilha-de-auditoria`,
  };

  return map[basePath] ?? basePath;
}

export function toLibraryDocumentPath(libraryId: string, documentId: string) {
  return `/authenticated/biblioteca/${libraryId}/documentos/${documentId}`;
}
