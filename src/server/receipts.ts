import { receiptSchema, receiptNumbers } from "@/lib/receipt";
import { requireDb, AppError } from "./errors";
import { accessibleOrder } from "./customer";
import { requireStaff, type Context } from "./session";

export async function readReceipt(ctx: Context, id: string, token?: string, admin = false) {
  let order;
  if (admin) await requireStaff(ctx, ["owner", "admin", "pharmacist", "fulfillment", "support"]);
  else order = await accessibleOrder(ctx, id, token);
  const row = requireDb(
    await ctx.db.from("receipts").select("document").eq("order_id", id).maybeSingle(),
  );
  const parsed = receiptSchema.safeParse(row.document);
  if (!parsed.success)
    throw new AppError(
      "RECEIPT_UNAVAILABLE",
      "Your receipt isn’t available yet. Please try again shortly.",
      503,
    );
  order ??= requireDb(await ctx.db.from("orders").select("public_reference").eq("id", id).single());
  return receiptNumbers(parsed.data, order.public_reference);
}

export { receiptPdf } from "./receipt-pdf";
