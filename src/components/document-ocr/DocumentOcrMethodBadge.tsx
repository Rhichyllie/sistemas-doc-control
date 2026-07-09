import { Badge } from "@/components/ui/badge";
import {
  getDocumentOcrMethodLabel,
  getDocumentOcrMethodTone,
  type DocumentOcrMethod,
} from "@/lib/documentOcr";

export function DocumentOcrMethodBadge({
  method,
}: {
  method: DocumentOcrMethod;
}) {
  return (
    <Badge variant="outline" className={getDocumentOcrMethodTone(method)}>
      {getDocumentOcrMethodLabel(method)}
    </Badge>
  );
}
