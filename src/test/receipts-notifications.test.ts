// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { Receipt } from "@/lib/receipt";
import { receiptPdf, readReceipt } from "@/server/receipts";
import { emailTemplate, prepareNotification, type OutboxMessage } from "@/server/notifications";
import type { Context } from "@/server/session";
import { AppError } from "@/server/errors";
const auth = vi.hoisted(() => ({ id: "buyer-1", staff: false }));
vi.mock("@/server/session", () => ({
  identity: async () => ({ id: auth.id }),
  requireStaff: async () => {
    if (!auth.staff) throw new AppError("FORBIDDEN", "Verify staff access.", 403);
  },
}));
const id = "00000000-0000-4000-8000-000000000001";
const receipt: Receipt = {
  version: 1,
  number: "RCP-RP-abc",
  reference: "RP-abc",
  paid_at: "2026-11-26T09:00:00Z",
  business: {
    name: "Relief Point Pharmacy",
    address: "",
    email: "support@reliefpointpharmacy.com",
    phone: "+234 706 784 1607",
  },
  customer: {
    name: "Amina <script>alert(1)</script>",
    email: "amina@example.com",
    phone: "08012345678",
    address: "12 Oregun Road",
  },
  items: [{ name: "Private medication Ω 中文", quantity: 2, price_kobo: 100000 }],
  subtotal: 200000,
  delivery: 250000,
  processing: 10000,
  total: 460000,
  method: "paystack",
  currency: "NGN",
  test_mode: false,
};
function context(message?: OutboxMessage, validGuestLink = false) {
  const writes: { table: string; value: any }[] = [],
    reads: string[] = [];
  const ctx = {
    origin: "https://pharmacy.example",
    guestHash: "guest",
    request: new Request("https://pharmacy.example"),
    hash: (s: string) => createHash("sha256").update(s).digest("hex"),
    db: {
      from: (table: string) => {
        reads.push(table);
        const data =
          table === "orders"
            ? {
                id,
                user_id: "buyer-1",
                guest_hash: "different",
                reference: receipt.reference,
                contact: receipt.customer,
                needs_prescription: true,
                prescription_status: "pending",
              }
            : table === "receipts"
              ? { document: receipt }
              : table === "delivery_events"
                ? {
                    status: "dispatched",
                    note: "Private medication review note",
                    courier: "Courier <b>name</b>",
                    tracking_reference: "PKG-123",
                    estimated_delivery: "Tomorrow",
                    created_at: receipt.paid_at,
                  }
                : table === "tracking_tokens" && validGuestLink
                  ? { order_id: id }
                  : null;
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          gt: () => chain,
          single: async () => ({ data, error: null }),
          maybeSingle: async () => ({ data, error: null }),
          update: (value: any) => {
            writes.push({ table, value });
            if (message) Object.assign(message, value);
            return chain;
          },
          upsert: (value: any) => {
            writes.push({ table, value });
            return chain;
          },
          then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
        };
        return chain;
      },
    },
  } as unknown as Context;
  return { ctx, writes, reads };
}
afterEach(() => {
  auth.id = "buyer-1";
  auth.staff = false;
});

it("restricts receipt downloads to the customer, valid guest link or authenticated staff", async () => {
  const { ctx } = context();
  expect(await readReceipt(ctx, id)).toEqual(receipt);
  auth.id = "different-buyer";
  const denied = context();
  await expect(readReceipt(denied.ctx, id)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  expect(denied.reads).not.toContain("receipts");
  await expect(readReceipt(ctx, id, "invalid-token")).rejects.toMatchObject({
    code: "LINK_EXPIRED",
  });
  await expect(readReceipt(ctx, id, "a".repeat(64))).rejects.toMatchObject({
    code: "LINK_EXPIRED",
  });
  expect(await readReceipt(context(undefined, true).ctx, id, "a".repeat(64))).toEqual(receipt);
  await expect(
    readReceipt(
      context(undefined, true).ctx,
      "00000000-0000-4000-8000-000000000002",
      "a".repeat(64),
    ),
  ).rejects.toMatchObject({ code: "LINK_EXPIRED" });
  await expect(readReceipt(ctx, id, undefined, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
  auth.staff = true;
  expect(await readReceipt(ctx, id, undefined, true)).toEqual(receipt);
});

it("creates a printable, paginated PDF without failing on non-Latin product names", async () => {
  const bytes = await receiptPdf({
    ...receipt,
    items: Array.from({ length: 70 }, () => receipt.items[0]!),
  });
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(pdf.getTitle()).toBe(`Receipt ${receipt.number}`);
});

it("attaches the receipt, escapes customer content and reuses private links on retries", async () => {
  const message: OutboxMessage = {
    id,
    email: "amina@example.com",
    subject: "Payment received — ReliefPoint Pharmacy",
    body: "Paid",
    kind: "receipt",
    order_id: id,
  };
  const { ctx, writes } = context(message);
  const mail = await prepareNotification(ctx, message);
  expect(mail.subject).toBe("Your payment receipt — ReliefPoint Pharmacy");
  expect(mail.htmlContent).toContain("#173FC5");
  expect(mail.htmlContent).toContain("&lt;script&gt;");
  expect(mail.htmlContent).not.toContain("<script>");
  expect(mail.htmlContent).not.toContain("Private medication");
  expect(mail.htmlContent).toContain("pharmacist approval");
  expect(mail.attachment).toHaveLength(1);
  const pdf = await PDFDocument.load(Buffer.from(mail.attachment![0]!.content, "base64"));
  expect(pdf.getTitle()).toBe(`Receipt ${receipt.number}`);
  const again = await prepareNotification(ctx, message);
  expect(again.htmlContent).toBe(mail.htmlContent);
  const hashes = writes
    .filter((write) => write.table === "tracking_tokens")
    .map((write) => write.value.hash);
  expect(hashes[0]).toBe(hashes[1]);
  const rawToken = mail.textContent.match(/token=([a-f0-9]{64})/)![1]!;
  expect(hashes[0]).not.toBe(rawToken);
  expect(
    JSON.stringify(writes.filter((write) => write.table === "notification_outbox")),
  ).not.toContain(rawToken);
});

it("uses the saved delivery event in emails, omits private notes and preserves text fallback", async () => {
  const { ctx } = context();
  const mail = await prepareNotification(ctx, {
    id,
    email: "amina@example.com",
    subject: "Delivery update",
    body: "Update",
    kind: "delivery",
    order_id: id,
    event_id: id,
  });
  expect(mail.subject).toBe("Dispatched — ReliefPoint Pharmacy");
  expect(mail.textContent).toContain("PKG-123");
  expect(mail.htmlContent).toContain("Courier &lt;b&gt;name&lt;/b&gt;");
  expect(mail.textContent).not.toContain("Private medication review note");
  expect(mail.attachment).toBeUndefined();
  const generic = emailTemplate({
    title: "Account update",
    paragraphs: ["<img src=x onerror=alert(1)>"],
    origin: "https://pharmacy.example",
  });
  expect(generic.htmlContent).not.toContain("<img src=x");
  expect(generic.textContent).toContain("Account update");
});
