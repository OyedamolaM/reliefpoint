import { LoaderCircle } from "lucide-react";

export function SectionLoading({
  label = "Loading",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`flex w-full items-center justify-center ${compact ? "min-h-24 py-6" : "min-h-48 py-12"}`}
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-7 animate-spin text-brand motion-reduce:animate-none"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
