import { WorkspaceModal } from "./workspace-shell";
import type { ReactNode } from "react";
import { SectionLoading } from "./section-loading";
import { invalidateOrderData, orderReadOptions, orderRefreshInterval } from "@/lib/order-updates";
import { PaymentPhotoButton } from "./payment-photo";
import { OrderReceipt } from "./order-receipt";
import { OrderTracking } from "./order-tracking";
import { TrackingEditor, InternalNoteForm } from "./order-tracking-editor";
import { receiptDate, paymentMethodLabel, trackingLabel } from "@/lib/receipt";
import { uploadFile } from "@/lib/upload";
import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, send, notifyError } from "@/lib/api";
import { formatNaira, type Product } from "@/lib/commerce";
import { useAccount } from "./auth-provider";
import { useCommerce } from "./commerce-provider";
import { SiteShell } from "./site-shell";
import { Field, Retry } from "./account-page";
import { ManualPaymentForm } from "./manual-payment-form";

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
  onUpdate?: (status?: string) => void;
}) {
  const queryClient = useQueryClient();
  const account = useAccount();
  const shop = useCommerce();
  const [busy, setBusy] = useState(false);
  const [openAction, setOpenAction] = useState("");
  const refundRequest = useRef(crypto.randomUUID());
  const data = useQuery({
    queryKey: ["private", "order", id, token, admin],
    queryFn: () =>
      api<any>(
        admin
          ? `admin/order?id=${id}`
          : `orders/${id}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
        orderReadOptions,
      ),
    refetchInterval: orderRefreshInterval,
    refetchIntervalInBackground: false,
    retry: false,
  });
  useEffect(() => {
    if (data.error) notifyError(data.error);
  }, [data.error]);
  if (data.error)
    return (
      <div className="space-y-4">
        <Retry error={data.error} retry={() => void data.refetch()} />
        {!admin && (
          <button className="action-button" onClick={() => shop.openPanel("tracking")}>
            Request a fresh tracking link
          </button>
        )}
      </div>
    );
  if (!data.data) return <SectionLoading label="Loading your order" />;
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
  const refresh = (status?: string) => {
    setOpenAction("");
    if (onUpdate) onUpdate(status);
    else void invalidateOrderData(queryClient);
  };
  const actionDialog = (title: string, content: ReactNode) => (
    <>
      <button
        type="button"
        className="action-button"
        disabled={busy}
        onClick={() => setOpenAction(title)}
      >
        {title}
      </button>
      <WorkspaceModal
        open={openAction === title}
        onClose={() => {
          if (!busy) setOpenAction("");
        }}
        title={title}
        size="medium"
      >
        {content}
      </WorkspaceModal>
    </>
  );
  const action = async (name: string, input: unknown) => {
    setBusy(true);
    try {
      const result = await send<{ message: string }>(`admin/actions/${name}`, input);
      toast.success(result.message);
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
        <h1 className="break-all text-2xl font-bold">
          {["pending", "review"].includes(order.payment_status) ? "Payment" : "Order"}{" "}
          {order.public_reference ?? order.reference}
        </h1>
        <p className="mt-2 text-sm">{receiptDate(order.created_at)} WAT</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Payment", order.payment_status],
          ["Delivery", order.fulfillment_status],
          ["Prescription", order.prescription_status],
        ]
          .filter(([label, value]) => label !== "Prescription" || value !== "not_required")
          .map(([label, value]) => (
            <div key={label} className="rounded-xl bg-secondary p-4">
              <strong>{label}</strong>
              <p className="mt-2 capitalize">
                {label === "Delivery"
                  ? trackingLabel(String(value))
                  : String(value).replaceAll("_", " ")}
              </p>
            </div>
          ))}
      </div>
      {order.payment_method && order.payment_method !== "paystack" && (
        <div className="rounded-xl border p-4">
          <p className="font-semibold">
            {order.payment_method === "manual_pending"
              ? "Awaiting payment to the pharmacy"
              : `Payment recorded · ${paymentMethodLabel(order.payment_method)}`}
          </p>
          {admin && data.data.manual_payment?.parts?.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {[...data.data.manual_payment.parts]
                .sort((a: any, b: any) => a.position - b.position)
                .map((part: any, index: number) => (
                  <li key={index}>
                    {paymentMethodLabel(part.method)}: {formatNaira(part.amount / 100)}
                    {part.evidence_id && manage && <PaymentPhotoButton id={part.evidence_id} />}
                    {part.method !== "cash" && part.reference
                      ? ` · Reference: ${part.reference}`
                      : ""}
                  </li>
                ))}
            </ul>
          )}
          {admin &&
            !data.data.manual_payment?.parts?.length &&
            data.data.manual_payment?.method !== "cash" &&
            data.data.manual_payment?.reference && (
              <p className="mt-2 text-sm">
                Receipt / transfer reference: {data.data.manual_payment.reference}
              </p>
            )}
          {admin &&
            manage &&
            order.payment_status === "pending" &&
            order.payment_method === "manual_pending" && (
              <div className="mt-4">
                {actionDialog(
                  "Record payment",
                  <ManualPaymentForm id={id} total={order.total} onSaved={refresh} />,
                )}
              </div>
            )}
          {order.payment_method !== "manual_pending" && admin && (
            <p className="mt-2 text-sm text-slate-500">
              Cash and bank-transfer refunds are handled outside Paystack.
            </p>
          )}
        </div>
      )}
      {order.payment_status === "pending" &&
        (!order.payment_method || order.payment_method === "paystack") && (
          <div className="rounded-xl border p-4">
            <p>We haven’t confirmed this payment yet. Check its status before paying again.</p>
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
                  refresh(result.status);
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
                    const checked = await ownedSend<{ status: string }>("customer/reconcile", {
                      id,
                    });
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
        <h2 className="mb-3 font-bold">
          {order.zone_snapshot.fulfillment_method === "pickup"
            ? "Pickup details"
            : "Delivery details"}
        </h2>
        <p>
          {order.contact.name} · {order.contact.phone}
        </p>
        <p>
          {order.zone_snapshot.fulfillment_method === "pickup"
            ? order.zone_snapshot.area
            : [
                order.contact.address,
                order.zone_snapshot.area,
                order.zone_snapshot.lga,
                order.zone_snapshot.state,
              ]
                .filter(Boolean)
                .join(", ")}
        </p>
        <p className="mt-2 text-sm">{order.zone_snapshot.estimate}</p>
        {order.contact.note && <p className="mt-2 text-sm">{order.contact.note}</p>}
      </div>
      <OrderReceipt
        document={data.data.receipt}
        id={id}
        {...(token ? { token } : {})}
        admin={admin}
      />
      <OrderTracking
        order={order}
        events={events}
        paidAt={data.data.receipt?.paid_at ?? payment?.verified_at}
      />
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
          {admin &&
            pharmacy &&
            actionDialog(
              "Review prescription",
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
              </form>,
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
        !["dispatched", "delivered", "cancelled"].includes(order.fulfillment_status) &&
        actionDialog(
          "Manage order items",
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
                onClick={() => void action("approve-remaining", { id })}
              >
                Approve remaining items after refund
              </button>
            </div>
          </section>,
        )}
      {admin &&
        manage &&
        !["dispatched", "delivered", "cancelled"].includes(order.fulfillment_status) &&
        actionDialog(
          "Cancel order",
          <div className="space-y-4">
            <p>Cancel this order? Paid orders also require a separate refund.</p>
            <button
              type="button"
              className="action-button"
              disabled={busy}
              onClick={() => void action("cancel-order", { id, note: "Cancelled by the pharmacy" })}
            >
              Confirm cancellation
            </button>
          </div>,
        )}
      {admin &&
        fulfillment &&
        actionDialog(
          "Update order tracking",
          <TrackingEditor
            key={order.fulfillment_status + events.length}
            id={id}
            pickup={order.zone_snapshot.fulfillment_method === "pickup"}
            status={order.fulfillment_status}
            lastEvent={events.at(-1)}
            busy={busy}
            action={action}
          />,
        )}
      {admin && (
        <section className="space-y-4 rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="font-bold">Staff notes</h2>
          {(data.data.staff_notes ?? []).map((note: any) => (
            <div key={note.id} className="rounded-xl bg-secondary p-3">
              <p className="whitespace-pre-wrap text-sm">{note.note}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {receiptDate(note.created_at)} WAT
              </p>
            </div>
          ))}
          {actionDialog(
            "Add internal note",
            <InternalNoteForm id={id} busy={busy} action={action} />,
          )}
        </section>
      )}
      {admin && (
        <section className="space-y-3 rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="font-bold">Customer emails</h2>
          {(data.data.notifications ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No order emails queued yet.</p>
          )}
          {(data.data.notifications ?? []).map((mail: any) => (
            <div
              key={mail.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
            >
              <div>
                <p className="font-semibold">{mail.subject}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {receiptDate(mail.created_at)} WAT
                </p>
              </div>
              <div>
                <span className="capitalize">
                  {mail.status === "sent"
                    ? "Accepted by email provider"
                    : mail.status === "pending"
                      ? "Queued"
                      : mail.status}
                </span>
                {manage && mail.status === "failed" && (
                  <button
                    className="ml-3 underline"
                    disabled={busy}
                    onClick={() => void action("retry-mail", { id: mail.id })}
                  >
                    Retry email
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      {admin &&
        manage &&
        (!order.payment_method || order.payment_method === "paystack") &&
        actionDialog(
          "Request refund",
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
              processing: {formatNaira(order.processing / 100)}. The approved fee policy controls
              the maximum refundable amount.
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
          </form>,
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
