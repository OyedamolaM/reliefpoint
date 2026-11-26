import { PaymentPhotoUpload } from "./payment-photo";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { send, notifyError } from "@/lib/api";
import { formatNaira } from "@/lib/commerce";
import { Field } from "./account-page";
type Part = {
  id: string;
  method: "cash" | "bank_transfer" | "card" | "other";
  amount: string;
  reference: string;
  evidence_id?: string | null;
};
export function ManualPaymentForm({
  id,
  total,
  onSaved,
}: {
  id: string;
  total: number;
  onSaved: (status: string) => void;
}) {
  const request = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(new Set<string>());
  const [parts, setParts] = useState<Part[]>([
    { id: crypto.randomUUID(), method: "cash", amount: (total / 100).toFixed(2), reference: "" },
  ]);
  const received = parts.reduce((sum, part) => sum + Math.round(Number(part.amount) * 100), 0);
  const update = (id: string, patch: Partial<Part>) =>
    setParts((current) => current.map((part) => (part.id === id ? { ...part, ...patch } : part)));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uploading.size) return;
    if (
      received !== total ||
      parts.some(
        (part) =>
          !Number.isSafeInteger(Math.round(Number(part.amount) * 100)) || Number(part.amount) <= 0,
      )
    ) {
      toast.error("The payment amounts must add up to the amount due.", {
        id: "manual-payment-validation",
      });
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await send<{ status: string; message: string }>("admin/manual-payment", {
        id,
        request_id: request.current,
        payments: parts.map((part) => ({
          method: part.method,
          amount: Math.round(Number(part.amount) * 100),
          reference: part.method === "cash" ? "" : part.reference.trim(),
          ...(part.method !== "cash" && part.evidence_id ? { evidence_id: part.evidence_id } : {}),
        })),
        note: data.get("note") || "",
      });
      toast.success(result.message);
      onSaved(result.status);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-4 rounded-xl border p-4"
      onSubmit={submit}
      onInvalid={() =>
        toast.error("Please check the highlighted fields.", { id: "manual-payment-validation" })
      }
    >
      <h3 className="font-bold">Record payment</h3>
      <p className="text-sm text-slate-600">Amount due: {formatNaira(total / 100)}</p>
      <fieldset disabled={busy || uploading.size > 0} className="min-w-0 space-y-4">
        {parts.map((part, index) => (
          <section
            key={part.id}
            aria-label={"Payment " + (index + 1)}
            className="grid min-w-0 gap-4 rounded-xl border p-3 sm:grid-cols-2"
          >
            <label className="text-sm font-semibold">
              Payment method
              <select
                aria-label={"Payment method " + (index + 1)}
                className="commerce-input mt-2"
                value={part.method}
                onChange={(event) =>
                  update(part.id, { method: event.target.value as Part["method"], reference: "" })
                }
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card / POS</option>
                <option value="other">Other</option>
              </select>
            </label>
            <Field
              label={"Amount received (\u20a6)"}
              aria-label={"Amount received " + (index + 1)}
              type="number"
              min="0.01"
              max={total / 100}
              step="0.01"
              value={part.amount}
              onChange={(event) => update(part.id, { amount: event.target.value })}
              required
            />
            {part.method !== "cash" && (
              <Field
                label="Receipt / transfer reference (optional)"
                aria-label={"Receipt / transfer reference " + (index + 1)}
                value={part.reference}
                onChange={(event) => update(part.id, { reference: event.target.value })}
                maxLength={120}
              />
            )}
            {part.method !== "cash" && (
              <PaymentPhotoUpload
                orderId={id}
                onChange={(evidence_id) => update(part.id, { evidence_id })}
                onBusyChange={(value) =>
                  setUploading((current) => {
                    const next = new Set(current);
                    if (value) next.add(part.id);
                    else next.delete(part.id);
                    return next;
                  })
                }
              />
            )}
            {parts.length > 1 && (
              <button
                type="button"
                className="inline-flex items-center gap-2 justify-self-start text-sm text-red-700"
                aria-label={"Remove payment " + (index + 1)}
                onClick={() => setParts((current) => current.filter((item) => item.id !== part.id))}
              >
                <Trash2 size={16} />
                Remove
              </button>
            )}
          </section>
        ))}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"
          disabled={parts.length >= 10}
          onClick={() =>
            setParts((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                method: "bank_transfer",
                amount: total > received ? ((total - received) / 100).toFixed(2) : "",
                reference: "",
              },
            ])
          }
        >
          <Plus size={16} />
          Add payment method
        </button>
        {parts.length > 1 && (
          <p role="status" className="text-sm">
            {received <= total
              ? "Remaining: " + formatNaira((total - received) / 100)
              : "Over by: " + formatNaira((received - total) / 100)}
          </p>
        )}
        <Field label="Note (optional)" name="note" maxLength={1000} />
        <label className="flex items-start gap-2 text-sm">
          <input className="mt-1" type="checkbox" required />I have confirmed receipt of this
          payment.
        </label>
        <button className="action-button" disabled={busy}>
          {busy ? "Recording..." : "Confirm payment received"}
        </button>
      </fieldset>
    </form>
  );
}
