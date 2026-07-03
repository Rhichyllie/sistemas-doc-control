import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface IndicatorKpiCardProps {
  title: string;
  value: number | string | null;
  description: string;
  icon: LucideIcon;
  tone?: "neutral" | "warning" | "critical" | "success";
  badge?: string;
  actionUrl?: string;
}

export function IndicatorKpiCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "neutral",
  badge,
  actionUrl,
}: IndicatorKpiCardProps) {
  const iconClass =
    tone === "critical"
      ? "bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "bg-amber-100 text-amber-700"
        : tone === "success"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-primary/10 text-primary";

  return (
    <Card className={tone === "critical" ? "border-destructive/35" : ""}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {badge && (
            <Badge className="mt-2" variant="outline">
              {badge}
            </Badge>
          )}
        </div>
        <div className={`rounded-lg p-2 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">
          {value ?? "—"}
        </div>
        <CardDescription className="mt-2 min-h-10">
          {description}
        </CardDescription>
        {actionUrl && (
          <Button asChild className="mt-2 h-auto p-0" variant="link">
            <Link to={actionUrl}>
              Investigar <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
