import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { api, send, notifyError } from "@/lib/api";
import { checkoutSchema, type Quote, type ShippingZone } from "@/lib/contracts";
import { formatNaira, type Product } from "@/lib/commerce";
import { Field, Retry } from "./account-page";
import { ManualPaymentForm } from "./manual-payment-form";

type Created = {
  order: { id: string; reference: string; payment_status: string };
  url: string;
  total: number;
  expires_at: string;
  message: string;
};
export function AdminOrderForm({
  onCreated,
  onView,
}: {
  onCreated: () => void;
  onView: (id: string, status: string) => void;
}) {
  const requestId = useRef(crypto.randomUUID());
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<{ product: Product; quantity: number }[]>([]);
  const [state, setState] = useState("");
  const [zone, setZone] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const catalog = useQuery({
    queryKey: ["private", "admin-order-products", term, page],
    queryFn: () =>
      api<{ products: Product[]; configured: boolean; more: boolean }>(
        `catalog?stock=1&q=${encodeURIComponent(term)}&page=${page}`,
      ),
    staleTime: 60000,
    retry: false,
  });
  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api<{ zones: ShippingZone[] }>("zones"),
    staleTime: 300000,
    retry: false,
  });
  useEffect(() => {
    if (catalog.error) notifyError(catalog.error);
  }, [catalog.error]);
  useEffect(() => {
    if (zones.error) notifyError(zones.error);
  }, [zones.error]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = checkoutSchema.safeParse({
      request_id: requestId.current,
      items: items.map(({ product, quantity }) => ({ id: product.id, quantity })),
      zone_id: zone,
      contact: Object.fromEntries(
        ["name", "email", "phone", "address", "note"].map((key) => [key, form.get(key) || ""]),
      ),
    });
    if (!parsed.success) {
      toast.error(
        items.length
          ? "Check the customer details and delivery area."
          : "Add at least one product.",
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
        onCreated();
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
      <div className="space-y-5">
        <p className="font-semibold">{created.order.reference}</p>
        <p>
          {created.order.payment_status === "pending"
            ? "Awaiting payment"
            : created.order.payment_status === "review"
              ? "Payment recorded · stock review required"
              : "Payment confirmed"}{" "}
          · {formatNaira(created.total / 100)}
        </p>
        {created.order.payment_status === "pending" && (
          <ManualPaymentForm
            id={created.order.id}
            total={created.total}
            onSaved={(status) => {
              setCreated({ ...created, order: { ...created.order, payment_status: status } });
              onCreated();
            }}
          />
        )}
        <p className="text-sm text-slate-600">
          Share this private link with the customer to track the purchase or upload their
          prescription. Unpaid stock is held for 20 minutes; the link expires at{" "}
          {new Date(created.expires_at).toLocaleTimeString("en-NG", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </p>
        <label className="block text-sm font-semibold">
          Customer tracking link
          <input
            className="commerce-input mt-2"
            value={created.url}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            className="action-button"
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
          </button>
          <button
            className="rounded-lg border px-4 py-2 font-semibold"
            onClick={() => onView(created.order.id, created.order.payment_status)}
          >
            View details
          </button>
        </div>
      </div>
    );
  return (
    <form
      onSubmit={submit}
      onChange={() => setQuote(null)}
      onInvalid={() =>
        toast.error("Please check the highlighted fields.", { id: "admin-order-validation" })
      }
    >
      <fieldset disabled={busy} className="min-w-0 space-y-6 disabled:opacity-70">
        <section className="space-y-4">
          <h3 className="font-bold">Customer details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Customer name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
            />
            <Field
              label="Email address"
              name="email"
              type="email"
              required
              maxLength={180}
              autoComplete="email"
            />
            <Field
              label="Phone number"
              name="phone"
              type="tel"
              required
              minLength={10}
              maxLength={24}
              autoComplete="tel"
            />
            <Field
              label="Street address"
              name="address"
              required
              minLength={5}
              maxLength={500}
              autoComplete="street-address"
            />
            <label className="text-sm font-semibold">
              State / FCT
              <select
                className="commerce-input mt-2"
                value={state}
                required
                onChange={(e) => {
                  setState(e.target.value);
                  setZone("");
                }}
              >
                <option value="">Select state</option>
                {[...new Set(zones.data?.zones.map((z) => z.state) ?? [])].map((name) => (
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
                disabled={!state}
                onChange={(e) => setZone(e.target.value)}
              >
                <option value="">Select LGA / area</option>
                {zones.data?.zones
                  .filter((z) => z.state === state)
                  .map((z) => (
                    <option key={z.id} value={z.id}>
                      {[z.lga, z.area].filter(Boolean).join(" · ")}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {zones.error && <Retry error={zones.error} retry={() => void zones.refetch()} />}
          {zones.data?.zones.length === 0 && (
            <p className="text-sm text-slate-600">
              Add an active delivery zone in Delivery before creating an order.
            </p>
          )}
          <Field label="Delivery note (optional)" name="note" maxLength={1000} />
        </section>
        <section className="space-y-3">
          <h3 className="font-bold">Products</h3>
          <Field
            label="Search products"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {catalog.error && <Retry error={catalog.error} retry={() => void catalog.refetch()} />}
          <div className="max-h-56 overflow-y-auto rounded-xl border divide-y">
            {catalog.data?.configured &&
              catalog.data.products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <span className="min-w-0">
                    <strong className="block">{product.name}</strong>
                    {formatNaira(product.price)}
                    {product.prescription && (
                      <span className="ml-2 text-slate-500">Prescription required</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border p-2 text-brand"
                    aria-label={`Add ${product.name}`}
                    disabled={items.some((i) => i.product.id === product.id) || items.length >= 50}
                    onClick={() => {
                      setItems([...items, { product, quantity: 1 }]);
                      setQuote(null);
                    }}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              ))}
            {catalog.isPending && <p className="p-3 text-sm">Loading products…</p>}
            {catalog.data && (!catalog.data.configured || !catalog.data.products.length) && (
              <p className="p-3 text-sm">No available products found.</p>
            )}
          </div>
          <div className="flex justify-between text-sm">
            <button
              type="button"
              disabled={page === 0}
              className="disabled:opacity-40"
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!catalog.data?.more}
              className="disabled:opacity-40"
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
          {items.map(({ product, quantity }) => (
            <div key={product.id} className="flex items-center gap-3 rounded-xl bg-secondary p-3">
              <span className="min-w-0 flex-1 text-sm font-semibold">{product.name}</span>
              <input
                aria-label={`Quantity for ${product.name}`}
                type="number"
                min={1}
                max={99}
                required
                value={quantity}
                className="commerce-input w-20"
                onChange={(e) =>
                  setItems(
                    items.map((i) =>
                      i.product.id === product.id ? { ...i, quantity: Number(e.target.value) } : i,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Remove ${product.name}`}
                className="p-2 text-red-700"
                onClick={() => {
                  setItems(items.filter((i) => i.product.id !== product.id));
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
              ["Delivery", quote.delivery],
              ["Processing fee", quote.processing],
              ["Total", quote.total],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt>{label}</dt>
                <dd className="font-semibold">{formatNaira(Number(value) / 100)}</dd>
              </div>
            ))}
            <div className="pt-2 text-sm">{quote.eta}</div>
            {quote.prescription && (
              <p className="text-sm">
                The customer must upload a prescription. Dispatch waits for pharmacist approval.
              </p>
            )}
          </dl>
        )}
        <p className="text-sm text-slate-500">
          This order uses cash or bank-transfer collection, with no Paystack processing fee. Record
          payment once received to move it from Pending payments to Orders.
        </p>
        <button className="action-button" disabled={busy || !items.length || !zone}>
          {busy ? "Saving…" : quote ? "Create order" : "Review order"}
        </button>
      </fieldset>
    </form>
  );
}
