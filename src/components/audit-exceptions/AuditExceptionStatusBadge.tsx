import { Badge } from "@/components/ui/badge";
import {
  getAuditExceptionSeverityLabel,
  getAuditExceptionStatusLabel,
  getSeverityTone,
  getStatusTone,
  type AuditExceptionSeverity,
  type AuditExceptionStatus,
} from "@/lib/auditExceptions";

export function AuditExceptionSeverityBadge({
  severity,
}: {
  severity: AuditExceptionSeverity;
}) {
  return (
    <Badge variant="outline" className={getSeverityTone(severity)}>
      {getAuditExceptionSeverityLabel(severity)}
    </Badge>
  );
}

export function AuditExceptionStatusBadge({
  status,
}: {
  status: AuditExceptionStatus;
}) {
  return (
    <Badge variant="outline" className={getStatusTone(status)}>
      {getAuditExceptionStatusLabel(status)}
    </Badge>
  );
}
