import { Check, Package, Truck } from "lucide-react";
import { receiptDate, trackingLabel } from "@/lib/receipt";

export type DeliveryEvent = {
  id?: string;
  status: string;
  note: string;
  courier?: string;
  tracking_reference?: string;
  estimated_delivery?: string;
  created_at: string;
};
export function OrderTracking({
  order,
  events,
  paidAt,
}: {
  order: {
    fulfillment_status: string;
    payment_status: string;
    needs_prescription: boolean;
    prescription_status: string;
    zone_snapshot: { estimate?: string; fulfillment_method?: "delivery" | "pickup" };
  };
  events: DeliveryEvent[];
  paidAt?: string;
}) {
  const paid = ["paid", "partially_refunded", "refunded"].includes(order.payment_status);
  const current = order.fulfillment_status;
  const pickup = order.zone_snapshot.fulfillment_method === "pickup";
  const stages = pickup ? ["processing", "delivered"] : ["processing", "dispatched", "delivered"];
  const label = (status: string) =>
    pickup && status === "delivered" ? "Collected" : trackingLabel(status);
  const steps = [
    { label: "Payment confirmed", done: paid, date: paidAt },
    ...(order.needs_prescription
      ? [{ label: "Pharmacist review", done: order.prescription_status === "approved" }]
      : []),
    ...stages.map((status, index) => ({
      label: label(status),
      done: events.some((event) => event.status === status) || stages.indexOf(current) >= index,
      date: events.find((event) => event.status === status)?.created_at,
    })),
  ];
  const next = steps.findIndex((step) => !step.done);
  const estimate =
    [...events].reverse().find((event) => event.estimated_delivery)?.estimated_delivery ??
    order.zone_snapshot.estimate;
  return (
    <section className="rounded-2xl border bg-white p-5 sm:p-6" aria-label="Order tracking">
      <div className="mb-5 flex items-center gap-3">
        <Truck className="size-6 text-brand" />
        <h2 className="text-lg font-bold">Track your order</h2>
      </div>
      <p className="mb-4 rounded-xl bg-secondary p-3 text-sm font-semibold">
        {label(current)}
        {current === "prescription_review" && " — awaiting pharmacist approval"}
      </p>
      {estimate && current !== "delivered" && current !== "cancelled" && (
        <p className="mb-5 text-sm">
          {pickup ? "Estimated collection time:" : "Estimated delivery time:"}{" "}
          <strong>{estimate}</strong>
        </p>
      )}
      <ol className="space-y-5">
        {steps.map((step, index) => (
          <li
            key={step.label}
            aria-current={index === next ? "step" : undefined}
            className="flex gap-3"
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-brand text-white" : "border border-slate-300 text-slate-500"}`}
            >
              {step.done ? <Check className="size-4" /> : <Package className="size-3" />}
            </span>
            <div>
              <p className={`text-sm ${step.done ? "font-semibold" : "text-muted-foreground"}`}>
                {step.label}
              </p>
              {step.date && (
                <p className="mt-1 text-xs text-muted-foreground">{receiptDate(step.date)} WAT</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {events.length > 0 && (
        <div className="mt-6 space-y-4 border-t pt-5">
          <h3 className="font-semibold">{pickup ? "Collection updates" : "Delivery updates"}</h3>
          {[...events].reverse().map((event, index) => (
            <div key={event.id ?? index} className="border-l-2 border-brand/25 pl-4">
              <p className="font-semibold">{label(event.status)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {receiptDate(event.created_at)} WAT
              </p>
              {event.note && <p className="mt-2 whitespace-pre-wrap text-sm">{event.note}</p>}
              {event.estimated_delivery && (
                <p className="mt-2 text-sm">
                  {pickup ? "Estimated collection time:" : "Estimated delivery time:"}{" "}
                  {event.estimated_delivery}
                </p>
              )}
              {event.courier && <p className="mt-2 text-sm">Courier: {event.courier}</p>}
              {event.tracking_reference && (
                <p className="mt-1 break-all text-sm">
                  Tracking reference: {event.tracking_reference}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
