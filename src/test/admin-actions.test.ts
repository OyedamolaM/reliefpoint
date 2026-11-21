// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { Context } from "@/server/session";
vi.mock("@/server/session", () => ({
  requireStaff: async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    roles: ["owner"],
    aal: "aal2",
  }),
  audit: async () => {},
}));
import { adminAction } from "@/server/admin";
describe("successful administrative mutations", () => {
  it.each(["prescription-review", "delivery", "inventory-adjust"])(
    "accepts the empty PostgreSQL response from %s",
    async (action) => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
      const ctx = { db: { rpc } } as unknown as Context;
      const value =
        action === "prescription-review" ? "approved" : action === "delivery" ? "processing" : "";
      const result = await adminAction(ctx, action, {
        id: "00000000-0000-4000-8000-000000000002",
        value,
        amount: 1,
        note: "Approved",
      });
      expect(result.message).toBe("Changes saved.");
      expect(rpc).toHaveBeenCalledOnce();
    },
  );
});
