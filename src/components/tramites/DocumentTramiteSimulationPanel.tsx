import { CheckCircle2, CircleDashed, Play, Route, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useDocumentTramiteSimulation } from "@/hooks/useDocumentTramiteSimulation";
import { useProjectOptions } from "@/hooks/useProjectOptions";

type SimulationController = ReturnType<typeof useDocumentTramiteSimulation>;

export function DocumentTramiteSimulationPanel({
  simulation,
}: {
  simulation: SimulationController;
}) {
  const projects = useProjectOptions();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Route className="h-5 w-5 text-primary" />
          Simulação operacional
        </CardTitle>
        <CardDescription>
          Prevê caminho, tarefas, responsáveis e bloqueios. Nenhum dado é
          gravado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="simulation-doc-type">Tipo documental</Label>
            <Input
              id="simulation-doc-type"
              value={simulation.context.docType ?? ""}
              onChange={(event) =>
                simulation.setContext({
                  docType: event.target.value.toUpperCase(),
                })
              }
              placeholder="Ex.: PRO"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="simulation-area">Área</Label>
            <Input
              id="simulation-area"
              value={simulation.context.area ?? ""}
              onChange={(event) =>
                simulation.setContext({
                  area: event.target.value.toUpperCase(),
                })
              }
              placeholder="Ex.: ENG"
            />
          </div>
          <div className="space-y-2">
            <Label>Projeto</Label>
            <Select
              value={simulation.context.projectId ?? "none"}
              onValueChange={(value) =>
                simulation.setContext({
                  projectId: value === "none" ? null : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem projeto</SelectItem>
                {projects.projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Decisão simulada</Label>
            <Select
              value={simulation.context.approvalDecision}
              onValueChange={(value) =>
                simulation.setContext({
                  approvalDecision: value as "approved" | "rejected",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Aprovado</SelectItem>
                <SelectItem value="rejected">Rejeitado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 self-end rounded-lg border p-3 text-sm">
            <Checkbox
              checked={simulation.context.hasFile}
              onCheckedChange={(checked) =>
                simulation.setContext({ hasFile: checked === true })
              }
            />
            Documento possui arquivo
          </label>
          <label className="flex items-center gap-2 self-end rounded-lg border p-3 text-sm">
            <Checkbox
              checked={simulation.context.hasEvidence}
              onCheckedChange={(checked) =>
                simulation.setContext({ hasEvidence: checked === true })
              }
            />
            Evidência disponível
          </label>
        </div>
        <Button type="button" onClick={simulation.simulate}>
          <Play className="h-4 w-4" />
          Executar simulação
        </Button>

        {simulation.result && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2">
              {simulation.result.completed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="font-medium">
                {simulation.result.completed
                  ? "Caminho concluído até o Fim"
                  : "Simulação encontrou bloqueios"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {simulation.result.path.map((step, index) => (
                <div
                  key={`${step.nodeId}-${index}`}
                  className="flex items-center gap-2"
                >
                  <Badge variant="outline">{step.label}</Badge>
                  {index < simulation.result!.path.length - 1 && (
                    <span className="text-muted-foreground">→</span>
                  )}
                </div>
              ))}
            </div>
            {simulation.result.blockers.length > 0 && (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                {simulation.result.blockers.map((blocker) => (
                  <p key={blocker} className="text-sm text-destructive">
                    {blocker}
                  </p>
                ))}
              </div>
            )}
            <div>
              <p className="text-sm font-medium">Tarefas previstas</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {simulation.result.tasks.map((task) => (
                  <li key={task} className="flex gap-2">
                    <CircleDashed className="mt-0.5 h-4 w-4 shrink-0" />
                    {task}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
