// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { requestContext, identity } from "@/server/session";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function context(origin: string) {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "local-anon-placeholder");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "local-service-placeholder");
  vi.stubEnv("SESSION_SECRET", "s".repeat(64));
  return requestContext(
    new Request(`${origin}/api/auth/session`, {
      headers: { cookie: "sb-example-auth-token=original-cookie" },
    }),
  );
}
describe("session cookie handling", () => {
  it.each(["http://localhost:3000", "https://www.reliefpointpharmacy.com"])(
    "uses host-only HttpOnly cookies for %s",
    (origin) => {
      const ctx = context(origin);
      ctx.setCookie("rp-mfa", "grant", 3600);
      const cookie = ctx.headers.getSetCookie().find((entry) => entry.startsWith("rp-mfa="))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).not.toMatch(/Domain=/i);
      expect(/; Secure/i.test(cookie)).toBe(origin.startsWith("https:"));
    },
  );
  it("does not send SDK auth-cookie deletions during a provider outage", async () => {
    const ctx = context("https://www.reliefpointpharmacy.com");
    vi.spyOn(ctx.auth.auth, "getUser").mockImplementation(async () => {
      ctx.clearAuthCookies();
      return {
        data: { user: null },
        error: new AuthApiError("Private provider error", 500, undefined),
      };
    });
    await expect(identity(ctx, true)).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
      status: 503,
    });
    expect(ctx.headers.getSetCookie().some((entry) => entry.startsWith("sb-"))).toBe(false);
    expect(ctx.headers.getSetCookie().some((entry) => entry.startsWith("rp-guest="))).toBe(true);
  });
});
