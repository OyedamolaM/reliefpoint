import type { CheckoutReadiness } from "@/lib/checkout-status";
import { config } from "./config";
import { database } from "./db";
import { requireDb, AppError } from "./errors";

export type CheckoutSettings = {
  checkout_enabled: boolean;
  launch_approved: boolean;
  worker_last_success: string | null;
  refund_fee_policy: string | null;
  prescription_retention_days: number | null;
  public_data: Record<string, unknown>;
};
type Environment = {
  PAYSTACK_SECRET_KEY?: string | undefined;
  BREVO_API_KEY?: string | undefined;
  WORKER_SECRET?: string | undefined;
  APP_ORIGIN: string;
};
export function checkoutReadiness(
  settings: CheckoutSettings,
  env: Environment,
  now = Date.now(),
): CheckoutReadiness {
  const mode = env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")
    ? "test"
    : env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_")
      ? "live"
      : "unconfigured";
  const checks: CheckoutReadiness["checks"] = [
    {
      key: "payment_key",
      label: "Configure a Paystack secret key in Vercel",
      ready: mode !== "unconfigured",
    },
    {
      key: "checkout_enabled",
      label: "Enable checkout in Business & checkout",
      ready: settings.checkout_enabled,
    },
  ];
  if (mode === "live") {
    const publicData = settings.public_data ?? {};
    const present = (key: string) =>
      typeof publicData[key] === "string" && String(publicData[key]).trim().length > 0;
    const heartbeat = Date.parse(settings.worker_last_success ?? "");
    checks.push(
      {
        key: "launch_approved",
        label: "Approve the live launch after completing its requirements",
        ready: settings.launch_approved,
      },
      {
        key: "email",
        label: "Configure the Brevo transactional API key in Vercel",
        ready: !!env.BREVO_API_KEY,
      },
      {
        key: "worker_secret",
        label: "Configure WORKER_SECRET in Vercel",
        ready: !!env.WORKER_SECRET,
      },
      {
        key: "worker",
        label: "Run the background worker successfully within the last 10 minutes",
        ready: Number.isFinite(heartbeat) && heartbeat >= now - 600000,
      },
      {
        key: "https",
        label: "Set APP_ORIGIN to the production HTTPS website",
        ready: env.APP_ORIGIN.startsWith("https://"),
      },
      { key: "address", label: "Add the pharmacy address", ready: present("address") },
      { key: "opening_hours", label: "Add opening hours", ready: present("opening_hours") },
      { key: "pcn_logo", label: "Upload authorised PCN artwork", ready: present("pcn_logo") },
      {
        key: "privacy_text",
        label: "Save the approved privacy policy",
        ready: present("privacy_text"),
      },
      {
        key: "shipping_text",
        label: "Save the approved shipping policy",
        ready: present("shipping_text"),
      },
      {
        key: "refund_text",
        label: "Save the approved refund policy",
        ready: present("refund_text"),
      },
      {
        key: "refund_fee_policy",
        label: "Choose how processing fees are handled in refunds",
        ready: ["refund", "retain"].includes(settings.refund_fee_policy ?? ""),
      },
      {
        key: "prescription_retention_days",
        label: "Set prescription retention days",
        ready:
          Number.isInteger(settings.prescription_retention_days) &&
          Number(settings.prescription_retention_days) >= 1 &&
          Number(settings.prescription_retention_days) <= 3650,
      },
    );
  }
  return { mode, available: checks.every((check) => check.ready), checks };
}
export async function readCheckoutReadiness(db = database()) {
  const settings = requireDb(
    await db
      .from("settings")
      .select(
        "checkout_enabled,launch_approved,worker_last_success,refund_fee_policy,prescription_retention_days,public_data",
      )
      .eq("id", true)
      .single(),
  );
  return checkoutReadiness(settings as CheckoutSettings, config());
}
export async function assertCheckoutReady(db: ReturnType<typeof database>) {
  const readiness = await readCheckoutReadiness(db);
  if (!readiness.available)
    throw new AppError(
      "CHECKOUT_UNAVAILABLE",
      "Online checkout is temporarily unavailable. Your basket is saved. Please contact our pharmacy team.",
      503,
    );
}
