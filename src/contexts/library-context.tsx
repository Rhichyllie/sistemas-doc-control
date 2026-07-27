import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLibraries, type LibraryRecord } from "@/hooks/useLibraries";

const ACTIVE_LIBRARY_STORAGE_KEY = "tramita.activeLibraryId";

interface LibraryScopeValue {
  libraryId: string | null;
  library: LibraryRecord | null;
  libraries: LibraryRecord[];
  loading: boolean;
}

const LibraryScopeContext = createContext<LibraryScopeValue>({
  libraryId: null,
  library: null,
  libraries: [],
  loading: false,
});

export function getStoredActiveLibraryId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_LIBRARY_STORAGE_KEY);
}

export function setStoredActiveLibraryId(libraryId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_LIBRARY_STORAGE_KEY, libraryId);
}

export function LibraryScopeProvider({
  libraryId,
  children,
}: {
  libraryId: string;
  children: ReactNode;
}) {
  const catalog = useLibraries();
  const library =
    catalog.libraries.find((item) => item.id === libraryId) ?? null;

  useEffect(() => {
    if (libraryId) setStoredActiveLibraryId(libraryId);
  }, [libraryId]);

  return (
    <LibraryScopeContext.Provider
      value={{
        libraryId,
        library,
        libraries: catalog.libraries,
        loading: catalog.loading,
      }}
    >
      {children}
    </LibraryScopeContext.Provider>
  );
}

export function useLibraryScope() {
  return useContext(LibraryScopeContext);
}
