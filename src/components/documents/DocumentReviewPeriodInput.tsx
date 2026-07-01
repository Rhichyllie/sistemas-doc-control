import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatReviewPeriod,
  type DocumentReviewPeriod,
  type DocumentReviewPeriodUnit,
  validateReviewPeriod,
} from "@/lib/documentReviewPeriod";

interface DocumentReviewPeriodInputProps {
  id: string;
  label: string;
  value: DocumentReviewPeriod;
  onChange: (value: DocumentReviewPeriod) => void;
  description?: string;
  disabled?: boolean;
  requiredByPolicy?: boolean;
}

const PRESETS: DocumentReviewPeriod[] = [
  { value: 6, unit: "months" },
  { value: 12, unit: "months" },
  { value: 24, unit: "months" },
  { value: 36, unit: "months" },
];

export function DocumentReviewPeriodInput({
  id,
  label,
  value,
  onChange,
  description,
  disabled,
  requiredByPolicy,
}: DocumentReviewPeriodInputProps) {
  const validationError = validateReviewPeriod(value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {requiredByPolicy && (
          <span className="text-xs font-medium text-amber-700">
            Obrigatório por política
          </span>
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
        <Input
          id={id}
          type="number"
          min={1}
          step={1}
          disabled={disabled}
          value={value.value}
          onChange={(event) =>
            onChange({
              ...value,
              value: Number(event.target.value),
            })
          }
        />
        <Select
          disabled={disabled}
          value={value.unit}
          onValueChange={(unit) =>
            onChange({
              ...value,
              unit: unit as DocumentReviewPeriodUnit,
            })
          }
        >
          <SelectTrigger aria-label="Unidade do período de revisão">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="days">Dias</SelectItem>
            <SelectItem value="months">Meses</SelectItem>
            <SelectItem value="years">Anos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <Button
            key={`${preset.value}-${preset.unit}`}
            type="button"
            size="sm"
            variant={
              value.value === preset.value && value.unit === preset.unit
                ? "secondary"
                : "ghost"
            }
            disabled={disabled}
            onClick={() => onChange(preset)}
          >
            {preset.value}m
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {description ??
          `Período configurado: ${formatReviewPeriod(value)}. Os atalhos são opcionais.`}
      </p>
      {validationError && (
        <p className="text-xs text-destructive">{validationError}</p>
      )}
    </div>
  );
}
