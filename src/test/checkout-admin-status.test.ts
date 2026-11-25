// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const access = vi.hoisted(() => ({ allowed: false }));
vi.mock("@/server/session", async (original) => {
  const real = await original<typeof import("@/server/session")>();
  const { AppError } = await import("@/server/errors");
  return {
    ...real,
    requireStaff: vi.fn(async () => {
      if (!access.allowed)
        throw new AppError("FORBIDDEN", "You don’t have access to this action.", 403);
      return { id: "owner", roles: ["owner"], mfaVerified: true };
    }),
  };
});
import { handleApi } from "@/server/api";
import { requireStaff } from "@/server/session";
beforeEach(() => {
  access.allowed = false;
  for (const [key, value] of Object.entries({
    APP_ORIGIN: "https://www.reliefpointpharmacy.com",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    SESSION_SECRET: "s".repeat(64),
    PAYSTACK_SECRET_KEY: "sk_live_veryprivate",
    BREVO_API_KEY: "very-private-mail-key",
    WORKER_SECRET: "w".repeat(64),
  }))
    vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("checkout diagnostics access", () => {
  it("denies access before reading payment configuration from the database", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await handleApi(
      new Request("https://www.reliefpointpharmacy.com/api/admin/checkout-readiness"),
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(requireStaff).toHaveBeenCalledWith(expect.anything(), ["owner", "admin"]);
  });
  it("returns actionable status to verified administrators without secret values", async () => {
    access.allowed = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          checkout_enabled: false,
          launch_approved: false,
          worker_last_success: null,
          refund_fee_policy: null,
          prescription_retention_days: null,
          public_data: {},
        }),
      ),
    );
    const response = await handleApi(
      new Request("https://www.reliefpointpharmacy.com/api/admin/checkout-readiness"),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ mode: "live", available: false });
    expect(data.checks).toContainEqual({
      key: "checkout_enabled",
      label: "Enable checkout in Business & checkout",
      ready: false,
    });
    expect(JSON.stringify(data)).not.toContain("veryprivate");
    expect(JSON.stringify(data)).not.toContain("very-private-mail-key");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
