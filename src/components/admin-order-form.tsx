import { useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { api, send, notifyError } from "@/lib/api";
import { checkoutSchema, type Quote, type ShippingZone } from "@/lib/contracts";
import { formatNaira } from "@/lib/commerce";
import { Field, Retry } from "./account-page";
import { ManualPaymentForm } from "./manual-payment-form";
import { CustomerForm, type CustomerChoice } from "./customer-form";
import { OrderCustomerPicker, OrderProductPicker, type OrderItem } from "./order-pickers";
import { WorkspaceModal } from "./workspace-shell";
import { Button } from "./ui/button";

type Created = {
  order: { id: string; reference: string; public_reference?: string; payment_status: string };
  url: string;
  total: number;
  expires_at: string;
};
export function AdminOrderForm({
  onCreated,
  onView,
}: {
  onCreated: (status: string) => void;
  onView: (id: string, status: string) => void;
}) {
  const requestId = useRef(crypto.randomUUID());
  const [items, setItems] = useState<OrderItem[]>([]),
    [customer, setCustomer] = useState<CustomerChoice | null>(null);
  const [contact, setContact] = useState({ name: "", email: "", phone: "", address: "", note: "" });
  const [customerPicker, setCustomerPicker] = useState(false),
    [newCustomer, setNewCustomer] = useState(false),
    [productPicker, setProductPicker] = useState(false);
  const [method, setMethod] = useState<"delivery" | "pickup">("delivery"),
    [state, setState] = useState("Lagos"),
    [zone, setZone] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState<Created | null>(null);
  const chooseCustomer = (next: CustomerChoice) => {
    const address = next.addresses?.[0] ?? next.last_delivery;
    setCustomer(next);
    if (method === "delivery") setZone("");
    setContact({
      name: next.name,
      email: next.email,
      phone: next.phone || "",
      address: address?.address || "",
      note: "",
    });
    if (address?.state) setState(address.state);
    setQuote(null);
  };
  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api<{ zones: ShippingZone[] }>("zones"),
    staleTime: 60000,
    retry: false,
  });
  const deliveries = zones.data?.zones.filter((z) => z.fulfillment_method !== "pickup") ?? [],
    pickups = zones.data?.zones.filter((z) => z.fulfillment_method === "pickup") ?? [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = checkoutSchema.safeParse({
      request_id: requestId.current,
      items: items.map(({ product, quantity }) => ({ id: product.id, quantity })),
      zone_id: zone,
      contact: { ...contact, address: method === "pickup" ? "Pharmacy pickup" : contact.address },
    });
    if (!customer || !parsed.success) {
      toast.error(
        items.length ? "Check the customer and delivery details." : "Add at least one product.",
      );
      return;
    }
    setBusy(true);
    try {
      if (!quote) {
        const result = await send<{ quote: Quote }>("admin/order-quote", parsed.data);
        setQuote(result.quote);
      } else {
        const result = await send<Created>("admin/order-create", parsed.data);
        setCreated(result);
        onCreated(result.order.payment_status);
        toast.success("Saved under Pending payments.");
      }
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  }
  if (created)
    return (
      <div className="space-y-4">
        <p className="break-all font-semibold">
          {created.order.public_reference ?? created.order.reference}
        </p>
        <p>
          {created.order.payment_status === "pending"
            ? "Awaiting payment"
            : created.order.payment_status === "paid"
              ? "Payment confirmed"
              : "Payment review"}
        </p>
        <p>{formatNaira(created.total / 100)}</p>
        {created.order.payment_status === "pending" && (
          <ManualPaymentForm
            id={created.order.id}
            total={created.total}
            onSaved={(status) => {
              setCreated({ ...created, order: { ...created.order, payment_status: status } });
              onCreated(status);
            }}
          />
        )}
        <Field
          label="Customer tracking link"
          value={created.url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(created.url);
                toast.success("Link copied.");
              } catch {
                toast.error("Select and copy the link above.");
              }
            }}
          >
            Copy link
          </Button>
          <Button
            variant="outline"
            onClick={() => onView(created.order.id, created.order.payment_status)}
          >
            View details
          </Button>
        </div>
      </div>
    );
  return (
    <>
      <form
        onSubmit={submit}
        onChange={() => setQuote(null)}
        onInvalid={() =>
          toast.error("Please check the highlighted fields.", { id: "admin-order-validation" })
        }
      >
        <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-70">
          <section className="space-y-3">
            <h3 className="font-bold">Customer</h3>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-w-0 flex-1 justify-start truncate"
                onClick={() => setCustomerPicker(true)}
              >
                {customer?.name || "Select customer"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Add new customer"
                onClick={() => setNewCustomer(true)}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {customer && (
              <div className="grid gap-3 sm:grid-cols-2">
                {(["name", "email", "phone"] as const).map((key) => (
                  <Field
                    key={key}
                    label={
                      { name: "Customer name", email: "Email address", phone: "Phone number" }[key]
                    }
                    type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                    value={contact[key]}
                    required
                    onChange={(event) => setContact({ ...contact, [key]: event.target.value })}
                  />
                ))}
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="font-bold">Delivery / pickup</h3>
            <div className="flex gap-4">
              {(pickups.length ? (["delivery", "pickup"] as const) : (["delivery"] as const)).map(
                (value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="fulfillment"
                      checked={method === value}
                      onChange={() => {
                        setMethod(value);
                        setZone(value === "pickup" ? pickups[0]?.id || "" : "");
                        setQuote(null);
                      }}
                    />
                    {value === "pickup" ? "Pickup" : "Delivery"}
                  </label>
                ),
              )}
            </div>
            {method === "pickup" ? (
              <label className="block text-sm font-semibold">
                Pickup location
                <select
                  className="commerce-input mt-2"
                  required
                  value={zone}
                  onChange={(event) => setZone(event.target.value)}
                >
                  <option value="">Select pickup location</option>
                  {pickups.map((z) => (
                    <option value={z.id} key={z.id}>
                      {z.area}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field
                    label="Street address"
                    value={contact.address}
                    minLength={5}
                    required
                    onChange={(event) => setContact({ ...contact, address: event.target.value })}
                  />
                </div>
                <label className="text-sm font-semibold">
                  State / FCT
                  <select
                    className="commerce-input mt-2"
                    required
                    value={state}
                    onChange={(event) => {
                      setState(event.target.value);
                      setZone("");
                    }}
                  >
                    <option value="">Select state</option>
                    {[...new Set(deliveries.map((z) => z.state))].map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Delivery area
                  <select
                    className="commerce-input mt-2"
                    required
                    value={zone}
                    onChange={(event) => setZone(event.target.value)}
                  >
                    <option value="">Select LGA / area</option>
                    {deliveries
                      .filter((z) => z.state === state)
                      .map((z) => (
                        <option key={z.id} value={z.id}>
                          {[z.lga, z.area].filter(Boolean).join(" / ")}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            )}
            {zones.error && <Retry error={zones.error} retry={() => void zones.refetch()} />}
            <Field
              label="Note (optional)"
              value={contact.note}
              onChange={(event) => setContact({ ...contact, note: event.target.value })}
            />
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">Products</h3>
              <Button type="button" variant="outline" onClick={() => setProductPicker(true)}>
                <Plus className="size-4" />
                Add products
              </Button>
            </div>
            {items.map(({ product, quantity }) => (
              <div className="flex items-center gap-2 rounded-xl bg-secondary p-3" key={product.id}>
                <span className="min-w-0 flex-1 text-sm font-semibold">{product.name}</span>
                <input
                  aria-label={`Quantity for ${product.name}`}
                  type="number"
                  min={1}
                  max={99}
                  required
                  className="commerce-input w-20"
                  value={quantity}
                  onChange={(event) =>
                    setItems(
                      items.map((item) =>
                        item.product.id === product.id
                          ? { ...item, quantity: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="p-2 text-red-700"
                  aria-label={`Remove ${product.name}`}
                  onClick={() => {
                    setItems(items.filter((item) => item.product.id !== product.id));
                    setQuote(null);
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </section>
          {quote && (
            <dl className="space-y-2 rounded-xl bg-secondary p-4">
              {[
                ["Subtotal", quote.subtotal],
                [method === "pickup" ? "Pickup" : "Delivery", quote.delivery],
                ["Total", quote.total],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt>{label}</dt>
                  <dd className="font-semibold">{formatNaira(Number(value) / 100)}</dd>
                </div>
              ))}
            </dl>
          )}
          <button className="action-button" disabled={busy || !customer || !items.length || !zone}>
            {busy ? "Saving..." : quote ? "Create order" : "Review order"}
          </button>
        </fieldset>
      </form>
      <OrderCustomerPicker
        open={customerPicker}
        onClose={() => setCustomerPicker(false)}
        onSelect={chooseCustomer}
      />
      <OrderProductPicker
        open={productPicker}
        onClose={() => setProductPicker(false)}
        items={items}
        onSelect={(next) => {
          setItems(next);
          setQuote(null);
        }}
      />
      <WorkspaceModal
        open={newCustomer}
        onClose={() => setNewCustomer(false)}
        title="Add customer"
        size="medium"
      >
        <CustomerForm
          onSaved={(next) => {
            setNewCustomer(false);
            if (next) chooseCustomer(next);
          }}
        />
      </WorkspaceModal>
    </>
  );
}
