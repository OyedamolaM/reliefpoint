import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { send, notifyError } from "@/lib/api";
import { formatNaira } from "@/lib/commerce";
import { Field } from "./account-page";

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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await send<{ status: string; message: string }>("admin/manual-payment", {
        id,
        request_id: request.current,
        method: data.get("method"),
        reference: data.get("reference"),
        amount: Math.round(Number(data.get("amount")) * 100),
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
      <p className="text-sm text-slate-600">
        Amount due: {formatNaira(total / 100)}. Record only money received and confirmed.
      </p>
      <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Payment method
          <select className="commerce-input mt-2" name="method" defaultValue="cash">
            <option value="cash">Cash</option>
            <option value="bank_transfer">Confirmed bank transfer</option>
          </select>
        </label>
        <Field
          label="Amount received (₦)"
          name="amount"
          type="number"
          min={total / 100}
          max={total / 100}
          step="0.01"
          defaultValue={(total / 100).toFixed(2)}
          required
        />
        <Field
          label="Receipt / transfer reference"
          name="reference"
          required
          minLength={3}
          maxLength={120}
        />
        <Field label="Note (optional)" name="note" maxLength={1000} />
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input className="mt-1" type="checkbox" required />I have confirmed receipt of this
          payment.
        </label>
        <button className="action-button sm:col-span-2" disabled={busy}>
          {busy ? "Recording…" : "Confirm payment received"}
        </button>
      </fieldset>
    </form>
  );
}
