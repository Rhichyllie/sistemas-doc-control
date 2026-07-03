import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleOff,
  ShieldAlert,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ReadinessStatusBadge } from "@/components/diagnostics/ReadinessCard";
import type { GoLiveSection, ReadinessCheck } from "@/lib/operationalReadiness";

function CheckIcon({ item }: { item: ReadinessCheck }) {
  if (item.status === "ok") {
    return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  }
  if (item.status === "not_installed") {
    return <CircleOff className="h-5 w-5 text-muted-foreground" />;
  }
  if (
    item.severity === "critical" &&
    ["absent", "read_error"].includes(item.status)
  ) {
    return <ShieldAlert className="h-5 w-5 text-destructive" />;
  }
  return <CircleAlert className="h-5 w-5 text-amber-600" />;
}

function ChecklistLine({ item }: { item: ReadinessCheck }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border bg-background p-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 shrink-0">
          <CheckIcon item={item} />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.title}</p>
            <ReadinessStatusBadge status={item.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.description}
          </p>
          {item.evidence && (
            <p className="mt-2 text-xs text-muted-foreground">
              Evidência: {item.evidence}
            </p>
          )}
        </div>
      </div>
      {item.actionRoute && item.actionLabel && (
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to={item.actionRoute}>
            {item.actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

export function ReadinessChecklist({
  sections,
}: {
  sections: GoLiveSection[];
}) {
  return (
    <Accordion
      type="multiple"
      defaultValue={["foundation", "notifications", "security", "pilot"]}
      className="rounded-xl border px-4"
    >
      {sections.map((section) => {
        const ready = section.checks.filter(
          (item) => item.status === "ok",
        ).length;
        return (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex flex-1 items-center justify-between gap-3 pr-3">
                <span>{section.title}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {ready}/{section.checks.length} OK
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              {section.checks.map((item) => (
                <ChecklistLine key={item.id} item={item} />
              ))}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
