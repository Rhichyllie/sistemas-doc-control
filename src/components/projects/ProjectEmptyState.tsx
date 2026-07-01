import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

interface ProjectEmptyStateProps {
  canManage: boolean;
  filtered?: boolean;
  onCreate: () => void;
}

export function ProjectEmptyState({
  canManage,
  filtered = false,
  onCreate,
}: ProjectEmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-primary/10 p-3">
          <FolderKanban className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-lg">
          {filtered
            ? "Nenhum projeto encontrado para os filtros atuais"
            : "Nenhum projeto operacional cadastrado"}
        </CardTitle>
        <CardDescription className="mt-2 max-w-lg">
          {filtered
            ? "Ajuste a busca, o status ou o tipo para ampliar os resultados."
            : "Projetos, obras, contratos e unidades aparecerão aqui para organizar documentos e códigos."}
        </CardDescription>
        {canManage && !filtered && (
          <Button className="mt-5" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Criar primeiro projeto
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
