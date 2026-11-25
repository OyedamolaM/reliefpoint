// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutReadiness, type CheckoutSettings } from "@/server/checkout-readiness";
import { quoteCheckout } from "@/server/payments";
import type { Context } from "@/server/session";
vi.mock("@/server/session", () => ({ rate: vi.fn(), identity: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
const now = Date.parse("2026-11-25T12:00:00Z");
const liveEnv = {
  PAYSTACK_SECRET_KEY: "sk_live_privatekey",
  BREVO_API_KEY: "private-mail-key",
  WORKER_SECRET: "private-worker-key",
  APP_ORIGIN: "https://www.reliefpointpharmacy.com",
};
const settings = (): CheckoutSettings => ({
  checkout_enabled: true,
  launch_approved: true,
  worker_last_success: new Date(now - 60000).toISOString(),
  refund_fee_policy: "refund",
  prescription_retention_days: 365,
  public_data: {
    address: "Approved pharmacy address",
    opening_hours: "Approved opening hours",
    pcn_logo: "https://example.com/pcn.webp",
    privacy_text: "Approved privacy policy",
    shipping_text: "Approved shipping policy",
    refund_text: "Approved refund policy",
  },
});
describe("checkout readiness", () => {
  it("explains the checkout switch in test mode without requiring live launch approval", () => {
    const value = settings();
    value.checkout_enabled = false;
    value.launch_approved = false;
    value.public_data = {};
    value.worker_last_success = null;
    const env = { APP_ORIGIN: liveEnv.APP_ORIGIN, PAYSTACK_SECRET_KEY: "sk_test_privatekey" };
    expect(
      checkoutReadiness(value, env, now)
        .checks.filter((c) => !c.ready)
        .map((c) => c.key),
    ).toEqual(["checkout_enabled"]);
    value.checkout_enabled = true;
    expect(checkoutReadiness(value, env, now)).toMatchObject({ mode: "test", available: true });
  });
  it("requires every live launch gate and never exposes secret values", () => {
    const value = checkoutReadiness(settings(), liveEnv, now);
    expect(value).toMatchObject({ available: true, mode: "live" });
    expect(JSON.stringify(value)).not.toContain("private");
    expect(checkoutReadiness(settings(), { APP_ORIGIN: liveEnv.APP_ORIGIN }, now)).toMatchObject({
      available: false,
      mode: "unconfigured",
    });
  });
  it.each(["address", "opening_hours", "pcn_logo", "privacy_text", "shipping_text", "refund_text"])(
    "reports the missing business field: %s",
    (field) => {
      const value = settings();
      value.public_data[field] = "   ";
      expect(
        checkoutReadiness(value, liveEnv, now).checks.find((c) => c.key === field)?.ready,
      ).toBe(false);
      expect(checkoutReadiness(value, liveEnv, now).available).toBe(false);
    },
  );
  it("reports failed worker, provider configuration and launch approval separately", () => {
    const value = settings();
    value.worker_last_success = new Date(now - 600001).toISOString();
    value.launch_approved = false;
    value.refund_fee_policy = null;
    value.prescription_retention_days = null;
    const result = checkoutReadiness(
      value,
      { ...liveEnv, BREVO_API_KEY: "", WORKER_SECRET: "" },
      now,
    );
    expect(result.checks.filter((c) => !c.ready).map((c) => c.key)).toEqual([
      "launch_approved",
      "email",
      "worker_secret",
      "worker",
      "refund_fee_policy",
      "prescription_retention_days",
    ]);
  });
});
describe("checkout quote preflight", () => {
  const input = {
    items: [{ id: "00000000-0000-4000-8000-000000000001", quantity: 1 }],
    zone_id: "00000000-0000-4000-8000-000000000002",
    request_id: "00000000-0000-4000-8000-000000000003",
    channel: "card",
    contact: {
      name: "Customer",
      email: "customer@example.com",
      phone: "08012345678",
      address: "1 Test Street",
      note: "",
    },
  };
  function setup(enabled: boolean) {
    for (const [key, value] of Object.entries({
      APP_ORIGIN: "https://www.reliefpointpharmacy.com",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
      SESSION_SECRET: "s".repeat(64),
      PAYSTACK_SECRET_KEY: "sk_test_privatekey",
    }))
      vi.stubEnv(key, value);
    const rpc = vi.fn(async () => ({
      data: { subtotal: 100000, delivery: 250000, processing: 15533, total: 365533 },
      error: null,
    }));
    const ctx = {
      db: {
        rpc,
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { ...settings(), checkout_enabled: enabled },
                error: null,
              }),
            }),
          }),
        }),
      },
    } as unknown as Context;
    return { ctx, rpc };
  }
  it("stops before payment review when checkout is disabled", async () => {
    const { ctx, rpc } = setup(false);
    await expect(quoteCheckout(ctx, input)).rejects.toMatchObject({
      code: "CHECKOUT_UNAVAILABLE",
      status: 503,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses server-calculated totals when test checkout is enabled", async () => {
    const { ctx, rpc } = setup(true);
    expect(await quoteCheckout(ctx, input)).toMatchObject({ quote: { total: 365533 } });
    expect(rpc).toHaveBeenCalledWith("calculate_quote", {
      p_items: input.items,
      p_zone: input.zone_id,
    });
  });
});
