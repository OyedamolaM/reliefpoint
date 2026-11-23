// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { Context } from "@/server/session";
vi.mock("@/server/session", () => ({
  requireStaff: async () => ({ id: "customer-1", roles: ["admin"], aal: "aal2" }),
  identity: async () => ({ id: "customer-1" }),
  audit: async () => {},
}));
import { adminList, adminWrite } from "@/server/admin";
import { customerData } from "@/server/customer";
function context() {
  const calls: unknown[][] = [];
  let rows = ["pending", "review", "paid", "partially_refunded", "refunded"].map(
    (payment_status) => ({ id: payment_status, payment_status }),
  );
  const q: any = {
    select: () => q,
    order: () => q,
    eq: (...args: unknown[]) => {
      calls.push(["eq", ...args]);
      return q;
    },
    in: (field: string, statuses: string[]) => {
      calls.push(["in", field, statuses]);
      rows = rows.filter((r) => statuses.includes(r.payment_status));
      return q;
    },
    range: (...args: unknown[]) => {
      calls.push(["range", ...args]);
      return q;
    },
    returns: () => q,
    insert: (input: unknown) => {
      calls.push(["insert", input]);
      return q;
    },
    single: async () => ({ data: { id: "saved-stock" }, error: null }),
    then: (resolve: (result: unknown) => void) => resolve({ data: rows, error: null }),
  };
  const ctx = {
    db: {
      from: (name: string) => {
        calls.push(["from", name]);
        return q;
      },
    },
  } as unknown as Context;
  return { ctx, calls };
}
describe("confirmed orders and pending payments", () => {
  it.each([false, true])("filters staff lists before pagination (pending %s)", async (pending) => {
    const { ctx, calls } = context();
    const data = await adminList(ctx, "orders", new URLSearchParams(pending ? "view=pending" : ""));
    expect(data.rows.map((r) => r["payment_status"])).toEqual(
      pending ? ["pending", "review"] : ["paid", "partially_refunded", "refunded"],
    );
    expect(calls.findIndex((c) => c[0] === "in")).toBeLessThan(
      calls.findIndex((c) => c[0] === "range"),
    );
  });
  it.each([false, true])(
    "keeps customer lists scoped to their owner (pending %s)",
    async (pending) => {
      const { ctx, calls } = context();
      const result = await customerData(
        ctx,
        "orders",
        new URLSearchParams(pending ? "view=pending" : ""),
      );
      expect("rows" in result && result.rows).toHaveLength(pending ? 2 : 3);
      expect(calls).toContainEqual(["eq", "user_id", "customer-1"]);
    },
  );
  it("adds quantity without asking for a batch number or expiry date", async () => {
    const { ctx, calls } = context();
    await adminWrite(ctx, "inventory_batches", {
      product_id: "00000000-0000-4000-8000-000000000001",
      quantity: 6,
    });
    const stock = calls.find((c) => c[0] === "insert")?.[1];
    expect(stock).toMatchObject({ quantity: 6, expires_on: "infinity" });
  });
});
