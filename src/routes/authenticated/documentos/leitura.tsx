import { createFileRoute } from "@tanstack/react-router";
import { DocumentOcrPanel } from "@/components/document-ocr/DocumentOcrPanel";
import { requireRole } from "../-route-guards";

export const Route = createFileRoute("/authenticated/documentos/leitura")({
  beforeLoad: async ({ location }) => {
    await requireRole(location.href, ["admin", "manager"]);
  },
  component: DocumentOcrPanel,
});
