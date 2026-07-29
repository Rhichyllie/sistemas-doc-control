import { FolderKanban } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

interface ProjectEmptyStateProps {
  filtered?: boolean;
}

export function ProjectEmptyState({
  filtered = false,
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
            : "Cada biblioteca criada registra automaticamente seu projeto correspondente. Quando houver bibliotecas nesta fase, elas aparecerão aqui."}
        </CardDescription>
      </CardContent>
    </Card>
  );
}
