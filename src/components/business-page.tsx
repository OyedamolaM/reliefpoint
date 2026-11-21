import { useState } from "react";
import { toast } from "sonner";
import { SiteShell } from "./site-shell";
import { Field } from "./account-page";
import { send, notifyError } from "@/lib/api";
import type { PublicSettings } from "@/lib/contracts";
import { policyDefaults } from "@/lib/business";
const titles: Record<string, string> = {
  about: "About us",
  contact: "Contact us",
  "privacy-policy": "Privacy policy",
  "refund-policy": "Refund policy",
  "shipping-policy": "Shipping policy",
};
export function BusinessPage({ kind, settings }: { kind: string; settings: PublicSettings }) {
  const [busy, setBusy] = useState(false);
  const policy =
    kind === "privacy-policy"
      ? settings.privacy_text || policyDefaults.privacy_text
      : kind === "refund-policy"
        ? settings.refund_text || policyDefaults.refund_text
        : settings.shipping_text || policyDefaults.shipping_text;
  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-4xl font-bold">{titles[kind]}</h1>
        {kind === "about" ? (
          <div className="space-y-6 leading-8">
            <p>
              Relief Point Pharmacy helps people in Nigeria access medicines, health products and
              pharmacist support with convenient delivery.
            </p>
            <p>
              Our team supports prescription review, everyday wellness and informed choices about
              your health.
            </p>
            <div className="rounded-xl bg-secondary p-5">
              {settings.pcn_logo && (
                <img
                  src={settings.pcn_logo}
                  alt="Pharmacy Council of Nigeria"
                  className="mb-4 h-24 w-auto object-contain"
                />
              )}
              <p className="font-bold">Pharm Chisom Onyejegbu</p>
              <p>Pharmacist registration number 027390</p>
            </div>
            {settings.address && <p>{settings.address}</p>}
            {settings.opening_hours && <p>{settings.opening_hours}</p>}
          </div>
        ) : kind === "contact" ? (
          <div className="grid gap-8 sm:grid-cols-2">
            <div className="space-y-5">
              <p className="font-bold">Relief Point Pharmacy</p>
              <a className="block underline" href="mailto:support@myreliefpoint.com">
                support@myreliefpoint.com
              </a>
              <a className="block underline" href="tel:+2347067841607">
                +234 706 784 1607
              </a>
              <a
                className="block underline"
                href="https://wa.me/2347067841607"
                target="_blank"
                rel="noopener noreferrer"
              >
                Chat on WhatsApp
              </a>
              {settings.address && <p>{settings.address}</p>}
              {settings.opening_hours && <p>{settings.opening_hours}</p>}
            </div>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const form = e.currentTarget;
                try {
                  await send("contact", Object.fromEntries(new FormData(form)));
                  form.reset();
                  toast.success("Your message has been sent. Our team will get back to you.");
                } catch (error) {
                  notifyError(error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Your name" name="name" required minLength={2} />
              <Field label="Email" name="email" type="email" required />
              <label className="block text-sm font-semibold">
                Message
                <textarea
                  name="message"
                  className="commerce-input mt-2 min-h-36"
                  required
                  minLength={10}
                  maxLength={5000}
                />
              </label>
              <button className="action-button" disabled={busy}>
                {busy ? "Sending…" : "Send message"}
              </button>
            </form>
          </div>
        ) : policy ? (
          <div className="whitespace-pre-wrap leading-8">{policy}</div>
        ) : (
          <div className="space-y-5 leading-8">
            <p>
              This policy is being finalised. Please contact our team for the current terms before
              placing an order.
            </p>
            <a className="underline" href="mailto:support@myreliefpoint.com">
              support@myreliefpoint.com
            </a>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
