import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "./ui/button";

export function QuantitySelector({
  value,
  onChange,
  name,
  disabled = false,
  allowRemoval = false,
}: {
  value: number;
  onChange: (quantity: number) => void;
  name: string;
  disabled?: boolean;
  allowRemoval?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div
      className="inline-flex max-w-full items-center gap-1"
      role="group"
      aria-label={`Quantity for ${name}`}
    >
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-8 shrink-0"
        disabled={disabled || (!allowRemoval && value <= 1)}
        aria-label={`Decrease ${name}`}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-3" />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        step={1}
        aria-label={`Quantity of ${name}`}
        disabled={disabled}
        value={draft}
        className="h-8 w-12 min-w-0 rounded-md border border-input bg-background px-1 text-center text-sm text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const quantity = Number(next);
          if (next !== "" && Number.isInteger(quantity) && quantity >= 1 && quantity <= 99)
            onChange(quantity);
        }}
        onBlur={() => setDraft(String(value))}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-8 shrink-0"
        disabled={disabled || value >= 99}
        aria-label={`Increase ${name}`}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}
