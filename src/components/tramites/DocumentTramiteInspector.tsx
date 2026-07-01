import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ApprovalGroup,
  WorkflowActorUser,
} from "@/hooks/useWorkflowActors";
import {
  type DocumentTramiteAssignmentType,
  type DocumentTramiteNode,
} from "@/lib/documentTramiteModel";

interface DocumentTramiteInspectorProps {
  node: DocumentTramiteNode | null;
  users: WorkflowActorUser[];
  groups: ApprovalGroup[];
  roles: readonly { value: string; label: string }[];
  canUseGroups: boolean;
  onChange: (updates: Partial<DocumentTramiteNode>) => void;
  onRemove: () => void;
}

export function DocumentTramiteInspector({
  node,
  users,
  groups,
  roles,
  canUseGroups,
  onChange,
  onRemove,
}: DocumentTramiteInspectorProps) {
  if (!node) {
    return (
      <aside className="rounded-xl border bg-muted/20 p-4">
        <h3 className="font-semibold">Inspetor da etapa</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Selecione uma etapa para definir responsável, prazo, evidências e
          instruções.
        </p>
      </aside>
    );
  }

  const canAssign = !["start", "end", "decision", "publication"].includes(
    node.node_type,
  );

  return (
    <aside className="space-y-4 rounded-xl border bg-background p-4">
      <div>
        <h3 className="font-semibold">Configurar etapa</h3>
        <p className="text-xs text-muted-foreground">{node.node_type}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tramite-node-label">Nome da etapa</Label>
        <Input
          id="tramite-node-label"
          value={node.label}
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tramite-node-description">Descrição</Label>
        <Textarea
          id="tramite-node-description"
          value={node.description}
          onChange={(event) => onChange({ description: event.target.value })}
          rows={2}
        />
      </div>
      {canAssign && (
        <>
          <div className="space-y-2">
            <Label>Quem atua</Label>
            <Select
              value={node.assignment_type}
              onValueChange={(value) =>
                onChange({
                  assignment_type: value as DocumentTramiteAssignmentType,
                  assignee_user_id: null,
                  assignee_group_id: null,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum responsável</SelectItem>
                <SelectItem value="author">Autor do documento</SelectItem>
                <SelectItem value="document_owner">
                  Dono do documento
                </SelectItem>
                <SelectItem value="specific_user">
                  Usuário específico
                </SelectItem>
                <SelectItem
                  value="approval_group"
                  disabled={!canUseGroups || groups.length === 0}
                >
                  Grupo de aprovação
                </SelectItem>
                <SelectItem value="role">Papel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {node.assignment_type === "specific_user" && (
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select
                value={node.assignee_user_id ?? ""}
                onValueChange={(value) => onChange({ assignee_user_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {node.assignment_type === "approval_group" && (
            <div className="space-y-2">
              <Label>Grupo</Label>
              <Select
                value={node.assignee_group_id ?? ""}
                onValueChange={(value) =>
                  onChange({ assignee_group_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {groups
                    .filter((group) => group.is_active)
                    .map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {node.assignment_type === "role" && (
            <div className="space-y-2">
              <Label>Papel responsável</Label>
              <Select
                value={node.required_role ?? ""}
                onValueChange={(value) => onChange({ required_role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="tramite-node-due">Prazo em dias</Label>
            <Input
              id="tramite-node-due"
              type="number"
              min={0}
              max={3650}
              value={node.due_days ?? ""}
              onChange={(event) =>
                onChange({
                  due_days:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
              placeholder="Sem prazo"
            />
          </div>
        </>
      )}
      <div className="space-y-2">
        {[
          ["required_evidence", "Evidência obrigatória"],
          ["required_file", "Arquivo obrigatório"],
          ["require_comment", "Comentário obrigatório"],
          ["allow_correction", "Permitir correção"],
        ].map(([field, label]) => (
          <label key={field} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean(node[field as keyof DocumentTramiteNode])}
              onCheckedChange={(checked) =>
                onChange({ [field]: checked === true })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="tramite-node-instructions">Instruções</Label>
        <Textarea
          id="tramite-node-instructions"
          value={node.instructions}
          onChange={(event) => onChange({ instructions: event.target.value })}
          placeholder="O que a pessoa precisa fazer nesta etapa?"
          rows={3}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full text-destructive hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
        Remover etapa
      </Button>
    </aside>
  );
}
