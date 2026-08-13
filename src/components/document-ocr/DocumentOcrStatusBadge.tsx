import { Badge } from "@/components/ui/badge";
import {
  getDocumentOcrPageStatusLabel,
  getDocumentOcrStatusLabel,
  getDocumentOcrStatusTone,
  type DocumentOcrJobStatus,
  type DocumentOcrPageStatus,
} from "@/lib/documentOcr";

export function DocumentOcrStatusBadge({
  status,
}: {
  status: DocumentOcrJobStatus;
}) {
  return (
    <Badge variant="outline" className={getDocumentOcrStatusTone(status)}>
      {getDocumentOcrStatusLabel(status)}
    </Badge>
  );
}

export function DocumentOcrPageStatusBadge({
  status,
}: {
  status: DocumentOcrPageStatus;
}) {
  return (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
      {getDocumentOcrPageStatusLabel(status)}
    </Badge>
  );
}
