export function CheckoutProgress({
  step,
  available,
  busy = false,
  onChange,
}: {
  step: number;
  available: number;
  busy?: boolean;
  onChange: (step: number) => void;
}) {
  return (
    <ol aria-label="Checkout progress" className="my-4 flex gap-2 text-sm">
      {["Cart", "Delivery", "Payment"].map((label, index) => (
        <li key={label} className="min-w-0 flex-1">
          <button
            type="button"
            aria-current={step === index ? "step" : undefined}
            disabled={busy || index > available}
            onClick={() => onChange(index)}
            className={`w-full border-b-2 pb-3 pt-2 text-left transition focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${step === index ? "border-brand font-bold text-brand" : index <= available ? "border-brand/25 text-brand hover:border-brand" : "border-slate-200 text-muted-foreground"}`}
          >
            {index + 1}. {label}
          </button>
        </li>
      ))}
    </ol>
  );
}
