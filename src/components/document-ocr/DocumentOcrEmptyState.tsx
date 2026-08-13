import { FileSearch } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DocumentOcrEmptyState({
  title = "Nenhuma leitura registrada",
  description = "Crie uma solicitação para acompanhar status, método, confiança e limitações da leitura documental.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader className="items-center text-center">
        <div className="rounded-full bg-muted p-3">
          <FileSearch className="h-6 w-6 text-muted-foreground" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="max-w-2xl">{description}</CardDescription>
      </CardHeader>
      <CardContent className="mx-auto max-w-2xl text-center text-sm text-muted-foreground">
        OCR indisponível, falho ou sem texto não significa documento vazio nem
        inválido. A P-29 registra apenas leitura técnica e não interpreta
        conteúdo.
      </CardContent>
    </Card>
  );
}
