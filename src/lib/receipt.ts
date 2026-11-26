import { z } from "zod";

const money = z.number().int().nonnegative().safe();
export const receiptSchema = z.object({
  version: z.literal(1),
  number: z.string(),
  reference: z.string(),
  paid_at: z.string(),
  business: z.object({
    name: z.string(),
    address: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  customer: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    address: z.string(),
  }),
  items: z.array(
    z.object({ name: z.string(), quantity: z.number().int().positive(), price_kobo: money }),
  ),
  subtotal: money,
  delivery: money,
  processing: money,
  total: money,
  method: z.string(),
  currency: z.literal("NGN"),
  test_mode: z.boolean(),
});
export type Receipt = z.infer<typeof receiptSchema>;
export const paymentMethodLabel = (method: string) =>
  ({ cash: "Cash", bank_transfer: "Bank transfer", paystack: "Paystack" })[method] ?? "Payment";
export const trackingLabel = (status: string) =>
  ({
    awaiting_payment: "Awaiting payment",
    prescription_review: "Pharmacist review",
    ready: "Payment confirmed",
    processing: "Preparing your order",
    dispatched: "Dispatched",
    delivered: "Delivered",
    cancelled: "Cancelled",
    exception: "Order under review",
  })[status] ?? status.replaceAll("_", " ");
export const receiptDate = (date: string) =>
  new Date(date).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
