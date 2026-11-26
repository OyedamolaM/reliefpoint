import { receiptSchema, receiptNumbers, receiptDate, trackingLabel } from "@/lib/receipt";
import { formatNaira } from "@/lib/commerce";
import { checkDb, requireDb } from "./errors";
import { receiptPdf } from "./receipts";
import type { Context } from "./session";

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

type Email = {
  title: string;
  greeting?: string;
  paragraphs: string[];
  details?: [string, string][];
  trackingUrl?: string;
  receiptUrl?: string;
  origin: string;
};
export function emailTemplate(email: Email) {
  const esc = escapeHtml;
  const button = (text: string, href: string) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:8px 8px 8px 0;padding:14px 20px;background:#B9FF00;color:#10235f;text-decoration:none;border-radius:8px;font-weight:bold">${text}</a>`;
  const htmlContent = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F6FA;color:#10235f;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="padding:26px;background:#173FC5;color:#fff"><img src="${esc(email.origin)}/reliefpoint-email-logo.png" alt="ReliefPoint Pharmacy" width="44" height="44" style="vertical-align:middle;border:0;margin-right:10px"><strong style="font-size:22px">ReliefPoint Pharmacy</strong></td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 20px;font-size:25px;line-height:1.3">${esc(email.title)}</h1>
${email.greeting ? `<p>Hello ${esc(email.greeting)},</p>` : ""}
${email.paragraphs.map((text) => `<p style="font-size:15px;line-height:1.7;white-space:pre-line">${esc(text)}</p>`).join("")}
${email.details?.length ? `<table width="100%" cellpadding="10" cellspacing="0" style="border-collapse:collapse;background:#F3F6FA;font-size:14px">${email.details.map(([label, value]) => `<tr><th align="left" style="vertical-align:top;border-bottom:1px solid #e1e7f0;font-weight:normal">${esc(label)}</th><td align="right" style="border-bottom:1px solid #e1e7f0;word-break:break-word;font-weight:bold">${esc(value)}</td></tr>`).join("")}</table>` : ""}
<div style="padding:14px 0">${email.trackingUrl ? button("Track order", email.trackingUrl) : ""}${email.receiptUrl ? button("View receipt", email.receiptUrl) : ""}</div>
${email.trackingUrl ? '<p style="font-size:12px;line-height:1.6;color:#526584">These private links expire after 30 minutes. If a link expires, sign in or request a fresh link using your order reference and checkout email.</p>' : ""}
<p style="font-size:14px;line-height:1.7">Need help? <a style="color:#173FC5" href="mailto:support@reliefpointpharmacy.com">support@reliefpointpharmacy.com</a><br>+234 706 784 1607</p></td></tr>
<tr><td style="padding:20px 28px;background:#F3F6FA;font-size:12px;line-height:1.7;color:#526584">Relief Point Pharmacy<br>This is a service email about your account or purchase.<br><a href="${esc(email.origin)}/privacy-policy" style="color:#173FC5">Privacy policy</a></td></tr>
</table></td></tr></table></body></html>`;
  const textContent = [
    email.title,
    email.greeting ? `Hello ${email.greeting},` : "",
    ...email.paragraphs,
    ...(email.details ?? []).map(([label, value]) => `${label}: ${value}`),
    email.trackingUrl
      ? `Track order (private link, valid for 30 minutes): ${email.trackingUrl}`
      : "",
    email.receiptUrl ? `View receipt: ${email.receiptUrl}` : "",
    "Relief Point Pharmacy",
    "support@reliefpointpharmacy.com | +234 706 784 1607",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { htmlContent, textContent };
}

export type OutboxMessage = {
  id: string;
  email: string;
  subject: string;
  body: string;
  kind?: string;
  order_id?: string | null;
  event_id?: string | null;
  link_expires_at?: string | null;
};
export async function prepareNotification(ctx: Context, message: OutboxMessage) {
  const email: Email = {
    title: message.subject.replace(/ — ReliefPoint Pharmacy$/, ""),
    paragraphs: [message.body],
    origin: ctx.origin,
  };
  let subject = message.subject;
  let attachment: { name: string; content: string }[] | undefined;
  if (message.order_id) {
    const order = requireDb(
      await ctx.db
        .from("orders")
        .select(
          "id,reference,public_reference,contact,fulfillment_status,prescription_status,needs_prescription,zone_snapshot",
        )
        .eq("id", message.order_id)
        .single(),
    );
    // Reuse this expiry/token on retries. Only its hash is stored in tracking_tokens.
    let expires = message.link_expires_at;
    if (!expires || Date.parse(expires) <= Date.now()) {
      expires = new Date(Date.now() + 30 * 60000).toISOString();
      checkDb(
        await ctx.db
          .from("notification_outbox")
          .update({ link_expires_at: expires })
          .eq("id", message.id),
      );
    }
    const token = ctx.hash(`order-email:${message.id}:${order.id}:${expires}`);
    checkDb(
      await ctx.db
        .from("tracking_tokens")
        .upsert({ hash: ctx.hash(token), order_id: order.id, expires_at: expires }),
    );
    const url = `${ctx.origin}/orders/${order.id}?token=${token}`;
    email.trackingUrl = url;
    email.greeting = order.contact.name;
    email.details = [["Order reference", order.public_reference ?? order.reference]];
    if (message.kind === "receipt") {
      const row = requireDb(
        await ctx.db.from("receipts").select("document").eq("order_id", order.id).single(),
      );
      const receipt = receiptNumbers(receiptSchema.parse(row.document), order.public_reference);
      email.title = receipt.test_mode ? "Test payment confirmed" : "Payment received. Thank you!";
      email.paragraphs = [
        "Your payment has been confirmed. Your itemised receipt is attached as a PDF and is also available on your order page.",
        order.needs_prescription && order.prescription_status !== "approved"
          ? "Your order is on hold for pharmacist approval before dispatch."
          : order.fulfillment_status === "exception"
            ? "Your payment is confirmed. Our team is checking availability before preparation."
            : "We’re preparing your order. We’ll email you with updates.",
      ];
      email.details.push(
        ["Receipt number", receipt.number],
        ["Paid on", receiptDate(receipt.paid_at) + " WAT"],
        ["Subtotal", formatNaira(receipt.subtotal / 100)],
        ["Delivery", formatNaira(receipt.delivery / 100)],
        ["Processing fee", formatNaira(receipt.processing / 100)],
        ["Total paid", formatNaira(receipt.total / 100)],
      );
      email.receiptUrl = `${url}#receipt`;
      attachment = [
        {
          name: `ReliefPoint-${receipt.reference}.pdf`,
          content: Buffer.from(await receiptPdf(receipt)).toString("base64"),
        },
      ];
      subject = receipt.test_mode
        ? "Test payment receipt — ReliefPoint Pharmacy"
        : "Your payment receipt — ReliefPoint Pharmacy";
    } else if (message.kind === "delivery" && message.event_id) {
      const event = requireDb(
        await ctx.db
          .from("delivery_events")
          .select("status,note,courier,tracking_reference,estimated_delivery,created_at")
          .eq("id", message.event_id)
          .eq("order_id", order.id)
          .single(),
      );
      const label =
        order.zone_snapshot?.fulfillment_method === "pickup" && event.status === "delivered"
          ? "Collected"
          : trackingLabel(event.status);
      email.title = label;
      // Notes may contain health information. Keep them behind the secure order link.
      email.paragraphs = [
        "Your pharmacy team has updated your delivery. Open your order to view the full update.",
      ];
      email.details.push(
        ["Order status", label],
        ["Updated", receiptDate(event.created_at) + " WAT"],
      );
      if (event.estimated_delivery)
        email.details.push(["Estimated delivery time", event.estimated_delivery]);
      if (event.courier) email.details.push(["Courier", event.courier]);
      if (event.tracking_reference)
        email.details.push(["Tracking reference", event.tracking_reference]);
      subject = `${label} — ReliefPoint Pharmacy`;
    }
  }
  return {
    sender: { name: "ReliefPoint Pharmacy", email: "support@reliefpointpharmacy.com" },
    replyTo: { email: "support@reliefpointpharmacy.com" },
    to: [{ email: message.email }],
    subject,
    ...emailTemplate(email),
    ...(attachment ? { attachment } : {}),
    headers: { idempotencyKey: message.id },
  };
}
