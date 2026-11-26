import { SectionLoading } from "./section-loading";
import { uploadFile } from "@/lib/upload";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { api, send, notifyError, ClientError } from "@/lib/api";
import type { Quote, ShippingZone, CheckoutInput } from "@/lib/contracts";
import { formatNaira, whatsapp, type CartItem } from "@/lib/commerce";
import { nigerianStates, deliveryState } from "@/lib/nigeria";
import { useAccount } from "./auth-provider";
import { Field } from "./account-page";
import { useDeliveryDraft } from "@/hooks/use-delivery-draft";
import { saveCookiePreferences } from "@/lib/cookie-preferences";
import { checkoutSchema } from "@/lib/contracts";
export function LiveCheckout({
  cart,
  onBack,
  activeStep,
  onStepChange,
  onReadyChange,
  onLockedChange,
  onBusyChange,
}: {
  cart: CartItem[];
  onBack: () => void;
  activeStep?: 1 | 2;
  onStepChange?: (step: 1 | 2) => void;
  onReadyChange?: (ready: boolean) => void;
  onLockedChange?: (locked: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const account = useAccount();
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [localStep, setLocalStep] = useState(1);
  const step = activeStep ?? localStep;
  const setStep = (next: 1 | 2) => {
    setLocalStep(next);
    onStepChange?.(next);
  };
  const [busy, setBusyValue] = useState(false);
  const setBusy = (value: boolean) => {
    setBusyValue(value);
    onBusyChange?.(value);
  };
  const draft = useDeliveryDraft(account);
  const { contact, setContact, state, setState, zone, setZone } = draft;
  const [file, setFile] = useState<File | null>(null);
  const [channel, setChannel] = useState<CheckoutInput["channel"]>("card");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<{
    id: string;
    reference: string;
    public_reference?: string;
    needs_prescription: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const [uploaded, setUploaded] = useState(false);
  const [paymentStarted, setPaymentStarted] = useState(false);
  const active = useRef(true);
  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );
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
  const activeZones = zones.data?.zones.filter((z) => z.active !== false) ?? [];
  const pickupZones = activeZones.filter((z) => z.fulfillment_method === "pickup");
  const deliveryZones = activeZones.filter((z) => z.fulfillment_method !== "pickup");
  const pickup = fulfillment === "pickup" || pickupZones.some((z) => z.id === zone);
  const stateZones = deliveryZones
    .filter((z) => deliveryState(z.state) === state)
    .sort((a, b) => `${a.lga} ${a.area}`.localeCompare(`${b.lga} ${b.area}`));
  const selectedZone = (pickup ? pickupZones : stateZones).find((z) => z.id === zone);
  const stateOptions = [
    ...new Set([...nigerianStates, ...deliveryZones.map((z) => deliveryState(z.state))]),
  ].sort();
  const needsRx = cart.some((i) => i.product.prescription);
  const basketKey = JSON.stringify(cart.map((i) => [i.product.id, i.quantity, i.product.price]));
  useEffect(() => {
    if (order) return;
    setQuote(null);
    onReadyChange?.(false);
  }, [basketKey, contact, state, zone, file, selectedZone?.id]);
  useEffect(() => {
    onLockedChange?.(paymentStarted);
  }, [paymentStarted, onLockedChange]);
  const input = (): CheckoutInput => ({
    items: cart.map(({ product, quantity }) => ({ id: product.id, quantity })),
    contact: { ...contact, address: pickup ? "Pharmacy pickup" : contact.address },
    zone_id: zone,
    channel,
    request_id: requestId.current,
  });
  const fail = (issue: unknown) => setError(notifyError(issue));
  const confirm = async () => {
    setPaymentStarted(true);
    setBusy(true);
    setError("");
    let current = order;
    try {
      if (!current) {
        const result = await send<{ order: NonNullable<typeof order>; quote: Quote }>(
          "checkout/start",
          input(),
        );
        if (!active.current) return;
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
        if (!active.current) return;
        setUploaded(true);
      }
      const result = await send<{ url: string }>("payments/initialize", {
        id: current.id,
        channel,
      });
      if (!active.current) return;
      window.location.assign(result.url);
    } catch (issue) {
      if (!active.current) return;
      if (
        !current &&
        issue instanceof ClientError &&
        issue.status >= 400 &&
        issue.status < 500 &&
        ![408, 429].includes(issue.status)
      )
        setPaymentStarted(false);
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
          Checkout {order.public_reference ?? order.reference}{" "}
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
            if (busy) return;
            if (!selectedZone || zones.isError || zones.isPending) {
              const message = "Select an available delivery area before continuing.";
              setError(message);
              toast.error(message, { id: "delivery-area-required" });
              return;
            }
            if (!checkoutSchema.safeParse(input()).success) {
              const message = "Check your name, email, phone number and delivery address.";
              setError(message);
              toast.error(message, { id: "delivery-details" });
              return;
            }
            if (needsRx && !file) {
              setError("Select your prescription to continue.");
              toast.error("Select your prescription to continue.");
              return;
            }
            setBusy(true);
            try {
              const result = await send<{ quote: Quote }>("checkout/quote", input());
              if (!active.current) return;
              setQuote(result.quote);
              onReadyChange?.(true);
              setStep(2);
              setError("");
            } catch (issue) {
              fail(issue);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy || paymentStarted} className="min-w-0 space-y-4">
            {!pickup && addresses.data?.rows.length ? (
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
                      setState(deliveryState(selected.state));
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
            {(["name", "email", "phone", "address"] as const)
              .filter((key) => !pickup || key !== "address")
              .map((key) => (
                <Field
                  key={key}
                  label={
                    {
                      name: "Full name",
                      email: "Email",
                      phone: "Phone number",
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
            {pickupZones.length > 0 && (
              <div className="flex gap-4">
                {(["delivery", "pickup"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="fulfillment"
                      checked={pickup ? value === "pickup" : value === "delivery"}
                      onChange={() => {
                        setFulfillment(value);
                        setZone(value === "pickup" ? pickupZones[0]?.id || "" : "");
                      }}
                    />
                    {value === "pickup" ? "Pickup" : "Delivery"}
                  </label>
                ))}
              </div>
            )}
            {!pickup && (
              <>
                {" "}
                <label className="block text-sm font-semibold">
                  State / FCT
                  <select
                    aria-label="State / FCT"
                    className="commerce-input mt-2"
                    required
                    value={state}
                    onChange={(e) => {
                      setState(e.target.value);
                      setZone("");
                      setError("");
                      setQuote(null);
                    }}
                  >
                    <option value="">Select state</option>
                    {stateOptions.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Delivery area
                  <select
                    aria-label="Delivery area"
                    className="commerce-input mt-2"
                    required
                    disabled={!state || zones.isPending || zones.isError || stateZones.length === 0}
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                  >
                    <option value="">
                      {zones.isPending
                        ? "Loading delivery areas…"
                        : !state
                          ? "Select a state first"
                          : stateZones.length === 0
                            ? "No delivery areas available"
                            : "Select LGA / area"}
                    </option>
                    {stateZones.map((z) => (
                      <option value={z.id} key={z.id}>
                        {z.lga}
                        {z.area ? ` — ${z.area}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {pickup && (
              <label className="block text-sm font-semibold">
                Pickup location
                <select
                  aria-label="Pickup location"
                  className="commerce-input mt-2"
                  value={zone}
                  required
                  onChange={(event) => setZone(event.target.value)}
                >
                  <option value="">Select pickup location</option>
                  {pickupZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.area}
                    </option>
                  ))}
                </select>
                {selectedZone && (
                  <span className="mt-2 block text-sm font-normal">{selectedZone.estimate}</span>
                )}
              </label>
            )}
            {zones.isPending && <SectionLoading label="Loading delivery areas" compact />}
            {zones.isError && (
              <div role="alert" className="rounded-xl border border-red-200 p-3 text-sm">
                <p>We couldn’t load delivery areas. Your details are still here.</p>
                <button
                  type="button"
                  className="mt-2 font-semibold text-brand underline"
                  onClick={() => {
                    notifyError(zones.error);
                    void zones.refetch();
                  }}
                >
                  Try again
                </button>
              </div>
            )}
            {zones.isSuccess &&
              !pickup &&
              (activeZones.length === 0 || (!!state && stateZones.length === 0)) && (
                <p className="rounded-xl bg-secondary p-3 text-sm leading-6">
                  {activeZones.length === 0
                    ? "Online delivery isn’t available yet."
                    : `Online delivery isn’t available in ${state} yet.`}{" "}
                  <a
                    className="font-semibold text-brand underline"
                    href={whatsapp(
                      `Hello ReliefPoint, I would like to arrange delivery${state ? ` to ${state}` : ""}.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Chat with our team
                  </a>
                  .
                </p>
              )}
            <Field
              label="Delivery note (optional)"
              value={contact.note}
              onChange={(e) => setContact((c) => ({ ...c, note: e.target.value }))}
            />
            <label className="flex items-start gap-2 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1.5 accent-brand"
                checked={draft.remember === true}
                onChange={(e) => saveCookiePreferences(e.target.checked)}
              />
              Remember my basket and delivery details on this browser for my next visit.
            </label>
            {needsRx && (
              <label className="block text-sm font-semibold">
                Prescription file
                <input
                  className="mt-2 block max-w-full"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  required={!file}
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
                  {file && <span className="mb-1 block">Selected: {file.name}</span>}
                  PDF, JPEG or PNG, up to 5 MB. Pharmacist approval is required before dispatch.
                </span>
              </label>
            )}
            <button
              className="action-button w-full disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !selectedZone || zones.isPending || zones.isError}
            >
              {busy ? "Checking…" : "Continue to payment"}
            </button>
            <button type="button" className="w-full underline" onClick={onBack}>
              Back to cart
            </button>
          </fieldset>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border p-4 text-sm">
            <p>
              {contact.name} · {contact.phone}
            </p>
            <p>{contact.email}</p>
            <p>{pickup ? selectedZone?.area : contact.address}</p>
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
                [pickup ? "Pickup" : "Delivery", quote.delivery],
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
          <button
            className="action-button w-full"
            disabled={busy || !quote || !selectedZone}
            onClick={() => void confirm()}
          >
            {busy ? "Opening secure checkout…" : `Pay ${formatNaira((quote?.total ?? 0) / 100)}`}
          </button>
          {!paymentStarted && (
            <button className="w-full underline" onClick={() => setStep(1)}>
              Edit delivery details
            </button>
          )}
        </div>
      )}
    </div>
  );
}
