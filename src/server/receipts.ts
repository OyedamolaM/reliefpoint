import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { receiptSchema, paymentMethodLabel, receiptDate, type Receipt } from "@/lib/receipt";
import { requireDb, AppError } from "./errors";
import { accessibleOrder } from "./customer";
import { requireStaff, type Context } from "./session";

export async function readReceipt(ctx: Context, id: string, token?: string, admin = false) {
  if (admin) await requireStaff(ctx, ["owner", "admin", "pharmacist", "fulfillment", "support"]);
  else await accessibleOrder(ctx, id, token);
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
  return parsed.data;
}

// PDF generation stays on the server and uses the immutable payment snapshot.
// NGN is used because the standard embedded font does not contain the naira glyph.
export async function receiptPdf(receipt: Receipt): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Receipt ${receipt.number}`);
  doc.setAuthor("Relief Point Pharmacy");
  doc.setCreationDate(new Date(receipt.paid_at));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(23 / 255, 63 / 255, 197 / 255);
  let page = doc.addPage([595.28, 841.89]),
    y = 794;
  const safe = (text: string) =>
    [...text.replace(/₦/g, "NGN ")]
      .map((char) => {
        try {
          font.encodeText(char);
          return char;
        } catch {
          return "?";
        }
      })
      .join("")
      .replace(/[\r\n\t]/g, " ");
  const line = (text: string, strong = false, size = 10) => {
    const selected = strong ? bold : font;
    // Wrap even long unbroken product names, emails or references.
    let row = "";
    for (const char of safe(text)) {
      if (selected.widthOfTextAtSize(row + char, size) > 495) {
        draw(row);
        row = char;
      } else row += char;
    }
    draw(row);
    function draw(value: string) {
      if (y < 64) {
        page = doc.addPage([595.28, 841.89]);
        y = 794;
      }
      page.drawText(value, { x: 50, y, size, font: selected, color: blue });
      y -= size + 7;
    }
  };
  page.drawRectangle({ x: 50, y: 754, width: 40, height: 40, color: blue });
  page.drawRectangle({ x: 66, y: 760, width: 8, height: 28, color: rgb(185 / 255, 1, 0) });
  page.drawRectangle({ x: 56, y: 770, width: 28, height: 8, color: rgb(185 / 255, 1, 0) });
  y = 729;
  line(receipt.business.name, true, 20);
  line(receipt.test_mode ? "TEST PAYMENT RECEIPT — no live payment" : "PAYMENT RECEIPT", true, 14);
  line(`Receipt: ${receipt.number}`);
  line(`Order: ${receipt.reference}`);
  line(`Paid: ${receiptDate(receipt.paid_at)} (WAT)`);
  line(`Payment method: ${paymentMethodLabel(receipt.method)}`);
  y -= 10;
  line("Billed to", true, 12);
  for (const value of Object.values(receipt.customer)) line(value);
  y -= 12;
  line("Items", true, 12);
  const money = (amount: number) =>
    `NGN ${(amount / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  for (const item of receipt.items) {
    line(item.name, true);
    line(
      `${item.quantity} x ${money(item.price_kobo)}     ${money(item.quantity * item.price_kobo)}`,
    );
    y -= 5;
  }
  y -= 8;
  for (const [label, amount] of [
    ["Subtotal", receipt.subtotal],
    ["Delivery", receipt.delivery],
    ["Processing fee", receipt.processing],
    ["Total paid", receipt.total],
  ] as const)
    line(`${label}: ${money(amount)}`, label === "Total paid", label === "Total paid" ? 14 : 10);
  y -= 15;
  line("Thank you for choosing Relief Point Pharmacy.", true);
  line("Payment confirmation does not replace pharmacist approval or confirm delivery.");
  line("Refunds are recorded separately; this original receipt remains unchanged.");
  if (receipt.business.address) line(receipt.business.address);
  line(`${receipt.business.email} | ${receipt.business.phone}`);
  return doc.save();
}
