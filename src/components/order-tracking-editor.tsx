import { useRef } from "react";
import { Field } from "./account-page";
import { Button } from "./ui/button";
import { trackingLabel } from "@/lib/receipt";
import type { DeliveryEvent } from "./order-tracking";

type Action = (name: string, input: unknown) => Promise<boolean>;
export function TrackingEditor({
  id,
  status,
  lastEvent,
  busy,
  action,
  pickup = false,
}: {
  id: string;
  status: string;
  lastEvent?: DeliveryEvent;
  busy: boolean;
  action: Action;
  pickup?: boolean;
}) {
  const request = useRef(crypto.randomUUID());
  const options =
    status === "ready"
      ? ["processing"]
      : status === "processing"
        ? ["processing", pickup ? "delivered" : "dispatched"]
        : status === "dispatched"
          ? ["dispatched", "delivered"]
          : status === "delivered"
            ? ["delivered"]
            : [];
  return (
    <form
      className="space-y-4 rounded-2xl border bg-white p-5 sm:p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const saved = await action("delivery", {
          id,
          ...Object.fromEntries(new FormData(event.currentTarget)),
          request_id: request.current,
        });
        if (saved) request.current = crypto.randomUUID();
      }}
    >
      <h2 className="font-bold">Update order tracking</h2>
      <p className="text-sm text-muted-foreground">
        Each saved update is visible to the customer and queues a delivery email.
      </p>
      {!options.length ? (
        <p className="rounded-xl bg-secondary p-3 text-sm">
          Delivery updates become available after payment and any required pharmacist approval.
        </p>
      ) : (
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Delivery status
            <select
              aria-label="Delivery status"
              className="commerce-input mt-2"
              name="value"
              defaultValue={options[0]}
            >
              {options.map((value) => (
                <option key={value} value={value}>
                  {pickup && value === "delivered" ? "Collected" : trackingLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <Field
            label={pickup ? "Estimated collection time" : "Estimated delivery time"}
            name="estimated_delivery"
            maxLength={200}
            defaultValue={lastEvent?.estimated_delivery ?? ""}
          />
          <Field
            label="Courier"
            name="courier"
            maxLength={100}
            defaultValue={lastEvent?.courier ?? ""}
          />
          <Field
            label="Tracking reference"
            name="tracking_reference"
            maxLength={200}
            defaultValue={lastEvent?.tracking_reference ?? ""}
          />
          <label className="block text-sm font-semibold sm:col-span-2">
            Customer update
            <textarea name="note" maxLength={1000} className="commerce-input mt-2 min-h-24" />
          </label>
          <Button className="sm:col-span-2" type="submit">
            {busy ? "Saving…" : "Save and notify customer"}
          </Button>
        </fieldset>
      )}
    </form>
  );
}

export function InternalNoteForm({
  id,
  busy,
  action,
}: {
  id: string;
  busy: boolean;
  action: Action;
}) {
  const request = useRef(crypto.randomUUID());
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const saved = await action("internal-note", {
          id,
          note: new FormData(form).get("note"),
          request_id: request.current,
        });
        if (saved) {
          form.reset();
          request.current = crypto.randomUUID();
        }
      }}
    >
      <label className="block text-sm font-semibold">
        Internal staff note
        <textarea required name="note" maxLength={1000} className="commerce-input mt-2 min-h-24" />
      </label>
      <p className="text-xs text-muted-foreground">
        Visible to staff only. No customer email is sent.
      </p>
      <Button variant="outline" disabled={busy} type="submit">
        Save internal note
      </Button>
    </form>
  );
}
