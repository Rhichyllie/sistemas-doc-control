import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FileCheck2, TimerReset } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OperationalBottleneck } from "@/lib/operationalIndicators";

interface BottleneckTableProps {
  title: string;
  description: string;
  items: OperationalBottleneck[];
  countLabel?: string;
  type?: "ranking" | "evidence" | "stalled";
}

export function BottleneckTable({
  title,
  description,
  items,
  countLabel = "Itens em risco",
  type = "ranking",
}: BottleneckTableProps) {
  const visibleItems = items.slice(0, 8);
  const maximum = Math.max(...visibleItems.map((item) => item.count), 1);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {visibleItems.length === 0 ? (
          <div className="mx-6 mb-6 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum gargalo identificado neste recorte.
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {type === "ranking" ? "Contexto" : "Documento e etapa"}
                    </TableHead>
                    <TableHead>
                      {type === "evidence"
                        ? "Exigência"
                        : type === "stalled"
                          ? "Idade"
                          : "Impacto"}
                    </TableHead>
                    <TableHead className="text-right">{countLabel}</TableHead>
                    <TableHead className="w-20 text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((item) => (
                    <TableRow key={`${item.key}-${item.documentId ?? ""}`}>
                      <TableCell>
                        <div className="font-medium">{item.label}</div>
                        {item.documentTitle && (
                          <div className="max-w-md truncate text-xs text-muted-foreground">
                            {[item.documentCode, item.documentTitle]
                              .filter(Boolean)
                              .join(" — ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <ItemImpact item={item} maximum={maximum} type={type} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.count}
                      </TableCell>
                      <TableCell className="text-right">
                        <ItemAction item={item} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {visibleItems.map((item) => (
                <div
                  key={`${item.key}-${item.documentId ?? ""}-mobile`}
                  className="rounded-xl border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.label}</p>
                      {item.documentTitle && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[item.documentCode, item.documentTitle]
                            .filter(Boolean)
                            .join(" — ")}
                        </p>
                      )}
                    </div>
                    <span className="text-xl font-semibold">{item.count}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <ItemImpact item={item} maximum={maximum} type={type} />
                    <ItemAction item={item} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ItemImpact({
  item,
  maximum,
  type,
}: {
  item: OperationalBottleneck;
  maximum: number;
  type: "ranking" | "evidence" | "stalled";
}) {
  if (type === "evidence") {
    return (
      <Badge variant="secondary">
        <FileCheck2 className="mr-1 h-3.5 w-3.5" />
        {item.requiredFile ? "Arquivo obrigatório" : "Evidência obrigatória"}
      </Badge>
    );
  }
  if (type === "stalled") {
    return (
      <Badge variant="outline">
        <TimerReset className="mr-1 h-3.5 w-3.5" />
        {item.ageHours === null || item.ageHours === undefined
          ? "Idade indisponível"
          : `${Math.max(0, Math.round(item.ageHours))} h`}
      </Badge>
    );
  }
  const high = item.count === maximum && item.count > 0;
  return (
    <Badge variant={high ? "destructive" : "secondary"}>
      {high ? "Maior impacto" : item.count > 1 ? "Atenção" : "Monitorar"}
    </Badge>
  );
}

function ItemAction({ item }: { item: OperationalBottleneck }) {
  return item.documentId ? (
    <Button asChild size="sm" variant="ghost">
      <Link
        aria-label={`Abrir documento de ${item.label}`}
        to="/authenticated/documents/$documentId"
        params={{ documentId: item.documentId }}
      >
        Abrir
        <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
      </Link>
    </Button>
  ) : (
    <Button asChild size="sm" variant="ghost">
      <Link to="/authenticated/documentos/central">
        Ver
        <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
      </Link>
    </Button>
  );
}
