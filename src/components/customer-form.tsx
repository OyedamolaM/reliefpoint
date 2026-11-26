import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { send, notifyError } from "@/lib/api";
import { nigerianStates } from "@/lib/nigeria";
import { Field } from "./account-page";
import { Button } from "./ui/button";
export type CustomerChoice = {
  id: string;
  name: string;
  email: string;
  phone: string;
  addresses?: { address: string; state: string; lga: string }[];
  last_delivery?: { address: string; state: string; lga: string } | null;
};
export function CustomerForm({ onSaved }: { onSaved: (customer?: CustomerChoice) => void }) {
  const [busy, setBusy] = useState(false);
  const intent = useRef("save");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const invite =
      ((event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? intent.current) ===
      "invite";
    setBusy(true);
    try {
      const result = await send<{ message: string; customer?: CustomerChoice }>(
        invite ? "admin/customer-invite" : "admin/customer-create",
        Object.fromEntries(new FormData(form)),
      );
      toast.success(result.message);
      onSaved(result.customer);
    } catch (error) {
      notifyError(error);
    } finally {
      intent.current = "save";
      setBusy(false);
    }
  };
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={submit}
      onInvalidCapture={() =>
        toast.error("Check the highlighted customer details.", { id: "customer-validation" })
      }
    >
      <Field label="Full name" name="name" required minLength={2} maxLength={100} />
      <Field label="Email address" name="email" type="email" required maxLength={180} />
      <Field
        label="Nigerian phone number"
        name="phone"
        type="tel"
        required
        pattern="(\+234|234|0)[789][01][0-9]{8}"
      />
      <Field label="Delivery address (optional)" name="address" maxLength={500} />
      <label className="block text-sm font-semibold">
        State / FCT (optional)
        <select name="state" className="commerce-input mt-2" defaultValue="">
          <option value="">Select state</option>
          {nigerianStates.map((state) => (
            <option key={state}>{state}</option>
          ))}
        </select>
      </label>
      <Field label="LGA / area (optional)" name="lga" maxLength={120} />
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button
          type="submit"
          value="save"
          onClick={() => {
            intent.current = "save";
          }}
          disabled={busy}
        >
          {busy ? "Saving…" : "Add customer"}
        </Button>
        <Button
          type="submit"
          value="invite"
          onClick={() => {
            intent.current = "invite";
          }}
          variant="outline"
          disabled={busy}
        >
          Send invitation
        </Button>
      </div>
    </form>
  );
}
