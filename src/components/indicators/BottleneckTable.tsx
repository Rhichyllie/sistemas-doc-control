import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
}

export function BottleneckTable({
  title,
  description,
  items,
  countLabel = "Itens em risco",
}: BottleneckTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Nenhum gargalo identificado neste recorte.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concentração</TableHead>
                <TableHead className="text-right">{countLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${item.key}-${item.documentId ?? ""}`}>
                  <TableCell>
                    <div className="font-medium">{item.label}</div>
                    {item.documentTitle && (
                      <div className="text-xs text-muted-foreground">
                        {[item.documentCode, item.documentTitle]
                          .filter(Boolean)
                          .join(" — ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Badge
                        variant={item.count > 0 ? "destructive" : "outline"}
                      >
                        {item.count}
                      </Badge>
                      {item.documentId && (
                        <Link
                          aria-label="Abrir documento"
                          className="text-primary"
                          to="/authenticated/documents/$documentId"
                          params={{ documentId: item.documentId }}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
