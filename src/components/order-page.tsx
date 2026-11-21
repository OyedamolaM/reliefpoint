import { uploadFile } from "@/lib/upload";
import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, send, notifyError } from "@/lib/api";
import { formatNaira, type Product } from "@/lib/commerce";
import { useAccount } from "./auth-provider";
import { useCommerce } from "./commerce-provider";
import { SiteShell } from "./site-shell";
import { Field, Retry } from "./account-page";

export function OrderPage({ id, token }: { id: string; token?: string }) {
  return (
    <SiteShell>
      <OrderView id={id} {...(token ? { token } : {})} />
    </SiteShell>
  );
}
export function OrderView({
  id,
  token,
  admin = false,
  onUpdate,
}: {
  id: string;
  token?: string;
  admin?: boolean;
  onUpdate?: () => void;
}) {
  const account = useAccount();
  const shop = useCommerce();
  const [busy, setBusy] = useState(false);
  const refundRequest = useRef(crypto.randomUUID());
  const data = useQuery({
    queryKey: ["private", "order", id, token, admin],
    queryFn: () =>
      api<any>(
        admin
          ? `admin/order?id=${id}`
          : `orders/${id}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      ),
    retry: false,
  });
  useEffect(() => {
    if (data.error) notifyError(data.error);
  }, [data.error]);
  if (data.error) return <Retry error={data.error} retry={() => void data.refetch()} />;
  if (!data.data) return <p>Loading your order…</p>;
  const { order, items, events, prescriptions, refunds, payment, can_resume } = data.data;
  const ownedSend = <T,>(path: string, body: unknown) =>
    api<T>(path, {
      method: "POST",
      headers: token ? { "X-Order-Token": token } : {},
      body: JSON.stringify(body),
    });
  const manage = account.user?.roles.some((r) => ["owner", "admin"].includes(r));
  const pharmacy = account.user?.roles.some((r) => ["owner", "admin", "pharmacist"].includes(r));
  const fulfillment = account.user?.roles.some((r) =>
    ["owner", "admin", "fulfillment"].includes(r),
  );
  const refresh = () => {
    void data.refetch();
    onUpdate?.();
  };
  const action = async (name: string, input: unknown) => {
    setBusy(true);
    try {
      await send(`admin/actions/${name}`, input);
      toast.success("Changes saved.");
      refresh();
      return true;
    } catch (error) {
      notifyError(error);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="break-all text-2xl font-bold">Order {order.reference}</h1>
        <p className="mt-2 text-sm">{new Date(order.created_at).toLocaleString("en-NG")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Payment", order.payment_status],
          ["Delivery", order.fulfillment_status],
          ["Prescription", order.prescription_status],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-secondary p-4">
            <strong>{label}</strong>
            <p className="mt-2 capitalize">{String(value).replaceAll("_", " ")}</p>
          </div>
        ))}
      </div>
      {order.payment_status === "pending" && (
        <div className="rounded-xl border p-4">
          <p>
            We haven’t confirmed a payment for this order yet. Check its status before paying again.
          </p>
          {["failed", "abandoned", "reversed"].includes(payment?.provider_status) && (
            <p className="mt-3 text-sm">
              The last payment attempt wasn’t completed. No successful payment has been confirmed.
            </p>
          )}
          <button
            className="action-button mt-3"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = admin
                  ? await send<{ status: string }>("admin/reconcile", {
                      reference: order.reference,
                    })
                  : await ownedSend<{ status: string }>("customer/reconcile", { id });
                toast[result.status === "paid" ? "success" : "info"](
                  result.status === "paid"
                    ? "Your payment has been confirmed."
                    : ["failed", "abandoned", "reversed"].includes(result.status)
                      ? "That payment attempt wasn’t completed. Check your order before trying again."
                      : "We’re still checking your payment. Please don’t pay again.",
                );
                refresh();
              } catch (error) {
                notifyError(error);
              } finally {
                setBusy(false);
              }
            }}
          >
            Check payment status
          </button>
          {!admin && can_resume && (
            <button
              className="ml-4 mt-3 underline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const checked = await ownedSend<{ status: string }>("customer/reconcile", { id });
                  if (
                    ["paid", "review", "refunded", "partially_refunded"].includes(checked.status)
                  ) {
                    refresh();
                    toast.info("Your payment has an update. Please review this order.");
                    return;
                  }
                  const result = await ownedSend<{ url: string }>("payments/initialize", {
                    id,
                    channel: "card",
                  });
                  window.location.assign(result.url);
                } catch (error) {
                  notifyError(error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Continue secure checkout
            </button>
          )}
        </div>
      )}
      <div className="rounded-xl border p-4">
        <h2 className="mb-3 font-bold">Items</h2>
        {items.map((item: any) => (
          <div key={item.id} className="flex justify-between gap-4 py-2 text-sm">
            <span>
              {item.name} × {item.quantity}
            </span>
            <strong>{formatNaira((item.price_kobo * item.quantity) / 100)}</strong>
          </div>
        ))}
        <dl className="mt-4 space-y-2 border-t pt-4">
          {[
            ["Subtotal", order.subtotal],
            ["Delivery", order.delivery],
            ["Processing fee", order.processing],
            ["Total", order.total],
          ].map(([label, amount]) => (
            <div key={label} className="flex justify-between">
              <dt>{label}</dt>
              <dd>{formatNaira(Number(amount) / 100)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="rounded-xl border p-4">
        <h2 className="mb-3 font-bold">Delivery details</h2>
        <p>
          {order.contact.name} · {order.contact.phone}
        </p>
        <p>
          {order.contact.address}, {order.zone_snapshot.area}, {order.zone_snapshot.lga},{" "}
          {order.zone_snapshot.state}
        </p>
        <p className="mt-2 text-sm">{order.zone_snapshot.estimate}</p>
        {order.contact.note && <p className="mt-2 text-sm">{order.contact.note}</p>}
      </div>
      {events.length > 0 && (
        <section>
          <h2 className="font-bold">Delivery updates</h2>
          {events.map((event: any, index: number) => (
            <div className="mt-3 border-l-2 border-brand pl-4" key={index}>
              <p className="capitalize">{event.status}</p>
              <p className="text-sm">{event.note}</p>
              <p className="text-sm">
                {event.courier} {event.tracking_reference}
              </p>
            </div>
          ))}
        </section>
      )}
      {order.needs_prescription && (
        <section className="rounded-xl border p-4">
          <h2 className="font-bold">Prescription review</h2>
          {prescriptions.map((p: any) => (
            <div className="mt-3" key={p.id}>
              <p className="text-sm">
                Uploaded {new Date(p.created_at).toLocaleDateString("en-NG")}
              </p>
              {p.notes && <p className="mt-2 whitespace-pre-wrap">{p.notes}</p>}
              {admin && pharmacy && (
                <button
                  className="underline"
                  onClick={() =>
                    void send<{ url: string }>("admin/actions/prescription-view", { id: p.id })
                      .then((r) => window.open(r.url, "_blank", "noopener,noreferrer"))
                      .catch(notifyError)
                  }
                >
                  View prescription
                </button>
              )}
            </div>
          ))}
          {!admin &&
            !["dispatched", "delivered", "cancelled"].includes(order.fulfillment_status) && (
              <label className="mt-4 block text-sm font-semibold">
                Upload a prescription
                <input
                  className="mt-2 block"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy(true);
                    try {
                      await uploadFile("prescription", file, id, token);
                      toast.success("Your prescription was uploaded securely.");
                      refresh();
                    } catch (error) {
                      notifyError(error);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
            )}
          {admin && pharmacy && (
            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void action("prescription-review", {
                  id,
                  value: d.get("value"),
                  note: d.get("note"),
                });
              }}
            >
              <label className="block">
                Review result
                <select name="value" className="commerce-input mt-2">
                  <option value="approved">Approve</option>
                  <option value="clarification">Request clarification</option>
                  <option value="rejected">Reject — refund review required</option>
                </select>
              </label>
              <Field label="Customer-facing review notes" name="note" required />
              <button className="action-button" disabled={busy}>
                Save review
              </button>
            </form>
          )}
        </section>
      )}
      {refunds.length > 0 && (
        <section>
          <h2 className="font-bold">Refunds</h2>
          {refunds.map((r: any) => (
            <p className="mt-2" key={r.id}>
              {formatNaira(r.amount / 100)} · {r.status}
            </p>
          ))}
        </section>
      )}
      {admin &&
        manage &&
        !["dispatched", "delivered", "cancelled"].includes(order.fulfillment_status) && (
          <section className="space-y-4 rounded-xl border p-4">
            <h2 className="font-bold">Cancellation & remaining items</h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void action("cancel-item", {
                  id,
                  value: d.get("item"),
                  amount: Number(d.get("quantity")),
                  note: d.get("note"),
                });
              }}
            >
              <label className="block text-sm">
                Item
                <select name="item" className="commerce-input mt-2">
                  {items
                    .filter((i: any) => i.quantity > i.cancelled_quantity)
                    .map((i: any) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.quantity - i.cancelled_quantity} remaining)
                      </option>
                    ))}
                </select>
              </label>
              <Field label="Quantity to cancel" name="quantity" type="number" min="1" required />
              <Field label="Customer-facing reason" name="note" required />
              <button className="action-button" disabled={busy}>
                Cancel selected quantity
              </button>
            </form>
            <p className="text-sm">
              Cancelled items remain on hold until the refund is processed and you approve the
              remaining items. Stock is not automatically returned to sale.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                className="underline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm("Cancel this order? Paid orders also require a separate refund.")
                  )
                    void action("cancel-order", { id, note: "Cancelled by the pharmacy" });
                }}
              >
                Cancel whole order
              </button>
              <button
                className="underline"
                disabled={busy}
                onClick={() => void action("approve-remaining", { id })}
              >
                Approve remaining items after refund
              </button>
            </div>
          </section>
        )}
      {admin && fulfillment && (
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void action("delivery", { id, ...Object.fromEntries(new FormData(e.currentTarget)) });
          }}
        >
          <h2 className="font-bold">Update delivery</h2>
          <select aria-label="Delivery status" className="commerce-input" name="value">
            <option value="processing">Processing</option>
            <option value="dispatched">Dispatched</option>
            <option value="delivered">Delivered</option>
          </select>
          <Field label="Courier" name="courier" />
          <Field label="Tracking reference" name="tracking_reference" />
          <Field label="Customer update" name="note" />
          <button className="action-button" disabled={busy}>
            Save delivery update
          </button>
        </form>
      )}
      {admin && manage && (
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const d = new FormData(form);
            const saved = await action("refund", {
              id,
              amount: Math.round(Number(d.get("amount")) * 100),
              note: d.get("note"),
              request_id: refundRequest.current,
            });
            if (saved) {
              form.reset();
              refundRequest.current = crypto.randomUUID();
            }
          }}
        >
          <h2 className="font-bold">Request refund</h2>
          <p className="text-sm">
            Products and delivery: {formatNaira((order.subtotal + order.delivery) / 100)} ·
            processing: {formatNaira(order.processing / 100)}. The approved fee policy controls the
            maximum refundable amount.
          </p>
          <Field
            label="Refund amount (₦)"
            name="amount"
            type="number"
            min="0.01"
            max={order.total / 100}
            step="0.01"
            required
          />
          <Field label="Reason" name="note" required />
          <button className="action-button" disabled={busy}>
            Submit refund for processing
          </button>
        </form>
      )}
      {!admin && !token && (
        <button
          className="action-button"
          onClick={async () => {
            setBusy(true);
            try {
              const resolved = await send<{ products: Product[] }>("catalog/resolve", {
                ids: items.map((item: any) => item.product_id),
              });
              shop.mergeCatalog(resolved.products);
              let added = 0;
              for (const item of items) {
                const product = resolved.products.find((p) => p.id === item.product_id);
                if (product?.inStock) {
                  shop.add(product, item.quantity);
                  added++;
                }
              }
              if (!added)
                toast.info("These items aren’t currently available. Please browse the store.");
            } catch (error) {
              notifyError(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          Shop these items again
        </button>
      )}
    </div>
  );
}
