import { loadLocalDocuments } from "@/hooks/useDocuments";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";

export interface PublicationSelectableDocument {
  id: string;
  code: string | null;
  title: string;
  status: string;
  published_at: string | null;
  library_id: string | null;
  project_id: string | null;
}

const PUBLIC_DOCUMENT_STATUSES = new Set([
  "published",
  "approved",
  "approved_with_comments",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSelectableDocument(
  value: unknown,
): PublicationSelectableDocument | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    code: typeof value.code === "string" ? value.code : null,
    title: typeof value.title === "string" ? value.title : "Documento",
    status: typeof value.status === "string" ? value.status : "draft",
    published_at:
      typeof value.published_at === "string" ? value.published_at : null,
    library_id: typeof value.library_id === "string" ? value.library_id : null,
    project_id: typeof value.project_id === "string" ? value.project_id : null,
  };
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

function sortDocuments(
  documents: PublicationSelectableDocument[],
): PublicationSelectableDocument[] {
  return [...documents].sort((left, right) => {
    const leftCode = left.code?.trim() ?? "";
    const rightCode = right.code?.trim() ?? "";

    if (leftCode && rightCode) {
      const codeComparison = leftCode.localeCompare(rightCode, "pt-BR");
      if (codeComparison !== 0) return codeComparison;
    }

    return left.title.localeCompare(right.title, "pt-BR");
  });
}

function isMissingDocumentsSchema(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  return (
    message.includes("documents") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  );
}

function isLegacyDocumentsContract(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  return (
    message.includes("library_id") ||
    message.includes("published_at") ||
    message.includes("project_id") ||
    message.includes("column")
  );
}

function isDocumentSelectable(document: PublicationSelectableDocument) {
  const normalizedStatus = document.status.trim().toLowerCase();

  if (PUBLIC_DOCUMENT_STATUSES.has(normalizedStatus)) {
    return true;
  }

  return Boolean(document.published_at);
}

async function fetchProjectIdsForLibrary(orgId: string, libraryId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .eq("library_id", libraryId);

  if (error) {
    const message = getErrorMessage(error, "").toLowerCase();
    if (
      message.includes("library_id") ||
      message.includes("schema cache") ||
      message.includes("does not exist")
    ) {
      return [] as string[];
    }

    throw error;
  }

  return (data ?? [])
    .map((item) =>
      isRecord(item) && typeof item.id === "string" ? item.id : null,
    )
    .filter((item): item is string => Boolean(item));
}

function filterDocumentsForLibrary(
  documents: PublicationSelectableDocument[],
  libraryId: string,
  projectIds: string[],
) {
  const projectIdSet = new Set(projectIds);

  return sortDocuments(
    documents.filter((document) => {
      const belongsToLibrary =
        document.library_id === libraryId ||
        (document.project_id ? projectIdSet.has(document.project_id) : false);

      return belongsToLibrary && isDocumentSelectable(document);
    }),
  );
}

async function fetchSelectableDocumentsFromRemote(
  orgId: string,
  libraryId: string,
  projectIds: string[],
) {
  const modernResult = await supabase
    .from("documents")
    .select("id, code, title, status, published_at, library_id, project_id")
    .eq("org_id", orgId)
    .limit(500);

  if (!modernResult.error) {
    return filterDocumentsForLibrary(
      (modernResult.data ?? [])
        .map(normalizeSelectableDocument)
        .filter((item): item is PublicationSelectableDocument => Boolean(item)),
      libraryId,
      projectIds,
    );
  }

  if (!isLegacyDocumentsContract(modernResult.error)) {
    throw modernResult.error;
  }

  const legacyResult = await supabase
    .from("documents")
    .select("id, code, title, status, project_id")
    .eq("org_id", orgId)
    .limit(500);

  if (legacyResult.error) {
    throw legacyResult.error;
  }

  return filterDocumentsForLibrary(
    (legacyResult.data ?? [])
      .map(normalizeSelectableDocument)
      .filter((item): item is PublicationSelectableDocument => Boolean(item)),
    libraryId,
    projectIds,
  );
}

export async function listSelectableLibraryDocuments(
  orgId: string,
  libraryId: string,
) {
  const projectIds = await fetchProjectIdsForLibrary(orgId, libraryId);

  try {
    return await fetchSelectableDocumentsFromRemote(orgId, libraryId, projectIds);
  } catch (error) {
    if (!isMissingDocumentsSchema(error)) {
      throw new Error(
        getErrorMessage(
          error,
          "Erro ao carregar documentos da biblioteca.",
        ),
      );
    }

    return filterDocumentsForLibrary(
      loadLocalDocuments(orgId).map((document) => ({
        id: document.id,
        code: document.code,
        title: document.title,
        status: document.status,
        published_at: document.published_at,
        library_id: document.library_id ?? null,
        project_id: document.project_id ?? null,
      })),
      libraryId,
      projectIds,
    );
  }
}

export async function findSelectableLibraryDocumentByCode(
  orgId: string,
  libraryId: string,
  code: string,
) {
  const normalizedTargetCode = normalizeCode(code);
  const documents = await listSelectableLibraryDocuments(orgId, libraryId);

  return (
    documents.find(
      (document) => normalizeCode(document.code ?? "") === normalizedTargetCode,
    ) ?? null
  );
}
