// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/session", () => ({ requireStaff: vi.fn(async () => ({ id: "owner" })) }));
import { adminList } from "@/server/admin";
import type { Context } from "@/server/session";
afterEach(() => vi.restoreAllMocks());
describe("admin list failures", () => {
  it.each(["orders", "profiles"])(
    "identifies the missing database update for %s without exposing provider details",
    async (resource) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const rpc = vi.fn(async () => ({
        data: null,
        error: { code: "PGRST202", message: "Sensitive query details buyer@example.com" },
      }));
      const ctx = {
        headers: new Headers({ "X-Request-Id": "request-123" }),
        db: { rpc },
      } as unknown as Context;
      await expect(adminList(ctx, resource, new URLSearchParams())).rejects.toMatchObject({
        code: "ADMIN_UPDATE_REQUIRED",
        status: 503,
      });
      expect(log).toHaveBeenCalledWith(
        JSON.stringify({
          event: "admin_data_failure",
          requestId: "request-123",
          resource,
          code: "PGRST202",
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain("buyer@example.com");
    },
  );
  it("loads delivery zones directly without querying a nonexistent date column", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/rest/v1/shipping_zones");
      expect(url.searchParams.has("created_at")).toBe(false);
      expect(url.searchParams.get("order")).toBe("id.asc");
      return Response.json([
        {
          id: "zone",
          state: "Lagos",
          lga: "Ikeja",
          area: "Oregun",
          fee_kobo: 250000,
          active: true,
        },
      ]);
    });
    const ctx = {
      headers: new Headers(),
      db: createClient("https://example.supabase.co", "test-service-key", {
        global: { fetch: fetcher },
        auth: { persistSession: false },
      }),
    } as unknown as Context;
    const result = await adminList(
      ctx,
      "shipping_zones",
      new URLSearchParams("page=0&period=custom&from=2026-10-01&to=2026-10-31"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ state: "Lagos", area: "Oregun" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("records delivery permission failures without exposing SQL or customer details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = createClient("https://example.supabase.co", "test-service-key", {
      global: {
        fetch: async () =>
          Response.json({ code: "42501", message: "Private database details" }, { status: 403 }),
      },
      auth: { persistSession: false },
    });
    const ctx = { headers: new Headers(), db } as Context;
    await expect(adminList(ctx, "shipping_zones", new URLSearchParams())).rejects.toMatchObject({
      code: "DATA_UNAVAILABLE",
    });
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
      resource: "shipping_zones",
      code: "42501",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Private database details");
  });
});
