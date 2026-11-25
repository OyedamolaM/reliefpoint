// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import { requestContext } from "@/server/session";
import { handleApi } from "@/server/api";
import { readBody } from "@/server/body";
import { reconcile } from "@/server/payments";
import type { Context } from "@/server/session";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function environment() {
  for (const [key, value] of Object.entries({
    APP_ORIGIN: "https://pharmacy.example",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key-long",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key-long",
    SESSION_SECRET: "a".repeat(64),
    WORKER_SECRET: "w".repeat(64),
    PAYSTACK_SECRET_KEY: "sk_test_testkey",
  }))
    vi.stubEnv(key, value);
}
describe("server security boundaries", () => {
  it("keeps a checkout resumable before Paystack has created its transaction", async () => {
    environment();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ status: false }, { status: 404 })),
    );
    const ctx = {
      db: { from: () => ({ update: () => ({ eq: async () => ({ data: null, error: null }) }) }) },
    } as unknown as Context;
    await expect(reconcile(ctx, "RP-" + "a".repeat(32))).resolves.toEqual({ status: "pending" });
  });
  it("uses Secure, HttpOnly and SameSite cookies and clears authentication cookies", () => {
    environment();
    const ctx = requestContext(
      new Request("https://pharmacy.example/api/auth/session", {
        headers: { cookie: "sb-project-auth-token=old-token" },
      }),
    );
    ctx.setCookie("session-check", "opaque");
    ctx.setCookie("rp-mfa", "opaque-mfa-proof", 86400);
    ctx.clearAuthCookies();
    const cookies = ctx.headers.getSetCookie();
    expect(
      cookies.some(
        (c) => c.includes("HttpOnly") && c.includes("Secure") && c.includes("SameSite=Lax"),
      ),
    ).toBe(true);
    expect(
      cookies.some((c) => c.startsWith("sb-project-auth-token=") && c.includes("Max-Age=0")),
    ).toBe(true);
    expect(cookies.join("")).not.toContain("test-service-key-long");
    expect(cookies.find((cookie) => cookie.startsWith("rp-mfa="))).toMatch(
      /Max-Age=86400.*HttpOnly.*Secure.*SameSite=Lax/,
    );
    expect(cookies.find((cookie) => cookie.startsWith("rp-mfa="))).not.toContain("Domain=");
  });
  it("rejects cross-site writes before authentication or database work", async () => {
    environment();
    const response = await handleApi(
      new Request("https://pharmacy.example/api/customer/profile", {
        method: "POST",
        headers: { origin: "https://another.example", "Content-Type": "application/json" },
        body: '{"name":"Attacker"}',
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toMatch(/refresh/);
  });
  it("rejects unsigned webhooks without storing the event", async () => {
    environment();
    const response = await handleApi(
      new Request("https://pharmacy.example/api/payments/webhook", {
        method: "POST",
        body: '{"event":"charge.success","data":{}}',
      }),
    );
    expect(response.status).toBe(401);
  });
  it("bounds streamed request bodies even when Content-Length is absent", async () => {
    const request = new Request("https://pharmacy.example/api/contact", {
      method: "POST",
      body: "x".repeat(100),
    });
    await expect(readBody(request, 50)).rejects.toMatchObject({ status: 413 });
  });
});
