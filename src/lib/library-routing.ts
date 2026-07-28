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
  };

  return map[basePath] ?? basePath;
}

export function toLibraryDocumentPath(libraryId: string, documentId: string) {
  return `/authenticated/biblioteca/${libraryId}/documentos/${documentId}`;
}
