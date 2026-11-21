import { uploadFile } from "@/lib/upload";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { api, send, notifyError } from "@/lib/api";
import type { Quote, ShippingZone, CheckoutInput } from "@/lib/contracts";
import { formatNaira, type CartItem } from "@/lib/commerce";
import { useAccount } from "./auth-provider";
import { Field } from "./account-page";
export function LiveCheckout({ cart, onBack }: { cart: CartItem[]; onBack: () => void }) {
  const account = useAccount();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [zone, setZone] = useState("");
  const [state, setState] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [channel, setChannel] = useState<CheckoutInput["channel"]>("card");
  const [contact, setContact] = useState({
    name: account.user?.name ?? "",
    email: account.user?.email ?? "",
    phone: account.user?.phone ?? "",
    address: "",
    note: "",
  });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<{
    id: string;
    reference: string;
    needs_prescription: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const [uploaded, setUploaded] = useState(false);
  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => api<{ zones: ShippingZone[] }>("zones"),
    staleTime: 60000,
    retry: false,
  });
  const addresses = useQuery({
    queryKey: ["private", "addresses", account.user?.id],
    queryFn: () => api<{ rows: any[] }>("customer/addresses"),
    enabled: !!account.user,
    retry: false,
  });
  const needsRx = cart.some((i) => i.product.prescription);
  const input = (): CheckoutInput => ({
    items: cart.map(({ product, quantity }) => ({ id: product.id, quantity })),
    contact,
    zone_id: zone,
    channel,
    request_id: requestId.current,
  });
  const fail = (issue: unknown) => setError(notifyError(issue));
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      let current = order;
      if (!current) {
        const result = await send<{ order: NonNullable<typeof order>; quote: Quote }>(
          "checkout/start",
          input(),
        );
        current = result.order;
        setOrder(current);
        setQuote(result.quote);
        if (quote && result.quote.total !== quote.total) {
          toast.info("Your checkout total has changed. Please review it before paying.");
          return;
        }
      }
      if (current.needs_prescription && !uploaded) {
        if (!file) {
          toast.error("Select your prescription to continue.");
          return;
        }
        await uploadFile("prescription", file, current.id);
        setUploaded(true);
      }
      const result = await send<{ url: string }>("payments/initialize", {
        id: current.id,
        channel,
      });
      window.location.assign(result.url);
    } catch (issue) {
      fail(issue);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5 py-4">
      <h2 className="text-xl font-bold">{step === 1 ? "Contact & delivery" : "Review & pay"}</h2>
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 p-3 text-sm">
          {error}
        </p>
      )}
      {order && (
        <p className="rounded-lg bg-secondary p-3 text-sm">
          Checkout {order.reference}{" "}
          <Link to="/orders/$id" params={{ id: order.id }} className="underline">
            View status
          </Link>
        </p>
      )}
      {step === 1 ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (needsRx && !file) {
              setError("Select your prescription to continue.");
              toast.error("Select your prescription to continue.");
              return;
            }
            setBusy(true);
            try {
              const result = await send<{ quote: Quote }>("checkout/quote", input());
              setQuote(result.quote);
              setStep(2);
              setError("");
            } catch (issue) {
              fail(issue);
            } finally {
              setBusy(false);
            }
          }}
        >
          {addresses.data?.rows.length ? (
            <label className="block text-sm font-semibold">
              Saved address
              <select
                className="commerce-input mt-2"
                defaultValue=""
                onChange={(e) => {
                  const selected = addresses.data.rows.find((a) => a.id === e.target.value);
                  if (selected) {
                    setContact((c) => ({
                      ...c,
                      name: selected.name,
                      phone: selected.phone,
                      address: selected.address,
                    }));
                    setState(selected.state);
                    setZone("");
                  }
                }}
              >
                <option value="">Select an address</option>
                {addresses.data.rows.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.address}, {a.lga}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {(["name", "email", "phone", "address"] as const).map((key) => (
            <Field
              key={key}
              label={
                {
                  name: "Full name",
                  email: "Email",
                  phone: "Nigerian phone number",
                  address: "Street address",
                }[key]
              }
              type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
              required
              value={contact[key]}
              onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
              readOnly={key === "email" && !!account.user}
            />
          ))}
          <label className="block text-sm font-semibold">
            State / FCT
            <select
              className="commerce-input mt-2"
              required
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setZone("");
              }}
            >
              <option value="">Select state</option>
              {[...new Set(zones.data?.zones.map((z) => z.state) ?? [])].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Delivery area
            <select
              className="commerce-input mt-2"
              required
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="">Select LGA / area</option>
              {zones.data?.zones
                .filter((z) => z.state === state)
                .map((z) => (
                  <option value={z.id} key={z.id}>
                    {z.lga}
                    {z.area ? ` — ${z.area}` : ""}
                  </option>
                ))}
            </select>
          </label>
          {zones.data?.zones.length === 0 && (
            <p className="text-sm">
              Delivery is not available online yet. Please contact our pharmacy team.
            </p>
          )}
          <Field
            label="Delivery note (optional)"
            value={contact.note}
            onChange={(e) => setContact((c) => ({ ...c, note: e.target.value }))}
          />
          {needsRx && (
            <label className="block text-sm font-semibold">
              Prescription file
              <input
                className="mt-2 block max-w-full"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected && selected.size > 5 * 1024 * 1024) {
                    toast.error("Choose a prescription up to 5 MB.");
                    e.target.value = "";
                    setFile(null);
                    return;
                  }
                  setFile(selected ?? null);
                  setUploaded(false);
                }}
              />
              <span className="mt-2 block text-xs font-normal">
                PDF, JPEG or PNG, up to 5 MB. Pharmacist approval is required before dispatch.
              </span>
            </label>
          )}
          <button className="action-button w-full" disabled={busy}>
            {busy ? "Checking…" : "Continue to payment"}
          </button>
          <button type="button" className="w-full underline" onClick={onBack}>
            Back to cart
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border p-4 text-sm">
            <p>
              {contact.name} · {contact.phone}
            </p>
            <p>{contact.email}</p>
            <p>{contact.address}</p>
            <p className="mt-3">{quote?.eta}</p>
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-3 font-bold">Payment method</legend>
            {["card", "bank_transfer", "ussd"].map((value) => (
              <label key={value} className="flex items-center gap-3 rounded-xl border p-3">
                <input
                  name="channel"
                  type="radio"
                  checked={channel === value}
                  onChange={() => setChannel(value as typeof channel)}
                />
                {value === "card" ? "Card" : value === "bank_transfer" ? "Bank transfer" : "USSD"}
              </label>
            ))}
          </fieldset>
          {quote && (
            <dl className="space-y-3 rounded-xl bg-secondary p-4">
              {[
                ["Subtotal", quote.subtotal],
                ["Delivery", quote.delivery],
                ["Processing fee", quote.processing],
                ["Total", quote.total],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt>{label}</dt>
                  <dd className="font-bold">{formatNaira(Number(value) / 100)}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-xs leading-6">
            By continuing, you agree to our{" "}
            <Link to="/privacy-policy" className="underline">
              privacy
            </Link>
            ,{" "}
            <Link to="/shipping-policy" className="underline">
              shipping
            </Link>{" "}
            and{" "}
            <Link to="/refund-policy" className="underline">
              refund
            </Link>{" "}
            policies.
          </p>
          <button className="action-button w-full" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Opening secure checkout…" : `Pay ${formatNaira((quote?.total ?? 0) / 100)}`}
          </button>
          {!order && (
            <button className="w-full underline" onClick={() => setStep(1)}>
              Edit delivery details
            </button>
          )}
        </div>
      )}
    </div>
  );
}
