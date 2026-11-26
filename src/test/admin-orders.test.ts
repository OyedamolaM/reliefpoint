// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/server/session", () => ({
  requireStaff: vi.fn(async () => {
    if (!access.allowed) throw new AppError("FORBIDDEN", "Access denied", 403);
    return { id: "staff-actor", roles: ["admin"] };
  }),
  rate: vi.fn(async () => {}),
}));
import { createAdminOrder, quoteAdminOrder, recordManualPayment } from "@/server/admin";
import type { Context } from "@/server/session";
const input = {
  request_id: "00000000-0000-4000-8000-000000000001",
  items: [{ id: "00000000-0000-4000-8000-000000000002", quantity: 2 }],
  zone_id: "00000000-0000-4000-8000-000000000003",
  contact: {
    name: "Customer One",
    email: "buyer@example.com",
    phone: "08012345678",
    address: "12 Oregun Road",
  },
};
function context() {
  const rpc = vi.fn(async () => ({
    data: {
      id: "order-1",
      reference: "RP-reference",
      total: 450000,
      payment_status: "pending",
      subtotal: 250000,
      delivery: 200000,
      processing: 9999,
    },
    error: null,
  }));
  const ctx = {
    db: { rpc },
    origin: "https://pharmacy.example",
    hash: (s: string) => createHash("sha256").update(s).digest("hex"),
  } as unknown as Context;
  return { ctx, rpc };
}
afterEach(() => {
  access.allowed = true;
  vi.clearAllMocks();
});
describe("staff-created orders", () => {
  it("uses server prices and zero gateway fee for a manual purchase", async () => {
    const { ctx, rpc } = context();
    const result = await quoteAdminOrder(ctx, { ...input, total: 1 });
    expect(result.quote).toMatchObject({ processing: 0, total: 450000 });
    expect(rpc).toHaveBeenCalledWith("calculate_quote", {
      p_items: input.items,
      p_zone: input.zone_id,
    });
  });
  it("keeps retries scoped to the staff member and does not attach their customer account", async () => {
    const { ctx, rpc } = context();
    const result = await createAdminOrder(ctx, input);
    await createAdminOrder(ctx, input);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc).toHaveBeenCalledWith(
      "create_admin_order",
      expect.objectContaining({
        p_actor: "staff-actor",
        p_input: expect.objectContaining({
          contact: expect.objectContaining({ email: "buyer@example.com" }),
        }),
        p_guest: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(result.url).toMatch(/^https:\/\/pharmacy.example\/orders\/order-1\?token=[a-f0-9]{64}$/);
  });
  it("requires staff authorization for creation, quote and payment", async () => {
    access.allowed = false;
    const { ctx, rpc } = context();
    for (const action of [createAdminOrder, quoteAdminOrder, recordManualPayment])
      await expect(action(ctx, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("validates payment amounts in integer kobo before writing anything", async () => {
    const { ctx, rpc } = context();
    await expect(
      recordManualPayment(ctx, {
        id: input.request_id,
        request_id: input.request_id,
        method: "cash",
        amount: 2.5,
        reference: "CASH-1",
      }),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
