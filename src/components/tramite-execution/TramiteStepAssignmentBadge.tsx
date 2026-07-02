import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DocumentTramiteInstanceStep } from "@/lib/documentTramiteExecution";

function getTramiteAssignmentLabel(
  step: DocumentTramiteInstanceStep,
  names?: { user?: string; group?: string; role?: string },
) {
  if (step.assignment_type === "author") return "Autor do documento";
  if (step.assignment_type === "document_owner") return "Dono do documento";
  if (step.assignment_type === "specific_user") {
    return names?.user || "Usuário específico";
  }
  if (step.assignment_type === "approval_group") {
    return names?.group || "Grupo de aprovação";
  }
  if (step.assignment_type === "role") {
    return names?.role || step.required_role || "Papel da organização";
  }
  return "Autor do documento";
}

export function TramiteStepAssignmentBadge({
  step,
  userName,
  groupName,
  roleName,
}: {
  step: DocumentTramiteInstanceStep;
  userName?: string;
  groupName?: string;
  roleName?: string;
}) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <UserRound className="h-3 w-3" />
      {getTramiteAssignmentLabel(step, {
        user: userName,
        group: groupName,
        role: roleName,
      })}
    </Badge>
  );
}
